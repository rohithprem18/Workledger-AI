package backend.WF.skill;

import lombok.Builder;
import lombok.Getter;

import java.util.UUID;

@Getter
@Builder
public class SkillResponse {

    private UUID id;
    private String name;
    private String description;
    private Integer proficiencyLevel;
}
