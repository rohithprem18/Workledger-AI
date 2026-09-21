-- ============================================================================
-- Access control for the AI modules, and the two roles that complete the
-- six-role model: PLATFORM_ADMIN (break-glass superuser) and AUDITOR
-- (read-only compliance reviewer who can see everything and change nothing).
-- ============================================================================

INSERT INTO permissions (id, code, description) VALUES
    ('c3000001-0000-0000-0000-000000000027', 'UPLOAD_CONTRACT_DOCUMENT',   'Upload a contract document for AI extraction'),
    ('c3000001-0000-0000-0000-000000000028', 'RUN_CONTRACT_EXTRACTION',    'Run the contract attribute extraction pipeline'),
    ('c3000001-0000-0000-0000-000000000029', 'VALIDATE_CONTRACT_EXTRACTION','Accept, edit or reject extracted contract attributes'),
    ('c3000001-0000-0000-0000-000000000030', 'APPLY_CONTRACT_EXTRACTION',  'Apply validated extractions to a contract'),
    ('c3000001-0000-0000-0000-000000000031', 'VIEW_CONTRACT_DOCUMENTS',    'View contract documents and their extractions'),
    ('c3000001-0000-0000-0000-000000000032', 'RUN_INVOICE_AUDIT',          'Run the three-way invoice reconciliation'),
    ('c3000001-0000-0000-0000-000000000033', 'VIEW_INVOICE_AUDIT',         'View invoice audit runs and findings'),
    ('c3000001-0000-0000-0000-000000000034', 'OVERRIDE_INVOICE_AUDIT',     'Approve an invoice despite blocking audit findings'),
    ('c3000001-0000-0000-0000-000000000035', 'VIEW_AUDIT_TRAIL',           'Read the system-wide audit log');

-- ---------------------------------------------------------------------------
-- Roles 5 and 6
-- ---------------------------------------------------------------------------
INSERT INTO roles (id, name, description) VALUES
    ('e5f6a7b8-0000-0000-0000-000000000003', 'PLATFORM_ADMIN', 'Platform administrator: full access across every module'),
    ('e5f6a7b8-0000-0000-0000-000000000004', 'AUDITOR',        'Compliance auditor: read-only visibility across every module');

-- PLATFORM_ADMIN holds every permission, including ones added by later migrations
-- (later migrations must re-run this grant for the codes they introduce).
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'e5f6a7b8-0000-0000-0000-000000000003', id FROM permissions
ON CONFLICT DO NOTHING;

-- AUDITOR is strictly read-only: every VIEW_* permission, nothing that writes.
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'e5f6a7b8-0000-0000-0000-000000000004', id FROM permissions
WHERE code LIKE 'VIEW\_%'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Contract intelligence belongs to the delivery manager, who owns contract intake
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', id FROM permissions
WHERE code IN (
    'UPLOAD_CONTRACT_DOCUMENT', 'RUN_CONTRACT_EXTRACTION',
    'VALIDATE_CONTRACT_EXTRACTION', 'APPLY_CONTRACT_EXTRACTION',
    'VIEW_CONTRACT_DOCUMENTS', 'VIEW_INVOICE_AUDIT'
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Invoice auditing belongs to finance, who owns invoice approval
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'e5f6a7b8-0000-0000-0000-000000000002', id FROM permissions
WHERE code IN (
    'RUN_INVOICE_AUDIT', 'VIEW_INVOICE_AUDIT', 'OVERRIDE_INVOICE_AUDIT',
    'VIEW_CONTRACT_DOCUMENTS', 'VIEW_AUDIT_TRAIL'
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed accounts for the two new roles (password: password — same bcrypt hash
-- as the other demo users; rotate before any real deployment)
-- ---------------------------------------------------------------------------
INSERT INTO users (id, username, password_hash, email) VALUES
    ('55555555-5555-5555-5555-555555555555', 'admin',
     '$2a$10$vAZ5.XOYKtM4esqOdKTH0.DNtLGyS8lea4I3gVOtiVBr2mK1YSozG',
     'admin@workledger.example'),
    ('66666666-6666-6666-6666-666666666666', 'auditor',
     '$2a$10$vAZ5.XOYKtM4esqOdKTH0.DNtLGyS8lea4I3gVOtiVBr2mK1YSozG',
     'auditor@workledger.example');

INSERT INTO user_roles (user_id, role_id) VALUES
    ('55555555-5555-5555-5555-555555555555', 'e5f6a7b8-0000-0000-0000-000000000003'),
    ('66666666-6666-6666-6666-666666666666', 'e5f6a7b8-0000-0000-0000-000000000004');
