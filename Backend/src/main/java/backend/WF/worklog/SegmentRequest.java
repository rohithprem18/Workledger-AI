package backend.WF.worklog;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalTime;

@Getter
@NoArgsConstructor
public class SegmentRequest {

    @NotNull(message = "Segment start time is required")
    private LocalTime startTime;

    @NotNull(message = "Segment end time is required")
    private LocalTime endTime;
}
