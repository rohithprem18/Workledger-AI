package backend.WF.intelligence;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The pattern engine is what makes the platform demonstrable with no model
 * credentials, so its recall on ordinary contract phrasing is worth pinning
 * down — as is the fact that its citations are correct by construction.
 */
class DeterministicAttributeExtractorTest {

    private final ValueNormalizer normalizer = new ValueNormalizer();
    private final DeterministicAttributeExtractor extractor =
            new DeterministicAttributeExtractor(normalizer);

    private static final String CONTRACT = """
            MASTER SERVICES AGREEMENT

            1. TERM. This Agreement is effective from 1 April 2026 and shall expire on
            31 March 2027 unless renewed in writing.

            2. RATES. The hourly rate for Senior Engineers shall be INR 2,400 per hour.
            Overtime is billed at 1.5 x the standard rate.

            3. PAYMENT. Invoices shall be raised monthly and are payable within 45 days.
            Late payment attracts interest of 1.5% per month.

            4. MILESTONES.
            Milestone 1 - Discovery and design complete: INR 450,000
            Milestone 2 - Production release: INR 900,000

            5. TERMINATION. Either party may terminate on 30 days written notice.
            """;

    private Optional<ExtractionCandidate> find(List<ExtractionCandidate> all, String fieldKey) {
        return all.stream().filter(c -> c.fieldKey().equals(fieldKey)).findFirst();
    }

    @Test
    void extractsTheHourlyRate() {
        Optional<ExtractionCandidate> rate = find(extractor.extract(CONTRACT), "hourly_rate");

        assertTrue(rate.isPresent(), "The hourly rate should be found");
        assertEquals(AttributeType.RATE, rate.get().attributeType());
        assertEquals("INR", rate.get().currency());
        assertEquals("2400", normalizer.normalize(rate.get().rawValue(), ValueKind.MONEY).orElseThrow());
    }

    @Test
    void extractsPaymentTermsAndInvoicingCadence() {
        List<ExtractionCandidate> all = extractor.extract(CONTRACT);

        assertEquals("45", find(all, "payment_terms_days")
                .flatMap(c -> normalizer.normalize(c.rawValue(), ValueKind.DURATION)).orElseThrow());
        assertTrue(find(all, "invoicing_frequency")
                .map(c -> c.rawValue().equalsIgnoreCase("monthly")).orElse(false),
                "Invoicing cadence should be read as monthly");
    }

    @Test
    void extractsBothContractDates() {
        List<ExtractionCandidate> all = extractor.extract(CONTRACT);

        assertEquals("2026-04-01", find(all, "contract_start")
                .flatMap(c -> normalizer.normalize(c.rawValue(), ValueKind.DATE)).orElseThrow());
        assertEquals("2027-03-31", find(all, "contract_end")
                .flatMap(c -> normalizer.normalize(c.rawValue(), ValueKind.DATE)).orElseThrow());
    }

    @Test
    void extractsEveryMilestoneSeparately() {
        long milestones = extractor.extract(CONTRACT).stream()
                .filter(c -> c.attributeType() == AttributeType.MILESTONE)
                .filter(c -> c.fieldKey().startsWith("milestone_"))
                .count();

        assertTrue(milestones >= 2, "Both milestone amounts should surface as separate rows");
    }

    @Test
    void everyCitationIsGenuinelyPresentInTheSource() {
        CitationVerifier verifier = new CitationVerifier();

        for (ExtractionCandidate candidate : extractor.extract(CONTRACT)) {
            assertTrue(verifier.locate(CONTRACT, candidate.citationQuote()).isPresent(),
                    "Pattern citations are the matched text itself, so every one must verify: "
                    + candidate.fieldKey() + " -> " + candidate.citationQuote());
        }
    }

    @Test
    void returnsNothingForTextWithNoContractualFacts() {
        assertTrue(extractor.extract("Dear team, please find the meeting notes attached.").isEmpty(),
                "Prose with no rates, terms, milestones or dates should yield nothing");
        assertTrue(extractor.extract("").isEmpty());
        assertTrue(extractor.extract(null).isEmpty());
    }
}
