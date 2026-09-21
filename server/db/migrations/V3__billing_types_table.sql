-- Dynamic billing types lookup
CREATE TABLE billing_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    label VARCHAR(100) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO billing_types (id, code, label) VALUES
    ('d4000001-0000-0000-0000-000000000001', 'HOURLY',    'Hourly'),
    ('d4000001-0000-0000-0000-000000000002', 'MILESTONE', 'Milestone');

-- Add nullable FK, backfill from existing enum column, then enforce NOT NULL
ALTER TABLE contracts ADD COLUMN billing_type_id UUID REFERENCES billing_types(id);

UPDATE contracts c
   SET billing_type_id = bt.id
  FROM billing_types bt
 WHERE bt.code = c.billing_type;

ALTER TABLE contracts ALTER COLUMN billing_type_id SET NOT NULL;

-- Drop old CHECK-constrained enum column
ALTER TABLE contracts DROP COLUMN billing_type;
