import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getContract,
  getRequirements,
  getEligibleEmployees,
  getAssignmentsByContract,
  createAssignment,
  cancelAssignment,
  getSkills,
  createRequirement,
  getMilestonesByContract,
  createMilestone,
  markMilestoneReached,
  getTasksByMilestone,
  createRootTask,
  createSubtask,
  updateTaskStatus,
  getEmployees,
} from '../../api'
import { useFetch } from '../../hooks/useFetch'
import { useAuth } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import Drawer from '../../components/Drawer'
import Btn from '../../components/Btn'
import Icon from '../../components/Icon'
import StatusPill from '../../components/StatusPill'
import Calendar from '../../components/Calendar'
import AutoAssignDrawer from './AutoAssignDrawer'
import {
  Alert,
  Card,
  EmptyState,
  Field,
  LoadingRows,
  Skeleton,
  Stat,
  Tabs,
  errorText,
  fmtDate,
  fmtDateTime,
  fmtRange,
  fmtTime,
  initials,
  money,
} from '../../components/ui'

const EMPTY_REQ = {
  skillId: '',
  requiredEmployeeCount: 1,
  hourlyRate: '',
  expectedHoursPerDay: 8,
  minProficiency: 3,
  startDate: '',
  endDate: '',
}
const EMPTY_MILESTONE = { sequenceOrder: 1, label: '', thresholdPercent: '', amount: '' }

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

