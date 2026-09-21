package backend.WF.assignment;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

@Getter
@Builder
public class SuggestedAssignmentItem {
    private UUID requirementId;
    private String skillName;
    private int slotIndex;
    private UUID employeeId;
    private String employeeName;
    private double score;
    private String status; // SUGGESTED | UNASSIGNABLE
    private LocalDate startDate;
    private LocalDate endDate;
    private LocalTime plannedStartTime;
    private LocalTime plannedEndTime;
}
