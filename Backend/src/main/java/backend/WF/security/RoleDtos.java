package backend.WF.security;

import jakarta.validation.constraints.NotBlank;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;
import java.util.Set;
import java.util.UUID;

public class RoleDtos {

    private RoleDtos() {}

    @Getter
    @Setter
    @NoArgsConstructor
    public static class CreateRequest {
        @NotBlank(message = "Role name is required")
        private String name;
        private String description;
        private Set<UUID> permissionIds;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class UpdateRequest {
        @NotBlank(message = "Role name is required")
        private String name;
        private String description;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class PermissionsUpdate {
        private Set<UUID> permissionIds;
    }

    @Getter
    @Builder
    public static class RoleResponse {
        private UUID id;
        private String name;
        private String description;
        private List<PermissionResponse> permissions;
    }

    @Getter
    @Builder
    public static class PermissionResponse {
        private UUID id;
        private String code;
        private String description;
    }
}
