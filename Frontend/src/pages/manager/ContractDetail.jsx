import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getContract,
  getRequirements,
  getEligibleEmployees,
  getAssignmentsByRequirement,
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
} from "../../api";
import { useFetch } from "../../hooks/useFetch";
import PageHeader from "../../components/PageHeader";
import Drawer from "../../components/Drawer";
import Btn from "../../components/Btn";
import StatusPill from "../../components/StatusPill";
import Calendar from "../../components/Calendar";
import AutoAssignDrawer from "./AutoAssignDrawer";

const ERR = {
  padding: "10px 16px",
  background: "#ef444415",
  color: "#ef4444",
  borderLeft: "2px solid #ef4444",
  marginBottom: 16,
  fontFamily: "monospace",
  fontSize: 12,
};
const LABEL = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  color: "#7a9ab0",
  fontFamily: "ui-monospace, Consolas, monospace",
  marginBottom: 6,
  textTransform: "uppercase",
};
const FIELD = { marginBottom: 18 };
const SECTION = {
  marginBottom: 32,
  background: "#0d1b2a",
  border: "1px solid #1e3a4a",
  borderRadius: 3,
};
const SEC_HEAD = {
  padding: "12px 16px",
  borderBottom: "1px solid #1e3a4a",
  fontFamily: "ui-monospace, Consolas, monospace",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  color: "#7a9ab0",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const EMPTY_REQ = {
  skillId: "",
  requiredEmployeeCount: 1,
  hourlyRate: "",
  expectedHoursPerDay: "",
  minProficiency: 1,
  startDate: "",
  endDate: "",
};
const EMPTY_MILESTONE = {
  sequenceOrder: 1,
  label: "",
  thresholdPercent: "",
  amount: "",
};

function eachDate(startDate, endDate) {
  const days = [];
  const cur = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export default function ContractDetail() {
  const { id } = useParams();

  const contract = useFetch(() => getContract(id), [id]);
  const requirements = useFetch(() => getRequirements(id), [id]);
  const skills = useFetch(getSkills, []);
  const milestones = useFetch(() => getMilestonesByContract(id), [id]);
  const assignmentsAll = useFetch(() => getAssignmentsByContract(id), [id]);

  // Add-requirement drawer
  const [reqDrawer, setReqDrawer] = useState(false);
  const [reqForm, setReqForm] = useState(EMPTY_REQ);
  const [reqError, setReqError] = useState(null);
  const [reqSaving, setReqSaving] = useState(false);

  // Assign drawer
  const [assignReq, setAssignReq] = useState(null);
  const [eligibles, setEligibles] = useState([]);
  const [eligLoading, setEligLoading] = useState(false);
  const [assignForm, setAssignForm] = useState({
    employeeId: "",
    plannedStartTime: "09:00",
    plannedEndTime: "17:00",
  });
  const [assignError, setAssignError] = useState(null);
  const [assigning, setAssigning] = useState(false);

  // Add-milestone drawer
  const [msDrawer, setMsDrawer] = useState(false);
  const [msForm, setMsForm] = useState(EMPTY_MILESTONE);
  const [msError, setMsError] = useState(null);
  const [msSaving, setMsSaving] = useState(false);

  const [autoAssignOpen, setAutoAssignOpen] = useState(false);

  const [actionError, setActionError] = useState(null);

  // Task management
  const [taskMs, setTaskMs] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskError, setTaskError] = useState(null);
  const [addTaskForm, setAddTaskForm] = useState({ name: '', assignedToUserId: '' });
  const [addingTask, setAddingTask] = useState(false);
  const [subtaskOf, setSubtaskOf] = useState(null);
  const [addSubForm, setAddSubForm] = useState({ name: '', assignedToUserId: '' });
  const [addingSubtask, setAddingSubtask] = useState(false);
  const users = useFetch(getEmployees, []);

  const c = contract.data;
  const reqs = requirements.data ?? [];
  const msList = milestones.data ?? [];
  const asgAll = assignmentsAll.data ?? [];
  const isMilestone = c?.billingTypeCode === "MILESTONE";

  const calendarEvents = useMemo(
    () =>
      asgAll
        .filter((a) => a.status === "ACTIVE")
        .flatMap((a) =>
          eachDate(a.startDate, a.endDate).map((d) => ({
            id: `${a.id}-${d}`,
            title: `${a.employeeName} · ${a.skillName}`,
            start: `${d}T${a.plannedStartTime}`,
            end: `${d}T${a.plannedEndTime}`,
            extendedProps: { assignment: a, workDate: d },
          })),
        ),
    [asgAll],
  );

  async function handleAddRequirement(e) {
    e.preventDefault();
    setReqSaving(true);
    setReqError(null);
    try {
      await createRequirement(id, {
        skillId: reqForm.skillId,
        requiredEmployeeCount: parseInt(reqForm.requiredEmployeeCount, 10),
        hourlyRate: parseFloat(reqForm.hourlyRate),
        expectedHoursPerDay: parseFloat(reqForm.expectedHoursPerDay),
        minProficiency: parseInt(reqForm.minProficiency, 10),
        startDate: reqForm.startDate,
        endDate: reqForm.endDate,
      });
      setReqDrawer(false);
      requirements.reload();
    } catch (err) {
      setReqError(
        err?.response?.data?.message ??
          err?.message ??
          "Failed to add requirement",
      );
    } finally {
      setReqSaving(false);
    }
  }

  async function openAssignDrawer(req) {
    setAssignReq(req);
    setAssignForm({
      employeeId: "",
      plannedStartTime: "09:00",
      plannedEndTime: "17:00",
    });
    setAssignError(null);
    setEligLoading(true);
    setEligibles([]);
    try {
      const list = await getEligibleEmployees(
        req.id,
        req.startDate,
        req.endDate,
      );
      setEligibles(Array.isArray(list) ? list : []);
    } catch {
      setEligibles([]);
    } finally {
      setEligLoading(false);
    }
  }

  async function handleAssign(e) {
    e.preventDefault();
    if (!assignForm.employeeId) {
      setAssignError("Select an employee");
      return;
    }
    setAssigning(true);
    setAssignError(null);
    try {
      await createAssignment({
        employeeId: assignForm.employeeId,
        requirementId: assignReq.id,
        startDate: assignReq.startDate,
        endDate: assignReq.endDate,
        plannedStartTime: assignForm.plannedStartTime
          ? assignForm.plannedStartTime + ":00"
          : undefined,
        plannedEndTime: assignForm.plannedEndTime
          ? assignForm.plannedEndTime + ":00"
          : undefined,
      });
      setAssignReq(null);
      requirements.reload();
      assignmentsAll.reload();
    } catch (err) {
      setAssignError(
        err?.response?.data?.message ?? err?.message ?? "Assignment failed",
      );
    } finally {
      setAssigning(false);
    }
  }

  async function handleCancelAssignment(asgId) {
    setActionError(null);
    try {
      await cancelAssignment(asgId);
      requirements.reload();
      assignmentsAll.reload();
    } catch (err) {
      setActionError(
        err?.response?.data?.message ?? err?.message ?? "Cancel failed",
      );
    }
  }

  async function handleAddMilestone(e) {
    e.preventDefault();
    setMsSaving(true);
    setMsError(null);
    try {
      await createMilestone(id, {
        sequenceOrder: parseInt(msForm.sequenceOrder, 10),
        label: msForm.label,
        thresholdPercent:
          msForm.thresholdPercent === ""
            ? null
            : parseFloat(msForm.thresholdPercent),
        amount: parseFloat(msForm.amount),
      });
      setMsDrawer(false);
      milestones.reload();
    } catch (err) {
      setMsError(
        err?.response?.data?.message ??
          err?.message ??
          "Failed to add milestone",
      );
    } finally {
      setMsSaving(false);
    }
  }

  async function handleMarkReached(msId) {
    setActionError(null);
    try {
      await markMilestoneReached(msId);
      milestones.reload();
    } catch (err) {
      setActionError(
        err?.response?.data?.message ?? err?.message ?? "Mark failed",
      );
    }
  }

  async function openTaskDrawer(ms) {
    setTaskMs(ms);
    setTaskError(null);
    setSubtaskOf(null);
    setAddTaskForm({ name: '', assignedToUserId: '' });
    setTasksLoading(true);
    try {
      const list = await getTasksByMilestone(ms.id);
      setTasks(Array.isArray(list) ? list : []);
    } catch (err) {
      setTaskError(err?.response?.data?.message ?? 'Failed to load tasks');
    } finally {
      setTasksLoading(false);
    }
  }

  async function reloadTasks(msId) {
    try {
      const list = await getTasksByMilestone(msId);
      setTasks(Array.isArray(list) ? list : []);
      milestones.reload();
    } catch (err) {
      setTaskError(err?.response?.data?.message ?? 'Failed to reload tasks');
    }
  }

  async function handleAddTask(e) {
    e.preventDefault();
    setAddingTask(true);
    setTaskError(null);
    try {
      await createRootTask(taskMs.id, {
        name: addTaskForm.name,
        assignedToUserId: addTaskForm.assignedToUserId || undefined,
      });
      setAddTaskForm({ name: '', assignedToUserId: '' });
      await reloadTasks(taskMs.id);
    } catch (err) {
      setTaskError(err?.response?.data?.message ?? 'Failed to add task');
    } finally {
      setAddingTask(false);
    }
  }

  async function handleAddSubtask(e) {
    e.preventDefault();
    setAddingSubtask(true);
    setTaskError(null);
    try {
      await createSubtask(subtaskOf, {
        name: addSubForm.name,
        assignedToUserId: addSubForm.assignedToUserId || undefined,
      });
      setSubtaskOf(null);
      setAddSubForm({ name: '', assignedToUserId: '' });
      await reloadTasks(taskMs.id);
    } catch (err) {
      setTaskError(err?.response?.data?.message ?? 'Failed to add subtask');
    } finally {
      setAddingSubtask(false);
    }
  }

  async function handleTaskStatus(taskId, status) {
    setTaskError(null);
    try {
      await updateTaskStatus(taskId, status);
      await reloadTasks(taskMs.id);
    } catch (err) {
      setTaskError(err?.response?.data?.message ?? 'Failed to update task');
    }
  }

  if (contract.loading) {
    return (
      <div style={{ padding: 40, color: "#7a9ab0", fontFamily: "monospace" }}>
        Loading...
      </div>
    );
  }
  if (contract.error) {
    return (
      <div style={{ padding: 40 }}>
        <div style={ERR}>ERROR: {contract.error}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={c?.title ?? "Contract"}
        subtitle={`${c?.companyName ?? ""} · ${c?.billingTypeLabel ?? c?.billingTypeCode ?? ""}`}
      />
      <div style={{ padding: "24px 32px" }}>
        {actionError && <div style={ERR}>ERROR: {actionError}</div>}

        {/* Contract info */}
        <div
          style={{
            ...SECTION,
            marginBottom: 28,
            padding: "16px 20px",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 20,
          }}
        >
          {[
            ["Client", c?.companyName ?? "—"],
            ["Billing Type", c?.billingTypeLabel ?? c?.billingTypeCode ?? "—"],
            ["Start Date", c?.startDate],
            ["End Date", c?.endDate],
          ].map(([lbl, val]) => (
            <div key={lbl}>
              <div style={{ ...LABEL, marginBottom: 4 }}>{lbl}</div>
              <div
                style={{
                  fontFamily: "ui-monospace, Consolas, monospace",
                  fontSize: 13,
                  color: "#f0f2f5",
                }}
              >
                {val ?? "—"}
              </div>
            </div>
          ))}
        </div>

        {/* Requirements */}
        <div style={SECTION}>
          <div style={SEC_HEAD}>
            <span>REQUIREMENTS</span>
            <div style={{ display: "flex", gap: 8 }}>
              {reqs.some((r) => r.remainingSlots > 0) && (
                <Btn
                  small
                  variant="approve"
                  onClick={() => setAutoAssignOpen(true)}
                >
                  AUTO ASSIGN
                </Btn>
              )}
              <Btn
                small
                onClick={() => {
                  setReqForm(EMPTY_REQ);
                  setReqError(null);
                  setReqDrawer(true);
                }}
              >
                + ADD REQUIREMENT
              </Btn>
            </div>
          </div>
          {requirements.loading ? (
            <div
              style={{
                padding: 16,
                color: "#7a9ab0",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            >
              Loading...
            </div>
          ) : reqs.length === 0 ? (
            <div
              style={{
                padding: 16,
                color: "#7a9ab0",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            >
              No requirements defined
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Min Prof.</th>
                  <th>Required</th>
                  <th>Fulfilled</th>
                  <th>Remaining</th>
                  <th>Hourly Rate</th>
                  <th>Hrs/Day</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reqs.map((req) => (
                  <RequirementRow
                    key={req.id}
                    req={req}
                    onAssign={() => openAssignDrawer(req)}
                    onCancel={handleCancelAssignment}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Assignment calendar */}
        <div style={SECTION}>
          <div style={SEC_HEAD}>
            <span>ASSIGNMENT CALENDAR</span>
            <span style={{ color: "#7a9ab0", fontSize: 10 }}>
              {asgAll.filter((a) => a.status === "ACTIVE").length} active
            </span>
          </div>
          <div style={{ padding: 16 }}>
            {assignmentsAll.loading ? (
              <div
                style={{
                  color: "#7a9ab0",
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              >
                Loading...
              </div>
            ) : (
              <Calendar
                events={calendarEvents}
                view="timeGridWeek"
                onEventClick={(info) => {
                  const asg = info.event.extendedProps.assignment;
                  if (
                    confirm(
                      `Cancel assignment for ${asg.employeeName} on ${asg.startDate}?`,
                    )
                  ) {
                    handleCancelAssignment(asg.id);
                  }
                }}
                height={520}
              />
            )}
          </div>
        </div>

        {/* Milestones — only for MILESTONE contracts */}
        {isMilestone && (
          <div style={SECTION}>
            <div style={SEC_HEAD}>
              <span>MILESTONES</span>
              <Btn
                small
                onClick={() => {
                  const nextSeq =
                    (msList[msList.length - 1]?.sequenceOrder ?? 0) + 1;
                  setMsForm({ ...EMPTY_MILESTONE, sequenceOrder: nextSeq });
                  setMsError(null);
                  setMsDrawer(true);
                }}
              >
                + ADD MILESTONE
              </Btn>
            </div>
            {milestones.loading ? (
              <div
                style={{
                  padding: 16,
                  color: "#7a9ab0",
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              >
                Loading...
              </div>
            ) : msList.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  color: "#7a9ab0",
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              >
                No milestones defined
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Label</th>
                    <th>Threshold %</th>
                    <th>Amount</th>
                    <th>Tasks</th>
                    <th>Status</th>
                    <th>Marked At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {msList.map((m) => (
                    <tr key={m.id}>
                      <td style={{ color: "#7a9ab0" }}>{m.sequenceOrder}</td>
                      <td style={{ color: "#f0f2f5", fontWeight: 600 }}>
                        {m.label}
                      </td>
                      <td>
                        {m.thresholdPercent != null
                          ? `${m.thresholdPercent}%`
                          : "—"}
                      </td>
                      <td style={{ color: "#ff6b00", fontWeight: 700 }}>
                        ${Number(m.amount).toFixed(2)}
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: 11 }}>
                        {m.totalTasks > 0 ? (
                          <span style={{ color: m.completedTasks === m.totalTasks ? "#00c851" : "#7a9ab0" }}>
                            {m.completedTasks}/{m.totalTasks}
                          </span>
                        ) : (
                          <span style={{ color: "#3a5a6a" }}>—</span>
                        )}
                      </td>
                      <td>
                        <StatusPill value={m.status} />
                      </td>
                      <td>
                        {m.markedAt?.replace("T", " ").slice(0, 16) ?? "—"}
                      </td>
                      <td style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {m.status === "PENDING" && (
                          <>
                            <Btn small variant="ghost" onClick={() => openTaskDrawer(m)}>
                              TASKS
                            </Btn>
                            {m.totalTasks === 0 && (
                              <Btn small variant="approve" onClick={() => handleMarkReached(m.id)}>
                                MARK REACHED
                              </Btn>
                            )}
                          </>
                        )}
                        {m.status === "REACHED" && (
                          <span style={{ color: "#fab43c", fontFamily: "monospace", fontSize: 11 }}>
                            AWAITING FINANCE
                          </span>
                        )}
                        {m.status === "APPROVED_INVOICED" && (
                          <span style={{ color: "#00c851", fontFamily: "monospace", fontSize: 11 }}>
                            INVOICED
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Assign Employee Drawer */}
      <Drawer
        open={!!assignReq}
        onClose={() => setAssignReq(null)}
        title="ASSIGN EMPLOYEE"
        width={540}
      >
        {assignError && <div style={ERR}>ERROR: {assignError}</div>}
        <div
          style={{
            marginBottom: 16,
            color: "#7a9ab0",
            fontFamily: "monospace",
            fontSize: 11,
          }}
        >
          Requirement: {assignReq?.skillName} · min proficiency{" "}
          {assignReq?.minProficiency ?? 1}
        </div>
        {eligLoading ? (
          <div
            style={{
              color: "#7a9ab0",
              fontFamily: "monospace",
              fontSize: 12,
              marginBottom: 16,
            }}
          >
            Loading eligible employees...
          </div>
        ) : eligibles.length === 0 ? (
          <div
            style={{
              color: "#7a9ab0",
              fontFamily: "monospace",
              fontSize: 12,
              marginBottom: 16,
            }}
          >
            No eligible employees found
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <div style={{ ...LABEL, marginBottom: 8 }}>Eligible Employees</div>
            <table style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Skills</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {eligibles.map((emp) => (
                  <tr
                    key={emp.id}
                    style={{
                      cursor: "pointer",
                      background:
                        assignForm.employeeId === emp.id ? "#ff6b0010" : "",
                    }}
                    onClick={() =>
                      setAssignForm((f) => ({ ...f, employeeId: emp.id }))
                    }
                  >
                    <td
                      style={{
                        color:
                          assignForm.employeeId === emp.id
                            ? "#ff6b00"
                            : "#f0f2f5",
                      }}
                    >
                      {emp.firstName} {emp.lastName}
                    </td>
                    <td style={{ color: "#7a9ab0", fontSize: 11 }}>
                      {(emp.skills ?? [])
                        .map((s) => s.skillName ?? s.name)
                        .join(", ") || "—"}
                    </td>
                    <td>
                      {assignForm.employeeId === emp.id && (
                        <span
                          style={{
                            color: "#ff6b00",
                            fontSize: 10,
                            fontFamily: "monospace",
                          }}
                        >
                          SELECTED
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={handleAssign}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div>
              <label style={LABEL}>Planned Start Time</label>
              <input
                type="time"
                value={assignForm.plannedStartTime}
                onChange={(e) =>
                  setAssignForm((f) => ({
                    ...f,
                    plannedStartTime: e.target.value,
                  }))
                }
                required
              />
            </div>
            <div>
              <label style={LABEL}>Planned End Time</label>
              <input
                type="time"
                value={assignForm.plannedEndTime}
                onChange={(e) =>
                  setAssignForm((f) => ({
                    ...f,
                    plannedEndTime: e.target.value,
                  }))
                }
                required
              />
            </div>
          </div>
          <Btn type="submit" disabled={assigning || !assignForm.employeeId}>
            {assigning ? "ASSIGNING..." : "CONFIRM ASSIGNMENT"}
          </Btn>
        </form>
      </Drawer>

      {/* Add Requirement Drawer */}
      <Drawer
        open={reqDrawer}
        onClose={() => setReqDrawer(false)}
        title="ADD REQUIREMENT"
        width={480}
      >
        {reqError && <div style={ERR}>ERROR: {reqError}</div>}
        <form onSubmit={handleAddRequirement}>
          <div style={FIELD}>
            <label style={LABEL}>Skill</label>
            <select
              value={reqForm.skillId}
              onChange={(e) =>
                setReqForm((f) => ({ ...f, skillId: e.target.value }))
              }
              required
            >
              <option value="">— Select skill —</option>
              {(skills.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div>
              <label style={LABEL}>Required Count</label>
              <input
                type="number"
                min="1"
                value={reqForm.requiredEmployeeCount}
                onChange={(e) =>
                  setReqForm((f) => ({
                    ...f,
                    requiredEmployeeCount: e.target.value,
                  }))
                }
                required
              />
            </div>
            <div>
              <label style={LABEL}>Min Proficiency (1-5)</label>
              <input
                type="number"
                min="1"
                max="5"
                value={reqForm.minProficiency}
                onChange={(e) =>
                  setReqForm((f) => ({ ...f, minProficiency: e.target.value }))
                }
                required
              />
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div>
              <label style={LABEL}>Hourly Rate ($)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={reqForm.hourlyRate}
                onChange={(e) =>
                  setReqForm((f) => ({ ...f, hourlyRate: e.target.value }))
                }
                required
              />
            </div>
            <div>
              <label style={LABEL}>Hours / Day</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={reqForm.expectedHoursPerDay}
                onChange={(e) =>
                  setReqForm((f) => ({
                    ...f,
                    expectedHoursPerDay: e.target.value,
                  }))
                }
                required
              />
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div>
              <label style={LABEL}>Start Date</label>
              <input
                type="date"
                value={reqForm.startDate}
                onChange={(e) =>
                  setReqForm((f) => ({ ...f, startDate: e.target.value }))
                }
                required
              />
            </div>
            <div>
              <label style={LABEL}>End Date</label>
              <input
                type="date"
                value={reqForm.endDate}
                onChange={(e) =>
                  setReqForm((f) => ({ ...f, endDate: e.target.value }))
                }
                required
              />
            </div>
          </div>
          <Btn type="submit" disabled={reqSaving}>
            {reqSaving ? "SAVING..." : "ADD REQUIREMENT"}
          </Btn>
        </form>
      </Drawer>

      {/* Auto Assign Drawer */}
      <AutoAssignDrawer
        contractId={id}
        open={autoAssignOpen}
        onClose={() => setAutoAssignOpen(false)}
        onSuccess={() => {
          requirements.reload();
          assignmentsAll.reload();
        }}
      />

      {/* Task Management Drawer */}
      <Drawer
        open={!!taskMs}
        onClose={() => setTaskMs(null)}
        title={taskMs ? `TASKS · ${taskMs.label}` : "TASKS"}
        width={520}
      >
        {taskError && <div style={ERR}>ERROR: {taskError}</div>}
        {tasksLoading ? (
          <div style={{ color: "#7a9ab0", fontFamily: "monospace", fontSize: 12, marginBottom: 16 }}>
            Loading...
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ color: "#7a9ab0", fontFamily: "monospace", fontSize: 12, marginBottom: 16 }}>
            No tasks yet. Add one below.
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            {tasks.filter(t => !t.parentId).map(root => (
              <TaskRow
                key={root.id}
                task={root}
                subtasks={tasks.filter(t => t.parentId === root.id)}
                users={users.data ?? []}
                subtaskOf={subtaskOf}
                addSubForm={addSubForm}
                addingSubtask={addingSubtask}
                onStatus={handleTaskStatus}
                onAddSubtask={setSubtaskOf}
                onSubFormChange={setAddSubForm}
                onSubSubmit={handleAddSubtask}
              />
            ))}
          </div>
        )}
        <div style={{ borderTop: "1px solid #1e3a4a", paddingTop: 16 }}>
          <div style={{ ...LABEL, marginBottom: 10 }}>ADD TASK</div>
          <form onSubmit={handleAddTask}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={LABEL}>Name</label>
                <input
                  value={addTaskForm.name}
                  onChange={e => setAddTaskForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Task name"
                  required
                />
              </div>
              <div>
                <label style={LABEL}>Assign To</label>
                <select
                  value={addTaskForm.assignedToUserId}
                  onChange={e => setAddTaskForm(f => ({ ...f, assignedToUserId: e.target.value }))}
                >
                  <option value="">— Unassigned —</option>
                  {(users.data ?? []).filter(e => e.userId).map(e => (
                    <option key={e.userId} value={e.userId}>{e.firstName} {e.lastName}</option>
                  ))}
                </select>
              </div>
            </div>
            <Btn type="submit" small disabled={addingTask}>
              {addingTask ? "ADDING..." : "+ ADD TASK"}
            </Btn>
          </form>
        </div>
      </Drawer>

      {/* Add Milestone Drawer */}
      <Drawer
        open={msDrawer}
        onClose={() => setMsDrawer(false)}
        title="ADD MILESTONE"
      >
        {msError && <div style={ERR}>ERROR: {msError}</div>}
        <form onSubmit={handleAddMilestone}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div>
              <label style={LABEL}>Sequence #</label>
              <input
                type="number"
                min="1"
                value={msForm.sequenceOrder}
                onChange={(e) =>
                  setMsForm((f) => ({ ...f, sequenceOrder: e.target.value }))
                }
                required
              />
            </div>
            <div>
              <label style={LABEL}>Label</label>
              <input
                value={msForm.label}
                onChange={(e) =>
                  setMsForm((f) => ({ ...f, label: e.target.value }))
                }
                required
                placeholder="e.g. 25% MVP delivery"
              />
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div>
              <label style={LABEL}>Threshold % (optional)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={msForm.thresholdPercent}
                onChange={(e) =>
                  setMsForm((f) => ({ ...f, thresholdPercent: e.target.value }))
                }
              />
            </div>
            <div>
              <label style={LABEL}>Amount ($)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={msForm.amount}
                onChange={(e) =>
                  setMsForm((f) => ({ ...f, amount: e.target.value }))
                }
                required
              />
            </div>
          </div>
          <Btn type="submit" disabled={msSaving}>
            {msSaving ? "SAVING..." : "ADD MILESTONE"}
          </Btn>
        </form>
      </Drawer>
    </div>
  );
}

function TaskRow({ task, subtasks, users, subtaskOf, addSubForm, addingSubtask, onStatus, onAddSubtask, onSubFormChange, onSubSubmit }) {
  const statusColor = task.status === 'DONE' ? '#00c851' : task.status === 'IN_PROGRESS' ? '#fab43c' : '#7a9ab0'
  const assignedUser = users.find(e => e.userId === task.assignedToUserId)
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#0d1b2a', border: '1px solid #1e3a4a', borderRadius: 3 }}>
        <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: task.status === 'DONE' ? '#3a5a6a' : '#f0f2f5', textDecoration: task.status === 'DONE' ? 'line-through' : 'none' }}>
          {task.name}
        </span>
        {assignedUser && (
          <span style={{ fontSize: 10, color: '#7a9ab0', fontFamily: 'monospace' }}>{assignedUser.firstName} {assignedUser.lastName}</span>
        )}
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: statusColor, fontWeight: 700 }}>{task.status}</span>
        {task.status === 'PENDING' && (
          <Btn small variant="ghost" onClick={() => onStatus(task.id, 'IN_PROGRESS')}>START</Btn>
        )}
        {task.status !== 'DONE' && (
          <Btn small variant="approve" onClick={() => onStatus(task.id, 'DONE')}>DONE</Btn>
        )}
        {task.status !== 'DONE' && (
          <Btn small variant="ghost" onClick={() => onAddSubtask(subtaskOf === task.id ? null : task.id)}>+ SUB</Btn>
        )}
      </div>
      {subtaskOf === task.id && (
        <form onSubmit={onSubSubmit} style={{ display: 'flex', gap: 8, padding: '6px 10px 6px 24px', background: '#08131c', border: '1px solid #1e3a4a', borderTop: 'none' }}>
          <input
            value={addSubForm.name}
            onChange={e => onSubFormChange(f => ({ ...f, name: e.target.value }))}
            placeholder="Subtask name"
            required
            style={{ flex: 1, fontSize: 11 }}
          />
          <select
            value={addSubForm.assignedToUserId}
            onChange={e => onSubFormChange(f => ({ ...f, assignedToUserId: e.target.value }))}
            style={{ fontSize: 11, width: 120 }}
          >
            <option value="">Unassigned</option>
            {users.filter(e => e.userId).map(e => <option key={e.userId} value={e.userId}>{e.firstName} {e.lastName}</option>)}
          </select>
          <Btn small type="submit" disabled={addingSubtask}>{addingSubtask ? '...' : 'ADD'}</Btn>
        </form>
      )}
      {subtasks.map(sub => (
        <div key={sub.id} style={{ paddingLeft: 20 }}>
          <TaskRow
            task={sub}
            subtasks={[]}
            users={users}
            subtaskOf={subtaskOf}
            addSubForm={addSubForm}
            addingSubtask={addingSubtask}
            onStatus={onStatus}
            onAddSubtask={onAddSubtask}
            onSubFormChange={onSubFormChange}
            onSubSubmit={onSubSubmit}
          />
        </div>
      ))}
    </div>
  )
}

function RequirementRow({ req, onAssign, onCancel }) {
  const assignments = useFetch(
    () => getAssignmentsByRequirement(req.id),
    [req.id],
  );
  const asgList = assignments.data ?? [];
  const [expanded, setExpanded] = useState(false);
  const activeCount = asgList.filter((a) => a.status !== "CANCELLED").length;

  return (
    <>
      <tr>
        <td style={{ color: "#f0f2f5" }}>{req.skillName ?? "—"}</td>
        <td style={{ color: "#ff6b00" }}>≥ {req.minProficiency ?? 1}</td>
        <td>{req.requiredEmployeeCount ?? 1}</td>
        <td style={{ color: "#00c851" }}>{activeCount}</td>
        <td style={{ color: "#ff6b00" }}>
          {Math.max(0, (req.requiredEmployeeCount ?? 1) - activeCount)}
        </td>
        <td>{req.hourlyRate != null ? `$${req.hourlyRate}` : "—"}</td>
        <td>{req.expectedHoursPerDay ?? "—"}</td>
        <td>{req.startDate}</td>
        <td>{req.endDate}</td>
        <td style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Btn small onClick={onAssign}>
            ASSIGN
          </Btn>
          <Btn small variant="ghost" onClick={() => setExpanded((x) => !x)}>
            {expanded ? "HIDE" : "ASSIGNMENTS"}
          </Btn>
        </td>
      </tr>
      {expanded &&
        asgList.map((a) => (
          <tr key={a.id} style={{ background: "#08131c" }}>
            <td
              colSpan={8}
              style={{ paddingLeft: 32, color: "#7a9ab0", fontSize: 11 }}
            >
              {a.employeeName ?? a.employeeId} · {a.startDate} → {a.endDate} ·{" "}
              {a.plannedStartTime}–{a.plannedEndTime}
            </td>
            <td>
              <StatusPill value={a.status} />
            </td>
            <td>
              {a.status !== "CANCELLED" && (
                <Btn small variant="danger" onClick={() => onCancel(a.id)}>
                  CANCEL
                </Btn>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}
