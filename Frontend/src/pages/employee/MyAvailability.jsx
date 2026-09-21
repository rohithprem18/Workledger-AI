import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { getAvailability, setAvailability } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Btn from '../../components/Btn'
import { NotLinked } from './MyAssignments'
import { Alert, Card, LoadingRows, errorText } from '../../components/ui'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const blankWeek = () =>
  DAYS.map((_, i) => ({ dayOfWeek: i + 1, on: false, startTime: '09:00', endTime: '17:00', maxHoursPerDay: 8 }))

function minutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/**
 * The weekly pattern assignment is checked against: every assigned day must
 * fall on an available day, inside its window, and under its hour cap. The
 * whole week is saved at once — the API replaces the pattern, so saving one
 * day in isolation would erase the others.
 */
export default function MyAvailability() {
  const { user } = useAuth()
  const empId = user?.employeeId ?? null

  const { data, loading, error, reload } = useFetch(
    () => (empId ? getAvailability(empId) : Promise.resolve([])),
    [empId],
  )

  const [week, setWeek] = useState(blankWeek)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (!data) return
    const next = blankWeek()
    for (const entry of data) {
      const day = next[entry.dayOfWeek - 1]
      if (!day) continue
      day.on = true
      day.startTime = String(entry.startTime).slice(0, 5)
      day.endTime = String(entry.endTime).slice(0, 5)
      day.maxHoursPerDay = Number(entry.maxHoursPerDay)
    }
    setWeek(next)
    setDirty(false)
  }, [data])

  function update(i, patch) {
    setWeek((w) => w.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))
    setDirty(true)
    setNotice(null)
  }

  function preset(kind) {
    setWeek(
      blankWeek().map((d) => ({
        ...d,
        on: kind === 'weekdays' ? d.dayOfWeek <= 5 : kind === 'all' ? true : false,
      })),
    )
    setDirty(true)
  }

  const problems = week
    .map((d, i) => {
      if (!d.on) return null
      if (minutes(d.endTime) <= minutes(d.startTime)) return `${DAYS[i]}: end must be after start`
      const window = (minutes(d.endTime) - minutes(d.startTime)) / 60
      if (Number(d.maxHoursPerDay) > window) return `${DAYS[i]}: cap exceeds the ${window}h window`
      if (!(Number(d.maxHoursPerDay) >= 0.5)) return `${DAYS[i]}: cap must be at least 0.5h`
      return null
    })
    .filter(Boolean)

  const totalHours = week.filter((d) => d.on).reduce((n, d) => n + Number(d.maxHoursPerDay || 0), 0)

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      await setAvailability(
        empId,
        week
          .filter((d) => d.on)
          .map((d) => ({
            dayOfWeek: d.dayOfWeek,
            startTime: d.startTime,
            endTime: d.endTime,
            maxHoursPerDay: Number(d.maxHoursPerDay),
          })),
      )
      setNotice('Availability saved. New assignments are checked against it.')
      reload()
    } catch (err) {
      setSaveError(errorText(err, 'Could not save'))
    } finally {
      setSaving(false)
    }
  }

  if (!empId) return <NotLinked title="Availability" />

  return (
    <>
      <PageHeader
        eyebrow="My work"
        title="Availability"
        subtitle="Your usual week. Managers can only assign you inside these windows and under your daily cap."
      >
        <Btn icon="check" loading={saving} disabled={!dirty || problems.length > 0} onClick={save}>
          Save week
        </Btn>
      </PageHeader>

      {(error || saveError) && <Alert>{error || saveError}</Alert>}
      {notice && (
        <Alert tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {problems.length > 0 && <Alert tone="warning">{problems[0]}</Alert>}

      <Card>
        <div className="card-header wrap">
          <div className="cluster">
            <span className="t-sm t-mute">Quick set:</span>
            <button type="button" className="btn btn-secondary btn-sm btn-pill" onClick={() => preset('weekdays')}>
              Weekdays 9–5
            </button>
            <button type="button" className="btn btn-secondary btn-sm btn-pill" onClick={() => preset('all')}>
              Every day
            </button>
            <button type="button" className="btn btn-ghost btn-sm btn-pill" onClick={() => preset('none')}>
              Clear
            </button>
          </div>
          <span className="t-sm t-body">
            Up to <strong className="t-ink t-num">{totalHours}h</strong> a week
          </span>
        </div>

        {loading ? (
          <LoadingRows rows={7} />
        ) : (
          <div className="list">
            {week.map((d, i) => (
              <div className="list-item wrap" key={d.dayOfWeek} style={{ opacity: d.on ? 1 : 0.7 }}>
                <label className="row gap-12" style={{ width: 150, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={d.on}
                    onChange={(e) => update(i, { on: e.target.checked })}
                    aria-label={`Available on ${DAYS[i]}`}
                  />
                  <span className="t-label">{DAYS[i]}</span>
                </label>

                {d.on ? (
                  <div className="row gap-8 wrap grow">
                    <input
                      type="time"
                      value={d.startTime}
                      onChange={(e) => update(i, { startTime: e.target.value })}
                      style={{ width: 120 }}
                      aria-label={`${DAYS[i]} start`}
                    />
                    <span className="t-mute">to</span>
                    <input
                      type="time"
                      value={d.endTime}
                      onChange={(e) => update(i, { endTime: e.target.value })}
                      style={{ width: 120 }}
                      aria-label={`${DAYS[i]} end`}
                    />
                    <span className="t-mute">·</span>
                    <input
                      type="number"
                      min="0.5"
                      max="24"
                      step="0.5"
                      value={d.maxHoursPerDay}
                      onChange={(e) => update(i, { maxHoursPerDay: e.target.value })}
                      style={{ width: 80 }}
                      aria-label={`${DAYS[i]} maximum hours`}
                    />
                    <span className="t-sm t-mute">h max</span>
                  </div>
                ) : (
                  <span className="grow t-sm t-faint">Unavailable</span>
                )}
              </div>
            ))}
          </div>
        )}

        {dirty && (
          <div className="card-footer">
            <span className="t-sm t-warning grow" style={{ alignSelf: 'center' }}>
              Unsaved changes
            </span>
            <Btn variant="secondary" onClick={() => reload()}>
              Discard
            </Btn>
            <Btn icon="check" loading={saving} disabled={problems.length > 0} onClick={save}>
              Save week
            </Btn>
          </div>
        )}
      </Card>
    </>
  )
}
