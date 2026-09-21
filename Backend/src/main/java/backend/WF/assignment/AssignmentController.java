package backend.WF.assignment;

import backend.WF.common.ApiResponse;
import backend.WF.employee.EmployeeResponse;
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
@RequiredArgsConstructor
public class AssignmentController {

    private final AssignmentService assignmentService;

    @PostMapping("/api/assignments")
    @PreAuthorize("hasAuthority('CREATE_ASSIGNMENT')")
    public ResponseEntity<ApiResponse<AssignmentResponse>> createAssignment(
            @Valid @RequestBody AssignmentCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(assignmentService.createAssignment(request)));
    }

    @DeleteMapping("/api/assignments/{id}")
    @PreAuthorize("hasAuthority('CANCEL_ASSIGNMENT')")
    public ResponseEntity<ApiResponse<AssignmentResponse>> cancelAssignment(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.ok(assignmentService.cancelAssignment(id)));
    }

    @GetMapping("/api/requirements/{requirementId}/assignments")
    @PreAuthorize("hasAuthority('VIEW_ASSIGNMENTS')")
    public ResponseEntity<ApiResponse<List<AssignmentResponse>>> getAssignmentsByRequirement(
            @PathVariable UUID requirementId) {
        return ResponseEntity.ok(ApiResponse.ok(assignmentService.getAssignmentsByRequirement(requirementId)));
    }

    @GetMapping("/api/contracts/{contractId}/assignments")
    @PreAuthorize("hasAuthority('VIEW_ASSIGNMENTS')")
    public ResponseEntity<ApiResponse<List<AssignmentResponse>>> getAssignmentsByContract(
            @PathVariable UUID contractId) {
        return ResponseEntity.ok(ApiResponse.ok(assignmentService.getAssignmentsByContract(contractId)));
    }

    @GetMapping("/api/requirements/{requirementId}/eligible-employees")
    @PreAuthorize("hasAuthority('CREATE_ASSIGNMENT')")
    public ResponseEntity<ApiResponse<List<EmployeeResponse>>> getEligibleEmployees(
            @PathVariable UUID requirementId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return ResponseEntity.ok(ApiResponse.ok(
                assignmentService.getEligibleEmployees(requirementId, startDate, endDate)));
    }

    @GetMapping("/api/assignments/mine")
    @PreAuthorize("hasAuthority('VIEW_OWN_ASSIGNMENTS')")
    public ResponseEntity<ApiResponse<List<AssignmentResponse>>> getMyAssignments(
            @RequestParam UUID employeeId) {
        return ResponseEntity.ok(ApiResponse.ok(assignmentService.getMyAssignments(employeeId)));
    }

    @GetMapping("/api/contracts/{contractId}/suggest-assignments")
    @PreAuthorize("hasAuthority('CREATE_ASSIGNMENT')")
    public ResponseEntity<ApiResponse<List<SuggestedAssignmentItem>>> suggestAssignments(
            @PathVariable UUID contractId) {
        return ResponseEntity.ok(ApiResponse.ok(assignmentService.suggestAssignments(contractId)));
    }

    @PostMapping("/api/assignments/bulk")
    @PreAuthorize("hasAuthority('CREATE_ASSIGNMENT')")
    public ResponseEntity<ApiResponse<BulkAssignResponse>> bulkCreateAssignments(
            @Valid @RequestBody BulkAssignRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(assignmentService.bulkCreateAssignments(request)));
    }
}
