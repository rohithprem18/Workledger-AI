package backend.WF.intelligence;

import jakarta.validation.constraints.NotNull;
import lombok.Builder;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** Wire shapes for the contract intelligence module. */
public final class IntelligenceDtos {

    private IntelligenceDtos() {}

    @Builder
    public record DocumentResponse(
            UUID id,
            UUID contractId,
            String contractTitle,
            UUID companyId,
            String companyName,
            String fileName,
            String contentType,
            long sizeBytes,
            int pageCount,
            DocumentStatus status,
            String extractionEngine,
            String extractionModel,
            String extractionError,
            LocalDateTime extractedAt,
            LocalDateTime createdAt,
            int attributeCount,
            int pendingCount,
            int verifiedCitationCount,
            List<ExtractionResponse> extractions
    ) {}

    @Builder
    public record ExtractionResponse(
            UUID id,
            AttributeType attributeType,
            String fieldKey,
            String fieldLabel,
            String rawValue,
            String normalizedValue,
            String effectiveValue,
            ValueKind valueKind,
            String currency,
            BigDecimal confidence,
            String citationQuote,
            Integer citationPage,
            Integer citationStart,
            Integer citationEnd,
            boolean citationVerified,
            ReviewStatus reviewStatus,
            String reviewedValue,
            String reviewNote,
            LocalDateTime reviewedAt
    ) {}

    /** A reviewer's decision on one extracted attribute. */
    public record ReviewRequest(
            @NotNull(message = "A review decision is required")
            ReviewStatus decision,
            /** Required when the decision is EDITED; ignored otherwise. */
            String correctedValue,
            String note
    ) {}

    /** The stored document text, for rendering a citation in context. */
    @Builder
    public record DocumentTextResponse(UUID id, String fileName, int pageCount, String sourceText) {}
}
