package backend.WF.intelligence;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Converts a value as written in a contract into a canonical form the rest of
 * the platform can compute on — a plain decimal, an ISO-8601 date, or trimmed
 * text. Applies to both extraction engines, so "₹1,250.00/hr" and "INR 1250 per
 * hour" normalize identically no matter which one found them.
 */
@Component
public class ValueNormalizer {

    private static final Pattern MONEY = Pattern.compile(
            "(-?\\d{1,3}(?:[,\\s]\\d{2,3})*(?:\\.\\d+)?|-?\\d+(?:\\.\\d+)?)");

    private static final Map<String, String> CURRENCY_SYMBOLS = Map.of(
            "₹", "INR", "$", "USD", "€", "EUR", "£", "GBP", "¥", "JPY");

    private static final List<DateTimeFormatter> DATE_FORMATS = List.of(
            DateTimeFormatter.ISO_LOCAL_DATE,
            DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("d/M/yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("yyyy/MM/dd", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("dd-MM-yyyy", Locale.ENGLISH),
            DateTimeFormatter.ofPattern("dd.MM.yyyy", Locale.ENGLISH));

    /** Canonical value, or empty when the raw text cannot be read as the given kind. */
    public Optional<String> normalize(String raw, ValueKind kind) {
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        String value = raw.trim();
        return switch (kind) {
            case MONEY, NUMBER -> parseDecimal(value).map(BigDecimal::toPlainString);
            case DATE -> parseDate(value).map(LocalDate::toString);
            case DURATION -> parseDecimal(value).map(d -> d.stripTrailingZeros().toPlainString());
            case TEXT -> Optional.of(value.replaceAll("\\s+", " "));
        };
    }

    public Optional<BigDecimal> parseDecimal(String raw) {
        if (raw == null) {
            return Optional.empty();
        }
        Matcher m = MONEY.matcher(raw);
        if (!m.find()) {
            return Optional.empty();
        }
        String digits = m.group(1).replaceAll("[,\\s]", "");
        try {
            return Optional.of(new BigDecimal(digits));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    public Optional<LocalDate> parseDate(String raw) {
        if (raw == null) {
            return Optional.empty();
        }
        String cleaned = raw.trim()
                // "1st April 2026" -> "1 April 2026"
                .replaceAll("(?i)(\\d+)(st|nd|rd|th)\\b", "$1")
                .replaceAll("\\s+", " ");
        for (DateTimeFormatter fmt : DATE_FORMATS) {
            try {
                return Optional.of(LocalDate.parse(cleaned, fmt));
            } catch (DateTimeParseException ignored) {
                // try the next pattern
            }
        }
        return Optional.empty();
    }

    /** ISO currency code implied by a symbol or code appearing in the raw text. */
    public Optional<String> detectCurrency(String raw) {
        if (raw == null) {
            return Optional.empty();
        }
        for (Map.Entry<String, String> e : CURRENCY_SYMBOLS.entrySet()) {
            if (raw.contains(e.getKey())) {
                return Optional.of(e.getValue());
            }
        }
        Matcher m = Pattern.compile("\\b(INR|USD|EUR|GBP|JPY|AUD|CAD|SGD)\\b").matcher(raw.toUpperCase(Locale.ROOT));
        return m.find() ? Optional.of(m.group(1)) : Optional.empty();
    }
}
