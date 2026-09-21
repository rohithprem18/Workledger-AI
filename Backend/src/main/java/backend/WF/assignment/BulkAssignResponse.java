package backend.WF.assignment;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
public class BulkAssignResponse {
    private int created;
    private List<AssignmentResponse> assignments;
}
