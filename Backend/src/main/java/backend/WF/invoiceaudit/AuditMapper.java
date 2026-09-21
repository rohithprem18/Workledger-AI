package backend.WF.invoiceaudit;

import org.springframework.stereotype.Component;

import java.util.List;

import static backend.WF.invoiceaudit.AuditDtos.AuditRunResponse;
import static backend.WF.invoiceaudit.AuditDtos.FindingResponse;

@Component
public class AuditMapper {

    public AuditRunResponse toResponse(InvoiceAuditRun run, List<InvoiceAuditFinding> findings) {
        return AuditRunResponse.builder()
                .id(run.getId())
                .invoiceId(run.getInvoice().getId())
                .verdict(run.getVerdict())
                .blockerCount(run.getBlockerCount())
                .warningCount(run.getWarningCount())
                .infoCount(run.getInfoCount())
                .contractTotal(run.getContractTotal())
                .approvedWorkTotal(run.getApprovedWorkTotal())
                .invoicedTotal(run.getInvoicedTotal())
                .narrative(run.getNarrative())
                .narrativeEngine(run.getNarrativeEngine())
                .rulesVersion(run.getRulesVersion())
                .createdAt(run.getCreatedAt())
                .findings(findings.stream().map(this::toResponse).toList())
                .build();
    }

    public FindingResponse toResponse(InvoiceAuditFinding f) {
        return FindingResponse.builder()
                .id(f.getId())
                .ruleCode(f.getRuleCode())
                .severity(f.getSeverity())
                .title(f.getTitle())
                .detail(f.getDetail())
                .expectedValue(f.getExpectedValue())
                .actualValue(f.getActualValue())
                .delta(f.getDelta())
                .lineItemId(f.getLineItemId())
                .explanation(f.getExplanation())
                .build();
    }
}
