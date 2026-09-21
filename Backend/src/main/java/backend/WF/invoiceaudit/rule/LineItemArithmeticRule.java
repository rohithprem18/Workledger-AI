package backend.WF.invoiceaudit.rule;

import backend.WF.invoice.InvoiceLineItem;
import backend.WF.invoiceaudit.ReconciliationContext;
import backend.WF.invoiceaudit.ReconciliationRule;
import backend.WF.invoiceaudit.Severity;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Checks that the invoice adds up: every line is quantity × rate, and the total
 * is the sum of the lines.
 *
 * <p>The cheapest check and the one worth running first — an invoice whose own
 * arithmetic is wrong cannot be meaningfully compared to anything else.
 */
@Component
public class LineItemArithmeticRule implements ReconciliationRule {

    /** Rounding at two decimal places can legitimately shift a line by a cent. */
    private static final BigDecimal TOLERANCE = new BigDecimal("0.01");

    @Override
    public String code() {
        return "LINE_ITEM_ARITHMETIC";
    }

    @Override
    public List<Finding> evaluate(ReconciliationContext context) {
        List<Finding> findings = new ArrayList<>();
        List<InvoiceLineItem> items = context.invoice().getLineItems();

        if (items.isEmpty()) {
            findings.add(Finding.of(Severity.BLOCKER,
                    "Invoice has no line items",
                    "This invoice presents a total of " + context.invoicedTotal()
                    + " with nothing itemised to support it. An invoice must break down into "
                    + "explainable parts before it can be approved."));
            return findings;
        }

        BigDecimal sum = BigDecimal.ZERO;
        for (InvoiceLineItem item : items) {
            BigDecimal expected = item.getQuantity()
                    .multiply(item.getUnitRate())
                    .setScale(2, RoundingMode.HALF_UP);
            BigDecimal actual = item.getAmount().setScale(2, RoundingMode.HALF_UP);
            sum = sum.add(actual);

            BigDecimal difference = actual.subtract(expected);
            if (difference.abs().compareTo(TOLERANCE) > 0) {
                findings.add(new Finding(Severity.BLOCKER,
                        "Line item does not equal quantity × rate",
                        "\"" + item.getDescription() + "\" bills " + actual + " but "
                        + item.getQuantity() + " × " + item.getUnitRate() + " is " + expected
                        + ", a difference of " + difference + ".",
                        expected.toPlainString(), actual.toPlainString(), difference,
                        item.getId()));
            }
        }

        BigDecimal total = context.invoicedTotal();
        BigDecimal totalDifference = total.subtract(sum);
        if (totalDifference.abs().compareTo(TOLERANCE) > 0) {
            findings.add(Finding.of(Severity.BLOCKER,
                    "Invoice total does not match its line items",
                    "The invoice total is " + total + " but its " + items.size()
                    + " line item(s) sum to " + sum + ", a difference of " + totalDifference + ".",
                    sum, total, totalDifference));
        }

        return findings;
    }
}
