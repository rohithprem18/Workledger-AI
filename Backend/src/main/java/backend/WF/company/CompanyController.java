package backend.WF.company;

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
@RequestMapping("/api/companies")
@RequiredArgsConstructor
public class CompanyController {

    private final CompanyService companyService;

    @PostMapping
    @PreAuthorize("hasAuthority('CREATE_COMPANY')")
    public ResponseEntity<ApiResponse<CompanyResponse>> createCompany(@Valid @RequestBody CompanyRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(companyService.createCompany(request)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('UPDATE_COMPANY')")
    public ResponseEntity<ApiResponse<CompanyResponse>> updateCompany(
            @PathVariable UUID id, @Valid @RequestBody CompanyRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(companyService.updateCompany(id, request)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('UPDATE_COMPANY')")
    public ResponseEntity<ApiResponse<Void>> deactivateCompany(@PathVariable UUID id) {
        companyService.deactivateCompany(id);
        return ResponseEntity.ok(ApiResponse.ok("Company deactivated", null));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('VIEW_COMPANIES')")
    public ResponseEntity<ApiResponse<List<CompanyResponse>>> getAllCompanies() {
        return ResponseEntity.ok(ApiResponse.ok(companyService.getAllCompanies()));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('VIEW_COMPANIES')")
    public ResponseEntity<ApiResponse<CompanyResponse>> getCompany(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.ok(companyService.getCompany(id)));
    }
}
