package backend.WF.milestone;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TaskUpdateStatusRequest {

    @NotNull
    private TaskStatus status;
}
