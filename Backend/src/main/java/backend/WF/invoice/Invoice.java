package backend.WF.invoice;

import backend.WF.common.BaseEntity;
import backend.WF.contract.Contract;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "invoices")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Invoice extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contract_id", nullable = false)
    private Contract contract;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;

    @Column(name = "total_amount", nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal totalAmount = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private InvoiceStatus status = InvoiceStatus.DRAFT;

    @Column(name = "generated_by", nullable = false)
    private UUID generatedBy;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "milestone_id")
    private UUID milestoneId;

    // --- Audit override: set only when finance approves despite blocking findings ---

    @Column(name = "audit_override_reason", columnDefinition = "TEXT")
    private String auditOverrideReason;

    @Column(name = "audit_override_by")
    private UUID auditOverrideBy;

    @Column(name = "audit_override_at")
    private LocalDateTime auditOverrideAt;

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<InvoiceLineItem> lineItems = new ArrayList<>();
}
