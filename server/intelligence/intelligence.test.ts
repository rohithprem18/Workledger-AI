import { describe, expect, it } from 'vitest';
import { locateCitation, PAGE_SEPARATOR } from './citation.js';
import { detectCurrency, normalize, parseDate } from './normalize.js';
import { extractByPattern, mergeCandidates, type ExtractionCandidate } from './extractors.js';

const SOURCE = `MASTER SERVICES AGREEMENT

2. RATES. The hourly rate for Senior Engineers shall be INR 2,400 per hour.
3. PAYMENT. Invoices are payable within 45 days of receipt.
`;

describe('citation verification', () => {
  it('locates a verbatim quote and reports its exact span', () => {
    const citation = locateCitation(
      SOURCE,
      'The hourly rate for Senior Engineers shall be INR 2,400 per hour.',
    );
    expect(citation).not.toBeNull();
    expect(SOURCE.slice(citation!.start, citation!.end)).toBe(citation!.quote);
  });

  it('rejects a quote that is not in the document', () => {
    // Reads like the contract, appears nowhere in it — precisely the failure
    // mode citation verification exists to catch.
    const citation = locateCitation(
      SOURCE,
      'The hourly rate for Senior Engineers shall be INR 3,900 per hour.',
    );
    expect(citation).toBeNull();
  });

  it('tolerates the whitespace damage PDF extraction causes', () => {
    const citation = locateCitation(SOURCE, 'Invoices   are payable\n   within 45 days');
    expect(citation).not.toBeNull();
    expect(citation!.quote).toContain('45 days');
  });

  it('rejects quotes too short to prove anything', () => {
    expect(locateCitation(SOURCE, '45')).toBeNull();
    expect(locateCitation(SOURCE, 'INR')).toBeNull();
  });

  it('handles missing input without throwing', () => {
    expect(locateCitation(null, 'anything')).toBeNull();
    expect(locateCitation(SOURCE, null)).toBeNull();
  });

  it('reports the page a quote appears on', () => {
    const paged = `page one text here${PAGE_SEPARATOR}the rate is INR 2,400 per hour`;
    expect(locateCitation(paged, 'the rate is INR 2,400 per hour')?.page).toBe(2);
  });
});

describe('value normalization', () => {
  it('normalizes money however it is written', () => {
    expect(normalize('INR 2,400', 'MONEY')).toBe('2400');
    expect(normalize('$1,250.50', 'MONEY')).toBe('1250.5');
  });

  it('reads the date formats contracts actually use', () => {
    expect(parseDate('2026-04-01')).toBe('2026-04-01');
    expect(parseDate('1 April 2026')).toBe('2026-04-01');
    expect(parseDate('1st April 2026')).toBe('2026-04-01');
    expect(parseDate('April 1, 2026')).toBe('2026-04-01');
    expect(parseDate('01/04/2026')).toBe('2026-04-01');
    expect(parseDate('01-04-2026')).toBe('2026-04-01');
  });

  it('rejects an impossible date rather than rolling it over', () => {
    expect(parseDate('31 February 2026')).toBeNull();
  });

  it('detects currency from a symbol or a code', () => {
    expect(detectCurrency('₹2,400')).toBe('INR');
    expect(detectCurrency('$1,250')).toBe('USD');
    expect(detectCurrency('GBP 900 per day')).toBe('GBP');
    expect(detectCurrency('2400 per hour')).toBeNull();
  });

  it('refuses values that do not fit the requested kind', () => {
    expect(normalize('sometime next spring', 'DATE')).toBeNull();
    expect(normalize('to be agreed', 'MONEY')).toBeNull();
    expect(normalize(null, 'NUMBER')).toBeNull();
  });
});

const CONTRACT = `MASTER SERVICES AGREEMENT

1. TERM. This Agreement is effective from 1 April 2026 and shall expire on
31 March 2027 unless renewed in writing.

2. RATES. The hourly rate for Senior Engineers shall be INR 2,400 per hour.
Overtime is billed at 1.5 x the standard rate.

3. PAYMENT. Invoices shall be raised monthly and are payable within 45 days.

4. MILESTONES.
Milestone 1 - Discovery and design complete: INR 450,000
Milestone 2 - Production release: INR 900,000

5. TERMINATION. Either party may terminate on 30 days written notice.
`;

const find = (all: ExtractionCandidate[], key: string) => all.find((c) => c.fieldKey === key);

describe('pattern extraction', () => {
  it('extracts the hourly rate with its currency', () => {
    const rate = find(extractByPattern(CONTRACT), 'hourly_rate');
    expect(rate).toBeDefined();
    expect(rate!.attributeType).toBe('RATE');
    expect(rate!.currency).toBe('INR');
    expect(normalize(rate!.rawValue, 'MONEY')).toBe('2400');
  });

  it('extracts payment terms and invoicing cadence', () => {
    const all = extractByPattern(CONTRACT);
    expect(normalize(find(all, 'payment_terms_days')!.rawValue, 'DURATION')).toBe('45');
    expect(find(all, 'invoicing_frequency')!.rawValue.toLowerCase()).toBe('monthly');
  });

  it('extracts both contract dates', () => {
    const all = extractByPattern(CONTRACT);
    expect(normalize(find(all, 'contract_start')!.rawValue, 'DATE')).toBe('2026-04-01');
    expect(normalize(find(all, 'contract_end')!.rawValue, 'DATE')).toBe('2027-03-31');
  });

  it('extracts each milestone as its own row', () => {
    const milestones = extractByPattern(CONTRACT).filter(
      (c) => c.attributeType === 'MILESTONE' && c.fieldKey.startsWith('milestone_'),
    );
    expect(milestones.length).toBeGreaterThanOrEqual(2);
  });

  it('produces citations that are genuinely present in the source', () => {
    // Pattern citations are the matched text itself, so every one must verify.
    for (const candidate of extractByPattern(CONTRACT)) {
      expect(
        locateCitation(CONTRACT, candidate.citationQuote),
        `${candidate.fieldKey} -> ${candidate.citationQuote}`,
      ).not.toBeNull();
    }
  });

  it('returns nothing for prose with no contractual facts', () => {
    expect(extractByPattern('Dear team, please find the meeting notes attached.')).toEqual([]);
    expect(extractByPattern('')).toEqual([]);
    expect(extractByPattern(null)).toEqual([]);
  });
});

describe('engine merge', () => {
  const candidate = (fieldKey: string, rawValue: string): ExtractionCandidate => ({
    attributeType: 'RATE',
    fieldKey,
    fieldLabel: fieldKey,
    rawValue,
    valueKind: 'MONEY',
    currency: 'INR',
    confidence: 0.5,
    citationQuote: null,
  });

  it('lets the pattern match win where both engines found the same field', () => {
    // The pattern value came from a regex over the document, so it cannot be
    // a fabrication — that is why it takes precedence.
    const merged = mergeCandidates(
      [candidate('hourly_rate', 'INR 9,999')],
      [candidate('hourly_rate', 'INR 2,400')],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.rawValue).toBe('INR 2,400');
  });

  it('keeps a field only one engine found', () => {
    const merged = mergeCandidates(
      [candidate('day_rate', 'INR 18,000')],
      [candidate('hourly_rate', 'INR 2,400')],
    );
    expect(merged).toHaveLength(2);
  });
});
