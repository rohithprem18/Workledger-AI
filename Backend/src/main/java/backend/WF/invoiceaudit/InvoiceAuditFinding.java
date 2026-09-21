package backend.WF.invoiceaudit;

import backend.WF.common.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One discrepancy found by one rule.
 *
 * <p>{@code detail}, {@code expectedValue}, {@code actualValue} and {@code delta}
 * are produced by the rule in Java and are the finding. {@code explanation} is
 * the only field a language model may write, and it adds nothing but prose: if
 * it were deleted the finding would still be complete, actionable and correct.
 * That separation is what lets finance act on these numbers.
 */
@Entity
@Table(name = "invoice_audit_findings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InvoiceAuditFinding extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "run_id", nullable = false)
    private InvoiceAuditRun run;

    /** Stable identifier of the rule, e.g. {@code RATE_MISMATCH}. */
    @Column(name = "rule_code", nullable = false, length = 60)
    private String ruleCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Severity severity;

    @Column(nullable = false)
    private String title;

    /** Deterministic, numeric statement of the discrepancy. */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String detail;

    @Column(name = "expected_value")
    private String expectedValue;

    @Column(name = "actual_value")
    private String actualValue;

    @Column(precision = 15, scale = 2)
    private BigDecimal delta;

    @Column(name = "line_item_id")
    private UUID lineItemId;

    /** Model-written explanation of an already-computed finding. Always optional. */
    @Column(columnDefinition = "TEXT")
    private String explanation;
}
