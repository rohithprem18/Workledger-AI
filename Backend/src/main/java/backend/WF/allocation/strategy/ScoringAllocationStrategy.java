package backend.WF.allocation.strategy;

import backend.WF.assignment.AssignmentRepository;
import backend.WF.assignment.AssignmentStatus;
import backend.WF.assignment.specification.SpecificationChain;
import backend.WF.common.DateRange;
import backend.WF.contract.ContractRequirement;
import backend.WF.contract.ContractRequirementRepository;
import backend.WF.employee.Employee;
import backend.WF.employee.EmployeeRepository;
import backend.WF.skill.EmployeeSkillRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * Allocation strategy: rank eligible employees by skill proficiency + workload balance.
 * Filtering via SpecificationChain, ranking via scoring formula.
 * Phase 1 auto-suggest implementation.
 */
@Component("scoringStrategy")
@RequiredArgsConstructor
public class ScoringAllocationStrategy implements AllocationStrategy {

    private final EmployeeRepository employeeRepository;
    private final ContractRequirementRepository requirementRepository;
    private final EmployeeSkillRepository employeeSkillRepository;
    private final AssignmentRepository assignmentRepository;
    private final SpecificationChain specificationChain;

    @Override
    public List<UUID> selectCandidates(UUID requirementId, int count, DateRange dateRange) {
        ContractRequirement requirement = requirementRepository.findById(requirementId)
                .orElseThrow(() -> new RuntimeException("Requirement not found: " + requirementId));

        return employeeRepository.findByActiveTrue().stream()
                .filter(emp -> specificationChain.isSatisfied(
                        emp.getId(), requirementId, dateRange, List.of()))
                .sorted(Comparator.comparingDouble((Employee emp) -> scoreEmployee(emp.getId(), requirement))
                        .reversed())
                .limit(count)
                .map(Employee::getId)
                .toList();
    }

    /**
     * Score employee for a specific requirement.
     * Formula: (proficiency/5 × 0.6) + (1 - activeCount/10 × 0.4)
     * Range: 0.0 (worst) to 1.0 (best)
     *
     * Components:
     * - Proficiency (60% weight): How skilled in the required skill (1–5 → 0–1)
     * - Workload balance (40% weight): How many slots available (fewer active = higher score)
     */
    private double scoreEmployee(UUID employeeId, ContractRequirement requirement) {
        int proficiency = employeeSkillRepository
                .findByEmployeeIdAndSkillId(employeeId, requirement.getSkill().getId())
                .map(skill -> skill.getProficiencyLevel())
                .orElse(1);
        double proficiencyScore = (proficiency / 5.0) * 0.6;

        int activeCount = assignmentRepository
                .findByEmployeeIdAndStatus(employeeId, AssignmentStatus.ACTIVE)
                .size();
        double workloadScore = Math.max(0.0, 1.0 - (activeCount / 10.0)) * 0.4;

        return proficiencyScore + workloadScore;
    }
}
