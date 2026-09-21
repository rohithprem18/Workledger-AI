package backend.WF.milestone;

import lombok.Builder;
import lombok.Getter;

import java.util.UUID;

@Getter
@Builder
public class TaskResponse {

    private UUID id;
    private UUID milestoneId;
    private UUID parentId;
    private String name;
    private String description;
    private UUID assignedToUserId;
    private TaskStatus status;
    private int childCount;
}
