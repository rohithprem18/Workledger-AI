package backend.WF.skill;

import backend.WF.employee.Employee;
import backend.WF.employee.EmployeeRepository;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.exception.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SkillService {

    private final SkillRepository skillRepository;
    private final EmployeeSkillRepository employeeSkillRepository;
    private final EmployeeRepository employeeRepository;

    @Transactional
    public SkillResponse createSkill(SkillCreateRequest request) {
        if (skillRepository.existsByNameIgnoreCase(request.getName())) {
            throw new BusinessRuleViolationException("Skill already exists: " + request.getName());
        }
        Skill skill = Skill.builder()
                .name(request.getName())
                .description(request.getDescription())
                .build();
        skill = skillRepository.save(skill);
        return toResponse(skill, null);
    }

    @Transactional
    public SkillResponse assignSkillToEmployee(UUID employeeId, AssignSkillRequest request) {
        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new EntityNotFoundException("Employee", employeeId));
        Skill skill = skillRepository.findById(request.getSkillId())
                .orElseThrow(() -> new EntityNotFoundException("Skill", request.getSkillId()));

        EmployeeSkill employeeSkill = employeeSkillRepository
                .findByEmployeeIdAndSkillId(employeeId, skill.getId())
                .orElse(EmployeeSkill.builder().employee(employee).skill(skill).build());

        employeeSkill.setProficiencyLevel(request.getProficiencyLevel());
        employeeSkillRepository.save(employeeSkill);
        return toResponse(skill, request.getProficiencyLevel());
    }

    @Transactional
    public void removeSkillFromEmployee(UUID employeeId, UUID skillId) {
        EmployeeSkill employeeSkill = employeeSkillRepository.findByEmployeeIdAndSkillId(employeeId, skillId)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Employee " + employeeId + " does not have skill " + skillId));
        employeeSkillRepository.delete(employeeSkill);
    }

    @Transactional(readOnly = true)
    public List<SkillResponse> getEmployeeSkills(UUID employeeId) {
        return employeeSkillRepository.findByEmployeeId(employeeId).stream()
                .map(es -> toResponse(es.getSkill(), es.getProficiencyLevel()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<SkillResponse> getAllSkills() {
        return skillRepository.findAll().stream()
                .map(s -> toResponse(s, null))
                .toList();
    }

    private SkillResponse toResponse(Skill skill, Integer proficiency) {
        return SkillResponse.builder()
                .id(skill.getId())
                .name(skill.getName())
                .description(skill.getDescription())
                .proficiencyLevel(proficiency)
                .build();
    }
}
