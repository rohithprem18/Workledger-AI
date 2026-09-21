package backend.WF.assignment.specification;

import backend.WF.common.DateRange;
import backend.WF.common.TimeWindow;
import backend.WF.contract.ContractRequirement;
import backend.WF.contract.ContractRequirementRepository;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.exception.EntityNotFoundException;
import backend.WF.skill.EmployeeSkillRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class SkillMatchSpecification implements AssignmentSpecification {

    private final ContractRequirementRepository requirementRepository;
    private final EmployeeSkillRepository employeeSkillRepository;

    @Override
    public void assertSatisfiedBy(UUID employeeId, UUID requirementId,
                                   DateRange dateRange, List<TimeWindow> plannedWindows) {
        ContractRequirement requirement = requirementRepository.findById(requirementId)
                .orElseThrow(() -> new EntityNotFoundException("ContractRequirement", requirementId));

        UUID requiredSkillId = requirement.getSkill().getId();
        int minProficiency = requirement.getMinProficiency();
        boolean qualifies = employeeSkillRepository
                .existsByEmployeeIdAndSkillIdAndProficiencyLevelGreaterThanEqual(
                        employeeId, requiredSkillId, minProficiency);

        if (!qualifies) {
            throw new BusinessRuleViolationException(
                    "Employee " + employeeId + " lacks required skill '"
                    + requirement.getSkill().getName()
                    + "' at proficiency ≥ " + minProficiency);
        }
    }
}
