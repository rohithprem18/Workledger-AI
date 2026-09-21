package backend.WF.employee;

import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.exception.EntityNotFoundException;
import backend.WF.security.Role;
import backend.WF.security.RoleRepository;
import backend.WF.security.User;
import backend.WF.security.UserRepository;
import backend.WF.skill.EmployeeSkill;
import backend.WF.skill.SkillResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public EmployeeResponse createEmployee(EmployeeCreateRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new BusinessRuleViolationException("Username already exists: " + request.getUsername());
        }
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BusinessRuleViolationException("Email already registered: " + request.getEmail());
        }

        Role employeeRole = roleRepository.findByName("EMPLOYEE")
                .orElseThrow(() -> new EntityNotFoundException("EMPLOYEE role not found in database"));

        User user = User.builder()
                .username(request.getUsername())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .email(request.getEmail())
                .active(true)
                .build();
        user.getRoles().add(employeeRole);
        user = userRepository.save(user);

        Employee employee = Employee.builder()
                .user(user)
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .email(request.getEmail())
                .phone(request.getPhone())
                .active(true)
                .build();
        employee = employeeRepository.save(employee);

        return toResponse(employee);
    }

    @Transactional
    public EmployeeResponse updateEmployee(UUID id, EmployeeUpdateRequest request) {
        Employee employee = loadEmployee(id);
        employee.setFirstName(request.getFirstName());
        employee.setLastName(request.getLastName());
        employee.setPhone(request.getPhone());
        return toResponse(employeeRepository.save(employee));
    }

    @Transactional
    public void deactivateEmployee(UUID id) {
        Employee employee = loadEmployee(id);
        employee.setActive(false);
        employee.getUser().setActive(false);
        employeeRepository.save(employee);
    }

    @Transactional(readOnly = true)
    public EmployeeResponse getEmployee(UUID id) {
        return toResponse(loadEmployee(id));
    }

    @Transactional(readOnly = true)
    public List<EmployeeResponse> getAllEmployees() {
        return employeeRepository.findByActiveTrue().stream()
                .map(this::toResponse)
                .toList();
    }

    public Employee loadEmployee(UUID id) {
        return employeeRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Employee", id));
    }

    public Employee loadEmployeeByUserId(UUID userId) {
        return employeeRepository.findByUserId(userId)
                .orElseThrow(() -> new EntityNotFoundException("Employee not found for user: " + userId));
    }

    public EmployeeResponse toResponse(Employee employee) {
        List<SkillResponse> skills = employee.getSkills().stream()
                .map(es -> SkillResponse.builder()
                        .id(es.getSkill().getId())
                        .name(es.getSkill().getName())
                        .description(es.getSkill().getDescription())
                        .proficiencyLevel(es.getProficiencyLevel())
                        .build())
                .toList();

        return EmployeeResponse.builder()
                .id(employee.getId())
                .userId(employee.getUser().getId())
                .firstName(employee.getFirstName())
                .lastName(employee.getLastName())
                .email(employee.getEmail())
                .phone(employee.getPhone())
                .active(employee.isActive())
                .username(employee.getUser().getUsername())
                .skills(skills)
                .build();
    }
}
