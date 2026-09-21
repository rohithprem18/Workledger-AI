package backend.WF.skill;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class SkillCreateRequest {

    @NotBlank(message = "Skill name is required")
    private String name;

    private String description;
}
