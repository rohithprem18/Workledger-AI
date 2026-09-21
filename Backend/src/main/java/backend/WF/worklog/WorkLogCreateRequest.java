package backend.WF.worklog;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Getter
@NoArgsConstructor
public class WorkLogCreateRequest {

    @NotNull(message = "Assignment ID is required")
    private UUID assignmentId;

    @NotNull(message = "Work date is required")
    private LocalDate workDate;

    @NotEmpty(message = "At least one time segment is required")
    @Valid
    private List<SegmentRequest> segments;
}
