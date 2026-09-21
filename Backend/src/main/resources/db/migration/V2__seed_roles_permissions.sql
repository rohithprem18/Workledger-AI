-- Roles
INSERT INTO roles (id, name, description) VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'MANAGER', 'Manager role with full access'),
    ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'EMPLOYEE', 'Employee role with limited access');

-- Permissions
INSERT INTO permissions (id, code, description) VALUES
    ('c3000001-0000-0000-0000-000000000001', 'CREATE_EMPLOYEE',        'Create new employees'),
    ('c3000001-0000-0000-0000-000000000002', 'UPDATE_EMPLOYEE',        'Update employee info'),
    ('c3000001-0000-0000-0000-000000000003', 'DEACTIVATE_EMPLOYEE',    'Deactivate employees'),
    ('c3000001-0000-0000-0000-000000000004', 'VIEW_EMPLOYEES',         'View employee list'),
    ('c3000001-0000-0000-0000-000000000005', 'CREATE_CONTRACT',        'Create contracts'),
    ('c3000001-0000-0000-0000-000000000006', 'UPDATE_CONTRACT',        'Update contracts'),
    ('c3000001-0000-0000-0000-000000000007', 'VIEW_CONTRACTS',         'View contracts'),
    ('c3000001-0000-0000-0000-000000000008', 'CREATE_COMPANY',         'Create client companies'),
    ('c3000001-0000-0000-0000-000000000009', 'UPDATE_COMPANY',         'Update client companies'),
    ('c3000001-0000-0000-0000-000000000010', 'VIEW_COMPANIES',         'View client companies'),
    ('c3000001-0000-0000-0000-000000000011', 'CREATE_ASSIGNMENT',      'Assign employees to requirements'),
    ('c3000001-0000-0000-0000-000000000012', 'CANCEL_ASSIGNMENT',      'Cancel assignments'),
    ('c3000001-0000-0000-0000-000000000013', 'VIEW_ASSIGNMENTS',       'View all assignments'),
    ('c3000001-0000-0000-0000-000000000014', 'APPROVE_TIMESHEET',      'Approve or reject timesheets'),
    ('c3000001-0000-0000-0000-000000000015', 'VIEW_TIMESHEETS',        'View all submitted timesheets'),
    ('c3000001-0000-0000-0000-000000000016', 'SUBMIT_TIMESHEET',       'Submit own timesheets'),
    ('c3000001-0000-0000-0000-000000000017', 'VIEW_OWN_TIMESHEETS',    'View own submitted timesheets'),
    ('c3000001-0000-0000-0000-000000000018', 'GENERATE_INVOICE',       'Generate invoices'),
    ('c3000001-0000-0000-0000-000000000019', 'APPROVE_INVOICE',        'Approve invoices'),
    ('c3000001-0000-0000-0000-000000000020', 'VIEW_INVOICES',          'View invoices'),
    ('c3000001-0000-0000-0000-000000000021', 'VIEW_OWN_ASSIGNMENTS',   'View own assignments'),
    ('c3000001-0000-0000-0000-000000000022', 'MANAGE_SKILLS',          'Create and manage skills');

-- Manager gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', id FROM permissions;

-- Employee gets limited permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'b2c3d4e5-f6a7-8901-bcde-f12345678901', id FROM permissions
WHERE code IN ('SUBMIT_TIMESHEET', 'VIEW_OWN_TIMESHEETS', 'VIEW_OWN_ASSIGNMENTS', 'VIEW_EMPLOYEES');

-- Default manager user (password: password — BCrypt strength 10)
-- To regenerate: new BCryptPasswordEncoder().encode("password")
INSERT INTO users (id, username, password_hash, email) VALUES
    ('11111111-1111-1111-1111-111111111111',
     'manager',
     '$2a$10$vAZ5.XOYKtM4esqOdKTH0.DNtLGyS8lea4I3gVOtiVBr2mK1YSozG',
     'manager@example.com');

INSERT INTO user_roles (user_id, role_id) VALUES
    ('11111111-1111-1111-1111-111111111111', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');

-- Default employee user (password: password — BCrypt strength 10)
INSERT INTO users (id, username, password_hash, email) VALUES
    ('22222222-2222-2222-2222-222222222222',
     'employee1',
     '$2a$10$vAZ5.XOYKtM4esqOdKTH0.DNtLGyS8lea4I3gVOtiVBr2mK1YSozG',
     'employee1@example.com');

INSERT INTO user_roles (user_id, role_id) VALUES
    ('22222222-2222-2222-2222-222222222222', 'b2c3d4e5-f6a7-8901-bcde-f12345678901');
