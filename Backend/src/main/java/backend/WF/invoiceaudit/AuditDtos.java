package backend.WF.invoiceaudit;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Builder;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** Wire shapes for the invoice auditor. */
public final class AuditDtos {

    private AuditDtos() {}

    @Builder
    public record AuditRunResponse(
            UUID id,
            UUID invoiceId,
            Verdict verdict,
            int blockerCount,
            int warningCount,
            int infoCount,
            /** Source 1 — what the contract authorises. */
            BigDecimal contractTotal,
            /** Source 2 — approved work valued at contracted rates. */
            BigDecimal approvedWorkTotal,
            /** Source 3 — what the invoice presents. */
            BigDecimal invoicedTotal,
            String narrative,
            String narrativeEngine,
            String rulesVersion,
            LocalDateTime createdAt,
            List<FindingResponse> findings
    ) {}

    @Builder
    public record FindingResponse(
            UUID id,
            String ruleCode,
            Severity severity,
            String title,
            /** Computed in Java. Always present, always the authoritative statement. */
            String detail,
            String expectedValue,
            String actualValue,
            BigDecimal delta,
            UUID lineItemId,
            /** Model-written prose. Null when the model is disabled or failed. */
            String explanation
    ) {}

    public record OverrideRequest(
            @NotBlank(message = "An override reason is required")
            @Size(min = 10, message = "State why the blocking findings are being accepted")
            String reason
    ) {}
}
