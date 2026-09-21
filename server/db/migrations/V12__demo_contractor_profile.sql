-- ============================================================================
-- Give the `employee1` demo account a contractor profile.
--
-- V2 seeded `employee1` as a login with the EMPLOYEE role but never created the
-- employee record behind it, so the "Contractor" demo account could sign in
-- yet saw an empty profile on every page. This adds the record, a baseline
-- skill catalogue, the contractor's skills, and a weekday availability pattern
-- — enough for a manager to assign them straight away.
--
-- Every insert is conditional, so an environment where any of this already
-- exists is left alone.
-- ============================================================================

INSERT INTO skills (name, description) VALUES
    ('Java',          'Backend services on the JVM'),
    ('React',         'Frontend applications with React'),
    ('Python',        'Data engineering and automation'),
    ('DevOps',        'CI/CD, containers and cloud infrastructure'),
    ('Data Analysis', 'SQL, reporting and dashboards')
ON CONFLICT (name) DO NOTHING;

INSERT INTO employees (id, user_id, first_name, last_name, email, phone)
SELECT '77777777-7777-7777-7777-777777777777',
       '22222222-2222-2222-2222-222222222222',
       'Priya', 'Nair', 'employee1@example.com', '+91 98450 12345'
WHERE EXISTS (SELECT 1 FROM users WHERE id = '22222222-2222-2222-2222-222222222222')
  AND NOT EXISTS (SELECT 1 FROM employees WHERE user_id = '22222222-2222-2222-2222-222222222222');

INSERT INTO employee_skills (employee_id, skill_id, proficiency_level)
SELECT e.id, s.id, v.level
  FROM employees e
  JOIN (VALUES ('Java', 4), ('React', 4), ('DevOps', 3)) AS v(name, level) ON TRUE
  JOIN skills s ON s.name = v.name
 WHERE e.user_id = '22222222-2222-2222-2222-222222222222'
ON CONFLICT (employee_id, skill_id) DO NOTHING;

INSERT INTO employee_weekly_availability (employee_id, day_of_week, start_time, end_time, max_hours_per_day)
SELECT e.id, d.day, '09:00', '18:00', 8
  FROM employees e
  CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS d(day)
 WHERE e.user_id = '22222222-2222-2222-2222-222222222222'
ON CONFLICT (employee_id, day_of_week) DO NOTHING;
