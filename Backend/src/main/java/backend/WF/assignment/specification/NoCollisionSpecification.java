package backend.WF.assignment.specification;

import backend.WF.assignment.Assignment;
import backend.WF.assignment.AssignmentRepository;
import backend.WF.assignment.AssignmentStatus;
import backend.WF.common.DateRange;
import backend.WF.common.TimeWindow;
import backend.WF.exception.DuplicateAssignmentException;
import backend.WF.worklog.domain.OverlapChecker;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class NoCollisionSpecification implements AssignmentSpecification {

    private final AssignmentRepository assignmentRepository;
    private final OverlapChecker overlapChecker;

    @Override
    public void assertSatisfiedBy(UUID employeeId, UUID requirementId,
                                   DateRange dateRange, List<TimeWindow> plannedWindows) {
        List<Assignment> existing = assignmentRepository.findActiveAssignmentsForEmployee(
                employeeId, dateRange.startDate(), dateRange.endDate());

        for (Assignment existingAssignment : existing) {
            TimeWindow existingWindow = new TimeWindow(
                    existingAssignment.getPlannedStartTime(),
                    existingAssignment.getPlannedEndTime());

            for (TimeWindow planned : plannedWindows) {
                if (overlapChecker.overlaps(planned, existingWindow)) {
                    throw new DuplicateAssignmentException(
                            "Employee " + employeeId + " already has an overlapping assignment "
                            + existingAssignment.getId() + " in the requested time window. "
                            + "Employee was just booked by another assignment, please reselect.");
                }
            }
        }
    }
}
