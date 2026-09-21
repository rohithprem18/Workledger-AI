package backend.WF.availability;

import backend.WF.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/employees/{employeeId}/availability")
@RequiredArgsConstructor
public class AvailabilityController {

    private final AvailabilityService availabilityService;

    @PutMapping
    @PreAuthorize("hasAuthority('SUBMIT_TIMESHEET') or hasAuthority('UPDATE_EMPLOYEE')")
    public ResponseEntity<ApiResponse<AvailabilityResponse>> setAvailability(
            @PathVariable UUID employeeId,
            @Valid @RequestBody AvailabilityRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(availabilityService.setAvailability(employeeId, request)));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('VIEW_EMPLOYEES') or hasAuthority('VIEW_OWN_ASSIGNMENTS')")
    public ResponseEntity<ApiResponse<List<AvailabilityResponse>>> getAvailability(
            @PathVariable UUID employeeId) {
        return ResponseEntity.ok(ApiResponse.ok(availabilityService.getAvailability(employeeId)));
    }
}
