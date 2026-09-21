package backend.WF.invoice;

import backend.WF.audit.Auditable;
import backend.WF.billing.BillingStrategyRegistry;
import backend.WF.billing.InvoiceCalculationStrategy;
import backend.WF.contract.Contract;
import backend.WF.contract.ContractRepository;
import backend.WF.email.EmailService;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.exception.EntityNotFoundException;
import backend.WF.invoiceaudit.InvoiceAuditService;
import backend.WF.milestone.ContractMilestone;
import backend.WF.security.CurrentUserService;
import backend.WF.security.User;
import backend.WF.worklog.WorkLog;
import backend.WF.worklog.WorkLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class InvoiceService {

    private final InvoiceRepository invoiceRepository;
    private final ContractRepository contractRepository;
    private final WorkLogRepository workLogRepository;
    private final BillingStrategyRegistry billingStrategyRegistry;
    private final CurrentUserService currentUserService;
    private final InvoiceReportService invoiceReportService;
    private final EmailService emailService;
    private final InvoiceAuditService invoiceAuditService;

    @Transactional
    @Auditable(action = "GENERATE_INVOICE", entityType = "Invoice")
    public InvoiceResponse generateInvoice(InvoiceGenerateRequest request) {
        Contract contract = contractRepository.findById(request.getContractId())
                .orElseThrow(() -> new EntityNotFoundException("Contract", request.getContractId()));

        if (invoiceRepository.findByContractIdAndPeriodStartAndPeriodEnd(
                request.getContractId(), request.getPeriodStart(), request.getPeriodEnd()).isPresent()) {
            throw new BusinessRuleViolationException(
                    "Invoice already exists for this contract and period");
        }

        List<WorkLog> approvedLogs = workLogRepository.findApprovedLogsForContract(
                request.getContractId(), request.getPeriodStart(), request.getPeriodEnd());

        InvoiceCalculationStrategy strategy = billingStrategyRegistry.resolve(contract.getBillingCode());
        List<InvoiceLineItem> lineItems = strategy.calculate(
                contract, approvedLogs, request.getPeriodStart(), request.getPeriodEnd());

        BigDecimal totalAmount = lineItems.stream()
                .map(InvoiceLineItem::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        User currentUser = currentUserService.getCurrentUser();

        Invoice invoice = Invoice.builder()
                .contract(contract)
                .periodStart(request.getPeriodStart())
                .periodEnd(request.getPeriodEnd())
                .totalAmount(totalAmount)
                .status(InvoiceStatus.DRAFT)
                .generatedBy(currentUser.getId())
                .build();
        invoice = invoiceRepository.save(invoice);

        final Invoice savedInvoice = invoice;
        for (InvoiceLineItem item : lineItems) {
            item.setInvoice(savedInvoice);
        }
        savedInvoice.setLineItems(lineItems);
        invoice = invoiceRepository.save(savedInvoice);

        return toResponse(invoice);
    }

    @Transactional
    @Auditable(action = "GENERATE_MILESTONE_INVOICE", entityType = "Invoice")
    public InvoiceResponse generateMilestoneInvoice(ContractMilestone milestone) {
        Contract contract = milestone.getContract();
        InvoiceCalculationStrategy strategy = billingStrategyRegistry.resolve("MILESTONE");
        List<InvoiceLineItem> lineItems = strategy.calculateForMilestone(contract, milestone);

        BigDecimal totalAmount = lineItems.stream()
                .map(InvoiceLineItem::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        User currentUser = currentUserService.getCurrentUser();
        LocalDate today = LocalDate.now();

        Invoice invoice = Invoice.builder()
                .contract(contract)
                .periodStart(today)
                .periodEnd(today)
                .totalAmount(totalAmount)
                .status(InvoiceStatus.DRAFT)
                .generatedBy(currentUser.getId())
                .milestoneId(milestone.getId())
                .build();
        invoice = invoiceRepository.save(invoice);

        final Invoice savedInvoice = invoice;
        for (InvoiceLineItem item : lineItems) {
            item.setInvoice(savedInvoice);
        }
        savedInvoice.setLineItems(lineItems);
        invoice = invoiceRepository.save(savedInvoice);

        return toResponse(invoice);
    }

    @Transactional
    @Auditable(action = "APPROVE_INVOICE", entityType = "Invoice")
    public InvoiceResponse approveInvoice(UUID invoiceId) {
        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new EntityNotFoundException("Invoice", invoiceId));

        if (invoice.getStatus() != InvoiceStatus.DRAFT) {
            throw new BusinessRuleViolationException(
                    "Only DRAFT invoices can be approved. Current status: " + invoice.getStatus());
        }

        // Approval sends money to a client, so it is gated on a reconciliation that
        // actually ran. An un-audited invoice is refused rather than assumed clean.
        invoiceAuditService.assertApprovable(invoice);

        invoice.setStatus(InvoiceStatus.APPROVED);
        invoice.setApprovedAt(LocalDateTime.now());
        Invoice saved = invoiceRepository.save(invoice);

        String companyEmail = saved.getContract().getCompany().getContactEmail();
        if (companyEmail != null && !companyEmail.isBlank()) {
            try {
                byte[] pdf = invoiceReportService.generateReport(saved.getId());
                String subject = "Invoice Approved – " + saved.getContract().getTitle();
                String html = buildInvoiceEmailHtml(saved);
                String filename = "invoice-" + saved.getId() + ".pdf";
                emailService.sendInvoiceEmail(companyEmail, subject, html, pdf, filename);
            } catch (Exception e) {
                log.error("Invoice approved but email failed for invoice {}: {}", saved.getId(), e.getMessage());
            }
        } else {
            log.warn("Invoice {} approved but company has no contactEmail — skipping email", saved.getId());
        }

        return toResponse(saved);
    }

    private String buildInvoiceEmailHtml(Invoice invoice) {
        return """
                <p>Dear Team,</p>
                <p>Invoice for contract <strong>%s</strong> covering <strong>%s to %s</strong>
                has been approved.</p>
                <p>Total Amount: <strong>₹ %s</strong></p>
                <p>Please find the detailed invoice report attached.</p>
                <br/>
                <p>Regards,<br/>Workforce Management System</p>
                """.formatted(
                invoice.getContract().getTitle(),
                invoice.getPeriodStart(),
                invoice.getPeriodEnd(),
                invoice.getTotalAmount().toPlainString()
        );
    }

    @Transactional(readOnly = true)
    public List<InvoiceResponse> getInvoicesByContract(UUID contractId) {
        return invoiceRepository.findByContractId(contractId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<InvoiceResponse> getAllInvoices() {
        return invoiceRepository.findAll().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public InvoiceResponse getInvoice(UUID invoiceId) {
        return toResponse(invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new EntityNotFoundException("Invoice", invoiceId)));
    }

    private InvoiceResponse toResponse(Invoice inv) {
        List<InvoiceResponse.LineItemResponse> items = inv.getLineItems().stream()
                .map(li -> InvoiceResponse.LineItemResponse.builder()
                        .id(li.getId())
                        .description(li.getDescription())
                        .quantity(li.getQuantity())
                        .unitRate(li.getUnitRate())
                        .amount(li.getAmount())
                        .build())
                .toList();

        return InvoiceResponse.builder()
                .id(inv.getId())
                .contractId(inv.getContract().getId())
                .contractTitle(inv.getContract().getTitle())
                .periodStart(inv.getPeriodStart())
                .periodEnd(inv.getPeriodEnd())
                .totalAmount(inv.getTotalAmount())
                .status(inv.getStatus())
                .approvedAt(inv.getApprovedAt())
                .milestoneId(inv.getMilestoneId())
                .lineItems(items)
                .build();
    }
}
