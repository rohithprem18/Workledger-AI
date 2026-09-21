package backend.WF.invoiceaudit;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * One independent check across the three sources.
 *
 * <p>Rules are pure: given a {@link ReconciliationContext} they return findings
 * and touch nothing else — no database, no clock, no model. That is what makes
 * the auditor deterministic, so the same invoice and the same data always yield
 * the same verdict, and a disputed invoice can be re-audited to the same answer
 * months later.
 *
 * <p>Adding a check means adding a class. {@link InvoiceAuditService} discovers
 * every rule Spring knows about and runs them all.
 */
public interface ReconciliationRule {

    /** Stable code recorded on each finding, e.g. {@code RATE_MISMATCH}. */
    String code();

    List<Finding> evaluate(ReconciliationContext context);

    /**
     * A discrepancy, fully described in numbers before any prose is attached.
     *
     * @param delta signed difference where one is meaningful, else null
     */
    record Finding(
            Severity severity,
            String title,
            String detail,
            String expectedValue,
            String actualValue,
            BigDecimal delta,
            UUID lineItemId
    ) {
        public static Finding of(Severity severity, String title, String detail) {
            return new Finding(severity, title, detail, null, null, null, null);
        }

        public static Finding of(Severity severity, String title, String detail,
                                 Object expected, Object actual, BigDecimal delta) {
            return new Finding(severity, title, detail,
                    expected == null ? null : expected.toString(),
                    actual == null ? null : actual.toString(),
                    delta, null);
        }

        public Finding onLineItem(UUID id) {
            return new Finding(severity, title, detail, expectedValue, actualValue, delta, id);
        }
    }
}
