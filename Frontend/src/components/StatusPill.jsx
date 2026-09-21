/**
 * Status badge. Colour is reserved for meaning, so each status maps to one
 * semantic tone and nothing is coloured for decoration.
 */
const TONE = {
  ACTIVE: 'success',
  APPROVED: 'success',
  APPROVED_INVOICED: 'success',
  ACCEPTED: 'success',
  CLEAN: 'success',
  DONE: 'success',
  APPLIED: 'success',
  VALIDATED: 'info',

  PENDING: 'warning',
  SUBMITTED: 'warning',
  PENDING_REVIEW: 'warning',
  ADVISORY: 'warning',
  REACHED: 'info',
  IN_PROGRESS: 'info',
  EXTRACTING: 'info',
  EDITED: 'violet',

  REJECTED: 'error',
  CANCELLED: 'error',
  BLOCKED: 'error',
  FAILED: 'error',
  INACTIVE: 'error',

  DRAFT: 'neutral',
  UPLOADED: 'neutral',
  HOURLY: 'outline',
  MILESTONE: 'violet',
}

const LABEL = {
  APPROVED_INVOICED: 'Invoiced',
  PENDING_REVIEW: 'In review',
  IN_PROGRESS: 'In progress',
}

function humanize(value) {
  if (LABEL[value]) return LABEL[value]
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ')
}

export default function StatusPill({ value, dot = true }) {
  if (!value) return null
  const key = String(value).toUpperCase()
  const tone = TONE[key] ?? 'neutral'
  return (
    <span className={`badge badge-${tone}${dot ? '' : ' badge-plain'}`}>{humanize(key)}</span>
  )
}
