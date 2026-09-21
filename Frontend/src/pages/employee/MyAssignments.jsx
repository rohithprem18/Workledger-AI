import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { getMyAssignments, getMyTasks, updateTaskStatus } from "../../api";
import { useFetch } from "../../hooks/useFetch";
import PageHeader from "../../components/PageHeader";
import Btn from "../../components/Btn";
import StatusPill from "../../components/StatusPill";
import Calendar from "../../components/Calendar";

const ERR = {
  padding: "10px 16px",
  background: "#ef444415",
  color: "#ef4444",
  borderLeft: "2px solid #ef4444",
  marginBottom: 16,
  fontFamily: "monospace",
  fontSize: 12,
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

export default function MyAssignments() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const empId = user?.employeeId ?? null;
  const [view, setView] = useState("calendar");

  const { data, loading, error } = useFetch(
    () => (empId ? getMyAssignments(empId) : Promise.resolve([])),
    [empId],
  );
  const myTasks = useFetch(getMyTasks, []);
  const [taskActionError, setTaskActionError] = useState(null);

  async function handleTaskStatus(taskId, status) {
    setTaskActionError(null);
    try {
      await updateTaskStatus(taskId, status);
      myTasks.reload();
    } catch (err) {
      setTaskActionError(err?.response?.data?.message ?? "Failed to update task");
    }
  }

  const assignments = data ?? [];

  const events = useMemo(
    () =>
      assignments
        .filter((a) => a.status === "ACTIVE")
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
  );

  if (!empId) {
    return (
      <div>
        <PageHeader title="My Assignments" subtitle="Active work assignments" />
        <div style={{ padding: "60px 32px", textAlign: "center" }}>
          <div
            style={{
              color: "#7a9ab0",
              fontFamily: "monospace",
              fontSize: 13,
              marginBottom: 8,
            }}
          >
            Employee profile not linked to this account.
          </div>
          <div
            style={{ color: "#7a9ab0", fontFamily: "monospace", fontSize: 11 }}
          >
            Contact HR to have your employee record associated with your login.
          </div>
        </div>
      </div>
    );
  }

  function onEventClick(info) {
    const { assignment, workDate } = info.event.extendedProps;
    navigate(`/my-worklogs/new?assignmentId=${assignment.id}&date=${workDate}`);
  }

  return (
    <div>
      <PageHeader
        title="My Assignments"
        subtitle="Active work assignments"
        action={
          <div style={{ display: "flex", gap: 6 }}>
            <Btn
              small
              variant={view === "calendar" ? "primary" : "ghost"}
              onClick={() => setView("calendar")}
            >
              CALENDAR
            </Btn>
            <Btn
              small
              variant={view === "list" ? "primary" : "ghost"}
              onClick={() => setView("list")}
            >
              LIST
            </Btn>
          </div>
        }
      />
      <div style={{ padding: "24px 32px" }}>
        {error && <div style={ERR}>ERROR: {error}</div>}

        {loading ? (
          <div
            style={{ color: "#7a9ab0", fontFamily: "monospace", fontSize: 12 }}
          >
            Loading...
          </div>
        ) : assignments.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 0",
              color: "#7a9ab0",
              fontFamily: "monospace",
              fontSize: 13,
            }}
          >
            No assignments found
          </div>
        ) : view === "calendar" ? (
          <Calendar
            events={events}
            view="timeGridWeek"
            onEventClick={onEventClick}
            height={640}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Skill</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Planned Start</th>
                <th>Planned End</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td style={{ color: "#f0f2f5", fontWeight: 600 }}>
                    {a.contractTitle ?? a.contractId ?? "—"}
                  </td>
                  <td>{a.skillName ?? "—"}</td>
                  <td>{a.startDate}</td>
                  <td>{a.endDate}</td>
                  <td>{a.plannedStartTime ?? "—"}</td>
                  <td>{a.plannedEndTime ?? "—"}</td>
                  <td>
                    <StatusPill value={a.status ?? "ACTIVE"} />
                  </td>
                  <td>
                    {a.status !== "CANCELLED" && (
                      <Btn
                        small
                        onClick={() =>
                          navigate(`/my-worklogs/new?assignmentId=${a.id}`)
                        }
                      >
                        SUBMIT LOG
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* My Tasks */}
      <div style={{ margin: "0 32px 32px", background: "#0d1b2a", border: "1px solid #1e3a4a", borderRadius: 3 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e3a4a", fontFamily: "ui-monospace, Consolas, monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#7a9ab0" }}>
          MY TASKS
        </div>
        {(taskActionError || myTasks.error) && (
          <div style={{ ...ERR, margin: "12px 16px 0" }}>ERROR: {taskActionError || myTasks.error}</div>
        )}
        {myTasks.loading ? (
          <div style={{ padding: 16, color: "#7a9ab0", fontFamily: "monospace", fontSize: 12 }}>Loading...</div>
        ) : (myTasks.data ?? []).length === 0 ? (
          <div style={{ padding: 16, color: "#7a9ab0", fontFamily: "monospace", fontSize: 12 }}>No tasks assigned to you</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Milestone</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(myTasks.data ?? []).map(t => (
                <tr key={t.id}>
                  <td style={{ color: t.status === "DONE" ? "#3a5a6a" : "#f0f2f5", textDecoration: t.status === "DONE" ? "line-through" : "none" }}>
                    {t.parentId && <span style={{ color: "#3a5a6a", marginRight: 6 }}>↳</span>}
                    {t.name}
                  </td>
                  <td style={{ color: "#7a9ab0", fontSize: 11, fontFamily: "monospace" }}>{t.milestoneId}</td>
                  <td>
                    <StatusPill value={t.status} />
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    {t.status === "PENDING" && (
                      <Btn small variant="ghost" onClick={() => handleTaskStatus(t.id, "IN_PROGRESS")}>START</Btn>
                    )}
                    {t.status !== "DONE" && (
                      <Btn small variant="approve" onClick={() => handleTaskStatus(t.id, "DONE")}>MARK DONE</Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
