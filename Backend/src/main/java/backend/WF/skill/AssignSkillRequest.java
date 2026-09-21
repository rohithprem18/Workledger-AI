package backend.WF.skill;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Getter
@NoArgsConstructor
public class AssignSkillRequest {

    @NotNull(message = "Skill ID is required")
    private UUID skillId;

    @Min(value = 1, message = "Proficiency must be between 1 and 5")
    @Max(value = 5, message = "Proficiency must be between 1 and 5")
    private int proficiencyLevel;
}
