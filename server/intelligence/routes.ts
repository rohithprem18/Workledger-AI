import { Router, type Request } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db/pool.ts';
import { BusinessRuleError, NotFoundError, ValidationError } from '../core/errors.ts';
import { created, handler, ok, param, parseBody, parseQuery } from '../core/http.ts';
import { authenticate, requirePermission } from '../auth/middleware.ts';
import { recordAudit } from '../core/audit.ts';
import { isAiEnabled } from '../ai/llm.ts';
import { locateCitation } from './citation.ts';
import { parseDocument } from './documentText.ts';
import { detectCurrency, normalize, type ValueKind } from './normalize.ts';
import {
  extractByModel,
  extractByPattern,
  mergeCandidates,
  type ExtractionCandidate,
} from './extractors.ts';

/**
 * The contract-processing pipeline.
 *
 *   upload → text extraction → both engines propose → merge
 *          → citation verification → normalization → PENDING rows
 *          → human validation → apply to contract
 *
 * Two properties hold throughout, and are what make the output usable rather
 * than merely impressive:
 *
 *   1. Nothing is applied without a human. The pipeline may only write
 *      PENDING; moving a row out of it requires a reviewer's identity, and only
 *      accepted or edited rows are ever applied.
 *   2. Every citation is checked against the stored source. A quote that is not
 *      a verbatim span cannot be marked verified, whichever engine produced it.
 */
export const intelligenceRouter: Router = Router();
intelligenceRouter.use(authenticate);

const reviewSchema = z.object({
  decision: z.enum(['ACCEPTED', 'EDITED', 'REJECTED']),
  correctedValue: z.string().trim().max(2000).nullish(),
  note: z.string().trim().max(2000).nullish(),
});

const listQuerySchema = z.object({ contractId: z.uuid().optional() });

const documentColumns = `
  d.id, d.contract_id AS "contractId", c.title AS "contractTitle",
  d.company_id AS "companyId", co.name AS "companyName",
  d.file_name AS "fileName", d.content_type AS "contentType", d.size_bytes AS "sizeBytes",
  d.page_count AS "pageCount", d.status,
  d.extraction_engine AS "extractionEngine", d.extraction_model AS "extractionModel",
  d.extraction_error AS "extractionError", d.extracted_at AS "extractedAt",
  d.created_at AS "createdAt"`;

const documentFrom = `
  FROM contract_documents d
  LEFT JOIN contracts c ON c.id = d.contract_id
  LEFT JOIN client_companies co ON co.id = d.company_id`;

const extractionColumns = `
  id, attribute_type AS "attributeType", field_key AS "fieldKey", field_label AS "fieldLabel",
  raw_value AS "rawValue", normalized_value AS "normalizedValue",
  coalesce(nullif(reviewed_value, ''), normalized_value) AS "effectiveValue",
  value_kind AS "valueKind", currency, confidence,
  citation_quote AS "citationQuote", citation_page AS "citationPage",
  citation_start AS "citationStart", citation_end AS "citationEnd",
  citation_verified AS "citationVerified",
  review_status AS "reviewStatus", reviewed_value AS "reviewedValue",
  review_note AS "reviewNote", reviewed_at AS "reviewedAt"`;

async function extractionsOf(documentId: string) {
  return query(
    `SELECT ${extractionColumns} FROM contract_extractions
      WHERE document_id = $1 ORDER BY attribute_type, field_key`,
    [documentId],
  );
}

async function documentDetail(id: string) {
  const document = await queryOne(`SELECT ${documentColumns} ${documentFrom} WHERE d.id = $1`, [id]);
  if (!document) return null;
  const extractions = await extractionsOf(id);
  return {
    ...document,
    attributeCount: extractions.length,
    pendingCount: extractions.filter((e) => e.reviewStatus === 'PENDING').length,
    verifiedCitationCount: extractions.filter((e) => e.citationVerified).length,
    extractions,
  };
}

/**
 * Reads a multipart upload without a parser dependency.
 *
 * The endpoint accepts exactly one file field, so a full multipart
 * implementation would be weight for no benefit on a serverless bundle. The
 * body is buffered raw (see `app.ts`) and the single part is sliced out here
 * on byte boundaries, which is what keeps a PDF intact — splitting on a decoded
 * string would corrupt it.
 */
