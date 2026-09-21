-- ============================================================================
-- Invoice Auditor: deterministic three-way reconciliation.
--
-- Every invoice is reconciled against three authoritative sources before it
-- can be approved:
--   1. the CONTRACT        — authorised rates, billing terms, period bounds
--   2. the APPROVED WORK   — approved work logs and approved milestones
--   3. the INVOICE         — the line items as presented
--
-- Findings, amounts and deltas are computed in Java by versioned rules. The
-- language model never produces a number: it only writes the `explanation`
-- text attached to an already-computed finding, and the `narrative` summary.
-- ============================================================================

CREATE TABLE invoice_audit_runs (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id           UUID         NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    verdict              VARCHAR(20)  NOT NULL
        CHECK (verdict IN ('CLEAN', 'ADVISORY', 'BLOCKED')),
    blocker_count        INT          NOT NULL DEFAULT 0,
    warning_count        INT          NOT NULL DEFAULT 0,
    info_count           INT          NOT NULL DEFAULT 0,
    contract_total       NUMERIC(15,2),
    approved_work_total  NUMERIC(15,2),
    invoiced_total       NUMERIC(15,2),
    narrative            TEXT,
    narrative_engine     VARCHAR(50),
    rules_version        VARCHAR(20)  NOT NULL,
    run_by               UUID         REFERENCES users(id),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_audit_runs_invoice ON invoice_audit_runs(invoice_id);
CREATE INDEX idx_invoice_audit_runs_verdict ON invoice_audit_runs(verdict);

CREATE TABLE invoice_audit_findings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          UUID         NOT NULL REFERENCES invoice_audit_runs(id) ON DELETE CASCADE,
    rule_code       VARCHAR(60)  NOT NULL,
    severity        VARCHAR(20)  NOT NULL
        CHECK (severity IN ('BLOCKER', 'WARNING', 'INFO')),
    title           VARCHAR(255) NOT NULL,
    detail          TEXT         NOT NULL,
    expected_value  TEXT,
    actual_value    TEXT,
    delta           NUMERIC(15,2),
    line_item_id    UUID         REFERENCES invoice_line_items(id),
    explanation     TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_audit_findings_run  ON invoice_audit_findings(run_id);
CREATE INDEX idx_invoice_audit_findings_rule ON invoice_audit_findings(rule_code);

-- A BLOCKED audit stops invoice approval. Finance may override, but only with
-- a recorded reason and identity — the override itself is an audited action.
ALTER TABLE invoices
    ADD COLUMN audit_override_reason TEXT,
    ADD COLUMN audit_override_by     UUID REFERENCES users(id),
    ADD COLUMN audit_override_at     TIMESTAMPTZ;
