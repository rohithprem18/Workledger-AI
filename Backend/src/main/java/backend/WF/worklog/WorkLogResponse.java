package backend.WF.worklog;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

@Getter
@Builder
public class WorkLogResponse {

    private UUID id;
    private UUID assignmentId;
    private UUID employeeId;
    private String employeeName;
    private LocalDate workDate;
    private WorkLogStatus status;
    private int totalActualMinutes;
    private LocalDateTime submittedAt;
    private LocalDateTime approvedAt;
    private String rejectionReason;
    private List<SegmentResponse> segments;

    @Getter
    @Builder
    public static class SegmentResponse {
        private UUID id;
        private LocalTime startTime;
        private LocalTime endTime;
    }
}
