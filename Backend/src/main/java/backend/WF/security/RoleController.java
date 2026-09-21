package backend.WF.security;

import backend.WF.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/roles")
@RequiredArgsConstructor
public class RoleController {

    private final RoleService roleService;

    @GetMapping
    @PreAuthorize("hasAuthority('MANAGE_ROLES') or hasAuthority('MANAGE_USERS')")
    public ApiResponse<List<RoleDtos.RoleResponse>> list() {
        return ApiResponse.ok(roleService.list());
    }

    @PostMapping
    @PreAuthorize("hasAuthority('MANAGE_ROLES')")
    public ApiResponse<RoleDtos.RoleResponse> create(@Valid @RequestBody RoleDtos.CreateRequest request) {
        return ApiResponse.ok(roleService.create(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('MANAGE_ROLES')")
    public ApiResponse<RoleDtos.RoleResponse> update(@PathVariable UUID id,
                                                     @Valid @RequestBody RoleDtos.UpdateRequest request) {
        return ApiResponse.ok(roleService.update(id, request));
    }

    @PutMapping("/{id}/permissions")
    @PreAuthorize("hasAuthority('MANAGE_ROLES')")
    public ApiResponse<RoleDtos.RoleResponse> replacePermissions(
            @PathVariable UUID id, @RequestBody RoleDtos.PermissionsUpdate update) {
        return ApiResponse.ok(roleService.replacePermissions(id, update));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('MANAGE_ROLES')")
    public ApiResponse<Void> delete(@PathVariable UUID id) {
        roleService.delete(id);
        return ApiResponse.ok(null);
    }
}
