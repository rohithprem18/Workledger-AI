package backend.WF.assignment.specification;

import backend.WF.common.DateRange;
import backend.WF.common.TimeWindow;
import backend.WF.exception.BusinessRuleViolationException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SpecificationChain {

    private final ActiveStatusSpecification activeStatusSpecification;
    private final SkillMatchSpecification skillMatchSpecification;
    private final CapacitySpecification capacitySpecification;
    private final NoCollisionSpecification noCollisionSpecification;

    public void assertAllSatisfied(UUID employeeId, UUID requirementId,
                                    DateRange dateRange, List<TimeWindow> plannedWindows)
            throws BusinessRuleViolationException {
        activeStatusSpecification.assertSatisfiedBy(employeeId, requirementId, dateRange, plannedWindows);
        skillMatchSpecification.assertSatisfiedBy(employeeId, requirementId, dateRange, plannedWindows);
        capacitySpecification.assertSatisfiedBy(employeeId, requirementId, dateRange, plannedWindows);
        noCollisionSpecification.assertSatisfiedBy(employeeId, requirementId, dateRange, plannedWindows);
    }

    /**
     * Returns true if all specs pass for this employee — used to filter eligible candidates.
     */
    public boolean isSatisfied(UUID employeeId, UUID requirementId,
                                DateRange dateRange, List<TimeWindow> plannedWindows) {
        try {
            assertAllSatisfied(employeeId, requirementId, dateRange, plannedWindows);
            return true;
        } catch (BusinessRuleViolationException e) {
            return false;
        }
    }
}
