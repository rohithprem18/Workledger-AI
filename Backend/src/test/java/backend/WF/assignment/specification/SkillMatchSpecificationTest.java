package backend.WF.assignment.specification;

import backend.WF.common.DateRange;
import backend.WF.contract.ContractRequirement;
import backend.WF.contract.ContractRequirementRepository;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.skill.EmployeeSkillRepository;
import backend.WF.skill.Skill;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SkillMatchSpecificationTest {

    @Mock private ContractRequirementRepository requirementRepository;
    @Mock private EmployeeSkillRepository employeeSkillRepository;

    @InjectMocks
    private SkillMatchSpecification spec;

    private UUID employeeId;
    private UUID requirementId;
    private UUID skillId;
    private ContractRequirement requirement;
    private DateRange dateRange;

    @BeforeEach
    void setUp() {
        employeeId = UUID.randomUUID();
        requirementId = UUID.randomUUID();
        skillId = UUID.randomUUID();
        dateRange = new DateRange(LocalDate.now(), LocalDate.now().plusDays(7));

        Skill skill = mock(Skill.class);
        when(skill.getId()).thenReturn(skillId);
        when(skill.getName()).thenReturn("Java");

        requirement = mock(ContractRequirement.class);
        when(requirement.getSkill()).thenReturn(skill);
        when(requirement.getMinProficiency()).thenReturn(3);

        when(requirementRepository.findById(requirementId)).thenReturn(Optional.of(requirement));
    }

    @Test
    void passes_whenEmployeeHasSkillAtOrAboveThreshold() {
        when(employeeSkillRepository.existsByEmployeeIdAndSkillIdAndProficiencyLevelGreaterThanEqual(
                employeeId, skillId, 3)).thenReturn(true);

        assertDoesNotThrow(() -> spec.assertSatisfiedBy(employeeId, requirementId, dateRange, List.of()));
    }

    @Test
    void fails_whenEmployeeProficiencyBelowThreshold() {
        when(employeeSkillRepository.existsByEmployeeIdAndSkillIdAndProficiencyLevelGreaterThanEqual(
                employeeId, skillId, 3)).thenReturn(false);

        BusinessRuleViolationException ex = assertThrows(BusinessRuleViolationException.class,
                () -> spec.assertSatisfiedBy(employeeId, requirementId, dateRange, List.of()));
        org.junit.jupiter.api.Assertions.assertTrue(ex.getMessage().contains("proficiency ≥ 3"));
    }
}
