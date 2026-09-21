/**
 * Groups permission codes by the area they govern, so 35 codes read as a
 * handful of decisions rather than one long list.
 */
const GROUPS = [
  ['Contract intelligence', ['CONTRACT_DOCUMENT', 'EXTRACTION']],
  ['Invoicing & audit', ['INVOICE', 'AUDIT']],
  ['Milestones', ['MILESTONE']],
  ['Contracts & clients', ['CONTRACT', 'COMPAN']],
  ['Staffing', ['ASSIGNMENT']],
  ['Timesheets', ['TIMESHEET']],
  ['People', ['EMPLOYEE', 'SKILL']],
  ['Administration', ['ROLE', 'USER']],
]

function groupOf(code) {
  const match = GROUPS.find(([, keys]) => keys.some((k) => code.includes(k)))
  return match ? match[0] : 'Other'
}

export function groupPermissions(permissions) {
  const grouped = new Map()
  for (const p of permissions) {
    const g = groupOf(p.code)
    if (!grouped.has(g)) grouped.set(g, [])
    grouped.get(g).push(p)
  }
  const order = [...GROUPS.map(([name]) => name), 'Other']
  return [...grouped.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
}