function readSingleUpload(req: Request): { fileName: string; contentType: string; bytes: Buffer } {
  const contentType = req.headers['content-type'] ?? '';
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!boundaryMatch) {
    throw new ValidationError('Expected a multipart/form-data upload');
  }
  const boundary = `--${(boundaryMatch[1] ?? boundaryMatch[2] ?? '').trim()}`;
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new ValidationError('No file was uploaded');
  }

  const boundaryBuffer = Buffer.from(boundary);
  const parts: Buffer[] = [];
  let index = body.indexOf(boundaryBuffer);

  while (index !== -1) {
    const start = index + boundaryBuffer.length;
    const next = body.indexOf(boundaryBuffer, start);
    if (next === -1) break;
    parts.push(body.subarray(start, next));
    index = next;
  }

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headers = part.subarray(0, headerEnd).toString('utf8');
    if (!/name="file"/i.test(headers)) continue;

    const fileNameMatch = /filename="([^"]*)"/i.exec(headers);
    const partTypeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headers);

    // Trailing CRLF belongs to the boundary, not the file.
    let content = part.subarray(headerEnd + 4);
    if (content.subarray(-2).toString() === '\r\n') {
      content = content.subarray(0, content.length - 2);
    }

    return {
      fileName: fileNameMatch?.[1] || 'contract.txt',
      contentType: partTypeMatch?.[1]?.trim() || 'application/octet-stream',
      bytes: content,
    };
  }
  throw new ValidationError('No "file" field found in the upload');
}

/** Reads optional text fields out of the same multipart body. */
function readUploadField(req: Request, name: string): string | null {
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body)) return null;
  const pattern = new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r\\n]*)`, 'i');
  const match = pattern.exec(body.toString('utf8'));
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

// ----------------------------------------------------------------- upload

intelligenceRouter.post(
  '/contract-documents',
  requirePermission('UPLOAD_CONTRACT_DOCUMENT'),
  handler(async (req, res) => {
    const upload = readSingleUpload(req);
    const contractId = readUploadField(req, 'contractId');
    const companyId = readUploadField(req, 'companyId');

    const parsed = await parseDocument(upload.fileName, upload.contentType, upload.bytes);

    // The same file uploaded twice is the same document: return the existing
    // one rather than paying for extraction again and splitting the review.
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM contract_documents WHERE checksum_sha256 = $1',
      [parsed.checksum],
    );
    if (existing) {
      return ok(res, await documentDetail(existing.id), 'This document was already ingested');
    }

    let resolvedCompanyId = companyId;
    if (contractId) {
      const contract = await queryOne<{ company_id: string }>(
        'SELECT company_id FROM contracts WHERE id = $1',
        [contractId],
      );
      if (!contract) throw new NotFoundError('Contract', contractId);
      // A document attached to a contract inherits that contract's client.
      resolvedCompanyId ??= contract.company_id;
    }

    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO contract_documents
         (contract_id, company_id, file_name, content_type, size_bytes, checksum_sha256,
          source_text, page_count, status, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'UPLOADED', $9) RETURNING id`,
      [
        contractId,
        resolvedCompanyId,
        upload.fileName,
        upload.contentType,
        upload.bytes.length,
        parsed.checksum,
        parsed.text,
        parsed.pageCount,
        req.user!.id,
      ],
    );
    await recordAudit({
      userId: req.user!.id,
      action: 'UPLOAD_CONTRACT_DOCUMENT',
      entityType: 'ContractDocument',
      entityId: inserted!.id,
      newValue: { fileName: upload.fileName, pageCount: parsed.pageCount },
    });

    return created(res, await documentDetail(inserted!.id), 'Document ingested');
  }),
);

// -------------------------------------------------------------- extraction

/**
 * Materializes a candidate: verifies its citation and normalizes its value.
 *
 * A candidate whose quote cannot be found is still stored — flagged unverified
 * — because a reviewer deciding what to trust is better served by seeing it
 * than by having it silently dropped.
 */
