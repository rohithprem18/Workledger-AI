package backend.WF.assignment;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

@Getter
@NoArgsConstructor
public class AssignmentCreateRequest {

    @NotNull(message = "Employee ID is required")
    private UUID employeeId;

    @NotNull(message = "Requirement ID is required")
    private UUID requirementId;

    @NotNull(message = "Start date is required")
    private LocalDate startDate;

    @NotNull(message = "End date is required")
    private LocalDate endDate;

    @NotNull(message = "Planned start time is required")
    private LocalTime plannedStartTime;

    @NotNull(message = "Planned end time is required")
    private LocalTime plannedEndTime;
}
