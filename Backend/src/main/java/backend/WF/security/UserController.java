package backend.WF.security;

import backend.WF.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping
    @PreAuthorize("hasAuthority('MANAGE_USERS')")
    public ApiResponse<List<UserDtos.UserResponse>> list() {
        return ApiResponse.ok(userService.list());
    }

    @PostMapping
    @PreAuthorize("hasAuthority('MANAGE_USERS')")
    public ApiResponse<UserDtos.UserResponse> create(@Valid @RequestBody UserDtos.CreateRequest request) {
        return ApiResponse.ok(userService.create(request));
    }

    @PutMapping("/{id}/roles")
    @PreAuthorize("hasAuthority('MANAGE_USERS')")
    public ApiResponse<UserDtos.UserResponse> replaceRoles(@PathVariable UUID id,
                                                           @RequestBody UserDtos.RolesUpdate update) {
        return ApiResponse.ok(userService.replaceRoles(id, update));
    }

    @PutMapping("/{id}/deactivate")
    @PreAuthorize("hasAuthority('MANAGE_USERS')")
    public ApiResponse<UserDtos.UserResponse> deactivate(@PathVariable UUID id) {
        return ApiResponse.ok(userService.deactivate(id));
    }

    @PostMapping("/{id}/reset-password")
    @PreAuthorize("hasAuthority('MANAGE_USERS')")
    public ApiResponse<Void> resetPassword(@PathVariable UUID id,
                                           @Valid @RequestBody UserDtos.PasswordReset request) {
        userService.resetPassword(id, request);
        return ApiResponse.ok(null);
    }
}
