/* ----------------------------------------------------------- formatting */

const moneyFormat = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Money as the API sends it (a string or number), rendered with grouping. */
export function money(value, currency = '₹') {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${currency}${moneyFormat.format(n)}`
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** A YYYY-MM-DD string as "1 Apr 2026", without a timezone shift. */
export function fmtDate(value) {
  if (!value) return '—'
  const s = String(value)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s)
  return Number.isNaN(d.getTime()) ? s : dateFormat.format(d)
}

export function fmtDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : dateTimeFormat.format(d)
}

/** "09:00:00" → "09:00". */
export function fmtTime(value) {
  return value ? String(value).slice(0, 5) : '—'
}

export function fmtRange(start, end) {
  return `${fmtDate(start)} – ${fmtDate(end)}`
}

export function hours(minutes) {
  const m = Number(minutes) || 0
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h}h ${rest}m` : `${h}h`
}

export function initials(name = '') {
  return (
    name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  )
}

/** Axios errors arrive already unwrapped to a message string by the client. */
export function errorText(err, fallback = 'Something went wrong') {
  if (!err) return fallback
  if (typeof err === 'string') return err
  return err?.response?.data?.message ?? err?.message ?? fallback
}
