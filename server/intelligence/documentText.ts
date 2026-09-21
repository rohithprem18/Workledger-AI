import { createHash } from 'node:crypto';
import { BusinessRuleError } from '../core/errors.ts';
import { PAGE_SEPARATOR } from './citation.ts';

/**
 * Turns an uploaded file into the plain text every later stage reads.
 *
 * Pages are joined with a form feed so a character offset maps back to a page
 * number by counting separators before it — that is what lets a citation say
 * "page 3" without storing a per-page index.
 */

const MAX_BYTES = 10 * 1024 * 1024;

export interface ParsedDocument {
  text: string;
  pageCount: number;
  checksum: string;
}

/**
 * Collapses runs of spaces and tabs and trims trailing spaces on each line.
 *
 * Citation offsets are taken against this normalized text, so it must be the
 * one and only form ever stored — never re-normalized afterwards, or existing
 * offsets would silently point at the wrong span.
 */
export function normalizeWhitespace(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function parseDocument(
  fileName: string,
  contentType: string | undefined,
  bytes: Uint8Array,
): Promise<ParsedDocument> {
  if (!bytes || bytes.length === 0) {
    throw new BusinessRuleError('The uploaded document is empty');
  }
  if (bytes.length > MAX_BYTES) {
    throw new BusinessRuleError(
      `Document exceeds the 10 MB limit (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`,
    );
  }

  const lower = (fileName ?? '').toLowerCase();
  const isPdf = lower.endsWith('.pdf') || contentType === 'application/pdf';

  let text: string;
  let pageCount: number;

  if (isPdf) {
    // Imported lazily so a plain-text upload never pays to load the PDF engine
    // — which matters on a serverless cold start.
    const { extractText, getDocumentProxy } = await import('unpdf');
    try {
      const pdf = await getDocumentProxy(bytes);
      const result = await extractText(pdf, { mergePages: false });
      const pages = Array.isArray(result.text) ? result.text : [String(result.text)];
      pageCount = Math.max(pages.length, 1);
      text = pages.join(PAGE_SEPARATOR);
    } catch (error) {
      throw new BusinessRuleError(
        `Could not read the PDF: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  } else {
    text = new TextDecoder('utf-8').decode(bytes);
    pageCount = 1;
  }

  text = normalizeWhitespace(text);
  if (text.length === 0) {
    throw new BusinessRuleError(
      'No readable text found in the document. Scanned images have no extractable text — ' +
        'upload a text-based PDF, plain text, or Markdown file.',
    );
  }

  return { text, pageCount, checksum: sha256(bytes) };
}
