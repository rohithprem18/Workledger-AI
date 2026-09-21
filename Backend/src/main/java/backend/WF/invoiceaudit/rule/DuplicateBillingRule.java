package backend.WF.invoiceaudit.rule;

import backend.WF.invoice.Invoice;
import backend.WF.invoice.InvoiceStatus;
import backend.WF.invoiceaudit.ReconciliationContext;
import backend.WF.invoiceaudit.ReconciliationRule;
import backend.WF.invoiceaudit.Severity;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Catches the same work being billed twice.
 *
 * <p>Exact period duplicates are already refused at generation time, so what
 * reaches here is the harder case: a period that partially overlaps one already
 * invoiced. Those days sit on two invoices, and whichever is approved second
 * bills the client again for work already charged.
 */
@Component
public class DuplicateBillingRule implements ReconciliationRule {

    @Override
    public String code() {
        return "OVERLAPPING_BILLING_PERIOD";
    }

    @Override
    public List<Finding> evaluate(ReconciliationContext context) {
        if (context.isMilestoneInvoice()) {
            return evaluateMilestoneDuplicates(context);
        }

        Invoice invoice = context.invoice();
        List<Finding> findings = new ArrayList<>();

        for (Invoice other : context.otherInvoices()) {
            if (other.getId().equals(invoice.getId()) || other.getMilestoneId() != null) {
                continue;
            }
            LocalDate overlapStart = max(invoice.getPeriodStart(), other.getPeriodStart());
            LocalDate overlapEnd = min(invoice.getPeriodEnd(), other.getPeriodEnd());
            if (overlapStart.isAfter(overlapEnd)) {
                continue;
            }

            long days = java.time.temporal.ChronoUnit.DAYS.between(overlapStart, overlapEnd) + 1L;
            boolean approved = other.getStatus() == InvoiceStatus.APPROVED;

            findings.add(Finding.of(
                    approved ? Severity.BLOCKER : Severity.WARNING,
                    approved ? "Period overlaps an already-approved invoice"
                             : "Period overlaps another draft invoice",
                    "This invoice covers " + invoice.getPeriodStart() + " to " + invoice.getPeriodEnd()
                    + ", which overlaps invoice " + shortId(other) + " ("
                    + other.getPeriodStart() + " to " + other.getPeriodEnd() + ", " + other.getStatus()
                    + ") across " + overlapStart + " to " + overlapEnd + ". "
                    + (approved
                        ? "Work in those " + days + " day(s) has already been billed and paid for."
                        : "Approving both would bill those " + days + " day(s) twice."),
                    0, days, java.math.BigDecimal.valueOf(days)));
        }

        return findings;
    }

    /** A milestone must be billed exactly once. */
    private List<Finding> evaluateMilestoneDuplicates(ReconciliationContext context) {
        Invoice invoice = context.invoice();
        List<Invoice> duplicates = context.otherInvoices().stream()
                .filter(other -> !other.getId().equals(invoice.getId()))
                .filter(other -> invoice.getMilestoneId().equals(other.getMilestoneId()))
                .toList();

        if (duplicates.isEmpty()) {
            return List.of();
        }
        return List.of(Finding.of(Severity.BLOCKER,
                "Milestone has already been invoiced",
                "Milestone " + invoice.getMilestoneId() + " is also billed by "
                + duplicates.size() + " other invoice(s): "
                + duplicates.stream().map(DuplicateBillingRule::shortId).toList()
                + ". A milestone may only be billed once.",
                1, duplicates.size() + 1, java.math.BigDecimal.valueOf(duplicates.size())));
    }

    private static String shortId(Invoice invoice) {
        return invoice.getId().toString().substring(0, 8);
    }

    private static LocalDate max(LocalDate a, LocalDate b) {
        return a.isAfter(b) ? a : b;
    }

    private static LocalDate min(LocalDate a, LocalDate b) {
        return a.isBefore(b) ? a : b;
    }
}
