package backend.WF.intelligence;

import java.math.BigDecimal;

/**
 * An attribute proposed by an extraction engine, before citation verification
 * and persistence. Engine-neutral on purpose: the language model path and the
 * regex path both produce these, so everything downstream — verification,
 * normalization, review — is identical regardless of which engine ran.
 *
 * @param citationQuote text the engine claims to have read this value from; it
 *                      is checked against the document and discarded if absent
 */
public record ExtractionCandidate(
        AttributeType attributeType,
        String fieldKey,
        String fieldLabel,
        String rawValue,
        ValueKind valueKind,
        String currency,
        BigDecimal confidence,
        String citationQuote
) {
    public static ExtractionCandidate of(AttributeType type, String key, String label,
                                         String rawValue, ValueKind kind,
                                         double confidence, String quote) {
        return new ExtractionCandidate(type, key, label, rawValue, kind, null,
                BigDecimal.valueOf(confidence), quote);
    }

    public ExtractionCandidate withCurrency(String iso) {
        return new ExtractionCandidate(attributeType, fieldKey, fieldLabel, rawValue,
                valueKind, iso, confidence, citationQuote);
    }
}
