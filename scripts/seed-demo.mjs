/**
 * Seeds a realistic demo scenario through the public API.
 *
 *   node scripts/seed-demo.mjs [baseUrl]
 *
 * Everything goes through the same endpoints and validation a person would
 * use — nothing is written to the database directly — so the result is
 * internally consistent: approved hours really are approved, invoices really
 * are generated from them, and the audit verdicts are real.
 *
 * The scenario:
 *   - Northwind Technologies, an hourly contract with Java and React roles
 *   - Priya (the `employee1` demo account) and two colleagues on the bench
 *   - three weeks of timesheets: most approved, one returned, two in review
 *   - an audited, approved invoice, and a draft for the following period
 *     waiting for finance to run the auditor
 *   - Globex Retail, a milestone contract with one milestone awaiting finance
 *   - the sample contract uploaded and extracted, waiting for review
 *
 * Idempotent: if Northwind Technologies already exists it stops.
 */
import { readFileSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'http://localhost:8080').replace(/\/+$/, '')

async function call(token, method, path, body, raw) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  let payload
  if (raw) {
    payload = raw.body
    headers['Content-Type'] = raw.contentType
  } else if (body !== undefined) {
    payload = JSON.stringify(body)
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${BASE}/api${path}`, { method, headers, body: payload })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${json.message ?? 'failed'}`)
  }
  return json.data
}

async function login(username, password = 'password') {
  return (await call(null, 'POST', '/auth/login', { username, password })).token
}

const step = (msg) => console.log(`  · ${msg}`)

// ------------------------------------------------------------------- dates
const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}
const today = new Date(`${iso(new Date())}T00:00:00Z`)
const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
// Work period: the three full weeks before today, weekdays only.
const workStart = addDays(today, -21)
const workDays = []
for (let d = new Date(workStart); d < today; d = addDays(d, 1)) {
  const dow = d.getUTCDay()
  if (dow !== 0 && dow !== 6) workDays.push(iso(d))
}
const contractStart = iso(addDays(monthStart, -31))
const contractEnd = iso(addDays(monthStart, 150))

console.log(`\nSeeding demo data against ${BASE}\n`)

const manager = await login('manager')
const hr = await login('hr')
const finance = await login('finance')
const priya = await login('employee1')

const companies = await call(manager, 'GET', '/companies')
if (companies.some((c) => c.name === 'Northwind Technologies')) {
  console.log('Demo data already present (Northwind Technologies exists). Nothing to do.\n')
  process.exit(0)
}

// ------------------------------------------------------------------ people
const skills = await call(hr, 'GET', '/skills')
const skill = (name) => {
  const s = skills.find((x) => x.name === name)
  if (!s) throw new Error(`Skill "${name}" missing — run the migrations first (V12 seeds it).`)
  return s.id
}

const employees = await call(hr, 'GET', '/employees')
const priyaProfile = employees.find((e) => e.username === 'employee1')
if (!priyaProfile) throw new Error('employee1 has no profile — apply migration V12 first.')

async function onboard(first, last, username, skillLevels) {
  const existing = employees.find((e) => e.username === username)
  const person =
    existing ??
    (await call(hr, 'POST', '/employees', {
      firstName: first,
      lastName: last,
      email: `${username}@workledger.example`,
      phone: '+91 98450 00000',
      username,
      password: 'Contractor#2026',
    }))
  for (const [name, level] of skillLevels) {
    await call(hr, 'POST', `/employees/${person.id}/skills`, { skillId: skill(name), proficiencyLevel: level })
  }
  const token = await login(username, 'Contractor#2026')
  await call(
    token,
    'PUT',
    `/employees/${person.id}/availability`,
    [1, 2, 3, 4, 5].map((day) => ({ dayOfWeek: day, startTime: '09:00', endTime: '18:00', maxHoursPerDay: 8 })),
  )
  step(`onboarded ${first} ${last}`)
  return { ...person, token }
}

