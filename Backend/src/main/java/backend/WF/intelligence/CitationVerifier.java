package backend.WF.intelligence;

import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Decides whether a claimed citation is really present in the source document.
 *
 * <p>This is the guard that separates a grounded extraction from a plausible
 * invention. A model asked for a supporting quote will sometimes produce one
 * that reads like the contract but appears nowhere in it; such a quote fails
 * here and the extraction reaches the reviewer flagged as unverified rather
 * than silently carrying false provenance.
 *
 * <p>Matching is exact first, then whitespace-insensitive. It deliberately
 * stops there: fuzzy matching would re-admit exactly the quotes this class
 * exists to catch.
 */
@Component
public class CitationVerifier {

    /** A located, verified citation: offsets into the source text and its page. */
    public record Citation(String quote, int start, int end, int page) {}

    public Optional<Citation> locate(String sourceText, String claimedQuote) {
        if (sourceText == null || claimedQuote == null) {
            return Optional.empty();
        }
        String quote = claimedQuote.trim();
        // Shorter than this, a "quote" matches by coincidence and proves nothing.
        if (quote.length() < 8) {
            return Optional.empty();
        }

        int start = sourceText.indexOf(quote);
        if (start >= 0) {
            return Optional.of(build(sourceText, quote, start, start + quote.length()));
        }

        return locateIgnoringWhitespace(sourceText, quote);
    }

    /**
     * PDF text extraction inserts and drops spaces unpredictably around line
     * breaks, so a quote that is genuinely present often differs from the source
     * only in whitespace. Walk both strings skipping whitespace, and report the
     * span in the original text that the quote covers.
     */
    private Optional<Citation> locateIgnoringWhitespace(String source, String quote) {
        String compactQuote = quote.replaceAll("\\s+", "");
        if (compactQuote.length() < 8) {
            return Optional.empty();
        }

        int qi = 0;
        int spanStart = -1;
        for (int i = 0; i < source.length(); i++) {
            char c = source.charAt(i);
            if (Character.isWhitespace(c)) {
                continue;
            }
            if (c == compactQuote.charAt(qi)) {
                if (qi == 0) {
                    spanStart = i;
                }
                qi++;
                if (qi == compactQuote.length()) {
                    return Optional.of(build(source, source.substring(spanStart, i + 1), spanStart, i + 1));
                }
            } else if (qi > 0) {
                // Restart the scan from just after the failed start, so overlapping
                // near-misses cannot cause a match to be skipped.
                i = spanStart;
                qi = 0;
                spanStart = -1;
            }
        }
        return Optional.empty();
    }

    private Citation build(String source, String quote, int start, int end) {
        return new Citation(quote, start, end, pageOf(source, start));
    }

    /** Pages are separated by form feeds by {@link DocumentTextExtractor}. */
    static int pageOf(String source, int offset) {
        int page = 1;
        int limit = Math.min(offset, source.length());
        for (int i = 0; i < limit; i++) {
            if (source.charAt(i) == DocumentTextExtractor.PAGE_SEPARATOR) {
                page++;
            }
        }
        return page;
    }
}
