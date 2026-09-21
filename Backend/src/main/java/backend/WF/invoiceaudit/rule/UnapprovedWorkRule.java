package backend.WF.invoiceaudit.rule;

import backend.WF.invoiceaudit.ReconciliationContext;
import backend.WF.invoiceaudit.ReconciliationRule;
import backend.WF.invoiceaudit.Severity;
import backend.WF.worklog.WorkLog;
import backend.WF.worklog.WorkLogStatus;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Reports work in the invoice period that never reached approval.
 *
 * <p>Nothing here is wrong with the invoice — unapproved work is correctly
 * excluded from it. What this rule catches is an invoice raised too early:
 * timesheets still sitting in a manager's queue mean the period is not closed,
 * and approving now guarantees a second invoice or a credit note later.
 */
@Component
public class UnapprovedWorkRule implements ReconciliationRule {

    @Override
    public String code() {
        return "UNAPPROVED_WORK_IN_PERIOD";
    }

    @Override
    public List<Finding> evaluate(ReconciliationContext context) {
        if (context.isMilestoneInvoice() || context.unapprovedLogs().isEmpty()) {
            return List.of();
        }

        Map<WorkLogStatus, List<WorkLog>> byStatus =
                ReconciliationContext.groupBy(context.unapprovedLogs(), WorkLog::getStatus);

        List<Finding> findings = new ArrayList<>();

        List<WorkLog> awaiting = new ArrayList<>();
        awaiting.addAll(byStatus.getOrDefault(WorkLogStatus.SUBMITTED, List.of()));
        awaiting.addAll(byStatus.getOrDefault(WorkLogStatus.DRAFT, List.of()));

        if (!awaiting.isEmpty()) {
            BigDecimal hours = ReconciliationContext.minutesToHours(
                    awaiting.stream().mapToInt(WorkLog::getTotalActualMinutes).sum());
            findings.add(Finding.of(Severity.WARNING,
                    "Work in this period is still awaiting approval",
                    awaiting.size() + " work log(s) totalling " + hours
                    + " hours fall inside " + context.invoice().getPeriodStart() + " to "
                    + context.invoice().getPeriodEnd() + " but have not been approved, so they are "
                    + "not on this invoice. Approving now will require a follow-up invoice for them.",
                    0, hours, hours));
        }

        List<WorkLog> rejected = byStatus.getOrDefault(WorkLogStatus.REJECTED, List.of());
        if (!rejected.isEmpty()) {
            BigDecimal hours = ReconciliationContext.minutesToHours(
                    rejected.stream().mapToInt(WorkLog::getTotalActualMinutes).sum());
            findings.add(Finding.of(Severity.INFO,
                    "Rejected work in this period was correctly excluded",
                    rejected.size() + " rejected work log(s) totalling " + hours
                    + " hours fall in this period and are not billed.",
                    0, hours, BigDecimal.ZERO));
        }

        return findings;
    }
}