const arjun = await onboard('Arjun', 'Mehta', 'arjun.mehta', [['React', 5], ['Java', 3]])
await onboard('Sara', 'Khan', 'sara.khan', [['Java', 4], ['Python', 4]])

// ---------------------------------------------------------------- contracts
const billingTypes = await call(manager, 'GET', '/billing-types')
const hourly = billingTypes.find((b) => b.code === 'HOURLY').id
const milestoneType = billingTypes.find((b) => b.code === 'MILESTONE').id

const northwind = await call(manager, 'POST', '/companies', {
  name: 'Northwind Technologies',
  contactEmail: 'accounts@northwind.example',
  contactPhone: '+91 80 4000 1000',
  address: 'Embassy Tech Village, Outer Ring Road, Bengaluru',
})
const globex = await call(manager, 'POST', '/companies', {
  name: 'Globex Retail',
  contactEmail: 'ap@globex.example',
  contactPhone: '+91 22 6100 2000',
  address: 'Bandra Kurla Complex, Mumbai',
})
step('created clients Northwind Technologies and Globex Retail')

const platform = await call(manager, 'POST', '/contracts', {
  companyId: northwind.id,
  title: 'Platform Modernisation',
  description: 'Migrating the order-management monolith to services on the JVM, with a new React back office.',
  billingTypeId: hourly,
  startDate: contractStart,
  endDate: contractEnd,
  requirements: [
    {
      skillId: skill('Java'),
      requiredEmployeeCount: 2,
      hourlyRate: 2400,
      expectedHoursPerDay: 8,
      minProficiency: 3,
      startDate: contractStart,
      endDate: contractEnd,
    },
    {
      skillId: skill('React'),
      requiredEmployeeCount: 1,
      hourlyRate: 2100,
      expectedHoursPerDay: 8,
      minProficiency: 4,
      startDate: contractStart,
      endDate: contractEnd,
    },
  ],
})
const javaReq = platform.requirements.find((r) => r.skillName === 'Java')
const reactReq = platform.requirements.find((r) => r.skillName === 'React')
step('created hourly contract Platform Modernisation (Java ×2, React ×1)')

const assignmentEnd = iso(addDays(today, 60))
const priyaAssignment = await call(manager, 'POST', '/assignments', {
  employeeId: priyaProfile.id,
  requirementId: javaReq.id,
  startDate: iso(workStart),
  endDate: assignmentEnd,
  plannedStartTime: '09:30',
  plannedEndTime: '17:30',
})
const arjunAssignment = await call(manager, 'POST', '/assignments', {
  employeeId: arjun.id,
  requirementId: reactReq.id,
  startDate: iso(workStart),
  endDate: assignmentEnd,
  plannedStartTime: '09:00',
  plannedEndTime: '17:00',
})
step('assigned Priya (Java) and Arjun (React); one Java seat left open for auto-assign')

// --------------------------------------------------------------- timesheets
const logs = []
for (const [i, day] of workDays.entries()) {
  logs.push({
    who: 'priya',
    day,
    log: await call(priya, 'POST', '/worklogs', {
      assignmentId: priyaAssignment.id,
      workDate: day,
      segments: [
        { startTime: '09:30', endTime: '13:00' },
        { startTime: '13:45', endTime: i % 3 === 0 ? '17:30' : '17:15' },
      ],
    }),
  })
  if (i % 2 === 0) {
    logs.push({
      who: 'arjun',
      day,
      log: await call(arjun.token, 'POST', '/worklogs', {
        assignmentId: arjunAssignment.id,
        workDate: day,
        segments: [
          { startTime: '09:00', endTime: '12:30' },
          { startTime: '13:30', endTime: '17:00' },
        ],
      }),
    })
  }
}
step(`logged ${logs.length} timesheets across ${workDays.length} working days`)

