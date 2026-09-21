package backend.WF.billing;

import backend.WF.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/billing-types")
@RequiredArgsConstructor
public class BillingTypeController {

    private final BillingTypeRepository repository;

    @GetMapping
    @PreAuthorize("hasAuthority('VIEW_CONTRACTS') or hasAuthority('CREATE_CONTRACT')")
    public ApiResponse<List<BillingTypeResponse>> list() {
        List<BillingTypeResponse> types = repository.findByActiveTrue().stream()
                .map(bt -> BillingTypeResponse.builder()
                        .id(bt.getId())
                        .code(bt.getCode())
                        .label(bt.getLabel())
                        .active(bt.isActive())
                        .build())
                .toList();
        return ApiResponse.ok(types);
    }
}
