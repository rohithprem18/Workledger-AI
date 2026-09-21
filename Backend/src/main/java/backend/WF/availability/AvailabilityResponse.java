package backend.WF.availability;

import lombok.Builder;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.UUID;

@Getter
@Builder
public class AvailabilityResponse {

    private UUID id;
    private int dayOfWeek;
    private String dayName;
    private LocalTime startTime;
    private LocalTime endTime;
    private BigDecimal maxHoursPerDay;
}
