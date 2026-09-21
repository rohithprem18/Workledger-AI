package backend.WF.invoiceaudit;

import backend.WF.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

import static backend.WF.invoiceaudit.AuditDtos.*;

@RestController
@RequiredArgsConstructor
public class InvoiceAuditController {

    private final InvoiceAuditService auditService;
    private final AuditMapper mapper;

    /** Reconciles the invoice against contract, approved work and its own lines. */
    @PostMapping("/api/invoices/{invoiceId}/audit")
    @PreAuthorize("hasAuthority('RUN_INVOICE_AUDIT')")
    public ResponseEntity<ApiResponse<AuditRunResponse>> run(@PathVariable UUID invoiceId) {
        InvoiceAuditRun run = auditService.audit(invoiceId);
        return ResponseEntity.ok(ApiResponse.ok(
                describe(run), mapper.toResponse(run, auditService.findingsOf(run.getId()))));
    }

    /** The most recent run, which is the one the approval gate consults. */
    @GetMapping("/api/invoices/{invoiceId}/audit")
    @PreAuthorize("hasAuthority('VIEW_INVOICE_AUDIT')")
    public ResponseEntity<ApiResponse<AuditRunResponse>> latest(@PathVariable UUID invoiceId) {
        return auditService.latest(invoiceId)
                .map(run -> ResponseEntity.ok(ApiResponse.ok(
                        mapper.toResponse(run, auditService.findingsOf(run.getId())))))
                .orElseGet(() -> ResponseEntity.ok(ApiResponse.ok(null)));
    }

    @GetMapping("/api/invoices/{invoiceId}/audit/history")
    @PreAuthorize("hasAuthority('VIEW_INVOICE_AUDIT')")
    public ResponseEntity<ApiResponse<List<AuditRunResponse>>> history(@PathVariable UUID invoiceId) {
        List<AuditRunResponse> runs = auditService.history(invoiceId).stream()
                .map(run -> mapper.toResponse(run, auditService.findingsOf(run.getId())))
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(runs));
    }

    /** Accepts blocking findings deliberately, on the record. */
    @PostMapping("/api/invoices/{invoiceId}/audit/override")
    @PreAuthorize("hasAuthority('OVERRIDE_INVOICE_AUDIT')")
    public ResponseEntity<ApiResponse<String>> override(
            @PathVariable UUID invoiceId,
            @Valid @RequestBody OverrideRequest request) {
        auditService.override(invoiceId, request.reason());
        return ResponseEntity.ok(ApiResponse.ok(
                "Override recorded. This invoice can now be approved despite its blocking findings.",
                request.reason()));
    }

    /** The rule set in force, for the "what gets checked" panel. */
    @GetMapping("/api/invoice-audit/rules")
    @PreAuthorize("hasAuthority('VIEW_INVOICE_AUDIT')")
    public ResponseEntity<ApiResponse<List<String>>> rules() {
        return ResponseEntity.ok(ApiResponse.ok(auditService.ruleCodes()));
    }

    private static String describe(InvoiceAuditRun run) {
        return switch (run.getVerdict()) {
            case CLEAN -> "All three sources reconcile. Nothing flagged.";
            case ADVISORY -> run.getWarningCount() + " item(s) to review; approval is not blocked.";
            case BLOCKED -> run.getBlockerCount() + " blocking discrepancy(ies) found. "
                    + "Approval is refused until they are resolved or overridden.";
        };
    }
}
