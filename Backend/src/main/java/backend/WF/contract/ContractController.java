package backend.WF.contract;

import backend.WF.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class ContractController {

    private final ContractService contractService;

    @PostMapping("/api/contracts")
    @PreAuthorize("hasAuthority('CREATE_CONTRACT')")
    public ResponseEntity<ApiResponse<ContractResponse>> createContract(
            @Valid @RequestBody ContractCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(contractService.createContract(request)));
    }

    @GetMapping("/api/contracts")
    @PreAuthorize("hasAuthority('VIEW_CONTRACTS')")
    public ResponseEntity<ApiResponse<List<ContractResponse>>> getAllContracts() {
        return ResponseEntity.ok(ApiResponse.ok(contractService.getAllContracts()));
    }

    @GetMapping("/api/contracts/{id}")
    @PreAuthorize("hasAuthority('VIEW_CONTRACTS')")
    public ResponseEntity<ApiResponse<ContractResponse>> getContract(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.ok(contractService.getContract(id)));
    }

    @GetMapping("/api/companies/{companyId}/contracts")
    @PreAuthorize("hasAuthority('VIEW_CONTRACTS')")
    public ResponseEntity<ApiResponse<List<ContractResponse>>> getContractsByCompany(
            @PathVariable UUID companyId) {
        return ResponseEntity.ok(ApiResponse.ok(contractService.getContractsByCompany(companyId)));
    }

    @PostMapping("/api/contracts/{id}/requirements")
    @PreAuthorize("hasAuthority('CREATE_CONTRACT')")
    public ResponseEntity<ApiResponse<RequirementResponse>> addRequirement(
            @PathVariable UUID id,
            @Valid @RequestBody RequirementRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(contractService.addRequirement(id, request)));
    }

    @GetMapping("/api/contracts/{contractId}/requirements")
    @PreAuthorize("hasAuthority('VIEW_CONTRACTS')")
    public ResponseEntity<ApiResponse<List<RequirementResponse>>> getRequirements(
            @PathVariable UUID contractId) {
        return ResponseEntity.ok(ApiResponse.ok(contractService.getRequirements(contractId)));
    }

    @GetMapping("/api/requirements/{requirementId}")
    @PreAuthorize("hasAuthority('VIEW_CONTRACTS')")
    public ResponseEntity<ApiResponse<RequirementResponse>> getRequirement(
            @PathVariable UUID requirementId) {
        return ResponseEntity.ok(ApiResponse.ok(contractService.getRequirement(requirementId)));
    }
}
