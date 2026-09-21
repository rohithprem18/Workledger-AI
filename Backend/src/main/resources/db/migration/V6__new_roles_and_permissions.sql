-- New permissions
INSERT INTO permissions (id, code, description) VALUES
    ('c3000001-0000-0000-0000-000000000023', 'MANAGE_ROLES',      'Create/update roles and assign permissions'),
    ('c3000001-0000-0000-0000-000000000024', 'MANAGE_USERS',      'Create users and assign to roles'),
    ('c3000001-0000-0000-0000-000000000025', 'MARK_MILESTONE',    'Mark contract milestones as reached'),
    ('c3000001-0000-0000-0000-000000000026', 'APPROVE_MILESTONE', 'Approve reached milestones and generate invoice');

-- New roles
INSERT INTO roles (id, name, description) VALUES
    ('e5f6a7b8-0000-0000-0000-000000000001', 'HR_MANAGER',      'HR: manages users, roles, employees, skills'),
    ('e5f6a7b8-0000-0000-0000-000000000002', 'FINANCE_MANAGER', 'Finance: approves milestones and generates invoices');

-- HR_MANAGER permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'e5f6a7b8-0000-0000-0000-000000000001', id FROM permissions
WHERE code IN (
    'MANAGE_ROLES', 'MANAGE_USERS',
    'CREATE_EMPLOYEE', 'UPDATE_EMPLOYEE', 'DEACTIVATE_EMPLOYEE', 'VIEW_EMPLOYEES',
    'MANAGE_SKILLS', 'VIEW_COMPANIES'
);

-- FINANCE_MANAGER permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'e5f6a7b8-0000-0000-0000-000000000002', id FROM permissions
WHERE code IN (
    'VIEW_CONTRACTS', 'VIEW_TIMESHEETS',
    'GENERATE_INVOICE', 'APPROVE_INVOICE', 'APPROVE_MILESTONE',
    'VIEW_INVOICES', 'VIEW_COMPANIES', 'VIEW_EMPLOYEES'
);

-- Grant MANAGER the MARK_MILESTONE permission (V2 blanket-grant preceded new perm insert)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', id FROM permissions
WHERE code = 'MARK_MILESTONE'
ON CONFLICT DO NOTHING;

-- Remove finance and HR permissions from MANAGER
DELETE FROM role_permissions
 WHERE role_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
   AND permission_id IN (
       SELECT id FROM permissions
        WHERE code IN (
            'GENERATE_INVOICE', 'APPROVE_INVOICE',
            'CREATE_EMPLOYEE', 'UPDATE_EMPLOYEE', 'DEACTIVATE_EMPLOYEE',
            'MANAGE_SKILLS', 'MANAGE_ROLES', 'MANAGE_USERS'
        )
   );

-- Seed HR + Finance users (password: password — reuses V2 bcrypt hash, strength 10)
INSERT INTO users (id, username, password_hash, email) VALUES
    ('33333333-3333-3333-3333-333333333333', 'hr',
     '$2a$10$vAZ5.XOYKtM4esqOdKTH0.DNtLGyS8lea4I3gVOtiVBr2mK1YSozG',
     'hr@example.com'),
    ('44444444-4444-4444-4444-444444444444', 'finance',
     '$2a$10$vAZ5.XOYKtM4esqOdKTH0.DNtLGyS8lea4I3gVOtiVBr2mK1YSozG',
     'finance@example.com');

INSERT INTO user_roles (user_id, role_id) VALUES
    ('33333333-3333-3333-3333-333333333333', 'e5f6a7b8-0000-0000-0000-000000000001'),
    ('44444444-4444-4444-4444-444444444444', 'e5f6a7b8-0000-0000-0000-000000000002');
