package backend.WF.invoice;

import lombok.Builder;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Getter
@Builder
public class InvoiceResponse {

    private UUID id;
    private UUID contractId;
    private String contractTitle;
    private LocalDate periodStart;
    private LocalDate periodEnd;
    private BigDecimal totalAmount;
    private InvoiceStatus status;
    private LocalDateTime approvedAt;
    private UUID milestoneId;
    private List<LineItemResponse> lineItems;

    @Getter
    @Builder
    public static class LineItemResponse {
        private UUID id;
        private String description;
        private BigDecimal quantity;
        private BigDecimal unitRate;
        private BigDecimal amount;
    }
}
