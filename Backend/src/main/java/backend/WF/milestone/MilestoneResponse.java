package backend.WF.milestone;

import lombok.Builder;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Builder
public class MilestoneResponse {

    private UUID id;
    private UUID contractId;
    private String contractTitle;
    private int sequenceOrder;
    private String label;
    private BigDecimal thresholdPercent;
    private BigDecimal amount;
    private MilestoneStatus status;
    private UUID markedByUserId;
    private LocalDateTime markedAt;
    private UUID approvedByUserId;
    private LocalDateTime approvedAt;
    private UUID invoiceId;
    private int totalTasks;
    private int completedTasks;
}
