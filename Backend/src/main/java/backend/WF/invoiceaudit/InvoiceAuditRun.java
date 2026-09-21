package backend.WF.invoiceaudit;

import backend.WF.common.BaseEntity;
import backend.WF.invoice.Invoice;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * One reconciliation of one invoice against the three authoritative sources.
 *
 * <p>Runs are kept rather than overwritten: the verdict that was in force when
 * an invoice was approved is part of the financial record, and a later re-run
 * on changed data must not be able to rewrite history.
 */
@Entity
@Table(name = "invoice_audit_runs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InvoiceAuditRun extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invoice_id", nullable = false)
    private Invoice invoice;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Verdict verdict;

    @Column(name = "blocker_count", nullable = false)
    @Builder.Default
    private int blockerCount = 0;

    @Column(name = "warning_count", nullable = false)
    @Builder.Default
    private int warningCount = 0;

    @Column(name = "info_count", nullable = false)
    @Builder.Default
    private int infoCount = 0;

    /** Source 1 — what the contract authorises for this period. */
    @Column(name = "contract_total", precision = 15, scale = 2)
    private BigDecimal contractTotal;

    /** Source 2 — what approved work is actually worth at contracted rates. */
    @Column(name = "approved_work_total", precision = 15, scale = 2)
    private BigDecimal approvedWorkTotal;

    /** Source 3 — what the invoice presents for payment. */
    @Column(name = "invoiced_total", precision = 15, scale = 2)
    private BigDecimal invoicedTotal;

    /** Plain-English summary. Written by the model when enabled, else templated. */
    @Column(columnDefinition = "TEXT")
    private String narrative;

    @Column(name = "narrative_engine", length = 50)
    private String narrativeEngine;

    /** Which rule set produced this verdict, so an old run stays interpretable. */
    @Column(name = "rules_version", nullable = false, length = 20)
    private String rulesVersion;

    @Column(name = "run_by")
    private UUID runBy;

    @OneToMany(mappedBy = "run", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<InvoiceAuditFinding> findings = new ArrayList<>();
}
