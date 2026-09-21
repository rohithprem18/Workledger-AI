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
public class MilestoneController {

    private final MilestoneService milestoneService;

    @PostMapping("/api/contracts/{id}/milestones")
    @PreAuthorize("hasAuthority('CREATE_CONTRACT')")
    public ResponseEntity<ApiResponse<MilestoneResponse>> create(
            @PathVariable("id") UUID contractId,
            @Valid @RequestBody MilestoneCreateRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(milestoneService.create(contractId, request)));
    }

    @GetMapping("/api/contracts/{id}/milestones")
    @PreAuthorize("hasAuthority('VIEW_CONTRACTS')")
    public ApiResponse<List<MilestoneResponse>> listByContract(@PathVariable("id") UUID contractId) {
        return ApiResponse.ok(milestoneService.listByContract(contractId));
    }

    @PutMapping("/api/milestones/{id}/reach")
    @PreAuthorize("hasAuthority('MARK_MILESTONE')")
    public ApiResponse<MilestoneResponse> markReached(@PathVariable UUID id) {
        return ApiResponse.ok(milestoneService.markReached(id));
    }

    @PutMapping("/api/milestones/{id}/approve")
    @PreAuthorize("hasAuthority('APPROVE_MILESTONE')")
    public ApiResponse<MilestoneResponse> approve(@PathVariable UUID id) {
        return ApiResponse.ok(milestoneService.approveAndInvoice(id));
    }

    @GetMapping("/api/milestones")
    @PreAuthorize("hasAuthority('APPROVE_MILESTONE')")
    public ApiResponse<List<MilestoneResponse>> listByStatus(
            @RequestParam(defaultValue = "REACHED") MilestoneStatus status) {
        return ApiResponse.ok(milestoneService.listByStatus(status));
    }
}
