/**
 * Decides whether a claimed citation is really present in the source document.
 *
 * This is the guard that separates a grounded extraction from a plausible
 * invention. A model asked for a supporting quote will sometimes produce one
 * that reads like the contract but appears nowhere in it; such a quote fails
 * here and the extraction reaches the reviewer flagged as unverified rather
 * than silently carrying false provenance.
 *
 * Matching is exact first, then whitespace-insensitive. It deliberately stops
 * there: fuzzy matching would re-admit exactly the quotes this exists to catch.
 */

/** Pages are joined with a form feed, so an offset maps back to a page number. */
export const PAGE_SEPARATOR = '\f';

export interface Citation {
  quote: string;
  start: number;
  end: number;
  page: number;
}

/** Shorter than this, a "quote" matches by coincidence and proves nothing. */
const MIN_QUOTE_LENGTH = 8;

export function pageOf(source: string, offset: number): number {
  let page = 1;
  const limit = Math.min(offset, source.length);
  for (let i = 0; i < limit; i++) {
    if (source[i] === PAGE_SEPARATOR) page++;
  }
  return page;
}

function build(source: string, quote: string, start: number, end: number): Citation {
  return { quote, start, end, page: pageOf(source, start) };
}

/**
 * PDF extraction inserts and drops spaces unpredictably around line breaks, so
 * a quote that is genuinely present often differs from the source only in
 * whitespace. Walk both skipping whitespace, and report the span in the
 * original text that the quote covers.
 */
function locateIgnoringWhitespace(source: string, quote: string): Citation | null {
  const compact = quote.replace(/\s+/g, '');
  if (compact.length < MIN_QUOTE_LENGTH) return null;

  let qi = 0;
  let spanStart = -1;

  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (/\s/.test(char)) continue;

    if (char === compact[qi]) {
      if (qi === 0) spanStart = i;
      qi++;
      if (qi === compact.length) {
        return build(source, source.slice(spanStart, i + 1), spanStart, i + 1);
      }
    } else if (qi > 0) {
      // Restart just after the failed start, so an overlapping near-miss
      // cannot cause a real match to be skipped.
      i = spanStart;
      qi = 0;
      spanStart = -1;
    }
  }
  return null;
}

export function locateCitation(
  sourceText: string | null | undefined,
  claimedQuote: string | null | undefined,
): Citation | null {
  if (!sourceText || !claimedQuote) return null;

  const quote = claimedQuote.trim();
  if (quote.length < MIN_QUOTE_LENGTH) return null;

  const start = sourceText.indexOf(quote);
  if (start >= 0) {
    return build(sourceText, quote, start, start + quote.length);
  }
  return locateIgnoringWhitespace(sourceText, quote);
}
