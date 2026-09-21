package backend.WF.assignment;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

@Getter
@Builder
public class AssignmentResponse {

    private UUID id;
    private UUID employeeId;
    private String employeeName;
    private UUID requirementId;
    private String skillName;
    private UUID contractId;
    private String contractTitle;
    private LocalDate startDate;
    private LocalDate endDate;
    private LocalTime plannedStartTime;
    private LocalTime plannedEndTime;
    private AssignmentStatus status;
}
