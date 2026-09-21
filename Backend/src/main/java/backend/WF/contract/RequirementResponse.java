package backend.WF.contract;

import lombok.Builder;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Getter
@Builder
public class RequirementResponse {

    private UUID id;
    private UUID skillId;
    private String skillName;
    private int requiredEmployeeCount;
    private BigDecimal hourlyRate;
    private BigDecimal expectedHoursPerDay;
    private int minProficiency;
    private LocalDate startDate;
    private LocalDate endDate;
    private int fulfilledCount;
    private int remainingSlots;
}
