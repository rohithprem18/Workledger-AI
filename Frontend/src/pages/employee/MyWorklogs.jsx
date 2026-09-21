import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { getMyWorklogs } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Btn from '../../components/Btn'
import StatusPill from '../../components/StatusPill'
import Calendar from '../../components/Calendar'

const ERR = {
  padding: '10px 16px', background: '#ef444415', color: '#ef4444',
  borderLeft: '2px solid #ef4444', marginBottom: 16,
  fontFamily: 'monospace', fontSize: 12,
}

function totalHours(segments) {
  if (!segments?.length) return null
  let mins = 0
  for (const s of segments) {
    const [sh, sm] = s.startTime.split(':').map(Number)
    const [eh, em] = s.endTime.split(':').map(Number)
    mins += (eh * 60 + em) - (sh * 60 + sm)
  }
  return (mins / 60).toFixed(2)
}

function statusClass(status) {
  switch (status) {
    case 'APPROVED':  return 'wb-approved'
    case 'REJECTED':  return 'wb-rejected'
    case 'SUBMITTED': return 'wb-submitted'
    default:          return ''
  }
}

export default function MyWorklogs() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const empId     = user?.employeeId ?? null
  const [view, setView] = useState('calendar')

  const { data, loading, error } = useFetch(
    () => empId ? getMyWorklogs(empId) : Promise.resolve([]),
    [empId],
  )

  const worklogs = data ?? []

  const events = useMemo(() => (
    worklogs.flatMap(w =>
      (w.segments ?? []).map((seg, i) => ({
        id: `${w.id}-${i}`,
        title: w.status,
        start: `${w.workDate}T${seg.startTime}`,
        end:   `${w.workDate}T${seg.endTime}`,
        classNames: [statusClass(w.status)],
        extendedProps: { worklog: w },
      })),
    )
  ), [worklogs])

  if (!empId) {
    return (
      <div>
        <PageHeader title="My Worklogs" subtitle="Submitted timesheets" />
        <div style={{ padding: '60px 32px', textAlign: 'center' }}>
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 13, marginBottom: 8 }}>
            Employee profile not linked to this account.
          </div>
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 11 }}>
            Contact HR to have your employee record associated with your login.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="My Worklogs"
        subtitle="Submitted timesheets"
        action={
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn small variant={view === 'calendar' ? 'primary' : 'ghost'} onClick={() => setView('calendar')}>CALENDAR</Btn>
            <Btn small variant={view === 'list' ? 'primary' : 'ghost'} onClick={() => setView('list')}>LIST</Btn>
            <Btn onClick={() => navigate('/my-worklogs/new')}>+ SUBMIT WORKLOG</Btn>
          </div>
        }
      />
      <div style={{ padding: '24px 32px' }}>
        {error && <div style={ERR}>ERROR: {error}</div>}

        {loading ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : worklogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7a9ab0', fontFamily: 'monospace', fontSize: 13 }}>
            <div style={{ marginBottom: 16 }}>No worklogs submitted yet</div>
            <Btn onClick={() => navigate('/my-worklogs/new')}>+ Submit first worklog</Btn>
          </div>
        ) : view === 'calendar' ? (
          <Calendar events={events} view="timeGridWeek" height={640} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Assignment</th>
                <th>Work Date</th>
                <th>Total Hours</th>
                <th>Status</th>
                <th>Submitted At</th>
                <th>Rejection Reason</th>
              </tr>
            </thead>
            <tbody>
              {worklogs.map(w => {
                const hrs = w.totalActualMinutes != null
                  ? (w.totalActualMinutes / 60).toFixed(2)
                  : totalHours(w.segments)
                return (
                  <tr key={w.id}>
                    <td style={{ color: '#f0f2f5' }}>
                      {w.contractTitle ?? w.assignmentId ?? '—'}
                    </td>
                    <td>{w.workDate}</td>
                    <td style={{ color: '#ff6b00', fontWeight: 700 }}>
                      {hrs != null ? `${hrs}h` : '—'}
                    </td>
                    <td><StatusPill value={w.status} /></td>
                    <td style={{ color: '#7a9ab0' }}>
                      {w.submittedAt ? new Date(w.submittedAt).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ color: '#ef4444', fontSize: 11 }}>
                      {w.rejectionReason ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
