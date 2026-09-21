package backend.WF.assignment.specification;

import backend.WF.common.DateRange;
import backend.WF.common.TimeWindow;
import backend.WF.employee.Employee;
import backend.WF.employee.EmployeeRepository;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.exception.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class ActiveStatusSpecification implements AssignmentSpecification {

    private final EmployeeRepository employeeRepository;

    @Override
    public void assertSatisfiedBy(UUID employeeId, UUID requirementId,
                                   DateRange dateRange, List<TimeWindow> plannedWindows) {
        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new EntityNotFoundException("Employee", employeeId));
        if (!employee.isActive()) {
            throw new BusinessRuleViolationException(
                    "Employee " + employeeId + " is not active and cannot be assigned");
        }
    }
}
