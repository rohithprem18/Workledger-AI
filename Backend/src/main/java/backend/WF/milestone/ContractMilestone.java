package backend.WF.milestone;

import backend.WF.common.BaseEntity;
import backend.WF.contract.Contract;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "contract_milestones")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContractMilestone extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contract_id", nullable = false)
    private Contract contract;

    @Column(name = "sequence_order", nullable = false)
    private int sequenceOrder;

    @Column(nullable = false)
    private String label;

    @Column(name = "threshold_percent", precision = 5, scale = 2)
    private BigDecimal thresholdPercent;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private MilestoneStatus status = MilestoneStatus.PENDING;

    @Column(name = "marked_by_user_id")
    private UUID markedByUserId;

    @Column(name = "marked_at")
    private LocalDateTime markedAt;

    @Column(name = "approved_by_user_id")
    private UUID approvedByUserId;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "invoice_id")
    private UUID invoiceId;

    @OneToMany(mappedBy = "milestone", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<MilestoneTask> tasks = new ArrayList<>();
}
