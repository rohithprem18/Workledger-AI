package backend.WF.intelligence;

import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The guard that separates a grounded extraction from a plausible invention.
 * These cases are the contract the rest of the pipeline relies on.
 */
class CitationVerifierTest {

    private final CitationVerifier verifier = new CitationVerifier();

    private static final String SOURCE = """
            MASTER SERVICES AGREEMENT

            2. RATES. The hourly rate for Senior Engineers shall be INR 2,400 per hour.
            3. PAYMENT. Invoices are payable within 45 days of receipt.
            """;

    @Test
    void locatesAVerbatimQuote() {
        Optional<CitationVerifier.Citation> found =
                verifier.locate(SOURCE, "The hourly rate for Senior Engineers shall be INR 2,400 per hour.");

        assertTrue(found.isPresent(), "A verbatim quote must be located");
        CitationVerifier.Citation citation = found.get();
        assertEquals(citation.quote(), SOURCE.substring(citation.start(), citation.end()),
                "Offsets must point at exactly the quoted span");
    }

    @Test
    void rejectsAQuoteThatIsNotInTheDocument() {
        // Reads like the contract, appears nowhere in it — precisely the failure
        // mode citation verification exists to catch.
        Optional<CitationVerifier.Citation> found = verifier.locate(SOURCE,
                "The hourly rate for Senior Engineers shall be INR 3,900 per hour.");

        assertTrue(found.isEmpty(), "An invented quote must not verify");
    }

    @Test
    void toleratesWhitespaceDifferencesFromPdfExtraction() {
        // PDF extraction routinely breaks a line mid-sentence and adds or drops
        // spaces; the underlying text is still genuinely present.
        Optional<CitationVerifier.Citation> found =
                verifier.locate(SOURCE, "Invoices   are payable\n   within 45 days of receipt.");

        assertTrue(found.isPresent(), "Whitespace-only differences must still verify");
        assertTrue(found.get().quote().contains("45 days"),
                "The located span should cover the real text");
    }

    @Test
    void rejectsQuotesTooShortToProveAnything() {
        assertTrue(verifier.locate(SOURCE, "45").isEmpty(),
                "A two-character match is coincidence, not provenance");
        assertTrue(verifier.locate(SOURCE, "INR").isEmpty(),
                "A three-character match is coincidence, not provenance");
    }

    @Test
    void handlesNullsWithoutThrowing() {
        assertTrue(verifier.locate(null, "anything").isEmpty());
        assertTrue(verifier.locate(SOURCE, null).isEmpty());
    }

    @Test
    void reportsThePageAQuoteAppearsOn() {
        String paged = "page one text here" + DocumentTextExtractor.PAGE_SEPARATOR
                + "the rate is INR 2,400 per hour";

        Optional<CitationVerifier.Citation> found =
                verifier.locate(paged, "the rate is INR 2,400 per hour");

        assertTrue(found.isPresent());
        assertEquals(2, found.get().page(), "A quote after one page break is on page 2");
    }
}