export default function ContractDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('CREATE_CONTRACT')
  const canAssign = hasPermission('CREATE_ASSIGNMENT')
  const canMark = hasPermission('MARK_MILESTONE')

  const contract = useFetch(() => getContract(id), [id])
  const requirements = useFetch(() => getRequirements(id), [id])
  const skills = useFetch(() => (canEdit ? getSkills() : Promise.resolve([])), [canEdit])
  const milestones = useFetch(() => getMilestonesByContract(id), [id])
  const assignmentsAll = useFetch(
    () => (hasPermission('VIEW_ASSIGNMENTS') ? getAssignmentsByContract(id) : Promise.resolve([])),
    [id],
  )
  const people = useFetch(() => getEmployees().catch(() => []), [])

  const [tab, setTab] = useState('requirements')
  const [actionError, setActionError] = useState(null)
  const [notice, setNotice] = useState(null)

  // requirement drawer
  const [reqDrawer, setReqDrawer] = useState(false)
  const [reqForm, setReqForm] = useState(EMPTY_REQ)
  const [reqError, setReqError] = useState(null)
  const [reqSaving, setReqSaving] = useState(false)

  // assign drawer
  const [assignReq, setAssignReq] = useState(null)
  const [eligibles, setEligibles] = useState([])
  const [eligLoading, setEligLoading] = useState(false)
  const [assignForm, setAssignForm] = useState({})
  const [assignError, setAssignError] = useState(null)
  const [assigning, setAssigning] = useState(false)

  // assignment detail drawer (from the calendar)
  const [openAssignment, setOpenAssignment] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  // milestone drawer
  const [msDrawer, setMsDrawer] = useState(false)
  const [msForm, setMsForm] = useState(EMPTY_MILESTONE)
  const [msError, setMsError] = useState(null)
  const [msSaving, setMsSaving] = useState(false)

  const [autoAssignOpen, setAutoAssignOpen] = useState(false)

  // tasks drawer
  const [taskMs, setTaskMs] = useState(null)
  const [tasks, setTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [taskError, setTaskError] = useState(null)
  const [taskForm, setTaskForm] = useState({ name: '', assignedToUserId: '' })
  const [addingTask, setAddingTask] = useState(false)
  const [subtaskOf, setSubtaskOf] = useState(null)
  const [subForm, setSubForm] = useState({ name: '', assignedToUserId: '' })
  const [addingSubtask, setAddingSubtask] = useState(false)

  const c = contract.data
  const reqs = requirements.data ?? []
  const msList = milestones.data ?? []
  const asgAll = useMemo(() => assignmentsAll.data ?? [], [assignmentsAll.data])
  const peopleList = people.data ?? []
  const isMilestone = c?.billingTypeCode === 'MILESTONE'
  const activeAssignments = asgAll.filter((a) => a.status === 'ACTIVE')

  const seatsNeeded = reqs.reduce((n, r) => n + (r.requiredEmployeeCount ?? 0), 0)
  const seatsFilled = reqs.reduce((n, r) => n + (r.fulfilledCount ?? 0), 0)
  const openSeats = reqs.some((r) => r.remainingSlots > 0)
  const daysLeft = c?.endDate
    ? Math.ceil((new Date(`${c.endDate}T00:00:00`) - new Date()) / 86_400_000)
    : null

  const calendarEvents = useMemo(
    () =>
      asgAll
        .filter((a) => a.status === 'ACTIVE')
        .flatMap((a) =>
          eachDate(a.startDate, a.endDate).map((d) => ({
            id: `${a.id}-${d}`,
            title: `${a.employeeName} · ${a.skillName}`,
            start: `${d}T${a.plannedStartTime}`,
            end: `${d}T${a.plannedEndTime}`,
            extendedProps: { assignment: a },
          })),
        ),
    [asgAll],
  )

  function reloadStaffing() {
    requirements.reload()
    assignmentsAll.reload()
    contract.reload()
  }

  // ------------------------------------------------------------ requirement
  function openRequirement() {
    setReqForm({ ...EMPTY_REQ, startDate: c?.startDate ?? '', endDate: c?.endDate ?? '' })
    setReqError(null)
    setReqDrawer(true)
  }

  async function handleAddRequirement(e) {
    e.preventDefault()
    setReqSaving(true)
    setReqError(null)
    try {
      await createRequirement(id, {
        skillId: reqForm.skillId,
        requiredEmployeeCount: parseInt(reqForm.requiredEmployeeCount, 10),
        hourlyRate: parseFloat(reqForm.hourlyRate),
        expectedHoursPerDay: parseFloat(reqForm.expectedHoursPerDay),
        minProficiency: parseInt(reqForm.minProficiency, 10),
        startDate: reqForm.startDate,
        endDate: reqForm.endDate,
      })
      setReqDrawer(false)
      reloadStaffing()
      setNotice('Requirement added.')
    } catch (err) {
      setReqError(errorText(err, 'Could not add the requirement'))
    } finally {
      setReqSaving(false)
    }
  }

  // ------------------------------------------------------------- assignment
  async function openAssign(req) {
    setAssignReq(req)
    setAssignForm({
      employeeId: '',
      startDate: req.startDate,
      endDate: req.endDate,
      plannedStartTime: '09:00',
      plannedEndTime: '17:00',
    })
    setAssignError(null)
    setEligLoading(true)
    setEligibles([])
    try {
      const list = await getEligibleEmployees(req.id, req.startDate, req.endDate)
      setEligibles(Array.isArray(list) ? list : [])
    } catch {
      setEligibles([])
    } finally {
      setEligLoading(false)
    }
  }

  async function handleAssign(e) {
    e.preventDefault()
    if (!assignForm.employeeId) {
      setAssignError('Choose a contractor first')
      return
    }
    setAssigning(true)
    setAssignError(null)
    try {
      await createAssignment({
        employeeId: assignForm.employeeId,
        requirementId: assignReq.id,
        startDate: assignForm.startDate,
        endDate: assignForm.endDate,
        plannedStartTime: `${assignForm.plannedStartTime}:00`,
        plannedEndTime: `${assignForm.plannedEndTime}:00`,
      })
      const who = eligibles.find((x) => x.id === assignForm.employeeId)
      setAssignReq(null)
      reloadStaffing()
      setNotice(`${who ? `${who.firstName} ${who.lastName}` : 'Contractor'} assigned to ${assignReq.skillName}.`)
    } catch (err) {
      setAssignError(errorText(err, 'Assignment failed'))
    } finally {
      setAssigning(false)
    }
  }

  async function handleCancelAssignment(asg) {
    setActionError(null)
    setCancelling(true)
    try {
      await cancelAssignment(asg.id)
      setOpenAssignment(null)
      reloadStaffing()
      setNotice(`Cancelled ${asg.employeeName}'s assignment.`)
    } catch (err) {
      setActionError(errorText(err, 'Could not cancel the assignment'))
    } finally {
      setCancelling(false)
    }
  }

  // -------------------------------------------------------------- milestone
  function openMilestone() {
    const next = (msList[msList.length - 1]?.sequenceOrder ?? 0) + 1
    setMsForm({ ...EMPTY_MILESTONE, sequenceOrder: next })
    setMsError(null)
    setMsDrawer(true)
  }

  async function handleAddMilestone(e) {
    e.preventDefault()
    setMsSaving(true)
    setMsError(null)
    try {
      await createMilestone(id, {
        sequenceOrder: parseInt(msForm.sequenceOrder, 10),
        label: msForm.label,
        thresholdPercent: msForm.thresholdPercent === '' ? null : parseFloat(msForm.thresholdPercent),
        amount: parseFloat(msForm.amount),
      })
      setMsDrawer(false)
      milestones.reload()
    } catch (err) {
      setMsError(errorText(err, 'Could not add the milestone'))
    } finally {
      setMsSaving(false)
    }
  }

  async function handleMarkReached(m) {
    setActionError(null)
    try {
      await markMilestoneReached(m.id)
      milestones.reload()
      setNotice(`"${m.label}" marked reached — finance can now approve it.`)
    } catch (err) {
      setActionError(errorText(err, 'Could not mark the milestone reached'))
    }
  }

  // ------------------------------------------------------------------ tasks
  async function openTasks(ms) {
    setTaskMs(ms)
    setTaskError(null)
    setSubtaskOf(null)
    setTaskForm({ name: '', assignedToUserId: '' })
    setTasksLoading(true)
    try {
      const list = await getTasksByMilestone(ms.id)
      setTasks(Array.isArray(list) ? list : [])
    } catch (err) {
      setTaskError(errorText(err, 'Could not load tasks'))
    } finally {
      setTasksLoading(false)
    }
  }

  async function reloadTasks() {
    try {
      const list = await getTasksByMilestone(taskMs.id)
      setTasks(Array.isArray(list) ? list : [])
      milestones.reload()
    } catch (err) {
      setTaskError(errorText(err, 'Could not reload tasks'))
    }
  }

  async function handleAddTask(e) {
    e.preventDefault()
    setAddingTask(true)
    setTaskError(null)
    try {
      await createRootTask(taskMs.id, {
        name: taskForm.name,
        assignedToUserId: taskForm.assignedToUserId || undefined,
      })
      setTaskForm({ name: '', assignedToUserId: '' })
      await reloadTasks()
    } catch (err) {
      setTaskError(errorText(err, 'Could not add the task'))
    } finally {
      setAddingTask(false)
    }
  }

  async function handleAddSubtask(e) {
    e.preventDefault()
    setAddingSubtask(true)
    setTaskError(null)
    try {
      await createSubtask(subtaskOf, {
        name: subForm.name,
        assignedToUserId: subForm.assignedToUserId || undefined,
      })
      setSubtaskOf(null)
      setSubForm({ name: '', assignedToUserId: '' })
      await reloadTasks()
    } catch (err) {
      setTaskError(errorText(err, 'Could not add the subtask'))
    } finally {
      setAddingSubtask(false)
    }
  }

  async function handleTaskStatus(taskId, status) {
    setTaskError(null)
    try {
      await updateTaskStatus(taskId, status)
      await reloadTasks()
    } catch (err) {
      setTaskError(errorText(err, 'Could not update the task'))
    }
  }

  // ----------------------------------------------------------------- render
  if (contract.loading) {
    return (
      <div className="stack gap-16">
        <Skeleton height={14} width={120} />
        <Skeleton height={36} width="50%" />
        <div className="grid grid-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={92} />
          ))}
        </div>
        <Skeleton height={240} />
      </div>
    )
  }

  if (contract.error) {
    return (
      <>
        <Link to="/contracts" className="btn btn-ghost btn-sm">
          <Icon name="arrowLeft" /> Contracts
        </Link>
        <Alert>{contract.error}</Alert>
      </>
    )
  }

  const tabs = [
    { value: 'requirements', label: 'Requirements', count: reqs.length },
    { value: 'schedule', label: 'Schedule', count: activeAssignments.length },
  ]
  if (isMilestone) tabs.push({ value: 'milestones', label: 'Milestones', count: msList.length })

  return (
    <>
      <Link to="/contracts" className="btn btn-ghost btn-sm" style={{ marginLeft: -10, marginBottom: 12 }}>
        <Icon name="arrowLeft" /> Contracts
      </Link>

      <PageHeader
        eyebrow={c?.companyName ?? 'Contract'}
        title={c?.title ?? 'Contract'}
        subtitle={c?.description || undefined}
      >
        {canAssign && openSeats && (
          <Btn variant="secondary" icon="wand" onClick={() => setAutoAssignOpen(true)}>
            Auto-assign
          </Btn>
        )}
        {canEdit && (
          <Btn variant="secondary" icon="sparkles" onClick={() => navigate('/contracts/intake')}>
            Upload document
          </Btn>
        )}
        {canEdit && tab !== 'milestones' && (
          <Btn icon="plus" onClick={openRequirement}>
            Add requirement
          </Btn>
        )}
        {canEdit && tab === 'milestones' && (
          <Btn icon="plus" onClick={openMilestone}>
            Add milestone
          </Btn>
        )}
      </PageHeader>

      {actionError && <Alert onClose={() => setActionError(null)}>{actionError}</Alert>}
      {notice && (
        <Alert tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <div className="grid grid-4">
        <Stat
          label="Billing"
          value={<StatusPill value={c?.billingTypeCode} dot={false} />}
          foot={c?.active ? 'Active contract' : 'Inactive'}
        />
        <Stat label="Term" value={<span className="t-h3">{fmtRange(c?.startDate, c?.endDate)}</span>} foot={
          daysLeft === null ? '' : daysLeft < 0 ? 'Ended' : `${daysLeft} days remaining`
        } />
        <Stat
          label="Seats filled"
          value={`${seatsFilled}/${seatsNeeded}`}
          foot={seatsNeeded ? `${Math.round((seatsFilled / seatsNeeded) * 100)}% staffed` : 'No requirements yet'}
        />
        <Stat label="On assignment" value={activeAssignments.length} foot="Active placements" />
      </div>

      <div className="mt-32" style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} options={tabs} />
      </div>

      {tab === 'requirements' &&
        (requirements.loading ? (
          <Card>
            <LoadingRows />
          </Card>
        ) : reqs.length === 0 ? (
          <Card>
            <EmptyState
              icon="users"
              title="No requirements yet"
              action={
                canEdit && (
                  <Btn icon="plus" onClick={openRequirement}>
                    Add a requirement
                  </Btn>
                )
              }
            >
              A requirement names a skill, a headcount and the hourly rate the client has
              authorised — which is what invoices are later audited against.
            </EmptyState>
          </Card>
        ) : (
          <div className="stack gap-16">
            {reqs.map((req) => (
              <RequirementCard
                key={req.id}
                req={req}
                assignments={asgAll.filter((a) => a.requirementId === req.id)}
                canAssign={canAssign}
                onAssign={() => openAssign(req)}
                onCancel={handleCancelAssignment}
              />
            ))}
          </div>
        ))}

      {tab === 'schedule' && (
        <Card>
          <div className="card-body">
            {assignmentsAll.loading ? (
              <Skeleton height={420} />
            ) : activeAssignments.length === 0 ? (
              <EmptyState icon="calendar" title="Nobody scheduled yet">
                Assign contractors to a requirement and their planned hours appear here.
              </EmptyState>
            ) : (
              <Calendar
                events={calendarEvents}
                view="timeGridWeek"
                initialDate={activeAssignments.map((a) => a.startDate).sort()[0]}
                onEventClick={(info) => setOpenAssignment(info.event.extendedProps.assignment)}
                height={640}
              />
            )}
          </div>
        </Card>
      )}

      {tab === 'milestones' &&
        (milestones.loading ? (
          <Card>
            <LoadingRows />
          </Card>
        ) : msList.length === 0 ? (
          <Card>
            <EmptyState
              icon="flag"
              title="No milestones yet"
              action={
                canEdit && (
                  <Btn icon="plus" onClick={openMilestone}>
                    Add a milestone
                  </Btn>
                )
              }
            >
              Milestones are fixed-amount checkpoints. Finance approves each one before it is invoiced.
            </EmptyState>
          </Card>
        ) : (
          <div className="stack gap-12">
            {msList.map((m) => (
              <Card pad="sm" key={m.id}>
                <div className="row gap-16 wrap">
                  <span
                    className="mono t-sm"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      display: 'grid',
                      placeItems: 'center',
                      background: 'var(--well)',
                    }}
                  >
                    {m.sequenceOrder}
                  </span>
                  <div className="grow" style={{ minWidth: 180 }}>
                    <div className="t-label">{m.label}</div>
                    <div className="t-sm t-mute">
                      {m.thresholdPercent != null ? `${m.thresholdPercent}% of scope · ` : ''}
                      {m.totalTasks > 0 ? `${m.completedTasks}/${m.totalTasks} tasks done` : 'No tasks'}
                      {m.markedAt ? ` · reached ${fmtDateTime(m.markedAt)}` : ''}
                    </div>
                  </div>
                  <div className="t-h3 t-num">{money(m.amount)}</div>
                  <StatusPill value={m.status} />
                  <div className="cluster">
                    {m.status === 'PENDING' && (
                      <>
                        <Btn small variant="secondary" icon="list" onClick={() => openTasks(m)}>
                          Tasks
                        </Btn>
                        {canMark && (
                          <Btn
                            small
                            variant="approve"
                            icon="flag"
                            disabled={m.totalTasks > 0 && m.completedTasks < m.totalTasks}
                            title={
                              m.totalTasks > m.completedTasks
                                ? 'Finish every task before marking the milestone reached'
                                : undefined
                            }
                            onClick={() => handleMarkReached(m)}
                          >
                            Mark reached
                          </Btn>
                        )}
                      </>
                    )}
                    {m.status === 'REACHED' && <span className="t-sm t-warning">Awaiting finance</span>}
                  </div>
                </div>
                {m.totalTasks > 0 && (
                  <div className="progress mt-12">
                    <span style={{ width: `${(m.completedTasks / m.totalTasks) * 100}%` }} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        ))}

      {/* ---------------------------------------------------- assign drawer */}
      <Drawer
        open={!!assignReq}
        onClose={() => setAssignReq(null)}
        title="Assign contractor"
        subtitle={
          assignReq ? `${assignReq.skillName} · level ${assignReq.minProficiency ?? 1}+ · ${money(assignReq.hourlyRate)}/h` : ''
        }
        footer={
          <>
            <Btn variant="secondary" onClick={() => setAssignReq(null)}>
              Cancel
            </Btn>
            <Btn type="submit" form="assign-form" loading={assigning} disabled={!assignForm.employeeId}>
              Assign
            </Btn>
          </>
        }
      >
        {assignError && <Alert>{assignError}</Alert>}
        <div className="eyebrow">Eligible contractors</div>
        <p className="t-sm t-mute mt-4">
          Active, holding the skill at the required level, with no clashing assignment.
        </p>
        <div className="mt-12">
          {eligLoading ? (
            <LoadingRows rows={3} />
          ) : eligibles.length === 0 ? (
            <div className="card">
              <EmptyState icon="users" title="Nobody is eligible">
                No active contractor holds this skill at the required level. HR can record skills in People.
              </EmptyState>
            </div>
          ) : (
            <div className="card list" role="radiogroup">
              {eligibles.map((emp) => {
                const selected = assignForm.employeeId === emp.id
                return (
                  <button
                    key={emp.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`list-item${selected ? ' active' : ''}`}
                    onClick={() => setAssignForm((f) => ({ ...f, employeeId: emp.id }))}
                  >
                    <span className="avatar avatar-sm">{initials(`${emp.firstName} ${emp.lastName}`)}</span>
                    <div className="grow">
                      <div className="t-label">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="t-sm t-mute t-wrap">{emp.email}</div>
                    </div>
                    {selected && <Icon name="check" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <form id="assign-form" onSubmit={handleAssign} className="mt-24">
          <div className="field-row">
            <Field label="From">
              <input
                type="date"
                value={assignForm.startDate ?? ''}
                min={assignReq?.startDate}
                max={assignReq?.endDate}
                onChange={(e) => setAssignForm((f) => ({ ...f, startDate: e.target.value }))}
                required
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={assignForm.endDate ?? ''}
                min={assignForm.startDate}
                max={assignReq?.endDate}
                onChange={(e) => setAssignForm((f) => ({ ...f, endDate: e.target.value }))}
                required
              />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Daily start">
              <input
                type="time"
                value={assignForm.plannedStartTime ?? ''}
                onChange={(e) => setAssignForm((f) => ({ ...f, plannedStartTime: e.target.value }))}
                required
              />
            </Field>
            <Field label="Daily end">
              <input
                type="time"
                value={assignForm.plannedEndTime ?? ''}
                onChange={(e) => setAssignForm((f) => ({ ...f, plannedEndTime: e.target.value }))}
                required
              />
            </Field>
          </div>
          <p className="field-hint mt-8">
            Every day in the range must fall inside the contractor's weekly availability.
          </p>
        </form>
      </Drawer>

      {/* ------------------------------------------- assignment detail drawer */}
      <Drawer
        open={!!openAssignment}
        onClose={() => setOpenAssignment(null)}
        title={openAssignment?.employeeName ?? 'Assignment'}
        subtitle={openAssignment?.skillName}
        footer={
          openAssignment &&
          canAssign && (
            <Btn variant="danger" loading={cancelling} onClick={() => handleCancelAssignment(openAssignment)}>
              Cancel assignment
            </Btn>
          )
        }
      >
        {openAssignment && (
          <dl className="kv">
            <dt>Status</dt>
            <dd>
              <StatusPill value={openAssignment.status} />
            </dd>
            <dt>Dates</dt>
            <dd>{fmtRange(openAssignment.startDate, openAssignment.endDate)}</dd>
            <dt>Daily hours</dt>
            <dd className="mono">
              {fmtTime(openAssignment.plannedStartTime)} – {fmtTime(openAssignment.plannedEndTime)}
            </dd>
          </dl>
        )}
      </Drawer>

      {/* ----------------------------------------------- requirement drawer */}
      <Drawer
        open={reqDrawer}
        onClose={() => setReqDrawer(false)}
        title="Add requirement"
        subtitle="A role to fill, and the rate the client authorises for it."
        footer={
          <>
            <Btn variant="secondary" onClick={() => setReqDrawer(false)}>
              Cancel
            </Btn>
            <Btn type="submit" form="req-form" loading={reqSaving}>
              Add requirement
            </Btn>
          </>
        }
      >
        {reqError && <Alert>{reqError}</Alert>}
        <form id="req-form" onSubmit={handleAddRequirement}>
          <Field label="Skill">
            <select
              value={reqForm.skillId}
              onChange={(e) => setReqForm((f) => ({ ...f, skillId: e.target.value }))}
              required
            >
              <option value="">Select a skill</option>
              {(skills.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="field-row">
            <Field label="Headcount">
              <input
                type="number"
                min="1"
                value={reqForm.requiredEmployeeCount}
                onChange={(e) => setReqForm((f) => ({ ...f, requiredEmployeeCount: e.target.value }))}
                required
              />
            </Field>
            <Field label="Minimum level" hint="1 to 5">
              <input
                type="number"
                min="1"
                max="5"
                value={reqForm.minProficiency}
                onChange={(e) => setReqForm((f) => ({ ...f, minProficiency: e.target.value }))}
                required
              />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Hourly rate (₹)">
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={reqForm.hourlyRate}
                onChange={(e) => setReqForm((f) => ({ ...f, hourlyRate: e.target.value }))}
                required
              />
            </Field>
            <Field label="Hours per day">
              <input
                type="number"
                min="0.5"
                max="24"
                step="0.5"
                value={reqForm.expectedHoursPerDay}
                onChange={(e) => setReqForm((f) => ({ ...f, expectedHoursPerDay: e.target.value }))}
                required
              />
            </Field>
          </div>
          <div className="field-row">
            <Field label="From">
              <input
                type="date"
                value={reqForm.startDate}
                min={c?.startDate}
                max={c?.endDate}
                onChange={(e) => setReqForm((f) => ({ ...f, startDate: e.target.value }))}
                required
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={reqForm.endDate}
                min={reqForm.startDate || c?.startDate}
                max={c?.endDate}
                onChange={(e) => setReqForm((f) => ({ ...f, endDate: e.target.value }))}
                required
              />
            </Field>
          </div>
        </form>
      </Drawer>

      {/* ------------------------------------------------- milestone drawer */}
      <Drawer
        open={msDrawer}
        onClose={() => setMsDrawer(false)}
        title="Add milestone"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setMsDrawer(false)}>
              Cancel
            </Btn>
            <Btn type="submit" form="ms-form" loading={msSaving}>
              Add milestone
            </Btn>
          </>
        }
      >
        {msError && <Alert>{msError}</Alert>}
        <form id="ms-form" onSubmit={handleAddMilestone}>
          <Field label="Label">
            <input
              value={msForm.label}
              onChange={(e) => setMsForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Discovery and design signed off"
              required
            />
          </Field>
          <div className="field-row">
            <Field label="Sequence">
              <input
                type="number"
                min="1"
                value={msForm.sequenceOrder}
                onChange={(e) => setMsForm((f) => ({ ...f, sequenceOrder: e.target.value }))}
                required
              />
            </Field>
            <Field label="Amount (₹)">
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={msForm.amount}
                onChange={(e) => setMsForm((f) => ({ ...f, amount: e.target.value }))}
                required
              />
            </Field>
          </div>
          <Field label="Share of scope (%)" hint="Optional">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={msForm.thresholdPercent}
              onChange={(e) => setMsForm((f) => ({ ...f, thresholdPercent: e.target.value }))}
            />
          </Field>
        </form>
      </Drawer>

      {/* ----------------------------------------------------- tasks drawer */}
      <Drawer
        open={!!taskMs}
        onClose={() => setTaskMs(null)}
        title="Milestone tasks"
        subtitle={taskMs?.label}
      >
        {taskError && <Alert>{taskError}</Alert>}
        {tasksLoading ? (
          <LoadingRows rows={3} />
        ) : tasks.length === 0 ? (
          <div className="card">
            <EmptyState icon="list" title="No tasks yet">
              Break the milestone into tasks. It can only be marked reached once every task is done.
            </EmptyState>
          </div>
        ) : (
          <div className="stack gap-8">
            {tasks
              .filter((t) => !t.parentId)
              .map((root) => (
                <TaskRow
                  key={root.id}
                  task={root}
                  subtasks={tasks.filter((t) => t.parentId === root.id)}
                  people={peopleList}
                  subtaskOf={subtaskOf}
                  subForm={subForm}
                  addingSubtask={addingSubtask}
                  onStatus={handleTaskStatus}
                  onToggleSubtask={setSubtaskOf}
                  onSubFormChange={setSubForm}
                  onSubSubmit={handleAddSubtask}
                />
              ))}
          </div>
        )}

        <hr className="divider mt-24" />
        <form onSubmit={handleAddTask} className="mt-16">
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Add task
          </div>
          <Field label="Task">
            <input
              value={taskForm.name}
              onChange={(e) => setTaskForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="What needs doing"
              required
            />
          </Field>
          <Field label="Owner">
            <select
              value={taskForm.assignedToUserId}
              onChange={(e) => setTaskForm((f) => ({ ...f, assignedToUserId: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {peopleList
                .filter((p) => p.userId)
                .map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
            </select>
          </Field>
          <Btn type="submit" icon="plus" loading={addingTask} className="mt-16">
            Add task
          </Btn>
        </form>
      </Drawer>

      <AutoAssignDrawer
        contractId={id}
        open={autoAssignOpen}
        onClose={() => setAutoAssignOpen(false)}
        onSuccess={() => {
          reloadStaffing()
          setNotice('Assignments created.')
        }}
      />
    </>
  )
}

function RequirementCard({ req, assignments, canAssign, onAssign, onCancel }) {
  const active = assignments.filter((a) => a.status === 'ACTIVE')
  const need = req.requiredEmployeeCount ?? 0
  const have = req.fulfilledCount ?? active.length
  const full = have >= need

  return (
    <Card>
      <div className="card-body">
        <div className="row between wrap gap-12">
          <div>
            <div className="row gap-8 wrap">
              <span className="t-h3">{req.skillName}</span>
              <span className="badge badge-outline badge-plain mono">L{req.minProficiency ?? 1}+</span>
            </div>
            <div className="t-sm t-mute mt-4">
              {fmtRange(req.startDate, req.endDate)} · {req.expectedHoursPerDay}h/day
            </div>
          </div>
          <div className="row gap-16">
            <div className="t-right">
              <div className="eyebrow">Rate</div>
              <div className="t-label t-num">{money(req.hourlyRate)}/h</div>
            </div>
            {canAssign && (
              <Btn small variant={full ? 'secondary' : 'primary'} icon="userPlus" disabled={full} onClick={onAssign}>
                {full ? 'Filled' : 'Assign'}
              </Btn>
            )}
          </div>
        </div>

        <div className="row gap-12 mt-16">
          <div className="progress grow">
            <span style={{ width: `${need ? (have / need) * 100 : 0}%` }} />
          </div>
          <span className="t-sm t-num t-body">
            {have} of {need} filled
          </span>
        </div>
      </div>

      {active.length > 0 && (
        <div className="list" style={{ borderTop: '1px solid var(--hairline)' }}>
          {active.map((a) => (
            <div className="list-item" key={a.id}>
              <span className="avatar avatar-sm">{initials(a.employeeName ?? '')}</span>
              <div className="grow">
                <div className="t-label">{a.employeeName}</div>
                <div className="t-sm t-mute">
                  {fmtDate(a.startDate)} – {fmtDate(a.endDate)} ·{' '}
                  <span className="mono">
                    {fmtTime(a.plannedStartTime)}–{fmtTime(a.plannedEndTime)}
                  </span>
                </div>
              </div>
              {canAssign && (
                <Btn small variant="ghost" onClick={() => onCancel(a)}>
                  Cancel
                </Btn>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function TaskRow({
  task,
  subtasks,
  people,
  subtaskOf,
  subForm,
  addingSubtask,
  onStatus,
  onToggleSubtask,
  onSubFormChange,
  onSubSubmit,
  depth = 0,
}) {
  const owner = people.find((p) => p.userId === task.assignedToUserId)
  const done = task.status === 'DONE'
  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div className="card card-pad-sm row gap-8 wrap">
        <div className="grow" style={{ minWidth: 140 }}>
          <div
            className="t-label"
            style={done ? { textDecoration: 'line-through', color: 'var(--mute)' } : undefined}
          >
            {task.name}
          </div>
          <div className="t-sm t-mute">{owner ? `${owner.firstName} ${owner.lastName}` : 'Unassigned'}</div>
        </div>
        <StatusPill value={task.status} />
        {task.status === 'PENDING' && (
          <Btn small variant="secondary" onClick={() => onStatus(task.id, 'IN_PROGRESS')}>
            Start
          </Btn>
        )}
        {!done && (
          <Btn small variant="approve" icon="check" onClick={() => onStatus(task.id, 'DONE')}>
            Done
          </Btn>
        )}
        {!done && depth === 0 && (
          <Btn
            small
            variant="ghost"
            icon="plus"
            onClick={() => onToggleSubtask(subtaskOf === task.id ? null : task.id)}
          >
            Subtask
          </Btn>
        )}
      </div>

      {subtaskOf === task.id && (
        <form onSubmit={onSubSubmit} className="row gap-8 wrap mt-8" style={{ marginLeft: 20 }}>
          <input
            value={subForm.name}
            onChange={(e) => onSubFormChange((f) => ({ ...f, name: e.target.value }))}
            placeholder="Subtask"
            required
            style={{ flex: 2, minWidth: 140 }}
          />
          <select
            value={subForm.assignedToUserId}
            onChange={(e) => onSubFormChange((f) => ({ ...f, assignedToUserId: e.target.value }))}
            style={{ flex: 1, minWidth: 120 }}
            aria-label="Owner"
          >
            <option value="">Unassigned</option>
            {people
              .filter((p) => p.userId)
              .map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
          </select>
          <Btn small type="submit" loading={addingSubtask}>
            Add
          </Btn>
        </form>
      )}

      {subtasks.length > 0 && (
        <div className="stack gap-8 mt-8">
          {subtasks.map((sub) => (
            <TaskRow
              key={sub.id}
              task={sub}
              subtasks={[]}
              people={people}
              subtaskOf={subtaskOf}
              subForm={subForm}
              addingSubtask={addingSubtask}
              onStatus={onStatus}
              onToggleSubtask={onToggleSubtask}
              onSubFormChange={onSubFormChange}
              onSubSubmit={onSubSubmit}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
