/**
 * Converts a value as written in a contract into a canonical form the rest of
 * the platform can compute on — a plain decimal, an ISO-8601 date, or trimmed
 * text.
 *
 * Applied to both extraction engines, so "₹1,250.00/hr" and "INR 1250 per
 * hour" normalize identically no matter which one found them.
 */

export type ValueKind = 'MONEY' | 'NUMBER' | 'DATE' | 'DURATION' | 'TEXT';

export const VALUE_KINDS: readonly ValueKind[] = ['MONEY', 'NUMBER', 'DATE', 'DURATION', 'TEXT'];

const MONEY_PATTERN = /(-?\d{1,3}(?:[,\s]\d{2,3})*(?:\.\d+)?|-?\d+(?:\.\d+)?)/;

const CURRENCY_SYMBOLS: Record<string, string> = {
  '₹': 'INR',
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
};

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
};

export function parseDecimal(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = MONEY_PATTERN.exec(raw);
  if (!match) return null;
  const value = Number(match[1]!.replace(/[,\s]/g, ''));
  return Number.isFinite(value) ? value : null;
}

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Round-trip through Date to reject 31 February and friends.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Parses the date formats contracts actually use.
 *
 * Ambiguous all-numeric forms are read day-first (01/04/2026 is 1 April),
 * which is the convention in the markets this platform targets. A contract
 * using month-first would be misread — which is exactly why every extracted
 * date is shown to a human with its source quote before it is applied.
 */
export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const cleaned = raw
    .trim()
    .replace(/(\d+)(st|nd|rd|th)\b/gi, '$1')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ');

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(cleaned);
  if (isoMatch) return iso(+isoMatch[1]!, +isoMatch[2]!, +isoMatch[3]!);

  const slashIso = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(cleaned);
  if (slashIso) return iso(+slashIso[1]!, +slashIso[2]!, +slashIso[3]!);

  // 1 April 2026
  const dayMonth = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(cleaned);
  if (dayMonth) {
    const month = MONTHS[dayMonth[2]!.toLowerCase()];
    if (month) return iso(+dayMonth[3]!, month, +dayMonth[1]!);
  }

  // April 1 2026
  const monthDay = /^([A-Za-z]+) (\d{1,2}) (\d{4})$/.exec(cleaned);
  if (monthDay) {
    const month = MONTHS[monthDay[1]!.toLowerCase()];
    if (month) return iso(+monthDay[3]!, month, +monthDay[2]!);
  }

  // 01/04/2026, 01-04-2026, 01.04.2026 — day first.
  const numeric = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(cleaned);
  if (numeric) return iso(+numeric[3]!, +numeric[2]!, +numeric[1]!);

  return null;
}

/** ISO currency code implied by a symbol or code in the raw text. */
export function detectCurrency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (raw.includes(symbol)) return code;
  }
  const match = /\b(INR|USD|EUR|GBP|JPY|AUD|CAD|SGD)\b/.exec(raw.toUpperCase());
  return match ? match[1]! : null;
}

/** Canonical value, or null when the raw text cannot be read as that kind. */
export function normalize(raw: string | null | undefined, kind: ValueKind): string | null {
  if (!raw || raw.trim().length === 0) return null;
  const value = raw.trim();

  switch (kind) {
    case 'MONEY':
    case 'NUMBER': {
      const parsed = parseDecimal(value);
      return parsed === null ? null : String(parsed);
    }
    case 'DURATION': {
      const parsed = parseDecimal(value);
      return parsed === null ? null : String(parsed);
    }
    case 'DATE':
      return parseDate(value);
    case 'TEXT':
      return value.replace(/\s+/g, ' ');
  }
}
