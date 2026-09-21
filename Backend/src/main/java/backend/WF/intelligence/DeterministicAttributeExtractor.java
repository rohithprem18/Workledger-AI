package backend.WF.intelligence;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pattern-based extraction over the contract text.
 *
 * <p>This engine is why the platform can be deployed and demonstrated with no
 * model credentials and no per-token cost at all. It has lower recall than the
 * language model on unusual phrasing, but what it finds it finds exactly, and
 * its citation is the matched span itself — so its citations are verified by
 * construction rather than by checking a claim after the fact.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DeterministicAttributeExtractor implements AttributeExtractor {

    private final ValueNormalizer normalizer;

    private static final int CONTEXT = 70;

    /** Currency-prefixed or currency-suffixed money amount. */
    private static final String MONEY = "(?:INR|USD|EUR|GBP|Rs\\.?|₹|\\$|€|£)\\s*[\\d,]+(?:\\.\\d+)?";

    private record Rule(AttributeType type, String fieldKey, String label,
                        ValueKind kind, double confidence, Pattern pattern) {}

    private static Rule rule(AttributeType type, String key, String label, ValueKind kind,
                             double confidence, String regex) {
        return new Rule(type, key, label, kind, confidence, Pattern.compile(regex));
    }

    /**
     * Ordered most-specific first. Each pattern captures the value in group 1, so
     * the surrounding sentence can be widened into the citation.
     */
    private static final List<Rule> RULES = List.of(
            rule(AttributeType.RATE, "hourly_rate", "Hourly rate", ValueKind.MONEY, 0.88,
                    "(?i)(?:hourly\\s+rate|rate\\s+per\\s+hour)\\s*(?:of|is|:|shall\\s+be|at)?\\s*(" + MONEY + ")"),
            rule(AttributeType.RATE, "hourly_rate", "Hourly rate", ValueKind.MONEY, 0.85,
                    "(?i)(" + MONEY + ")\\s*(?:per\\s+hour|/\\s*hour|/\\s*hr|an\\s+hour)\\b"),
            rule(AttributeType.RATE, "day_rate", "Day rate", ValueKind.MONEY, 0.82,
                    "(?i)(" + MONEY + ")\\s*(?:per\\s+day|/\\s*day|per\\s+diem)\\b"),
            rule(AttributeType.RATE, "overtime_multiplier", "Overtime multiplier", ValueKind.NUMBER, 0.80,
                    "(?i)overtime[^.\\n]{0,40}?\\b(\\d+(?:\\.\\d+)?)\\s*(?:x|times)\\b"),
            rule(AttributeType.RATE, "contract_cap", "Total contract cap", ValueKind.MONEY, 0.78,
                    "(?i)(?:not\\s+to\\s+exceed|capped\\s+at|maximum\\s+(?:of|value)|total\\s+contract\\s+value)"
                            + "[^.\\n]{0,30}?(" + MONEY + ")"),

            rule(AttributeType.BILLING_TERM, "payment_terms_days", "Payment terms (days)", ValueKind.DURATION, 0.87,
                    "(?i)(?:net|payable\\s+within|payment\\s+(?:terms?|due)\\s*(?:of|:|is|shall\\s+be)?)\\s*"
                            + "(\\d{1,3})\\s*(?:days|calendar\\s+days|business\\s+days)?\\b"),
            rule(AttributeType.BILLING_TERM, "invoicing_frequency", "Invoicing frequency", ValueKind.TEXT, 0.80,
                    "(?i)invoic\\w*[^.\\n]{0,40}?\\b(monthly|weekly|fortnightly|bi-weekly|quarterly|"
                            + "milestone-based|upon\\s+completion)\\b"),
            rule(AttributeType.BILLING_TERM, "billing_model", "Billing model", ValueKind.TEXT, 0.76,
                    "(?i)\\b(time\\s+and\\s+materials|fixed\\s+price|milestone[-\\s]based|hourly\\s+billing)\\b"),
            rule(AttributeType.BILLING_TERM, "late_payment_interest", "Late payment interest (%)", ValueKind.NUMBER, 0.75,
                    "(?i)(?:late\\s+payment|overdue)[^.\\n]{0,40}?(\\d+(?:\\.\\d+)?)\\s*%"),

            rule(AttributeType.MILESTONE, "milestone", "Milestone", ValueKind.MONEY, 0.75,
                    "(?i)milestone\\s*\\d*\\s*[:\\-–][^\\n]{0,80}?(" + MONEY + ")"),
            rule(AttributeType.MILESTONE, "milestone_share", "Milestone payment share (%)", ValueKind.NUMBER, 0.72,
                    "(?i)(?:on\\s+completion|upon\\s+delivery|milestone)[^.\\n]{0,50}?(\\d{1,3})\\s*%"),

            rule(AttributeType.DATE, "contract_start", "Contract start date", ValueKind.DATE, 0.88,
                    "(?i)(?:effective\\s+(?:date|from)|commenc\\w+\\s+on|start\\s+date|shall\\s+begin\\s+on)"
                            + "\\s*(?:of|is|:|shall\\s+be)?\\s*([\\dA-Za-z][\\w,./\\- ]{5,25}\\d{4})"),
            rule(AttributeType.DATE, "contract_end", "Contract end date", ValueKind.DATE, 0.88,
                    "(?i)(?:expir\\w+\\s+on|end\\s+date|terminat\\w+\\s+on|valid\\s+(?:un)?til)"
                            + "\\s*(?:of|is|:|shall\\s+be)?\\s*([\\dA-Za-z][\\w,./\\- ]{5,25}\\d{4})"),
            rule(AttributeType.DATE, "notice_period_days", "Termination notice (days)", ValueKind.DURATION, 0.80,
                    "(?i)(\\d{1,3})\\s*(?:days|calendar\\s+days)\\s*(?:prior\\s+)?written\\s+notice")
    );

    @Override
    public String engineName() {
        return "deterministic";
    }

    @Override
    public boolean isAvailable() {
        return true;
    }

    @Override
    public List<ExtractionCandidate> extract(String sourceText) {
        if (sourceText == null || sourceText.isBlank()) {
            return List.of();
        }
        List<ExtractionCandidate> found = new ArrayList<>();
        // One value per field key, except milestones, where each occurrence is its own row.
        Set<String> claimed = new LinkedHashSet<>();

        for (Rule r : RULES) {
            Matcher m = r.pattern().matcher(sourceText);
            boolean repeatable = r.type() == AttributeType.MILESTONE;
            int occurrence = 0;

            while (m.find()) {
                String rawValue = m.group(1);
                if (rawValue == null || rawValue.isBlank()) {
                    continue;
                }
                String key = repeatable ? r.fieldKey() + "_" + (occurrence + 1) : r.fieldKey();
                if (claimed.contains(key)) {
                    break;
                }
                // A value that will not normalize is a false positive, not an extraction.
                if (normalizer.normalize(rawValue, r.kind()).isEmpty()) {
                    continue;
                }
                claimed.add(key);
                occurrence++;

                String label = repeatable ? r.label() + " " + occurrence : r.label();
                ExtractionCandidate candidate = ExtractionCandidate.of(
                        r.type(), key, label, rawValue.trim(), r.kind(), r.confidence(),
                        sentenceAround(sourceText, m.start(), m.end()));

                found.add(normalizer.detectCurrency(rawValue)
                        .map(candidate::withCurrency)
                        .orElse(candidate));

                if (!repeatable) {
                    break;
                }
            }
        }
        return found;
    }

    /** Widens a match to readable sentence bounds so the citation carries context. */
    static String sentenceAround(String text, int matchStart, int matchEnd) {
        int from = Math.max(0, matchStart - CONTEXT);
        int to = Math.min(text.length(), matchEnd + CONTEXT);

        int sentenceStart = Math.max(text.lastIndexOf(". ", matchStart), text.lastIndexOf('\n', matchStart));
        if (sentenceStart > from) {
            from = sentenceStart + 1;
        }
        int sentenceEnd = text.indexOf(". ", matchEnd);
        if (sentenceEnd >= 0 && sentenceEnd + 1 < to) {
            to = sentenceEnd + 1;
        }
        int lineEnd = text.indexOf('\n', matchEnd);
        if (lineEnd >= 0 && lineEnd < to) {
            to = lineEnd;
        }
        return text.substring(from, Math.max(from, to)).trim();
    }
}
