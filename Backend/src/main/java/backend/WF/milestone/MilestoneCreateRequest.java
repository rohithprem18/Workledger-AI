package backend.WF.milestone;

import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

@Getter
@Setter
@NoArgsConstructor
public class MilestoneCreateRequest {

    @Min(value = 1, message = "Sequence order must be positive")
    private int sequenceOrder;

    @NotBlank(message = "Label is required")
    private String label;

    @DecimalMin(value = "0.00", message = "Threshold percent must be non-negative")
    @DecimalMax(value = "100.00", message = "Threshold percent must not exceed 100")
    private BigDecimal thresholdPercent;

    @NotNull(message = "Amount is required")
    @DecimalMin(value = "0.01", message = "Amount must be positive")
    private BigDecimal amount;
}
