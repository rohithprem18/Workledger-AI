package backend.WF.security;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;
import java.util.Set;
import java.util.UUID;

public class UserDtos {

    private UserDtos() {}

    @Getter
    @Setter
    @NoArgsConstructor
    public static class CreateRequest {
        @NotBlank private String username;
        @NotBlank @Email private String email;
        @PasswordStrength
        private String password;
        private Set<UUID> roleIds;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class RolesUpdate {
        private Set<UUID> roleIds;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class PasswordReset {
        @PasswordStrength
        private String password;
    }

    @Getter
    @Builder
    public static class UserResponse {
        private UUID id;
        private String username;
        private String email;
        private boolean active;
        private List<String> roleNames;
        private List<UUID> roleIds;
    }
}