function toRow(candidate: ExtractionCandidate, sourceText: string) {
  const normalized = normalize(candidate.rawValue, candidate.valueKind);
  const currency =
    candidate.currency ??
    (candidate.valueKind === 'MONEY' ? detectCurrency(candidate.rawValue) : null);
  const citation = locateCitation(sourceText, candidate.citationQuote);

  return {
    attributeType: candidate.attributeType,
    fieldKey: candidate.fieldKey,
    fieldLabel: candidate.fieldLabel,
    rawValue: candidate.rawValue,
    normalizedValue: normalized,
    valueKind: candidate.valueKind as ValueKind,
    currency,
    confidence: candidate.confidence,
    citationQuote: citation?.quote ?? candidate.citationQuote,
    citationPage: citation?.page ?? null,
    citationStart: citation?.start ?? null,
    citationEnd: citation?.end ?? null,
    citationVerified: citation !== null,
  };
}

intelligenceRouter.post(
  '/contract-documents/:id/extract',
  requirePermission('RUN_CONTRACT_EXTRACTION'),
  handler(async (req, res) => {
    const id = param(req, 'id');

    const document = await queryOne<{ id: string; status: string; source_text: string }>(
      'SELECT id, status, source_text FROM contract_documents WHERE id = $1',
      [id],
    );
    if (!document) throw new NotFoundError('Contract document', id);
    if (document.status === 'APPLIED') {
      throw new BusinessRuleError(
        'This document has already been applied to a contract and cannot be re-extracted',
      );
    }

    // Both engines run; neither is trusted alone.
    const fromModel = await extractByModel(document.source_text).catch((error: unknown) => {
      console.warn('Model extractor failed:', error);
      return [] as ExtractionCandidate[];
    });
    const fromPatterns = extractByPattern(document.source_text);
    const merged = mergeCandidates(fromModel, fromPatterns);

    const engine =
      fromModel.length > 0 && fromPatterns.length > 0
        ? 'llm+deterministic'
        : fromModel.length > 0
          ? 'llm'
          : 'deterministic';

    await withTransaction(async (tx) => {
      // Re-running replaces the previous proposal set, and the reviewer
      // decisions on it — which is why an applied document is frozen above.
      await tx.query('DELETE FROM contract_extractions WHERE document_id = $1', [id]);

      for (const candidate of merged) {
        const row = toRow(candidate, document.source_text);
        await tx.query(
          `INSERT INTO contract_extractions
             (document_id, attribute_type, field_key, field_label, raw_value, normalized_value,
              value_kind, currency, confidence, citation_quote, citation_page,
              citation_start, citation_end, citation_verified, review_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'PENDING')`,
          [
            id, row.attributeType, row.fieldKey, row.fieldLabel, row.rawValue,
            row.normalizedValue, row.valueKind, row.currency, row.confidence,
            row.citationQuote, row.citationPage, row.citationStart, row.citationEnd,
            row.citationVerified,
          ],
        );
      }

      await tx.query(
        `UPDATE contract_documents
            SET status = 'PENDING_REVIEW', extraction_engine = $2, extraction_model = $3,
                extraction_error = NULL, extracted_at = now(), updated_at = now()
          WHERE id = $1`,
        [id, engine, isAiEnabled() ? 'llm-assisted' : 'patterns-only'],
      );
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'RUN_CONTRACT_EXTRACTION',
          entityType: 'ContractDocument',
          entityId: id,
          newValue: { engine, attributeCount: merged.length },
        },
        tx,
      );
    });

    return ok(
      res,
      await documentDetail(id),
      `Extracted ${merged.length} attribute(s) — every one needs review before it is applied`,
    );
  }),
);

// ---------------------------------------------------------- human review

