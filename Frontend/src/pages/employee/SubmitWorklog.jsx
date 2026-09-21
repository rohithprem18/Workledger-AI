import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { getMyAssignments, submitWorklog } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Btn from '../../components/Btn'
import Icon from '../../components/Icon'
import { NotLinked } from './MyAssignments'
import { Alert, Card, EmptyState, Field, LoadingRows, errorText, fmtRange, hours } from '../../components/ui'

const newSegment = () => ({ startTime: '09:00', endTime: '12:00' })

function toMinutes(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Client-side preview only — the server recomputes the total and is the record. */
function segmentMinutes(s) {
  const a = toMinutes(s.startTime)
  const b = toMinutes(s.endTime)
  if (a === null || b === null) return 0
  return b > a ? b - a : 1440 - a + b // overnight wraps past midnight
}

function overlapping(segments) {
  const spans = segments
    .filter((s) => s.startTime && s.endTime)
    .map((s) => {
      const a = toMinutes(s.startTime)
      const b = toMinutes(s.endTime)
      return b > a ? [[a, b]] : [[a, 1440], [0, b]]
    })
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      for (const [a1, b1] of spans[i]) {
        for (const [a2, b2] of spans[j]) {
          if (Math.max(a1, a2) < Math.min(b1, b2)) return true
        }
      }
    }
  }
  return false
}

export default function SubmitWorklog() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const empId = user?.employeeId ?? null

  const assignments = useFetch(
    () => (empId ? getMyAssignments(empId) : Promise.resolve([])),
    [empId],
  )

  const [assignmentId, setAssignmentId] = useState(params.get('assignmentId') ?? '')
  const [workDate, setWorkDate] = useState(params.get('date') ?? new Date().toISOString().slice(0, 10))
  const [segments, setSegments] = useState([newSegment(), { startTime: '13:00', endTime: '17:00' }])
  const [submitError, setSubmitError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (!empId) return <NotLinked title="Log time" />

  const active = (assignments.data ?? []).filter((a) => a.status === 'ACTIVE')
  const selected = active.find((a) => a.id === assignmentId)
  const total = segments.reduce((n, s) => n + segmentMinutes(s), 0)
  const clash = overlapping(segments)
  const outOfRange = selected && workDate && (workDate < selected.startDate || workDate > selected.endDate)

  const update = (i, field, value) =>
    setSegments((s) => s.map((seg, idx) => (idx === i ? { ...seg, [field]: value } : seg)))

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitWorklog({
        assignmentId,
        workDate,
        segments: segments.map((s) => ({ startTime: `${s.startTime}:00`, endTime: `${s.endTime}:00` })),
      })
      navigate('/my-worklogs')
    } catch (err) {
      setSubmitError(errorText(err, 'Submission failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Link to="/my-worklogs" className="btn btn-ghost btn-sm" style={{ marginLeft: -10, marginBottom: 12 }}>
        <Icon name="arrowLeft" /> Timesheets
      </Link>
      <PageHeader
        eyebrow="My work"
        title="Log time"
        subtitle="Record each stretch you worked. Breaks are simply the gaps between segments."
      />

      {assignments.error && <Alert>{assignments.error}</Alert>}

      {assignments.loading ? (
        <Card>
          <LoadingRows />
        </Card>
      ) : active.length === 0 ? (
        <Card>
          <EmptyState icon="briefcase" title="No active assignments">
            You can only log time against an assignment. Your delivery manager places you on contracts.
          </EmptyState>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
          {submitError && <Alert onClose={() => setSubmitError(null)}>{submitError}</Alert>}

          <Card pad>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              1 · Assignment
            </div>
            <div className="list card" role="radiogroup">
              {active.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={assignmentId === a.id}
                  className={`list-item${assignmentId === a.id ? ' active' : ''}`}
                  onClick={() => setAssignmentId(a.id)}
                >
                  <div className="grow">
                    <div className="t-label t-wrap">{a.contractTitle}</div>
                    <div className="t-sm t-mute">
                      {a.skillName} · {fmtRange(a.startDate, a.endDate)}
                    </div>
                  </div>
                  {assignmentId === a.id && <Icon name="check" />}
                </button>
              ))}
            </div>

            <div className="eyebrow mt-24" style={{ marginBottom: 12 }}>
              2 · Day
            </div>
            <Field hint={outOfRange ? <span className="t-warning">Outside this assignment's dates</span> : undefined}>
              <input
                type="date"
                value={workDate}
                min={selected?.startDate}
                max={selected?.endDate}
                onChange={(e) => setWorkDate(e.target.value)}
                required
                style={{ maxWidth: 220 }}
                aria-label="Work date"
              />
            </Field>

            <div className="row between mt-24" style={{ marginBottom: 12 }}>
              <span className="eyebrow">3 · Time worked</span>
              <Btn small variant="secondary" icon="plus" onClick={() => setSegments((s) => [...s, { startTime: '', endTime: '' }])}>
                Add segment
              </Btn>
            </div>
            <div className="stack gap-8">
              {segments.map((seg, i) => (
                <div key={i} className="row gap-8 wrap">
                  <span className="t-sm t-mute mono" style={{ width: 22 }}>
                    {i + 1}
                  </span>
                  <input
                    type="time"
                    value={seg.startTime}
                    onChange={(e) => update(i, 'startTime', e.target.value)}
                    required
                    style={{ width: 130 }}
                    aria-label={`Segment ${i + 1} start`}
                  />
                  <span className="t-mute">→</span>
                  <input
                    type="time"
                    value={seg.endTime}
                    onChange={(e) => update(i, 'endTime', e.target.value)}
                    required
                    style={{ width: 130 }}
                    aria-label={`Segment ${i + 1} end`}
                  />
                  <span className="t-sm t-mute t-num" style={{ minWidth: 56 }}>
                    {seg.startTime && seg.endTime ? hours(segmentMinutes(seg)) : ''}
                  </span>
                  {segments.length > 1 && (
                    <Btn
                      small
                      variant="ghost"
                      icon="trash"
                      aria-label={`Remove segment ${i + 1}`}
                      onClick={() => setSegments((s) => s.filter((_, idx) => idx !== i))}
                    />
                  )}
                </div>
              ))}
            </div>
            {clash && (
              <div className="mt-12">
                <Alert tone="warning">Two segments overlap. Adjust them so each minute is logged once.</Alert>
              </div>
            )}
          </Card>

          <Card className="mt-16">
            <div className="card-body row between wrap gap-12">
              <div>
                <div className="eyebrow">Total</div>
                <div className="stat-value" style={{ marginTop: 4 }}>
                  {hours(total)}
                </div>
                <div className="t-sm t-mute">Recalculated on the server when you submit</div>
              </div>
              <div className="cluster">
                <Btn variant="secondary" onClick={() => navigate('/my-worklogs')}>
                  Cancel
                </Btn>
                <Btn
                  type="submit"
                  icon="check"
                  loading={submitting}
                  disabled={!assignmentId || clash || outOfRange || total === 0}
                >
                  Submit for approval
                </Btn>
              </div>
            </div>
          </Card>
        </form>
      )}
    </>
  )
}
