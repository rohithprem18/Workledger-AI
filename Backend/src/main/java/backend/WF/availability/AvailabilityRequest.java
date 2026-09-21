package backend.WF.availability;

import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalTime;

@Getter
@NoArgsConstructor
public class AvailabilityRequest {

    @Min(value = 1, message = "Day of week must be between 1 (Monday) and 7 (Sunday)")
    @Max(value = 7, message = "Day of week must be between 1 (Monday) and 7 (Sunday)")
    private int dayOfWeek;

    @NotNull(message = "Start time is required")
    private LocalTime startTime;

    @NotNull(message = "End time is required")
    private LocalTime endTime;

    @NotNull(message = "Max hours per day is required")
    @DecimalMin(value = "0.5", message = "Max hours must be at least 0.5")
    @DecimalMax(value = "24.0", message = "Max hours cannot exceed 24")
    private BigDecimal maxHoursPerDay;
}
