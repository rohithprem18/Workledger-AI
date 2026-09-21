package backend.WF.invoiceaudit.rule;

import backend.WF.invoiceaudit.ReconciliationContext;
import backend.WF.invoiceaudit.ReconciliationRule;
import backend.WF.invoiceaudit.Severity;
import backend.WF.milestone.ContractMilestone;
import backend.WF.milestone.MilestoneStatus;
import backend.WF.milestone.MilestoneTask;
import backend.WF.milestone.TaskStatus;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Reconciles a milestone invoice against the milestone that authorises it.
 *
 * <p>For milestone billing, source 2 is not a pile of hours but a single
 * approved checkpoint: the amount must match the milestone, and the milestone
 * must have genuinely been reached and approved. An invoice for a milestone
 * nobody signed off is the milestone equivalent of billing unapproved hours.
 */
@Component
public class MilestoneAuthorisationRule implements ReconciliationRule {

    @Override
    public String code() {
        return "MILESTONE_AUTHORISATION";
    }

    @Override
    public List<Finding> evaluate(ReconciliationContext context) {
        if (!context.isMilestoneInvoice()) {
            return List.of();
        }

        Optional<ContractMilestone> found = context.milestone();
        if (found.isEmpty()) {
            return List.of(Finding.of(Severity.BLOCKER,
                    "Milestone behind this invoice is missing",
                    "This invoice references milestone " + context.invoice().getMilestoneId()
                    + ", which no longer exists. Nothing authorises the amount billed."));
        }

        ContractMilestone milestone = found.get();
        List<Finding> findings = new ArrayList<>();

        if (milestone.getStatus() == MilestoneStatus.PENDING) {
            findings.add(Finding.of(Severity.BLOCKER,
                    "Milestone has not been reached",
                    "\"" + milestone.getLabel() + "\" is still PENDING — it has not been marked "
                    + "reached by a manager, yet it has already been invoiced.",
                    MilestoneStatus.APPROVED_INVOICED, milestone.getStatus(), null));
        } else if (milestone.getStatus() == MilestoneStatus.REACHED
                && milestone.getApprovedAt() == null) {
            findings.add(Finding.of(Severity.BLOCKER,
                    "Milestone has not been approved by finance",
                    "\"" + milestone.getLabel() + "\" is marked reached but has no finance "
                    + "approval recorded, so the amount is not yet authorised for billing.",
                    MilestoneStatus.APPROVED_INVOICED, milestone.getStatus(), null));
        }

        BigDecimal authorised = milestone.getAmount().setScale(2, java.math.RoundingMode.HALF_UP);
        BigDecimal invoiced = context.invoicedTotal();
        BigDecimal difference = invoiced.subtract(authorised);

        if (difference.abs().compareTo(new BigDecimal("0.01")) > 0) {
            findings.add(Finding.of(Severity.BLOCKER,
                    "Invoice amount does not match the milestone",
                    "Milestone \"" + milestone.getLabel() + "\" is worth " + authorised
                    + " under the contract, but the invoice presents " + invoiced
                    + " — a difference of " + difference + ".",
                    authorised, invoiced, difference));
        }

        List<MilestoneTask> incomplete = milestone.getTasks().stream()
                .filter(t -> t.getStatus() != TaskStatus.DONE)
                .toList();
        if (!incomplete.isEmpty()) {
            findings.add(Finding.of(Severity.WARNING,
                    "Milestone has unfinished tasks",
                    incomplete.size() + " of " + milestone.getTasks().size()
                    + " task(s) under \"" + milestone.getLabel() + "\" are not marked done, "
                    + "yet the milestone is being billed as complete.",
                    0, incomplete.size(), BigDecimal.valueOf(incomplete.size())));
        }

        return findings;
    }
}
