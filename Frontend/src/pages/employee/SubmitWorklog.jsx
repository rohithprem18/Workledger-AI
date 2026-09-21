import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { getMyAssignments, submitWorklog } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Btn from '../../components/Btn'

const ERR = {
  padding: '10px 16px', background: '#ef444415', color: '#ef4444',
  borderLeft: '2px solid #ef4444', marginBottom: 16,
  fontFamily: 'monospace', fontSize: 12,
}
const LABEL = {
  display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
  color: '#7a9ab0', fontFamily: 'ui-monospace, Consolas, monospace',
  marginBottom: 6, textTransform: 'uppercase',
}
const FIELD = { marginBottom: 18 }

function newSegment() { return { startTime: '', endTime: '' } }

function assignmentLabel(a) {
  const contract = a.contractTitle ?? a.contractId ?? 'Unknown Contract'
  const skill    = a.skillName ?? a.requirementId ?? ''
  return `${contract}${skill ? ' — ' + skill : ''} (${a.startDate} → ${a.endDate})`
}

export default function SubmitWorklog() {
  const { user }    = useAuth()
  const navigate    = useNavigate()
  const [params]    = useSearchParams()
  const empId       = user?.employeeId ?? null
  const prefilledId   = params.get('assignmentId') ?? ''
  const prefilledDate = params.get('date') ?? ''

  const { data: assignments, loading: asgLoading, error: asgError } = useFetch(
    () => empId ? getMyAssignments(empId) : Promise.resolve([]),
    [empId],
  )

  const [assignmentId, setAssignmentId] = useState(prefilledId)
  const [workDate, setWorkDate]         = useState(prefilledDate)
  const [segments, setSegments]         = useState([newSegment()])
  const [submitError, setSubmitError]   = useState(null)
  const [submitting, setSubmitting]     = useState(false)

  const asgList = assignments ?? []

  function addSegment() {
    setSegments(s => [...s, newSegment()])
  }

  function removeSegment(i) {
    setSegments(s => s.filter((_, idx) => idx !== i))
  }

  function updateSegment(i, field, value) {
    setSegments(s => s.map((seg, idx) => idx === i ? { ...seg, [field]: value } : seg))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (segments.length === 0) { setSubmitError('At least one time segment is required'); return }
    if (segments.some(s => !s.startTime || !s.endTime)) {
      setSubmitError('All segments must have start and end times')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitWorklog({
        assignmentId,
        workDate,
        segments: segments.map(s => ({
          startTime: s.startTime + ':00',
          endTime:   s.endTime   + ':00',
        })),
      })
      navigate('/my-worklogs')
    } catch (err) {
      setSubmitError(err?.response?.data?.message ?? err?.message ?? 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!empId) {
    return (
      <div>
        <PageHeader title="Submit Worklog" subtitle="Record your work hours" />
        <div style={{ padding: '60px 32px', textAlign: 'center' }}>
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 13 }}>
            Employee profile not linked. Contact your manager.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Submit Worklog" subtitle="Record your work hours" />
      <div style={{ padding: '24px 32px', maxWidth: 640 }}>
        {(asgError || submitError) && (
          <div style={ERR}>ERROR: {asgError || submitError}</div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Assignment select */}
          <div style={FIELD}>
            <label style={LABEL}>Assignment</label>
            {asgLoading ? (
              <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading assignments...</div>
            ) : (
              <select
                value={assignmentId}
                onChange={e => setAssignmentId(e.target.value)}
                required
              >
                <option value="">— Select assignment —</option>
                {asgList.filter(a => a.status !== 'CANCELLED').map(a => (
                  <option key={a.id} value={a.id}>{assignmentLabel(a)}</option>
                ))}
              </select>
            )}
          </div>

          {/* Work date */}
          <div style={FIELD}>
            <label style={LABEL}>Work Date</label>
            <input
              type="date"
              value={workDate}
              onChange={e => setWorkDate(e.target.value)}
              required
              style={{ maxWidth: 200 }}
            />
          </div>

          {/* Time segments */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={LABEL}>Time Segments</span>
              <Btn small variant="ghost" onClick={addSegment} type="button">+ ADD SEGMENT</Btn>
            </div>

            {segments.map((seg, i) => (
              <div
                key={i}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr auto',
                  gap: 10, alignItems: 'flex-end', marginBottom: 10,
                  padding: '12px 14px', background: '#0d1b2a',
                  border: '1px solid #1e3a4a', borderRadius: 3,
                }}
              >
                <div>
                  <label style={{ ...LABEL, marginBottom: 4 }}>Start Time</label>
                  <input
                    type="time"
                    value={seg.startTime}
                    onChange={e => updateSegment(i, 'startTime', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ ...LABEL, marginBottom: 4 }}>End Time</label>
                  <input
                    type="time"
                    value={seg.endTime}
                    onChange={e => updateSegment(i, 'endTime', e.target.value)}
                    required
                  />
                </div>
                <div style={{ paddingBottom: 2 }}>
                  {segments.length > 1 && (
                    <Btn small variant="danger" type="button" onClick={() => removeSegment(i)}>
                      REMOVE
                    </Btn>
                  )}
                </div>
              </div>
            ))}

            {segments.length === 0 && (
              <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 11, marginBottom: 12 }}>
                No segments — click ADD SEGMENT
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <Btn type="submit" disabled={submitting || asgLoading}>
              {submitting ? 'SUBMITTING...' : 'SUBMIT WORKLOG'}
            </Btn>
            <Btn type="button" variant="ghost" onClick={() => navigate('/my-worklogs')}>
              CANCEL
            </Btn>
          </div>
        </form>
      </div>
    </div>
  )
}
