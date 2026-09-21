import { completeJson, isAiEnabled, aiConfig, truncate } from '../ai/llm.ts';
import { detectCurrency, normalize, VALUE_KINDS, type ValueKind } from './normalize.ts';

/**
 * The two extraction engines, and the shape they both produce.
 *
 * A language model gives recall on prose no pattern anticipates; a pattern
 * matcher is exact, free and never unavailable. Both always run and their
 * output is merged, so the pipeline downstream — citation verification,
 * normalization, human review — is identical regardless of which found what.
 */

export type AttributeType = 'RATE' | 'BILLING_TERM' | 'MILESTONE' | 'DATE';

const ATTRIBUTE_TYPES: readonly AttributeType[] = ['RATE', 'BILLING_TERM', 'MILESTONE', 'DATE'];

export interface ExtractionCandidate {
  attributeType: AttributeType;
  fieldKey: string;
  fieldLabel: string;
  rawValue: string;
  valueKind: ValueKind;
  currency: string | null;
  confidence: number;
  /** What the engine claims to have read this from; verified before storage. */
  citationQuote: string | null;
}

// ------------------------------------------------------- pattern engine

const MONEY = String.raw`(?:INR|USD|EUR|GBP|Rs\.?|₹|\$|€|£)\s*[\d,]+(?:\.\d+)?`;
const CONTEXT = 70;

interface Rule {
  type: AttributeType;
  fieldKey: string;
  label: string;
  kind: ValueKind;
  confidence: number;
  pattern: RegExp;
}

function rule(
  type: AttributeType,
  fieldKey: string,
  label: string,
  kind: ValueKind,
  confidence: number,
  source: string,
): Rule {
  return { type, fieldKey, label, kind, confidence, pattern: new RegExp(source, 'gi') };
}

/** Ordered most-specific first; each captures the value in group 1. */
const RULES: Rule[] = [
  rule('RATE', 'hourly_rate', 'Hourly rate', 'MONEY', 0.88,
    String.raw`(?:hourly\s+rate|rate\s+per\s+hour)\s*(?:of|is|:|shall\s+be|at)?\s*(${MONEY})`),
  rule('RATE', 'hourly_rate', 'Hourly rate', 'MONEY', 0.85,
    String.raw`(${MONEY})\s*(?:per\s+hour|/\s*hour|/\s*hr|an\s+hour)\b`),
  rule('RATE', 'day_rate', 'Day rate', 'MONEY', 0.82,
    String.raw`(${MONEY})\s*(?:per\s+day|/\s*day|per\s+diem)\b`),
  rule('RATE', 'overtime_multiplier', 'Overtime multiplier', 'NUMBER', 0.8,
    String.raw`overtime[^.\n]{0,40}?\b(\d+(?:\.\d+)?)\s*(?:x|times)\b`),
  rule('RATE', 'contract_cap', 'Total contract cap', 'MONEY', 0.78,
    String.raw`(?:not\s+to\s+exceed|capped\s+at|maximum\s+(?:of|value)|total\s+contract\s+value)[^.\n]{0,30}?(${MONEY})`),

  rule('BILLING_TERM', 'payment_terms_days', 'Payment terms (days)', 'DURATION', 0.87,
    String.raw`(?:net|payable\s+within|payment\s+(?:terms?|due)\s*(?:of|:|is|shall\s+be)?)\s*(\d{1,3})\s*(?:days|calendar\s+days|business\s+days)?\b`),
  rule('BILLING_TERM', 'invoicing_frequency', 'Invoicing frequency', 'TEXT', 0.8,
    String.raw`invoic\w*[^.\n]{0,40}?\b(monthly|weekly|fortnightly|bi-weekly|quarterly|milestone-based|upon\s+completion)\b`),
  rule('BILLING_TERM', 'billing_model', 'Billing model', 'TEXT', 0.76,
    String.raw`\b(time\s+and\s+materials|fixed\s+price|milestone[-\s]based|hourly\s+billing)\b`),
  rule('BILLING_TERM', 'late_payment_interest', 'Late payment interest (%)', 'NUMBER', 0.75,
    String.raw`(?:late\s+payment|overdue)[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*%`),

  rule('MILESTONE', 'milestone', 'Milestone', 'MONEY', 0.75,
    String.raw`milestone\s*\d*\s*[:\-–][^\n]{0,80}?(${MONEY})`),
  rule('MILESTONE', 'milestone_share', 'Milestone payment share (%)', 'NUMBER', 0.72,
    String.raw`(?:on\s+completion|upon\s+delivery|milestone)[^.\n]{0,50}?(\d{1,3})\s*%`),

  rule('DATE', 'contract_start', 'Contract start date', 'DATE', 0.88,
    String.raw`(?:effective\s+(?:date|from)|commenc\w+\s+on|start\s+date|shall\s+begin\s+on)\s*(?:of|is|:|shall\s+be)?\s*([\dA-Za-z][\w,./\- ]{5,25}\d{4})`),
  rule('DATE', 'contract_end', 'Contract end date', 'DATE', 0.88,
    String.raw`(?:expir\w+\s+on|end\s+date|terminat\w+\s+on|valid\s+(?:un)?til)\s*(?:of|is|:|shall\s+be)?\s*([\dA-Za-z][\w,./\- ]{5,25}\d{4})`),
  rule('DATE', 'notice_period_days', 'Termination notice (days)', 'DURATION', 0.8,
    String.raw`(\d{1,3})\s*(?:days|calendar\s+days)\s*(?:prior\s+)?written\s+notice`),
];

