/**
 * End-to-end smoke test against a running API.
 *
 *   node scripts/smoke.mjs http://localhost:8080
 *   node scripts/smoke.mjs https://workledger-ai.vercel.app
 *
 * Walks the whole chain the platform exists for — contract intake, staffing,
 * timesheets, invoicing, and the audit gate — as the role that would actually
 * do each step. Creates its own uniquely-named data, so it is safe to run
 * repeatedly against a shared demo database.
 */
import { readFileSync } from 'node:fs';

const BASE = (process.argv[2] ?? 'http://localhost:8080').replace(/\/+$/, '');
const RUN = Date.now().toString(36);
let passed = 0;

async function call(token, method, path, body, raw) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let payload;
  if (raw) {
    payload = raw.body;
    headers['Content-Type'] = raw.contentType;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE}/api${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

function check(label, condition, detail) {
  if (!condition) {
    console.error(`  ✗ ${label}`);
    if (detail !== undefined) console.error('    ', JSON.stringify(detail).slice(0, 400));
    process.exit(1);
  }
  passed++;
  console.log(`  ✓ ${label}`);
}

async function login(username) {
  const r = await call(null, 'POST', '/auth/login', { username, password: 'password' });
  check(`${username} signs in`, r.status === 200 && r.body.data?.token, r.body);
  return r.body.data.token;
}

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const monthStart = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
const monthEnd = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)));
const workDay = (() => {
  // A weekday inside this month, so the contractor's Mon–Fri availability applies.
  const d = new Date(`${monthStart}T00:00:00Z`);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
})();

console.log(`\nSmoke test against ${BASE}  (run ${RUN})\n`);

// ------------------------------------------------------------------ health
{
  const r = await call(null, 'GET', '/health');
  check('health is UP with the database reachable', r.body.data?.database === 'UP', r.body);
}

// -------------------------------------------------------------------- auth
const admin = await login('admin');
const hr = await login('hr');
const manager = await login('manager');
const finance = await login('finance');
const auditor = await login('auditor');
{
  const r = await call(null, 'POST', '/auth/login', { username: 'admin', password: 'wrong' });
  check('a wrong password is refused', r.status === 401, r.body);
  const denied = await call(auditor, 'POST', '/skills', { name: `nope-${RUN}` });
  check('the read-only auditor cannot write', denied.status === 403, denied.body);
}

// --------------------------------------------------------------- workforce
const skill = await call(hr, 'POST', '/skills', { name: `TypeScript-${RUN}` });
check('HR creates a skill', skill.status === 201, skill.body);

const employee = await call(hr, 'POST', '/employees', {
  firstName: 'Smoke',
  lastName: `Tester ${RUN}`,
  email: `smoke-${RUN}@example.com`,
  username: `smoke${RUN}`,
  password: 'SmokeTest123!',
});
check('HR onboards a contractor', employee.status === 201, employee.body);
const employeeId = employee.body.data.id;

const skillAssign = await call(hr, 'POST', `/employees/${employeeId}/skills`, {
  skillId: skill.body.data.id,
  proficiencyLevel: 4,
});
check('HR records the contractor’s skill', skillAssign.status === 200, skillAssign.body);

const contractor = await (async () => {
  const r = await call(null, 'POST', '/auth/login', {
    username: `smoke${RUN}`,
    password: 'SmokeTest123!',
  });
  check('the new contractor can sign in', r.status === 200, r.body);
  return r.body.data.token;
})();

const availability = await call(
  contractor,
  'PUT',
  `/employees/${employeeId}/availability`,
  [1, 2, 3, 4, 5].map((day) => ({
    dayOfWeek: day,
    startTime: '09:00',
    endTime: '18:00',
    maxHoursPerDay: 8,
  })),
);
check('the contractor sets their own availability', availability.status === 200, availability.body);

// --------------------------------------------------------------- contracts
const company = await call(manager, 'POST', '/companies', {
  name: `Smoke Client ${RUN}`,
  contactEmail: `billing-${RUN}@example.com`,
});
check('the manager creates a client', company.status === 201, company.body);

const billingTypes = await call(manager, 'GET', '/billing-types');
const hourly = billingTypes.body.data.find((b) => b.code === 'HOURLY');
check('billing types are seeded', !!hourly, billingTypes.body);

const contract = await call(manager, 'POST', '/contracts', {
  companyId: company.body.data.id,
  title: `Smoke Contract ${RUN}`,
  billingTypeId: hourly.id,
  startDate: monthStart,
  endDate: monthEnd,
  requirements: [
    {
      skillId: skill.body.data.id,
      requiredEmployeeCount: 1,
      hourlyRate: 1000,
      expectedHoursPerDay: 8,
      minProficiency: 3,
      startDate: monthStart,
      endDate: monthEnd,
    },
  ],
});
check('the manager creates an hourly contract', contract.status === 201, contract.body);
const contractId = contract.body.data.id;
const requirementId = contract.body.data.requirements[0].id;

