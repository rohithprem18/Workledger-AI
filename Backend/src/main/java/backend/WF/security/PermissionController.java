package backend.WF.security;

import backend.WF.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/permissions")
@RequiredArgsConstructor
public class PermissionController {

    private final RoleService roleService;

    @GetMapping
    @PreAuthorize("hasAuthority('MANAGE_ROLES')")
    public ApiResponse<List<RoleDtos.PermissionResponse>> list() {
        return ApiResponse.ok(roleService.listPermissions());
    }
}
