package backend.WF.worklog;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class WorkLogApprovalRequest {

    private boolean approved;
    private String rejectionReason;
}
