-- ============================================================================
-- Contract Intelligence: document intake, AI-assisted attribute extraction,
-- verifiable source citations, and human validation.
--
-- The pipeline extracts four critical attribute families from a contract
-- document: RATE, BILLING_TERM, MILESTONE, DATE. Every extracted value carries
-- a citation that must be a verbatim span of the stored source text — the
-- backend verifies this before persisting, so a hallucinated quote can never
-- reach a reviewer marked as cited.
-- ============================================================================

CREATE TABLE contract_documents (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id        UUID REFERENCES contracts(id),
    company_id         UUID REFERENCES client_companies(id),
    file_name          VARCHAR(255) NOT NULL,
    content_type       VARCHAR(100) NOT NULL,
    size_bytes         BIGINT       NOT NULL,
    checksum_sha256    VARCHAR(64)  NOT NULL,
    source_text        TEXT         NOT NULL,
    page_count         INT          NOT NULL DEFAULT 1,
    status             VARCHAR(30)  NOT NULL DEFAULT 'UPLOADED'
        CHECK (status IN ('UPLOADED', 'EXTRACTING', 'PENDING_REVIEW', 'VALIDATED', 'APPLIED', 'FAILED')),
    extraction_engine  VARCHAR(50),
    extraction_model   VARCHAR(120),
    extraction_error   TEXT,
    extracted_at       TIMESTAMPTZ,
    uploaded_by        UUID         NOT NULL REFERENCES users(id),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_documents_contract ON contract_documents(contract_id);
CREATE INDEX idx_contract_documents_status   ON contract_documents(status);

CREATE TABLE contract_extractions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id        UUID         NOT NULL REFERENCES contract_documents(id) ON DELETE CASCADE,
    attribute_type     VARCHAR(20)  NOT NULL
        CHECK (attribute_type IN ('RATE', 'BILLING_TERM', 'MILESTONE', 'DATE')),
    field_key          VARCHAR(100) NOT NULL,
    field_label        VARCHAR(255) NOT NULL,
    raw_value          TEXT,
    normalized_value   TEXT,
    value_kind         VARCHAR(20)  NOT NULL
        CHECK (value_kind IN ('MONEY', 'NUMBER', 'DATE', 'TEXT', 'DURATION')),
    currency           VARCHAR(3),
    confidence         NUMERIC(4,3) NOT NULL DEFAULT 0
        CHECK (confidence >= 0 AND confidence <= 1),
    citation_quote     TEXT,
    citation_page      INT,
    citation_start     INT,
    citation_end       INT,
    citation_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
    review_status      VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
        CHECK (review_status IN ('PENDING', 'ACCEPTED', 'EDITED', 'REJECTED')),
    reviewed_value     TEXT,
    review_note        TEXT,
    reviewed_by        UUID         REFERENCES users(id),
    reviewed_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_extractions_document ON contract_extractions(document_id);
CREATE INDEX idx_contract_extractions_review   ON contract_extractions(review_status);
CREATE INDEX idx_contract_extractions_type     ON contract_extractions(attribute_type);
