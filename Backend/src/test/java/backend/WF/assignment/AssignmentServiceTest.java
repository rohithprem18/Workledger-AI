package backend.WF.assignment;

import backend.WF.assignment.specification.SpecificationChain;
import backend.WF.contract.ContractRequirement;
import backend.WF.contract.ContractRequirementRepository;
import backend.WF.employee.Employee;
import backend.WF.employee.EmployeeRepository;
import backend.WF.employee.EmployeeService;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.exception.DuplicateAssignmentException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AssignmentServiceTest {

    @Mock private AssignmentRepository assignmentRepository;
    @Mock private EmployeeRepository employeeRepository;
    @Mock private ContractRequirementRepository requirementRepository;
    @Mock private SpecificationChain specificationChain;
    @Mock private EmployeeService employeeService;
    @Mock private EntityManager entityManager;
    @Mock private Query lockQuery;

    @InjectMocks
    private AssignmentService assignmentService;

    private UUID employeeId;
    private UUID requirementId;
    private Employee employee;
    private ContractRequirement requirement;
    private AssignmentCreateRequest request;

    @BeforeEach
    void setUp() {
        employeeId = UUID.randomUUID();
        requirementId = UUID.randomUUID();

        employee = mock(Employee.class);
        when(employee.getId()).thenReturn(employeeId);

        requirement = mock(ContractRequirement.class);
        when(requirement.getId()).thenReturn(requirementId);
        when(requirement.getRequiredEmployeeCount()).thenReturn(2);
        when(requirement.getFulfilledCount()).thenReturn(0);
        when(requirement.isFullyFulfilled()).thenReturn(false);

        request = new AssignmentCreateRequest();
        setField(request, "employeeId", employeeId);
        setField(request, "requirementId", requirementId);
        setField(request, "startDate", LocalDate.now());
        setField(request, "endDate", LocalDate.now().plusDays(30));
        setField(request, "plannedStartTime", LocalTime.of(9, 0));
        setField(request, "plannedEndTime", LocalTime.of(17, 0));

        when(entityManager.createNativeQuery(anyString())).thenReturn(lockQuery);
        when(lockQuery.setParameter(anyInt(), any())).thenReturn(lockQuery);
        when(lockQuery.getSingleResult()).thenReturn(1);
    }

    @Test
    void createAssignment_happyPath_savesAssignmentAndIncrementsCount() {
        when(requirementRepository.findByIdForUpdate(requirementId)).thenReturn(Optional.of(requirement));
        when(employeeRepository.findById(employeeId)).thenReturn(Optional.of(employee));

        Assignment savedAssignment = mock(Assignment.class);
        when(savedAssignment.getId()).thenReturn(UUID.randomUUID());
        when(savedAssignment.getEmployee()).thenReturn(employee);
        when(savedAssignment.getRequirement()).thenReturn(requirement);
        when(savedAssignment.getStatus()).thenReturn(AssignmentStatus.ACTIVE);
        when(savedAssignment.getStartDate()).thenReturn(request.getStartDate());
        when(savedAssignment.getEndDate()).thenReturn(request.getEndDate());
        when(savedAssignment.getPlannedStartTime()).thenReturn(request.getPlannedStartTime());
        when(savedAssignment.getPlannedEndTime()).thenReturn(request.getPlannedEndTime());

        mockRequirementForResponse();
        when(assignmentRepository.save(any())).thenReturn(savedAssignment);
        doNothing().when(specificationChain).assertAllSatisfied(any(), any(), any(), any());

        AssignmentResponse response = assignmentService.createAssignment(request);

        assertNotNull(response);
        verify(assignmentRepository).save(any(Assignment.class));
        verify(requirement).setFulfilledCount(1);
        verify(requirementRepository).save(requirement);
    }

    @Test
    void createAssignment_skillMismatch_propagatesException() {
        when(requirementRepository.findByIdForUpdate(requirementId)).thenReturn(Optional.of(requirement));
        doThrow(new BusinessRuleViolationException("Skill mismatch"))
                .when(specificationChain).assertAllSatisfied(any(), any(), any(), any());

        assertThrows(BusinessRuleViolationException.class,
                () -> assignmentService.createAssignment(request));

        verify(assignmentRepository, never()).save(any());
    }

    @Test
    void createAssignment_inactiveEmployee_propagatesException() {
        when(requirementRepository.findByIdForUpdate(requirementId)).thenReturn(Optional.of(requirement));
        doThrow(new BusinessRuleViolationException("Employee is not active"))
                .when(specificationChain).assertAllSatisfied(any(), any(), any(), any());

        assertThrows(BusinessRuleViolationException.class,
                () -> assignmentService.createAssignment(request));
    }

    @Test
    void createAssignment_collision_throwsDuplicateAssignmentException() {
        when(requirementRepository.findByIdForUpdate(requirementId)).thenReturn(Optional.of(requirement));
        doThrow(new DuplicateAssignmentException("Overlapping assignment"))
                .when(specificationChain).assertAllSatisfied(any(), any(), any(), any());

        assertThrows(DuplicateAssignmentException.class,
                () -> assignmentService.createAssignment(request));
    }

    @Test
    void createAssignment_fullyFulfilled_throwsBusinessRuleViolation() {
        when(requirement.isFullyFulfilled()).thenReturn(true);
        when(requirement.getFulfilledCount()).thenReturn(2);
        when(requirementRepository.findByIdForUpdate(requirementId)).thenReturn(Optional.of(requirement));

        assertThrows(BusinessRuleViolationException.class,
                () -> assignmentService.createAssignment(request));
    }

    private void mockRequirementForResponse() {
        backend.WF.contract.Contract contract = mock(backend.WF.contract.Contract.class);
        when(contract.getId()).thenReturn(UUID.randomUUID());
        when(contract.getTitle()).thenReturn("Test Contract");

        backend.WF.skill.Skill skill = mock(backend.WF.skill.Skill.class);
        when(skill.getName()).thenReturn("Java");

        when(requirement.getContract()).thenReturn(contract);
        when(requirement.getSkill()).thenReturn(skill);
        when(employee.getFullName()).thenReturn("John Doe");
    }

    private void setField(Object target, String fieldName, Object value) {
        try {
            java.lang.reflect.Field field = target.getClass().getDeclaredField(fieldName);
            field.setAccessible(true);
            field.set(target, value);
        } catch (Exception e) {
            throw new RuntimeException("Failed to set field " + fieldName, e);
        }
    }
}
