package backend.WF.security;

import backend.WF.audit.Auditable;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.exception.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RoleService {

    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<RoleDtos.RoleResponse> list() {
        return roleRepository.findAll().stream()
                .sorted(Comparator.comparing(Role::getName))
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<RoleDtos.PermissionResponse> listPermissions() {
        return permissionRepository.findAll().stream()
                .sorted(Comparator.comparing(Permission::getCode))
                .map(p -> RoleDtos.PermissionResponse.builder()
                        .id(p.getId())
                        .code(p.getCode())
                        .description(p.getDescription())
                        .build())
                .toList();
    }

    @Transactional
    @Auditable(action = "CREATE_ROLE", entityType = "Role")
    public RoleDtos.RoleResponse create(RoleDtos.CreateRequest request) {
        if (roleRepository.findByName(request.getName()).isPresent()) {
            throw new BusinessRuleViolationException("Role name already exists: " + request.getName());
        }
        Role role = Role.builder()
                .name(request.getName())
                .description(request.getDescription())
                .permissions(loadPermissions(request.getPermissionIds()))
                .build();
        return toResponse(roleRepository.save(role));
    }

    @Transactional
    @Auditable(action = "UPDATE_ROLE", entityType = "Role")
    public RoleDtos.RoleResponse update(UUID id, RoleDtos.UpdateRequest request) {
        Role role = loadRole(id);
        role.setName(request.getName());
        role.setDescription(request.getDescription());
        return toResponse(roleRepository.save(role));
    }

    @Transactional
    @Auditable(action = "UPDATE_ROLE_PERMISSIONS", entityType = "Role")
    public RoleDtos.RoleResponse replacePermissions(UUID id, RoleDtos.PermissionsUpdate update) {
        Role role = loadRole(id);
        role.setPermissions(loadPermissions(update.getPermissionIds()));
        return toResponse(roleRepository.save(role));
    }

    @Transactional
    @Auditable(action = "DELETE_ROLE", entityType = "Role")
    public void delete(UUID id) {
        Role role = loadRole(id);
        long inUse = userRepository.findAll().stream()
                .filter(u -> u.getRoles().stream().anyMatch(r -> r.getId().equals(id)))
                .count();
        if (inUse > 0) {
            throw new BusinessRuleViolationException(
                    "Cannot delete role '" + role.getName() + "': assigned to " + inUse + " user(s)");
        }
        roleRepository.delete(role);
    }

    private Role loadRole(UUID id) {
        return roleRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Role", id));
    }

    private Set<Permission> loadPermissions(Set<UUID> ids) {
        if (ids == null || ids.isEmpty()) return new HashSet<>();
        Set<Permission> perms = new HashSet<>(permissionRepository.findAllById(ids));
        if (perms.size() != ids.size()) {
            throw new BusinessRuleViolationException("One or more permission ids are invalid");
        }
        return perms;
    }

    private RoleDtos.RoleResponse toResponse(Role r) {
        List<RoleDtos.PermissionResponse> perms = r.getPermissions().stream()
                .sorted(Comparator.comparing(Permission::getCode))
                .map(p -> RoleDtos.PermissionResponse.builder()
                        .id(p.getId())
                        .code(p.getCode())
                        .description(p.getDescription())
                        .build())
                .toList();
        return RoleDtos.RoleResponse.builder()
                .id(r.getId())
                .name(r.getName())
                .description(r.getDescription())
                .permissions(perms)
                .build();
    }
}