/** Widens a match to readable sentence bounds so the citation carries context. */
export function sentenceAround(text: string, matchStart: number, matchEnd: number): string {
  let from = Math.max(0, matchStart - CONTEXT);
  let to = Math.min(text.length, matchEnd + CONTEXT);

  const sentenceStart = Math.max(text.lastIndexOf('. ', matchStart), text.lastIndexOf('\n', matchStart));
  if (sentenceStart > from) from = sentenceStart + 1;

  const sentenceEnd = text.indexOf('. ', matchEnd);
  if (sentenceEnd >= 0 && sentenceEnd + 1 < to) to = sentenceEnd + 1;

  const lineEnd = text.indexOf('\n', matchEnd);
  if (lineEnd >= 0 && lineEnd < to) to = lineEnd;

  return text.slice(from, Math.max(from, to)).trim();
}

/**
 * Pattern-based extraction.
 *
 * This engine is why the platform can be deployed and demonstrated with no
 * model credentials and no per-token cost. Lower recall on unusual phrasing,
 * but its citation *is* the matched text, so its provenance is correct by
 * construction rather than by checking a claim afterwards.
 */
export function extractByPattern(sourceText: string | null | undefined): ExtractionCandidate[] {
  if (!sourceText || sourceText.trim().length === 0) return [];

  const found: ExtractionCandidate[] = [];
  const claimed = new Set<string>();

  for (const r of RULES) {
    const repeatable = r.type === 'MILESTONE';
    let occurrence = 0;
    r.pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = r.pattern.exec(sourceText)) !== null) {
      const rawValue = match[1];
      if (!rawValue) continue;

      const key = repeatable ? `${r.fieldKey}_${occurrence + 1}` : r.fieldKey;
      if (claimed.has(key)) break;

      // A value that will not normalize is a false positive, not an extraction.
      if (normalize(rawValue, r.kind) === null) continue;

      claimed.add(key);
      occurrence++;

      found.push({
        attributeType: r.type,
        fieldKey: key,
        fieldLabel: repeatable ? `${r.label} ${occurrence}` : r.label,
        rawValue: rawValue.trim(),
        valueKind: r.kind,
        currency: detectCurrency(rawValue),
        confidence: r.confidence,
        citationQuote: sentenceAround(sourceText, match.index, match.index + match[0].length),
      });

      if (!repeatable) break;
    }
  }
  return found;
}

// --------------------------------------------------------- model engine

