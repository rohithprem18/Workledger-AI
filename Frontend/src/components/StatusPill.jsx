const MAP = {
  ACTIVE:       's-active',
  APPROVED:     's-approved',
  PENDING:      's-pending',
  SUBMITTED:    's-submitted',
  REJECTED:     's-rejected',
  CANCELLED:    's-cancelled',
  DRAFT:        's-draft',
  HOURLY:       's-hourly',
  MILESTONE:    's-draft',
  IN_PROGRESS:  's-submitted',
  DONE:         's-approved',
}

export default function StatusPill({ value }) {
  const cls = MAP[value?.toUpperCase?.()] ?? 's-draft'
  return <span className={`status-pill ${cls}`}>{value}</span>
}
