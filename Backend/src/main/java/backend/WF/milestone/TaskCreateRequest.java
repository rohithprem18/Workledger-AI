package backend.WF.milestone;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
public class TaskCreateRequest {

    @NotBlank
    private String name;

    private String description;

    private UUID assignedToUserId;
}
