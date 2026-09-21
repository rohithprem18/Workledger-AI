package backend.WF.milestone;

import backend.WF.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class MilestoneTaskController {

    private final MilestoneTaskService milestoneTaskService;

    @PostMapping("/api/milestones/{id}/tasks")
    @PreAuthorize("hasAuthority('CREATE_CONTRACT')")
    public ResponseEntity<ApiResponse<TaskResponse>> createRootTask(
            @PathVariable("id") UUID milestoneId,
            @Valid @RequestBody TaskCreateRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(milestoneTaskService.createRootTask(milestoneId, request)));
    }

    @PostMapping("/api/tasks/{id}/subtasks")
    @PreAuthorize("hasAuthority('CREATE_CONTRACT')")
    public ResponseEntity<ApiResponse<TaskResponse>> createSubtask(
            @PathVariable("id") UUID parentTaskId,
            @Valid @RequestBody TaskCreateRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(milestoneTaskService.createSubtask(parentTaskId, request)));
    }

    @GetMapping("/api/milestones/{id}/tasks")
    @PreAuthorize("hasAuthority('VIEW_CONTRACTS')")
    public ApiResponse<List<TaskResponse>> listByMilestone(@PathVariable("id") UUID milestoneId) {
        return ApiResponse.ok(milestoneTaskService.listByMilestone(milestoneId));
    }

    @PutMapping("/api/tasks/{id}/status")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<TaskResponse> updateStatus(
            @PathVariable("id") UUID taskId,
            @Valid @RequestBody TaskUpdateStatusRequest request) {
        return ApiResponse.ok(milestoneTaskService.updateStatus(taskId, request.getStatus()));
    }

    @DeleteMapping("/api/tasks/{id}")
    @PreAuthorize("hasAuthority('CREATE_CONTRACT')")
    public ApiResponse<Void> deleteTask(@PathVariable("id") UUID taskId) {
        milestoneTaskService.deleteTask(taskId);
        return ApiResponse.ok(null);
    }

    @GetMapping("/api/tasks/mine")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<List<TaskResponse>> getMyTasks() {
        return ApiResponse.ok(milestoneTaskService.getMyTasks());
    }
}
