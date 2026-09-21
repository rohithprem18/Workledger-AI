package backend.WF.intelligence;

import org.springframework.stereotype.Component;

import java.util.List;

import static backend.WF.intelligence.IntelligenceDtos.DocumentResponse;
import static backend.WF.intelligence.IntelligenceDtos.ExtractionResponse;

@Component
public class IntelligenceMapper {

    public ExtractionResponse toResponse(ContractExtraction e) {
        return ExtractionResponse.builder()
                .id(e.getId())
                .attributeType(e.getAttributeType())
                .fieldKey(e.getFieldKey())
                .fieldLabel(e.getFieldLabel())
                .rawValue(e.getRawValue())
                .normalizedValue(e.getNormalizedValue())
                .effectiveValue(e.effectiveValue())
                .valueKind(e.getValueKind())
                .currency(e.getCurrency())
                .confidence(e.getConfidence())
                .citationQuote(e.getCitationQuote())
                .citationPage(e.getCitationPage())
                .citationStart(e.getCitationStart())
                .citationEnd(e.getCitationEnd())
                .citationVerified(e.isCitationVerified())
                .reviewStatus(e.getReviewStatus())
                .reviewedValue(e.getReviewedValue())
                .reviewNote(e.getReviewNote())
                .reviewedAt(e.getReviewedAt())
                .build();
    }

    /** Summary row for a document list — extraction detail omitted. */
    public DocumentResponse toSummary(ContractDocument d) {
        return base(d, List.of()).build();
    }

    /** Full view of a document together with every attribute extracted from it. */
    public DocumentResponse toDetail(ContractDocument d, List<ContractExtraction> extractions) {
        List<ExtractionResponse> rows = extractions.stream().map(this::toResponse).toList();
        return base(d, extractions)
                .extractions(rows)
                .build();
    }

    private DocumentResponse.DocumentResponseBuilder base(ContractDocument d,
                                                          List<ContractExtraction> extractions) {
        return DocumentResponse.builder()
                .id(d.getId())
                .contractId(d.getContract() != null ? d.getContract().getId() : null)
                .contractTitle(d.getContract() != null ? d.getContract().getTitle() : null)
                .companyId(d.getCompany() != null ? d.getCompany().getId() : null)
                .companyName(d.getCompany() != null ? d.getCompany().getName() : null)
                .fileName(d.getFileName())
                .contentType(d.getContentType())
                .sizeBytes(d.getSizeBytes())
                .pageCount(d.getPageCount())
                .status(d.getStatus())
                .extractionEngine(d.getExtractionEngine())
                .extractionModel(d.getExtractionModel())
                .extractionError(d.getExtractionError())
                .extractedAt(d.getExtractedAt())
                .createdAt(d.getCreatedAt())
                .attributeCount(extractions.size())
                .pendingCount((int) extractions.stream()
                        .filter(e -> e.getReviewStatus() == ReviewStatus.PENDING).count())
                .verifiedCitationCount((int) extractions.stream()
                        .filter(ContractExtraction::isCitationVerified).count());
    }
}
