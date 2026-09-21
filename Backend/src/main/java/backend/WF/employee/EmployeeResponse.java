package backend.WF.employee;

import backend.WF.skill.SkillResponse;
import lombok.Builder;
import lombok.Getter;

import java.util.List;
import java.util.UUID;

@Getter
@Builder
public class EmployeeResponse {

    private UUID id;
    private UUID userId;
    private String firstName;
    private String lastName;
    private String email;
    private String phone;
    private boolean active;
    private String username;
    private List<SkillResponse> skills;
}
