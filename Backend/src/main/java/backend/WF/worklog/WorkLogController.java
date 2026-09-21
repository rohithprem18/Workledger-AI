package backend.WF.worklog;

import backend.WF.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/worklogs")
@RequiredArgsConstructor
public class WorkLogController {

    private final WorkLogService workLogService;

    @PostMapping
    @PreAuthorize("hasAuthority('SUBMIT_TIMESHEET')")
    public ResponseEntity<ApiResponse<WorkLogResponse>> createAndSubmitWorkLog(
            @Valid @RequestBody WorkLogCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(workLogService.createAndSubmitWorkLog(request)));
    }

    @PutMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('APPROVE_TIMESHEET')")
    public ResponseEntity<ApiResponse<WorkLogResponse>> approveWorkLog(
            @PathVariable UUID id,
            @RequestBody WorkLogApprovalRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(workLogService.approveWorkLog(id, request)));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('VIEW_TIMESHEETS')")
    public ResponseEntity<ApiResponse<List<WorkLogResponse>>> getWorkLogsForApproval(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(ApiResponse.ok(workLogService.getWorkLogsForApproval(from, to)));
    }

    @GetMapping("/approved")
    @PreAuthorize("hasAuthority('VIEW_TIMESHEETS')")
    public ResponseEntity<ApiResponse<List<WorkLogResponse>>> getApprovedWorkLogs() {
        return ResponseEntity.ok(ApiResponse.ok(workLogService.getByStatus(WorkLogStatus.APPROVED)));
    }

    @GetMapping("/mine")
    @PreAuthorize("hasAuthority('VIEW_OWN_TIMESHEETS')")
    public ResponseEntity<ApiResponse<List<WorkLogResponse>>> getMyWorkLogs(
            @RequestParam UUID employeeId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (from != null && to != null) {
            return ResponseEntity.ok(ApiResponse.ok(workLogService.getMyWorkLogsBetween(employeeId, from, to)));
        }
        return ResponseEntity.ok(ApiResponse.ok(workLogService.getMyWorkLogs(employeeId)));
    }
}
