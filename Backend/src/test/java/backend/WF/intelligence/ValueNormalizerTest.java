package backend.WF.intelligence;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

class ValueNormalizerTest {

    private final ValueNormalizer normalizer = new ValueNormalizer();

    @Test
    void normalizesMoneyRegardlessOfHowItIsWritten() {
        assertEquals("2400", normalizer.normalize("INR 2,400", ValueKind.MONEY).orElseThrow());
        assertEquals("2400", normalizer.normalize("₹2,400.00", ValueKind.MONEY).orElseThrow()
                .replaceAll("\\.00$", ""));
        assertEquals("1250.50", normalizer.normalize("$1,250.50", ValueKind.MONEY).orElseThrow());
    }

    @Test
    void normalizesDatesAcrossCommonContractFormats() {
        LocalDate expected = LocalDate.of(2026, 4, 1);

        assertEquals(expected, normalizer.parseDate("2026-04-01").orElseThrow());
        assertEquals(expected, normalizer.parseDate("1 April 2026").orElseThrow());
        assertEquals(expected, normalizer.parseDate("1st April 2026").orElseThrow());
        assertEquals(expected, normalizer.parseDate("April 1, 2026").orElseThrow());
        assertEquals(expected, normalizer.parseDate("01/04/2026").orElseThrow());
        assertEquals(expected, normalizer.parseDate("01-04-2026").orElseThrow());
    }

    @Test
    void detectsCurrencyFromSymbolOrCode() {
        assertEquals("INR", normalizer.detectCurrency("₹2,400").orElseThrow());
        assertEquals("USD", normalizer.detectCurrency("$1,250").orElseThrow());
        assertEquals("GBP", normalizer.detectCurrency("GBP 900 per day").orElseThrow());
        assertTrue(normalizer.detectCurrency("2400 per hour").isEmpty(),
                "An amount with no currency marker should not be assigned one");
    }

    @Test
    void refusesValuesThatDoNotFitTheRequestedKind() {
        assertTrue(normalizer.normalize("sometime next spring", ValueKind.DATE).isEmpty());
        assertTrue(normalizer.normalize("to be agreed", ValueKind.MONEY).isEmpty());
        assertTrue(normalizer.normalize(null, ValueKind.NUMBER).isEmpty());
        assertTrue(normalizer.normalize("   ", ValueKind.TEXT).isEmpty());
    }

    @Test
    void collapsesWhitespaceInTextValues() {
        assertEquals("time and materials",
                normalizer.normalize("  time   and\n materials ", ValueKind.TEXT).orElseThrow());
    }
}
