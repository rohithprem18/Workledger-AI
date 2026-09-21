CREATE TABLE contract_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES contracts(id),
    sequence_order INT NOT NULL,
    label VARCHAR(255) NOT NULL,
    threshold_percent DECIMAL(5,2),
    amount DECIMAL(15,2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'REACHED', 'APPROVED_INVOICED')),
    marked_by_user_id UUID REFERENCES users(id),
    marked_at TIMESTAMPTZ,
    approved_by_user_id UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    invoice_id UUID REFERENCES invoices(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (contract_id, sequence_order)
);

CREATE INDEX idx_milestones_contract ON contract_milestones(contract_id);
CREATE INDEX idx_milestones_status ON contract_milestones(status);

ALTER TABLE invoices ADD COLUMN milestone_id UUID REFERENCES contract_milestones(id);
