package backend.WF.invoiceaudit;

import backend.WF.audit.Auditable;
import backend.WF.contract.Contract;
import backend.WF.contract.ContractRequirementRepository;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.exception.EntityNotFoundException;
import backend.WF.invoice.Invoice;
import backend.WF.invoice.InvoiceRepository;
import backend.WF.milestone.ContractMilestone;
import backend.WF.milestone.MilestoneRepository;
import backend.WF.security.CurrentUserService;
import backend.WF.security.User;
import backend.WF.worklog.WorkLog;
import backend.WF.worklog.WorkLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The deterministic invoice auditor.
 *
 * <p>Reconciles an invoice against the contract, the approved work and the
 * invoice itself, then asks a language model to explain what it found. The
 * order is the point: every number, severity and verdict exists before the
 * model is called, so the model can only change how findings read, never
 * whether they exist or what they say happened.
 *
 * <p>Rules are injected as a list, so a new check is a new {@link
 * ReconciliationRule} bean and nothing here changes.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InvoiceAuditService {

    /** Bump when rule behaviour changes, so old runs stay interpretable. */
    public static final String RULES_VERSION = "1.0.0";

    private final InvoiceRepository invoiceRepository;
    private final ContractRequirementRepository requirementRepository;
    private final WorkLogRepository workLogRepository;
    private final MilestoneRepository milestoneRepository;
    private final InvoiceAuditRunRepository runRepository;
    private final InvoiceAuditFindingRepository findingRepository;
    private final List<ReconciliationRule> rules;
    private final FindingNarrator narrator;
    private final CurrentUserService currentUserService;

    // ------------------------------------------------------------------- audit

    @Transactional
    @Auditable(action = "RUN_INVOICE_AUDIT", entityType = "Invoice")
    public InvoiceAuditRun audit(UUID invoiceId) {
        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new EntityNotFoundException("Invoice", invoiceId));

        ReconciliationContext context = buildContext(invoice);

        // Every rule runs even if an earlier one found a blocker: a reviewer who
        // fixes one problem should not then discover a second on the next run.
        List<ReconciliationRule.Finding> raw = new ArrayList<>();
        List<String> codes = new ArrayList<>();
        for (ReconciliationRule rule : rules) {
            try {
                for (ReconciliationRule.Finding finding : rule.evaluate(context)) {
                    raw.add(finding);
                    codes.add(rule.code());
                }
            } catch (Exception e) {
                // A rule that throws is a defect, but it must not silently suppress
                // the findings of every other rule.
                log.error("Reconciliation rule {} failed on invoice {}", rule.code(), invoiceId, e);
                raw.add(ReconciliationRule.Finding.of(Severity.WARNING,
                        "A reconciliation check could not complete",
                        "The " + rule.code() + " check failed to run against this invoice ("
                        + e.getClass().getSimpleName() + "). This invoice has not been fully "
                        + "reconciled — resolve the error before relying on this verdict."));
                codes.add(rule.code());
            }
        }

        User user = currentUserService.getCurrentUser();
        InvoiceAuditRun run = InvoiceAuditRun.builder()
                .invoice(invoice)
                .rulesVersion(RULES_VERSION)
                .runBy(user.getId())
                .contractTotal(context.contractAuthorisedTotal())
                .approvedWorkTotal(context.approvedWorkValue())
                .invoicedTotal(context.invoicedTotal())
                .verdict(Verdict.CLEAN)
                .build();

        List<InvoiceAuditFinding> findings = new ArrayList<>();
        for (int i = 0; i < raw.size(); i++) {
            findings.add(toEntity(run, codes.get(i), raw.get(i)));
        }
        // Blockers first so the reason approval is refused is the first thing read.
        findings.sort(Comparator.comparing(f -> f.getSeverity().ordinal()));

        run.setBlockerCount((int) count(findings, Severity.BLOCKER));
        run.setWarningCount((int) count(findings, Severity.WARNING));
        run.setInfoCount((int) count(findings, Severity.INFO));
        run.setVerdict(verdictFor(findings));

        // ---- everything above is deterministic; the model speaks only now ----
        FindingNarrator.Narration narration = narrator.narrate(findings, context, run.getVerdict());
        run.setNarrative(narration.summary());
        run.setNarrativeEngine(narration.engine());
        for (int i = 0; i < findings.size() && i < narration.explanations().size(); i++) {
            findings.get(i).setExplanation(narration.explanations().get(i));
        }

        InvoiceAuditRun saved = runRepository.save(run);
        findings.forEach(f -> f.setRun(saved));
        findingRepository.saveAll(findings);
        saved.getFindings().addAll(findings);

        log.info("Audited invoice {}: {} ({} blocker, {} warning, {} info)",
                invoiceId, saved.getVerdict(), saved.getBlockerCount(),
                saved.getWarningCount(), saved.getInfoCount());
        return saved;
    }

    private static long count(List<InvoiceAuditFinding> findings, Severity severity) {
        return findings.stream().filter(f -> f.getSeverity() == severity).count();
    }

    private static Verdict verdictFor(List<InvoiceAuditFinding> findings) {
        if (findings.stream().anyMatch(f -> f.getSeverity() == Severity.BLOCKER)) {
            return Verdict.BLOCKED;
        }
        if (findings.stream().anyMatch(f -> f.getSeverity() == Severity.WARNING)) {
            return Verdict.ADVISORY;
        }
        return Verdict.CLEAN;
    }

    private InvoiceAuditFinding toEntity(InvoiceAuditRun run, String ruleCode,
                                         ReconciliationRule.Finding f) {
        return InvoiceAuditFinding.builder()
                .run(run)
                .ruleCode(ruleCode)
                .severity(f.severity())
                .title(f.title())
                .detail(f.detail())
                .expectedValue(f.expectedValue())
                .actualValue(f.actualValue())
                .delta(f.delta())
                .lineItemId(f.lineItemId())
                .build();
    }

    /** Loads all three sources once, so no two rules can disagree about the data. */
    private ReconciliationContext buildContext(Invoice invoice) {
        Contract contract = invoice.getContract();

        List<WorkLog> approved = workLogRepository.findApprovedLogsForContract(
                contract.getId(), invoice.getPeriodStart(), invoice.getPeriodEnd());

        List<WorkLog> unapproved = workLogRepository.findUnapprovedLogsForContract(
                contract.getId(), invoice.getPeriodStart(), invoice.getPeriodEnd());

        Optional<ContractMilestone> milestone = invoice.getMilestoneId() == null
                ? Optional.empty()
                : milestoneRepository.findById(invoice.getMilestoneId());

        return new ReconciliationContext(
                invoice,
                contract,
                requirementRepository.findByContractId(contract.getId()),
                approved,
                unapproved,
                milestone,
                invoiceRepository.findByContractId(contract.getId()));
    }

    // --------------------------------------------------- approval gate helpers

    /**
     * The gate {@code InvoiceService.approveInvoice} consults.
     *
     * <p>An invoice that has never been audited cannot be approved. That is
     * deliberate: silently treating "not checked" as "nothing wrong" would make
     * the auditor optional in exactly the cases it exists for.
     */
    @Transactional(readOnly = true)
    public void assertApprovable(Invoice invoice) {
        if (invoice.getAuditOverrideReason() != null) {
            return;
        }

        InvoiceAuditRun latest = runRepository
                .findFirstByInvoiceIdOrderByCreatedAtDesc(invoice.getId())
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "This invoice has not been reconciled yet. Run the invoice audit before approving it."));

        if (latest.getVerdict() == Verdict.BLOCKED) {
            throw new BusinessRuleViolationException(
                    "The invoice audit found " + latest.getBlockerCount()
                    + " blocking discrepancy(ies). Resolve them, or record an override with a reason, "
                    + "before approving this invoice.");
        }
    }

    /**
     * Records a deliberate decision to approve despite blockers. The reason and
     * the person are stored on the invoice, so the override is as auditable as
     * the findings it overrides.
     */
    @Transactional
    @Auditable(action = "OVERRIDE_INVOICE_AUDIT", entityType = "Invoice")
    public Invoice override(UUID invoiceId, String reason) {
        if (reason == null || reason.isBlank() || reason.trim().length() < 10) {
            throw new BusinessRuleViolationException(
                    "An override must state why the blocking findings are being accepted "
                    + "(at least 10 characters).");
        }

        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new EntityNotFoundException("Invoice", invoiceId));

        runRepository.findFirstByInvoiceIdOrderByCreatedAtDesc(invoiceId)
                .orElseThrow(() -> new BusinessRuleViolationException(
                        "There is nothing to override — this invoice has not been audited."));

        User user = currentUserService.getCurrentUser();
        invoice.setAuditOverrideReason(reason.trim());
        invoice.setAuditOverrideBy(user.getId());
        invoice.setAuditOverrideAt(LocalDateTime.now());
        return invoiceRepository.save(invoice);
    }

    // ------------------------------------------------------------------- reads

    @Transactional(readOnly = true)
    public List<InvoiceAuditRun> history(UUID invoiceId) {
        return runRepository.findByInvoiceIdOrderByCreatedAtDesc(invoiceId);
    }

    @Transactional(readOnly = true)
    public Optional<InvoiceAuditRun> latest(UUID invoiceId) {
        return runRepository.findFirstByInvoiceIdOrderByCreatedAtDesc(invoiceId);
    }

    @Transactional(readOnly = true)
    public InvoiceAuditRun getRun(UUID runId) {
        return runRepository.findById(runId)
                .orElseThrow(() -> new EntityNotFoundException("InvoiceAuditRun", runId));
    }

    @Transactional(readOnly = true)
    public List<InvoiceAuditFinding> findingsOf(UUID runId) {
        return findingRepository.findByRunIdOrderBySeverityAsc(runId);
    }

    /** The rule set currently in force, for the "how does this work" panel. */
    public List<String> ruleCodes() {
        return rules.stream().map(ReconciliationRule::code).sorted().toList();
    }
}
