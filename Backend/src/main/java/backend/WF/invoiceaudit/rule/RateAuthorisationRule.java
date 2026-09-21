package backend.WF.invoiceaudit.rule;

import backend.WF.invoice.InvoiceLineItem;
import backend.WF.invoiceaudit.ReconciliationContext;
import backend.WF.invoiceaudit.ReconciliationRule;
import backend.WF.invoiceaudit.Severity;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Reconciles source 3 (invoice) against source 1 (contract): every unit rate
 * billed must be a rate the contract actually authorises.
 *
 * <p>An unauthorised rate is the discrepancy that costs the most and is hardest
 * to spot by eye, because the invoice is internally consistent — the arithmetic
 * is right, the hours are right, and only the price is wrong.
 */
@Component
public class RateAuthorisationRule implements ReconciliationRule {

    @Override
    public String code() {
        return "RATE_NOT_AUTHORISED";
    }

    @Override
    public List<Finding> evaluate(ReconciliationContext context) {
        // A milestone invoice bills a fixed amount, not a rate. MilestoneAuthorisationRule owns it.
        if (context.isMilestoneInvoice()) {
            return List.of();
        }

        List<BigDecimal> authorised = context.authorisedRates();
        if (authorised.isEmpty()) {
            return List.of(Finding.of(Severity.BLOCKER,
                    "Contract authorises no rates",
                    "This contract has no requirements, so no hourly rate on it is authorised, "
                    + "yet an invoice has been raised against it."));
        }

        List<Finding> findings = new ArrayList<>();
        for (InvoiceLineItem item : context.invoice().getLineItems()) {
            BigDecimal billed = item.getUnitRate();
            boolean matches = authorised.stream()
                    .anyMatch(rate -> rate.compareTo(billed) == 0);
            if (matches) {
                continue;
            }

            BigDecimal nearest = authorised.stream()
                    .min((a, b) -> a.subtract(billed).abs().compareTo(b.subtract(billed).abs()))
                    .orElseThrow();

            findings.add(new Finding(Severity.BLOCKER,
                    "Billed rate is not authorised by the contract",
                    "\"" + item.getDescription() + "\" is billed at " + billed
                    + " per unit. The contract authorises "
                    + authorised.stream().map(BigDecimal::toPlainString).collect(Collectors.joining(", "))
                    + ". The closest authorised rate is " + nearest + ".",
                    nearest.toPlainString(), billed.toPlainString(),
                    billed.subtract(nearest), item.getId()));
        }
        return findings;
    }
}