// -------------------------------------------------------------- intake · AI
{
  const text = readFileSync(new URL('../docs/samples/sample-contract.txt', import.meta.url), 'utf8')
    .concat(`\nReference: ${RUN}\n`); // unique, so the checksum does not dedupe
  const boundary = `----smoke${RUN}`;
  const body =
    `--${boundary}\r\nContent-Disposition: form-data; name="contractId"\r\n\r\n${contractId}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="contract-${RUN}.txt"\r\n` +
    `Content-Type: text/plain\r\n\r\n${text}\r\n--${boundary}--\r\n`;

  const upload = await call(manager, 'POST', '/contract-documents', undefined, {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
  });
  check('the manager uploads a contract document', upload.status === 201, upload.body);
  const docId = upload.body.data.id;

  const extracted = await call(manager, 'POST', `/contract-documents/${docId}/extract`);
  const rows = extracted.body.data?.extractions ?? [];
  check(`extraction proposes attributes (${rows.length})`, rows.length >= 5, extracted.body);
  check(
    'every pattern-found citation verifies against the source',
    rows.every((r) => r.citationVerified),
    rows.filter((r) => !r.citationVerified),
  );
  check(
    'extraction covers all four attribute families',
    ['RATE', 'BILLING_TERM', 'MILESTONE', 'DATE'].every((t) => rows.some((r) => r.attributeType === t)),
    rows.map((r) => r.attributeType),
  );

  const blocked = await call(manager, 'POST', `/contract-documents/${docId}/apply`);
  check('applying is refused while attributes await review', blocked.status === 409, blocked.body);

  for (const row of rows) {
    // Keep the contract dates as the smoke run set them, so later steps fit.
    const decision = row.attributeType === 'DATE' ? 'REJECTED' : 'ACCEPTED';
    await call(manager, 'PUT', `/contract-documents/extractions/${row.id}/review`, { decision });
  }
  const applied = await call(manager, 'POST', `/contract-documents/${docId}/apply`);
  check('once every attribute is reviewed, it applies', applied.status === 200, applied.body);
}

// -------------------------------------------------------------- allocation
const eligible = await call(
  manager,
  'GET',
  `/requirements/${requirementId}/eligible-employees?startDate=${monthStart}&endDate=${monthEnd}`,
);
check(
  'the contractor appears as eligible',
  eligible.body.data?.some((e) => e.id === employeeId),
  eligible.body,
);

const assignment = await call(manager, 'POST', '/assignments', {
  employeeId,
  requirementId,
  startDate: workDay,
  endDate: workDay,
  plannedStartTime: '09:00',
  plannedEndTime: '17:00',
});
check('the manager assigns the contractor', assignment.status === 201, assignment.body);

const doubleBook = await call(manager, 'POST', '/assignments', {
  employeeId,
  requirementId,
  startDate: workDay,
  endDate: workDay,
  plannedStartTime: '10:00',
  plannedEndTime: '12:00',
});
check('a second assignment on a full requirement is refused', doubleBook.status === 409, doubleBook.body);

// -------------------------------------------------------------- timesheets
const worklog = await call(contractor, 'POST', '/worklogs', {
  assignmentId: assignment.body.data.id,
  workDate: workDay,
  segments: [
    { startTime: '09:00', endTime: '12:00' },
    { startTime: '13:00', endTime: '17:00' },
  ],
});
check('the contractor logs two segments', worklog.status === 201, worklog.body);
check(
  'duration is computed server-side (7h = 420 min)',
  worklog.body.data.totalActualMinutes === 420,
  worklog.body.data,
);

const overlapping = await call(contractor, 'POST', '/worklogs', {
  assignmentId: assignment.body.data.id,
  workDate: workDay,
  segments: [{ startTime: '11:00', endTime: '14:00' }],
});
check('a duplicate/overlapping log is refused', overlapping.status === 409, overlapping.body);

const approved = await call(manager, 'PUT', `/worklogs/${worklog.body.data.id}/approve`, {
  approved: true,
});
check('the manager approves the timesheet', approved.body.data?.status === 'APPROVED', approved.body);

// ------------------------------------------------------ invoicing and audit
const invoice = await call(finance, 'POST', '/invoices', {
  contractId,
  periodStart: monthStart,
  periodEnd: monthEnd,
});
check('finance generates an invoice', invoice.status === 201, invoice.body);
const invoiceId = invoice.body.data.id;
check(
  'the invoice total is approved hours × rate (7 × 1000)',
  Number(invoice.body.data.totalAmount) === 7000,
  invoice.body.data,
);

const unaudited = await call(finance, 'PUT', `/invoices/${invoiceId}/approve`);
check('an un-audited invoice cannot be approved', unaudited.status === 409, unaudited.body);

const audit = await call(finance, 'POST', `/invoices/${invoiceId}/audit`);
check(
  `the audit reconciles (${audit.body.data?.verdict})`,
  audit.status === 200 && audit.body.data?.verdict !== 'BLOCKED',
  audit.body,
);
check(
  'all three source totals agree',
  Number(audit.body.data.contractTotal) === 7000 &&
    Number(audit.body.data.approvedWorkTotal) === 7000 &&
    Number(audit.body.data.invoicedTotal) === 7000,
  audit.body.data,
);

const approvedInvoice = await call(finance, 'PUT', `/invoices/${invoiceId}/approve`);
check('the audited invoice is approved', approvedInvoice.body.data?.status === 'APPROVED', approvedInvoice.body);

const auditorView = await call(auditor, 'GET', `/invoices/${invoiceId}/audit`);
check('the auditor can read the audit trail', auditorView.status === 200, auditorView.body);

// -------------------------------------------------------------------- admin
const users = await call(admin, 'GET', '/users');
check('the platform admin can manage users', users.status === 200, users.body);

console.log(`\n  ${passed} checks passed.\n`);
