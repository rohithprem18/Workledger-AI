import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { getMyWorklogs, getMyAssignments } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Btn from '../../components/Btn'
import StatusPill from '../../components/StatusPill'
import Calendar from '../../components/Calendar'
import { NotLinked } from './MyAssignments'
import {
  Alert,
  Card,
  EmptyState,
  LoadingRows,
  Stat,
  Tabs,
  fmtDate,
  fmtTime,
  hours,
} from '../../components/ui'

const CLASS = { APPROVED: 'wb-approved', REJECTED: 'wb-rejected', SUBMITTED: 'wb-submitted' }

export default function MyWorklogs() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const empId = user?.employeeId ?? null
  const [view, setView] = useState('ALL')

  const { data, loading, error } = useFetch(
    () => (empId ? getMyWorklogs(empId) : Promise.resolve([])),
    [empId],
  )
  const assignments = useFetch(() => (empId ? getMyAssignments(empId) : Promise.resolve([])), [empId])

  const worklogs = useMemo(() => data ?? [], [data])
  const titleOf = useMemo(
    () => new Map((assignments.data ?? []).map((a) => [a.id, `${a.contractTitle} · ${a.skillName}`])),
    [assignments.data],
  )

  const events = useMemo(
    () =>
      worklogs.flatMap((w) =>
        (w.segments ?? []).map((seg, i) => ({
          id: `${w.id}-${i}`,
          title: titleOf.get(w.assignmentId) ?? w.status,
          start: `${w.workDate}T${seg.startTime}`,
          end: `${w.workDate}T${seg.endTime}`,
          classNames: [CLASS[w.status] ?? ''],
        })),
      ),
    [worklogs, titleOf],
  )

  if (!empId) return <NotLinked title="Timesheets" />

  const count = (s) => worklogs.filter((w) => w.status === s).length
  const minutes = (s) =>
    worklogs.filter((w) => w.status === s).reduce((n, w) => n + (w.totalActualMinutes ?? 0), 0)
  const rows = view === 'ALL' || view === 'CALENDAR' ? worklogs : worklogs.filter((w) => w.status === view)
  const rejected = worklogs.filter((w) => w.status === 'REJECTED')

  return (
    <>
      <PageHeader
        eyebrow="My work"
        title="Timesheets"
        subtitle="What you have logged and where it is in review. Approved time is final."
      >
        <Btn icon="plus" onClick={() => navigate('/my-worklogs/new')}>
          Log time
        </Btn>
      </PageHeader>

      {error && <Alert>{error}</Alert>}
      {rejected.length > 0 && (
        <Alert tone="warning">
          {rejected.length} timesheet{rejected.length === 1 ? ' was' : 's were'} returned. Check the reason and
          log the day again.
        </Alert>
      )}

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <Stat label="In review" value={loading ? '—' : hours(minutes('SUBMITTED'))} foot={`${count('SUBMITTED')} timesheets`} />
        <Stat label="Approved" value={loading ? '—' : hours(minutes('APPROVED'))} foot={`${count('APPROVED')} timesheets`} />
        <Stat
          label="Returned"
          value={loading ? '—' : count('REJECTED')}
          tone={count('REJECTED') ? 'error' : undefined}
          foot="Need resubmitting"
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Tabs
          value={view}
          onChange={setView}
          options={[
            { value: 'ALL', label: 'All', count: worklogs.length },
            { value: 'SUBMITTED', label: 'In review', count: count('SUBMITTED') },
            { value: 'APPROVED', label: 'Approved', count: count('APPROVED') },
            { value: 'REJECTED', label: 'Returned', count: count('REJECTED') },
            { value: 'CALENDAR', label: 'Calendar' },
          ]}
        />
      </div>

      <Card>
        {loading ? (
          <LoadingRows />
        ) : worklogs.length === 0 ? (
          <EmptyState
            icon="clock"
            title="Nothing logged yet"
            action={
              <Btn icon="plus" onClick={() => navigate('/my-worklogs/new')}>
                Log your first day
              </Btn>
            }
          >
            Log the hours you worked against one of your assignments.
          </EmptyState>
        ) : view === 'CALENDAR' ? (
          <div className="card-body">
            <Calendar events={events} view="timeGridWeek" initialDate={worklogs[0]?.workDate} height={620} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon="clock" title="Nothing in this state" />
        ) : (
          <div className="list">
            {rows.map((w) => (
              <div className="list-item" key={w.id} style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="row between wrap gap-8">
                    <div>
                      <div className="t-label">{fmtDate(w.workDate)}</div>
                      <div className="t-sm t-mute">{titleOf.get(w.assignmentId) ?? 'Assignment'}</div>
                    </div>
                    <div className="row gap-12">
                      <span className="t-label t-num">{hours(w.totalActualMinutes)}</span>
                      <StatusPill value={w.status} />
                    </div>
                  </div>
                  <div className="cluster gap-4 mt-8">
                    {(w.segments ?? []).map((s) => (
                      <span key={s.id} className="badge badge-outline badge-plain mono">
                        {fmtTime(s.startTime)}–{fmtTime(s.endTime)}
                      </span>
                    ))}
                  </div>
                  {w.rejectionReason && (
                    <div className="alert alert-error mt-12" style={{ fontSize: 13 }}>
                      <span>
                        <strong>Returned:</strong> {w.rejectionReason}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
