import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { getMyAssignments, getMyTasks, updateTaskStatus } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Btn from '../../components/Btn'
import StatusPill from '../../components/StatusPill'
import Calendar from '../../components/Calendar'
import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  LoadingRows,
  Tabs,
  errorText,
  fmtRange,
  fmtTime,
} from '../../components/ui'

function eachDate(startDate, endDate) {
  const days = []
  const cur = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  while (cur <= end && days.length < 400) {
    days.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return days
}

const today = () => new Date().toISOString().slice(0, 10)

export function NotLinked({ title }) {
  return (
    <>
      <PageHeader eyebrow="My work" title={title} />
      <Card>
        <EmptyState icon="users" title="No contractor profile on this account">
          This sign-in is not linked to an employee record. HR can onboard you from People → Employees.
        </EmptyState>
      </Card>
    </>
  )
}

export default function MyAssignments() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const empId = user?.employeeId ?? null
  const [view, setView] = useState('list')
  const [taskError, setTaskError] = useState(null)

  const { data, loading, error } = useFetch(
    () => (empId ? getMyAssignments(empId) : Promise.resolve([])),
    [empId],
  )
  const myTasks = useFetch(getMyTasks, [])

  const assignments = useMemo(() => data ?? [], [data])
  const now = today()
  const current = assignments.filter((a) => a.startDate <= now && a.endDate >= now)
  const upcoming = assignments.filter((a) => a.startDate > now)
  const past = assignments.filter((a) => a.endDate < now)

  const events = useMemo(
    () =>
      assignments
        .filter((a) => a.status === 'ACTIVE')
        .flatMap((a) =>
          eachDate(a.startDate, a.endDate).map((d) => ({
            id: `${a.id}-${d}`,
            title: `${a.contractTitle} · ${a.skillName}`,
            start: `${d}T${a.plannedStartTime}`,
            end: `${d}T${a.plannedEndTime}`,
            extendedProps: { assignment: a, workDate: d },
          })),
        ),
    [assignments],
  )

  async function handleTaskStatus(taskId, status) {
    setTaskError(null)
    try {
      await updateTaskStatus(taskId, status)
      myTasks.reload()
    } catch (err) {
      setTaskError(errorText(err, 'Could not update the task'))
    }
  }

  if (!empId) return <NotLinked title="Assignments" />

  const logFor = (a, date) =>
    navigate(`/my-worklogs/new?assignmentId=${a.id}${date ? `&date=${date}` : ''}`)

  const section = (title, list) =>
    list.length > 0 && (
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {title} · {list.length}
        </div>
        <div className="grid grid-2">
          {list.map((a) => (
            <Card pad key={a.id}>
              <div className="row between gap-8" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="t-h3 t-wrap">{a.contractTitle}</div>
                  <div className="t-sm t-mute mt-4">{a.skillName}</div>
                </div>
                <StatusPill value={a.status} />
              </div>
              <dl className="kv mt-16">
                <dt>Dates</dt>
                <dd>{fmtRange(a.startDate, a.endDate)}</dd>
                <dt>Hours</dt>
                <dd className="mono">
                  {fmtTime(a.plannedStartTime)} – {fmtTime(a.plannedEndTime)}
                </dd>
              </dl>
              {a.status === 'ACTIVE' && (
                <Btn
                  small
                  icon="clock"
                  className="mt-16"
                  variant={title === 'Current' ? 'primary' : 'secondary'}
                  onClick={() => logFor(a, title === 'Current' ? now : undefined)}
                >
                  Log time
                </Btn>
              )}
            </Card>
          ))}
        </div>
      </div>
    )

  const tasks = myTasks.data ?? []
  const openTasks = tasks.filter((t) => t.status !== 'DONE')

  return (
    <>
      <PageHeader
        eyebrow="My work"
        title="Assignments"
        subtitle="Where you are placed, and when. Log time against an assignment once the work is done."
      >
        <Btn icon="clock" onClick={() => navigate('/my-worklogs/new')}>
          Log time
        </Btn>
      </PageHeader>

      {error && <Alert>{error}</Alert>}

      <div style={{ marginBottom: 16 }}>
        <Tabs
          value={view}
          onChange={setView}
          options={[
            { value: 'list', label: 'Assignments', count: assignments.length },
            { value: 'calendar', label: 'Calendar' },
            { value: 'tasks', label: 'Tasks', count: openTasks.length },
          ]}
        />
      </div>

      {view === 'tasks' ? (
        <Card>
          <CardHeader title="Milestone tasks" subtitle="Work assigned to you on milestone contracts" />
          {taskError && (
            <div className="card-body">
              <Alert>{taskError}</Alert>
            </div>
          )}
          {myTasks.loading ? (
            <LoadingRows />
          ) : tasks.length === 0 ? (
            <EmptyState icon="list" title="No tasks">
              Tasks assigned to you on milestone contracts appear here.
            </EmptyState>
          ) : (
            <div className="list">
              {tasks.map((t) => (
                <div className="list-item wrap" key={t.id}>
                  <div className="grow" style={{ minWidth: 180 }}>
                    <div
                      className="t-label"
                      style={t.status === 'DONE' ? { textDecoration: 'line-through', color: 'var(--mute)' } : undefined}
                    >
                      {t.parentId && <span className="t-mute">↳ </span>}
                      {t.name}
                    </div>
                    <div className="t-sm t-mute">
                      {t.contractTitle} · {t.milestoneLabel}
                    </div>
                  </div>
                  <StatusPill value={t.status} />
                  {t.status === 'PENDING' && (
                    <Btn small variant="secondary" onClick={() => handleTaskStatus(t.id, 'IN_PROGRESS')}>
                      Start
                    </Btn>
                  )}
                  {t.status !== 'DONE' && (
                    <Btn small variant="approve" icon="check" onClick={() => handleTaskStatus(t.id, 'DONE')}>
                      Done
                    </Btn>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : loading ? (
        <Card>
          <LoadingRows />
        </Card>
      ) : assignments.length === 0 ? (
        <Card>
          <EmptyState icon="briefcase" title="No assignments yet">
            When a delivery manager places you on a contract it appears here.
          </EmptyState>
        </Card>
      ) : view === 'calendar' ? (
        <Card>
          <div className="card-body">
            <Calendar
              events={events}
              view="timeGridWeek"
              initialDate={current.length ? now : (upcoming[0] ?? past[past.length - 1])?.startDate}
              onEventClick={(info) => logFor(info.event.extendedProps.assignment, info.event.extendedProps.workDate)}
              height={640}
            />
            <p className="t-sm t-mute mt-12">Select a block to log time for that day.</p>
          </div>
        </Card>
      ) : (
        <div className="stack gap-32">
          {section('Current', current)}
          {section('Upcoming', upcoming)}
          {section('Finished', past)}
        </div>
      )}
    </>
  )
}
