package backend.WF.assignment.specification;

import backend.WF.common.DateRange;
import backend.WF.common.TimeWindow;
import backend.WF.exception.BusinessRuleViolationException;

import java.util.List;
import java.util.UUID;

public interface AssignmentSpecification {

    void assertSatisfiedBy(UUID employeeId, UUID requirementId,
                           DateRange dateRange, List<TimeWindow> plannedWindows)
            throws BusinessRuleViolationException;
}
