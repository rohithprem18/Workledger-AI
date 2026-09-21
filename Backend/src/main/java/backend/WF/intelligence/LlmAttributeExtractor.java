package backend.WF.intelligence;

import backend.WF.ai.AiProperties;
import backend.WF.ai.LlmGateway;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Language-model extraction over the contract text.
 *
 * <p>The prompt asks for a supporting quote alongside every value, and the
 * pipeline verifies each quote against the document before storing it. That
 * turns "cite your source" from a request the model may ignore into a property
 * the system checks — an invented quote fails verification and the row reaches
 * the reviewer visibly unverified instead of quietly wrong.
 *
 * <p>The model is never asked to do arithmetic or to decide anything. It reads
 * prose and reports what it read; normalization, validation and every downstream
 * calculation happen in Java.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LlmAttributeExtractor implements AttributeExtractor {

    private final LlmGateway llm;
    private final AiProperties properties;
    private final ObjectMapper objectMapper;

    private static final String SYSTEM_PROMPT = """
            You extract contractual facts from staffing and services contracts.

            Return ONLY a JSON object of this exact shape, with no prose and no
            markdown fences:

            {"attributes":[{"attribute_type":"RATE|BILLING_TERM|MILESTONE|DATE",
                            "field_key":"snake_case_identifier",
                            "field_label":"Human readable label",
                            "raw_value":"the value exactly as written in the contract",
                            "value_kind":"MONEY|NUMBER|DATE|DURATION|TEXT",
                            "currency":"ISO 4217 code, or null",
                            "confidence":0.0,
                            "quote":"a verbatim sentence copied character-for-character from the contract"}]}

            Rules you must follow:
            - "quote" MUST be copied verbatim from the contract text you were given.
              Never paraphrase, never reconstruct, never tidy it up. A quote that
              does not appear in the text is discarded and your extraction is lost.
            - If a fact is not stated in the contract, omit it. Do not infer, do not
              guess, and never supply a customary or typical value.
            - "raw_value" is what the contract says, not a converted or rounded form.
            - "confidence" is your own estimate between 0 and 1.
            - Use these field_key values where they apply, so results stay comparable:
              hourly_rate, day_rate, overtime_multiplier, contract_cap,
              payment_terms_days, invoicing_frequency, billing_model,
              late_payment_interest, milestone_1..n, contract_start, contract_end,
              notice_period_days.
            """;

    @Override
    public String engineName() {
        return "llm";
    }

    @Override
    public boolean isAvailable() {
        return llm.isEnabled();
    }

    @Override
    public List<ExtractionCandidate> extract(String sourceText) {
        if (!isAvailable() || sourceText == null || sourceText.isBlank()) {
            return List.of();
        }

        String text = truncate(sourceText, properties.getMaxSourceChars());
        String userPrompt = "CONTRACT TEXT:\n\n" + text
                + "\n\nExtract every rate, billing term, milestone and date stated above.";

        return llm.completeJson(SYSTEM_PROMPT, userPrompt)
                .map(this::parseCandidates)
                .orElseGet(List::of);
    }

    private List<ExtractionCandidate> parseCandidates(String json) {
        List<ExtractionCandidate> candidates = new ArrayList<>();
        try {
            JsonNode attributes = objectMapper.readTree(json).path("attributes");
            if (!attributes.isArray()) {
                log.warn("Model returned JSON without an 'attributes' array; ignoring");
                return List.of();
            }
            for (JsonNode node : attributes) {
                parseOne(node).ifPresent(candidates::add);
            }
        } catch (Exception e) {
            // Malformed model output is expected occasionally and is not an error
            // worth failing the upload over — the deterministic engine still ran.
            log.warn("Could not parse model extraction output: {}", e.getMessage());
            return List.of();
        }
        return candidates;
    }

    private java.util.Optional<ExtractionCandidate> parseOne(JsonNode node) {
        String rawValue = text(node, "raw_value");
        String fieldKey = text(node, "field_key");
        if (rawValue == null || fieldKey == null) {
            return java.util.Optional.empty();
        }

        AttributeType type = enumOrNull(AttributeType.class, text(node, "attribute_type"));
        ValueKind kind = enumOrNull(ValueKind.class, text(node, "value_kind"));
        if (type == null || kind == null) {
            return java.util.Optional.empty();
        }

        String label = text(node, "field_label");
        String currency = text(node, "currency");
        String quote = text(node, "quote");

        double raw = node.path("confidence").asDouble(0.5);
        BigDecimal confidence = BigDecimal.valueOf(Math.clamp(raw, 0.0, 1.0))
                .setScale(3, java.math.RoundingMode.HALF_UP);

        return java.util.Optional.of(new ExtractionCandidate(
                type,
                fieldKey.trim().toLowerCase(Locale.ROOT),
                label != null ? label : fieldKey,
                rawValue.trim(),
                kind,
                currency != null && currency.length() == 3 ? currency.toUpperCase(Locale.ROOT) : null,
                confidence,
                quote));
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String s = value.asText("").trim();
        return s.isEmpty() || "null".equalsIgnoreCase(s) ? null : s;
    }

    private static <E extends Enum<E>> E enumOrNull(Class<E> type, String value) {
        if (value == null) {
            return null;
        }
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** Trims on a paragraph boundary so a clause is not cut mid-sentence. */
    static String truncate(String text, int limit) {
        if (text.length() <= limit) {
            return text;
        }
        int cut = text.lastIndexOf("\n\n", limit);
        return text.substring(0, cut > limit / 2 ? cut : limit);
    }
}
