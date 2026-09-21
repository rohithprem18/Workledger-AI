package backend.WF.invoiceaudit.rule;

import backend.WF.contract.Contract;
import backend.WF.invoice.Invoice;
import backend.WF.invoiceaudit.ReconciliationContext;
import backend.WF.invoiceaudit.ReconciliationRule;
import backend.WF.invoiceaudit.Severity;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * Reconciles the invoice period against the contract's own dates.
 *
 * <p>Billing outside the contract term is unrecoverable if it reaches the
 * client: there is no agreement covering the work, so the line has no basis to
 * be paid against.
 */
@Component
public class ContractPeriodRule implements ReconciliationRule {

    @Override
    public String code() {
        return "PERIOD_OUTSIDE_CONTRACT";
    }

    @Override
    public List<Finding> evaluate(ReconciliationContext context) {
        List<Finding> findings = new ArrayList<>();
        Invoice invoice = context.invoice();
        Contract contract = context.contract();

        LocalDate periodStart = invoice.getPeriodStart();
        LocalDate periodEnd = invoice.getPeriodEnd();

        if (periodEnd.isBefore(periodStart)) {
            findings.add(Finding.of(Severity.BLOCKER,
                    "Invoice period ends before it starts",
                    "The billing period runs from " + periodStart + " to " + periodEnd
                    + ", which is not a valid period."));
            return findings;
        }

        // A milestone invoice is dated on the day it is raised, which is routinely
        // after the contract ends. Its authorisation comes from the milestone.
        if (context.isMilestoneInvoice()) {
            return findings;
        }

        if (periodStart.isBefore(contract.getStartDate())) {
            long days = ChronoUnit.DAYS.between(periodStart, contract.getStartDate());
            findings.add(Finding.of(Severity.BLOCKER,
                    "Invoice period starts before the contract does",
                    "The invoice bills from " + periodStart + ", but the contract only starts on "
                    + contract.getStartDate() + " — " + days + " day(s) of the billing period "
                    + "are not covered by any agreement.",
                    contract.getStartDate(), periodStart, java.math.BigDecimal.valueOf(days)));
        }

        if (periodEnd.isAfter(contract.getEndDate())) {
            long days = ChronoUnit.DAYS.between(contract.getEndDate(), periodEnd);
            findings.add(Finding.of(Severity.BLOCKER,
                    "Invoice period extends past the contract end",
                    "The invoice bills through " + periodEnd + ", but the contract ended on "
                    + contract.getEndDate() + " — " + days + " day(s) of the billing period "
                    + "fall outside the contract term.",
                    contract.getEndDate(), periodEnd, java.math.BigDecimal.valueOf(days)));
        }

        if (!contract.isActive()) {
            findings.add(Finding.of(Severity.WARNING,
                    "Contract is marked inactive",
                    "This invoice is raised against \"" + contract.getTitle()
                    + "\", which is no longer active."));
        }

        return findings;
    }
}
