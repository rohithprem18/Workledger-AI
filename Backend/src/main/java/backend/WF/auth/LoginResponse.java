package backend.WF.auth;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
public class LoginResponse {

    private String token;
    private String refreshToken;
    private String username;
    private String employeeId;
    private List<String> roles;
    private List<String> permissions;
}