const SYSTEM_PROMPT = `You extract contractual facts from staffing and services contracts.

Return ONLY a JSON object of this exact shape, with no prose and no markdown fences:

{"attributes":[{"attribute_type":"RATE|BILLING_TERM|MILESTONE|DATE",
                "field_key":"snake_case_identifier",
                "field_label":"Human readable label",
                "raw_value":"the value exactly as written in the contract",
                "value_kind":"MONEY|NUMBER|DATE|DURATION|TEXT",
                "currency":"ISO 4217 code, or null",
                "confidence":0.0,
                "quote":"a verbatim sentence copied character-for-character from the contract"}]}

Rules you must follow:
- "quote" MUST be copied verbatim from the contract text you were given. Never
  paraphrase, never reconstruct, never tidy it up. A quote that does not appear
  in the text is discarded and your extraction is lost.
- If a fact is not stated in the contract, omit it. Do not infer, do not guess,
  and never supply a customary or typical value.
- "raw_value" is what the contract says, not a converted or rounded form.
- "confidence" is your own estimate between 0 and 1.
- Use these field_key values where they apply, so results stay comparable:
  hourly_rate, day_rate, overtime_multiplier, contract_cap, payment_terms_days,
  invoicing_frequency, billing_model, late_payment_interest, milestone_1..n,
  contract_start, contract_end, notice_period_days.`;

interface RawAttribute {
  attribute_type?: string;
  field_key?: string;
  field_label?: string;
  raw_value?: string;
  value_kind?: string;
  currency?: string | null;
  confidence?: number;
  quote?: string | null;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase() as T;
  return allowed.includes(upper) ? upper : null;
}

/**
 * Language-model extraction.
 *
 * The model is never asked to do arithmetic or to decide anything. It reads
 * prose and reports what it read; normalization, verification and every
 * downstream calculation happen in code.
 */
export async function extractByModel(
  sourceText: string | null | undefined,
): Promise<ExtractionCandidate[]> {
  if (!isAiEnabled() || !sourceText || sourceText.trim().length === 0) return [];

  const config = aiConfig();
  const text = truncate(sourceText, config.maxSourceChars);
  const result = await completeJson<{ attributes?: RawAttribute[] }>(
    SYSTEM_PROMPT,
    `CONTRACT TEXT:\n\n${text}\n\nExtract every rate, billing term, milestone and date stated above.`,
  );

  if (!result?.attributes || !Array.isArray(result.attributes)) return [];

  const candidates: ExtractionCandidate[] = [];
  for (const attribute of result.attributes) {
    const type = asEnum(attribute.attribute_type, ATTRIBUTE_TYPES);
    const kind = asEnum(attribute.value_kind, VALUE_KINDS);
    const rawValue = attribute.raw_value?.trim();
    const fieldKey = attribute.field_key?.trim().toLowerCase();

    if (!type || !kind || !rawValue || !fieldKey) continue;

    const confidence = Number(attribute.confidence);
    const currency = attribute.currency?.trim();

    candidates.push({
      attributeType: type,
      fieldKey,
      fieldLabel: attribute.field_label?.trim() || fieldKey,
      rawValue,
      valueKind: kind,
      currency: currency && currency.length === 3 ? currency.toUpperCase() : null,
      confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0.5,
      citationQuote: attribute.quote?.trim() ?? null,
    });
  }
  return candidates;
}

/**
 * Combines both engines, keyed by attribute type and field key.
 *
 * The model goes in first for recall, then pattern matches overwrite what they
 * also found. The pattern match wins deliberately: its value came from a regex
 * over the document itself, so it cannot be a fabrication, and its citation is
 * the matched text rather than a claim about it.
 */
export function mergeCandidates(
  fromModel: ExtractionCandidate[],
  fromPatterns: ExtractionCandidate[],
): ExtractionCandidate[] {
  const byField = new Map<string, ExtractionCandidate>();
  for (const candidate of fromModel) {
    byField.set(`${candidate.attributeType}:${candidate.fieldKey}`, candidate);
  }
  for (const candidate of fromPatterns) {
    byField.set(`${candidate.attributeType}:${candidate.fieldKey}`, candidate);
  }
  return [...byField.values()];
}