intelligenceRouter.put(
  '/contract-documents/extractions/:extractionId/review',
  requirePermission('VALIDATE_CONTRACT_EXTRACTION'),
  handler(async (req, res) => {
    const extractionId = param(req, 'extractionId');
    const body = parseBody(reviewSchema, req.body);

    const row = await queryOne<{
      id: string;
      document_id: string;
      value_kind: ValueKind;
      field_label: string;
      doc_status: string;
    }>(
      `SELECT e.id, e.document_id, e.value_kind, e.field_label, d.status AS doc_status
         FROM contract_extractions e JOIN contract_documents d ON d.id = e.document_id
        WHERE e.id = $1`,
      [extractionId],
    );
    if (!row) throw new NotFoundError('Extraction', extractionId);
    if (row.doc_status === 'APPLIED') {
      throw new BusinessRuleError(
        'This document has already been applied and its extractions are frozen',
      );
    }

    let reviewedValue: string | null = null;
    if (body.decision === 'EDITED') {
      if (!body.correctedValue) {
        throw new BusinessRuleError('An edited extraction must carry the corrected value');
      }
      reviewedValue = normalize(body.correctedValue, row.value_kind);
      if (reviewedValue === null) {
        throw new BusinessRuleError(
          `"${body.correctedValue}" is not a valid ${row.value_kind.toLowerCase()} value for ${row.field_label}`,
        );
      }
    }

    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE contract_extractions
            SET review_status = $2, reviewed_value = $3, review_note = $4,
                reviewed_by = $5, reviewed_at = now(), updated_at = now()
          WHERE id = $1`,
        [extractionId, body.decision, reviewedValue, body.note ?? null, req.user!.id],
      );

      // Once nothing is still pending, the document as a whole is validated.
      const pending = await tx.queryOne<{ count: string }>(
        `SELECT count(*) AS count FROM contract_extractions
          WHERE document_id = $1 AND review_status = 'PENDING'`,
        [row.document_id],
      );
      if (Number(pending?.count ?? 0) === 0) {
        await tx.query(
          `UPDATE contract_documents SET status = 'VALIDATED', updated_at = now()
            WHERE id = $1 AND status = 'PENDING_REVIEW'`,
          [row.document_id],
        );
      }
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'VALIDATE_CONTRACT_EXTRACTION',
          entityType: 'ContractExtraction',
          entityId: extractionId,
          newValue: { decision: body.decision, reviewedValue },
        },
        tx,
      );
    });

    const updated = await queryOne(
      `SELECT ${extractionColumns} FROM contract_extractions WHERE id = $1`,
      [extractionId],
    );
    return ok(res, updated);
  }),
);

// ----------------------------------------------------------------- apply

intelligenceRouter.post(
  '/contract-documents/:id/apply',
  requirePermission('APPLY_CONTRACT_EXTRACTION'),
  handler(async (req, res) => {
    const id = param(req, 'id');

    const document = await queryOne<{ id: string; contract_id: string | null; status: string }>(
      'SELECT id, contract_id, status FROM contract_documents WHERE id = $1',
      [id],
    );
    if (!document) throw new NotFoundError('Contract document', id);
    if (!document.contract_id) {
      throw new BusinessRuleError('Link this document to a contract before applying its extractions');
    }
    if (document.status === 'APPLIED') {
      throw new BusinessRuleError('These extractions have already been applied');
    }

    const rows = await query<{
      field_key: string;
      attribute_type: string;
      review_status: string;
      effective: string | null;
    }>(
      `SELECT field_key, attribute_type, review_status,
              coalesce(nullif(reviewed_value, ''), normalized_value) AS effective
         FROM contract_extractions WHERE document_id = $1`,
      [id],
    );

    const unreviewed = rows.filter((r) => r.review_status === 'PENDING').length;
    if (unreviewed > 0) {
      throw new BusinessRuleError(
        `${unreviewed} extraction(s) still await review. Every attribute must be accepted, ` +
          'edited or rejected before it can be applied.',
      );
    }

    const contractId = document.contract_id;
    await withTransaction(async (tx) => {
      const contract = await tx.queryOne<{ start_date: string; end_date: string }>(
        'SELECT start_date, end_date FROM contracts WHERE id = $1 FOR UPDATE',
        [contractId],
      );
      if (!contract) throw new NotFoundError('Contract', contractId);

      let startDate = contract.start_date;
      let endDate = contract.end_date;

      // Only dates are applied structurally: they are the only extracted
      // attributes with an unambiguous home on the contract. Rates inform the
      // requirements a manager then creates, and milestones the schedule —
      // both deliberately left as human steps.
      for (const row of rows) {
        if (row.review_status === 'REJECTED' || row.attribute_type !== 'DATE') continue;
        if (!row.effective) continue;
        if (row.field_key === 'contract_start') startDate = row.effective;
        if (row.field_key === 'contract_end') endDate = row.effective;
      }

      if (endDate < startDate) {
        throw new BusinessRuleError(
          `Applying these dates would end the contract (${endDate}) before it starts (${startDate})`,
        );
      }

      await tx.query(
        'UPDATE contracts SET start_date = $2, end_date = $3, updated_at = now() WHERE id = $1',
        [contractId, startDate, endDate],
      );
      await tx.query(
        `UPDATE contract_documents SET status = 'APPLIED', updated_at = now() WHERE id = $1`,
        [id],
      );
      await recordAudit(
        {
          userId: req.user!.id,
          action: 'APPLY_CONTRACT_EXTRACTION',
          entityType: 'Contract',
          entityId: contractId,
          oldValue: { startDate: contract.start_date, endDate: contract.end_date },
          newValue: { startDate, endDate },
        },
        tx,
      );
    });

    const contract = await queryOne(
      `SELECT c.id, c.company_id AS "companyId", co.name AS "companyName", c.title, c.description,
              c.billing_type_id AS "billingTypeId", bt.code AS "billingTypeCode",
              bt.label AS "billingTypeLabel", c.start_date AS "startDate",
              c.end_date AS "endDate", c.active
         FROM contracts c
         JOIN client_companies co ON co.id = c.company_id
         JOIN billing_types bt ON bt.id = c.billing_type_id
        WHERE c.id = $1`,
      [contractId],
    );
    return ok(res, contract, 'Validated attributes applied to the contract');
  }),
);

// ----------------------------------------------------------------- reads

intelligenceRouter.get(
  '/contract-documents',
  requirePermission('VIEW_CONTRACT_DOCUMENTS'),
  handler(async (req, res) => {
    const { contractId } = parseQuery(listQuerySchema, req.query);
    const documents = await query<{ id: string }>(
      `SELECT ${documentColumns} ${documentFrom}
        WHERE ($1::uuid IS NULL OR d.contract_id = $1)
        ORDER BY d.created_at DESC`,
      [contractId ?? null],
    );

    // Counts for the list view, in one query rather than per document.
    const counts = await query<{
      document_id: string;
      total: string;
      pending: string;
      verified: string;
    }>(
      `SELECT document_id, count(*) AS total,
              count(*) FILTER (WHERE review_status = 'PENDING') AS pending,
              count(*) FILTER (WHERE citation_verified) AS verified
         FROM contract_extractions GROUP BY document_id`,
    );
    const byDocument = new Map(counts.map((c) => [c.document_id, c]));

    return ok(
      res,
      documents.map((d) => {
        const c = byDocument.get(d.id);
        return {
          ...d,
          attributeCount: Number(c?.total ?? 0),
          pendingCount: Number(c?.pending ?? 0),
          verifiedCitationCount: Number(c?.verified ?? 0),
        };
      }),
    );
  }),
);

intelligenceRouter.get(
  '/contract-documents/:id',
  requirePermission('VIEW_CONTRACT_DOCUMENTS'),
  handler(async (req, res) => {
    const detail = await documentDetail(param(req, 'id'));
    if (!detail) throw new NotFoundError('Contract document', param(req, 'id'));
    return ok(res, detail);
  }),
);

/** The stored text, so the UI can show a citation highlighted in place. */
intelligenceRouter.get(
  '/contract-documents/:id/text',
  requirePermission('VIEW_CONTRACT_DOCUMENTS'),
  handler(async (req, res) => {
    const document = await queryOne(
      `SELECT id, file_name AS "fileName", page_count AS "pageCount",
              source_text AS "sourceText"
         FROM contract_documents WHERE id = $1`,
      [param(req, 'id')],
    );
    if (!document) throw new NotFoundError('Contract document', param(req, 'id'));
    return ok(res, document);
  }),
);
