package backend.WF.security;

import backend.WF.audit.Auditable;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.exception.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public List<UserDtos.UserResponse> list() {
        return userRepository.findAll().stream()
                .sorted(Comparator.comparing(User::getUsername))
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    @Auditable(action = "CREATE_USER", entityType = "User")
    public UserDtos.UserResponse create(UserDtos.CreateRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new BusinessRuleViolationException("Username already exists: " + request.getUsername());
        }
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BusinessRuleViolationException("Email already exists: " + request.getEmail());
        }
        User user = User.builder()
                .username(request.getUsername())
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .active(true)
                .roles(loadRoles(request.getRoleIds()))
                .build();
        return toResponse(userRepository.save(user));
    }

    @Transactional
    @Auditable(action = "UPDATE_USER_ROLES", entityType = "User")
    public UserDtos.UserResponse replaceRoles(UUID id, UserDtos.RolesUpdate update) {
        User user = loadUser(id);
        user.setRoles(loadRoles(update.getRoleIds()));
        return toResponse(userRepository.save(user));
    }

    @Transactional
    @Auditable(action = "DEACTIVATE_USER", entityType = "User")
    public UserDtos.UserResponse deactivate(UUID id) {
        User user = loadUser(id);
        user.setActive(false);
        return toResponse(userRepository.save(user));
    }

    @Transactional
    @Auditable(action = "RESET_PASSWORD", entityType = "User")
    public void resetPassword(UUID id, UserDtos.PasswordReset request) {
        User user = loadUser(id);
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        userRepository.save(user);
    }

    private User loadUser(UUID id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("User", id));
    }

    private Set<Role> loadRoles(Set<UUID> ids) {
        if (ids == null || ids.isEmpty()) return new HashSet<>();
        Set<Role> roles = new HashSet<>(roleRepository.findAllById(ids));
        if (roles.size() != ids.size()) {
            throw new BusinessRuleViolationException("One or more role ids are invalid");
        }
        return roles;
    }

    private UserDtos.UserResponse toResponse(User u) {
        return UserDtos.UserResponse.builder()
                .id(u.getId())
                .username(u.getUsername())
                .email(u.getEmail())
                .active(u.isActive())
                .roleNames(u.getRoles().stream().map(Role::getName).sorted().toList())
                .roleIds(u.getRoles().stream().map(Role::getId).toList())
                .build();
    }
}
