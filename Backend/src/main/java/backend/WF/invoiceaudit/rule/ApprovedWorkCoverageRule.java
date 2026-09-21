package backend.WF.invoiceaudit.rule;

import backend.WF.invoice.InvoiceLineItem;
import backend.WF.invoiceaudit.ReconciliationContext;
import backend.WF.invoiceaudit.ReconciliationRule;
import backend.WF.invoiceaudit.Severity;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Reconciles source 3 (invoice) against source 2 (approved work): the hours
 * billed must be hours that were actually worked and actually approved.
 *
 * <p>This is the check the whole platform exists to make possible. Approved work
 * logs are immutable and rate-bearing, so "what may be billed" is a computed
 * fact rather than a claim — billing more hours than were approved is provable,
 * not arguable.
 */
@Component
public class ApprovedWorkCoverageRule implements ReconciliationRule {

    private static final BigDecimal TOLERANCE = new BigDecimal("0.02");

    @Override
    public String code() {
        return "APPROVED_WORK_COVERAGE";
    }

    @Override
    public List<Finding> evaluate(ReconciliationContext context) {
        if (context.isMilestoneInvoice()) {
            return List.of();
        }

        List<Finding> findings = new ArrayList<>();

        BigDecimal billedHours = context.invoice().getLineItems().stream()
                .map(InvoiceLineItem::getQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal approvedHours = context.totalApprovedHours();
        BigDecimal hourDifference = billedHours.subtract(approvedHours);

        if (hourDifference.compareTo(TOLERANCE) > 0) {
            findings.add(Finding.of(Severity.BLOCKER,
                    "Invoice bills more hours than were approved",
                    "The invoice bills " + billedHours + " hours for "
                    + context.invoice().getPeriodStart() + " to " + context.invoice().getPeriodEnd()
                    + ", but only " + approvedHours + " hours are approved in that period — "
                    + hourDifference + " hours are billed without an approved work log behind them.",
                    approvedHours, billedHours, hourDifference));
        } else if (hourDifference.negate().compareTo(TOLERANCE) > 0) {
            // Under-billing costs the vendor money rather than the client, so it is
            // surfaced for a decision rather than blocking approval.
            findings.add(Finding.of(Severity.WARNING,
                    "Approved hours are missing from this invoice",
                    approvedHours + " hours are approved for this period but only "
                    + billedHours + " are billed. " + hourDifference.negate()
                    + " approved hours are going unbilled.",
                    approvedHours, billedHours, hourDifference));
        }

        BigDecimal expectedValue = context.approvedWorkValue();
        BigDecimal invoiced = context.invoicedTotal();
        BigDecimal valueDifference = invoiced.subtract(expectedValue);

        if (valueDifference.abs().compareTo(new BigDecimal("0.05")) > 0) {
            findings.add(Finding.of(
                    valueDifference.signum() > 0 ? Severity.BLOCKER : Severity.WARNING,
                    "Invoice total does not match approved work at contracted rates",
                    "Approved work in this period is worth " + expectedValue
                    + " at contracted rates, but the invoice presents " + invoiced
                    + " — a difference of " + valueDifference + ".",
                    expectedValue, invoiced, valueDifference));
        }

        return findings;
    }
}