// Approve all but the two most recent days; return one for correction.
const recent = new Set(workDays.slice(-2))
const returnedDay = workDays[4]
for (const { who, day, log } of logs) {
  if (recent.has(day)) continue
  if (who === 'priya' && day === returnedDay) {
    await call(manager, 'PUT', `/worklogs/${log.id}/approve`, {
      approved: false,
      rejectionReason: 'The afternoon block overlaps the client workshop — please split it out and resubmit.',
    })
  } else {
    await call(manager, 'PUT', `/worklogs/${log.id}/approve`, { approved: true })
  }
}
step('approved timesheets, returned one, left the last two days in review')

// ---------------------------------------------------------- invoice + audit
const firstPeriodEnd = workDays[9] ?? workDays[workDays.length - 3]
const invoice = await call(finance, 'POST', '/invoices', {
  contractId: platform.id,
  periodStart: iso(workStart),
  periodEnd: firstPeriodEnd,
})
const cleanAudit = await call(finance, 'POST', `/invoices/${invoice.id}/audit`)
await call(finance, 'PUT', `/invoices/${invoice.id}/approve`)
step(`invoice 1 generated, audited ${cleanAudit.verdict}, approved`)

// The following period stays a draft, so finance has one to audit live.
const nextStart = workDays[workDays.indexOf(firstPeriodEnd) + 1]
if (nextStart) {
  await call(finance, 'POST', '/invoices', {
    contractId: platform.id,
    periodStart: nextStart,
    periodEnd: iso(addDays(today, -1)),
  })
  step('invoice 2 generated for the following period, left as a draft to audit')
}

// ---------------------------------------------------- milestone contract
const rollout = await call(manager, 'POST', '/contracts', {
  companyId: globex.id,
  title: 'Data Platform Rollout',
  description: 'Fixed-fee delivery of a retail analytics platform in three signed-off stages.',
  billingTypeId: milestoneType,
  startDate: contractStart,
  endDate: contractEnd,
})
const milestones = []
for (const [i, [label, amount, pct]] of [
  ['Discovery and solution design signed off', 450000, 20],
  ['Integration environment delivered', 675000, 30],
  ['Production release accepted', 900000, 50],
].entries()) {
  milestones.push(
    await call(manager, 'POST', `/contracts/${rollout.id}/milestones`, {
      sequenceOrder: i + 1,
      label,
      amount,
      thresholdPercent: pct,
    }),
  )
}
await call(manager, 'PUT', `/milestones/${milestones[0].id}/reach`)
const t1 = await call(manager, 'POST', `/milestones/${milestones[1].id}/tasks`, {
  name: 'Provision staging warehouse',
  assignedToUserId: priyaProfile.userId,
})
await call(manager, 'POST', `/milestones/${milestones[1].id}/tasks`, {
  name: 'Point-of-sale ingestion pipeline',
  assignedToUserId: arjun.userId,
})
await call(manager, 'PUT', `/tasks/${t1.id}/status`, { status: 'IN_PROGRESS' })
step('created milestone contract Data Platform Rollout; milestone 1 awaits finance')

// ------------------------------------------------------- contract intake
// Uploads are de-duplicated by checksum, so tag this copy with its client.
const text = readFileSync(new URL('../docs/samples/sample-contract.txt', import.meta.url), 'utf8')
  .concat('\nCounterparty: Northwind Technologies\n')
const boundary = '----workledger-demo'
const body =
  `--${boundary}\r\nContent-Disposition: form-data; name="contractId"\r\n\r\n${platform.id}\r\n` +
  `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="northwind-msa.txt"\r\n` +
  `Content-Type: text/plain\r\n\r\n${text}\r\n--${boundary}--\r\n`
const doc = await call(manager, 'POST', '/contract-documents', undefined, {
  body,
  contentType: `multipart/form-data; boundary=${boundary}`,
})
const extracted = await call(manager, 'POST', `/contract-documents/${doc.id}/extract`)
step(`uploaded the Northwind MSA; ${extracted.attributeCount} attributes await review`)

console.log('\nDone. Sign in with any demo account to explore.\n')
