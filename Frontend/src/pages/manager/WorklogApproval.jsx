import { Fragment, useMemo, useState } from "react";
import { getPendingWorklogs, approveWorklog } from "../../api";
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

function todayInputValue() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function addYearsInputValue(dateStr, years) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setFullYear(d.getFullYear() + years);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function totalHours(segments) {
  if (!segments?.length) return "—";
  let mins = 0;
  for (const s of segments) {
    const [sh, sm] = s.startTime.split(":").map(Number);
    const [eh, em] = s.endTime.split(":").map(Number);
    mins += eh * 60 + em - (sh * 60 + sm);
  }
  return (mins / 60).toFixed(2);
}

export default function WorklogApproval() {
  const [from, setFrom] = useState(todayInputValue);
  const [to, setTo] = useState(() => addYearsInputValue(todayInputValue(), 1));
  const [view, setView] = useState("calendar");
  const [expanded, setExpanded] = useState({});
  const [rejecting, setRejecting] = useState({});
  const [actionError, setActionError] = useState(null);
  const [acting, setActing] = useState(null);

  const { data, loading, error, reload } = useFetch(
    () => getPendingWorklogs(from, to),
    [from, to],
  );

  const submitted = (data ?? []).filter((w) => w.status === "SUBMITTED");

  const events = useMemo(
    () =>
      submitted.flatMap((w) =>
        (w.segments ?? []).map((seg, i) => ({
          id: `${w.id}-${i}`,
          title: `${w.employeeName ?? "Employee"}`,
          start: `${w.workDate}T${seg.startTime}`,
          end: `${w.workDate}T${seg.endTime}`,
          classNames: ["wb-submitted"],
          extendedProps: { worklog: w },
        })),
      ),
    [submitted],
  );

  function toggleExpand(id) {
    setExpanded((x) => ({ ...x, [id]: !x[id] }));
  }
  function startReject(id) {
    setRejecting((r) => ({ ...r, [id]: "" }));
  }

  async function handleAction(id, approved, reason) {
    setActing(id);
    setActionError(null);
    try {
      await approveWorklog(id, { approved, rejectionReason: reason ?? null });
      setRejecting((r) => {
        const n = { ...r };
        delete n[id];
        return n;
      });
      reload();
    } catch (err) {
      setActionError(
        err?.response?.data?.message ?? err?.message ?? "Action failed",
      );
    } finally {
      setActing(null);
    }
  }

  function onEventClick(info) {
    const w = info.event.extendedProps.worklog;
    if (
      confirm(
        `Approve worklog for ${w.employeeName} on ${w.workDate}?\n\nCancel to reject.`,
      )
    ) {
      handleAction(w.id, true, null);
    } else {
      const reason = prompt("Rejection reason:");
      if (reason && reason.trim()) handleAction(w.id, false, reason.trim());
    }
  }

  return (
    <div>
      <PageHeader
        title="Worklog Approvals"
        subtitle="Review submitted timesheets"
      />
      <div style={{ padding: "24px 32px" }}>
        {(error || actionError) && (
          <div style={ERR}>ERROR: {error || actionError}</div>
        )}

        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "flex-end",
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <label style={LABEL}>From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{ width: 160 }}
            />
          </div>
          <div>
            <label style={LABEL}>To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{ width: 160 }}
            />
          </div>
          <Btn variant="ghost" onClick={reload}>
            REFRESH
          </Btn>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              color: "#7a9ab0",
              alignSelf: "center",
            }}
          >
            {loading ? "..." : `${submitted.length} pending`}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
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
        </div>

        {loading ? (
          <div
            style={{ color: "#7a9ab0", fontFamily: "monospace", fontSize: 12 }}
          >
            Loading...
          </div>
        ) : submitted.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 0",
              color: "#7a9ab0",
              fontFamily: "monospace",
              fontSize: 13,
            }}
          >
            No pending worklogs in this date range
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
                <th>Employee</th>
                <th>Date</th>
                <th>Total Hours</th>
                <th>Status</th>
                <th>Segments</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {submitted.map((w) => (
                <Fragment key={w.id}>
                  <tr>
                    <td style={{ color: "#f0f2f5" }}>
                      {w.employeeName ?? w.employeeId ?? "—"}
                    </td>
                    <td>{w.workDate}</td>
                    <td style={{ color: "#ff6b00", fontWeight: 700 }}>
                      {(w.totalActualMinutes / 60).toFixed(2) ||
                        totalHours(w.segments)}
                      h
                    </td>
                    <td>
                      <StatusPill value={w.status} />
                    </td>
                    <td>
                      {w.segments?.length > 0 && (
                        <Btn
                          small
                          variant="ghost"
                          onClick={() => toggleExpand(w.id)}
                        >
                          {expanded[w.id] ? "HIDE" : `${w.segments.length} SEG`}
                        </Btn>
                      )}
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        {rejecting[w.id] === undefined ? (
                          <>
                            <Btn
                              small
                              variant="approve"
                              disabled={acting === w.id}
                              onClick={() => handleAction(w.id, true, null)}
                            >
                              APPROVE
                            </Btn>
                            <Btn
                              small
                              variant="reject"
                              onClick={() => startReject(w.id)}
                            >
                              REJECT
                            </Btn>
                          </>
                        ) : (
                          <>
                            <input
                              value={rejecting[w.id]}
                              onChange={(e) =>
                                setRejecting((r) => ({
                                  ...r,
                                  [w.id]: e.target.value,
                                }))
                              }
                              placeholder="Rejection reason"
                              style={{ width: 180, fontSize: 11 }}
                            />
                            <Btn
                              small
                              variant="reject"
                              disabled={acting === w.id || !rejecting[w.id]}
                              onClick={() =>
                                handleAction(w.id, false, rejecting[w.id])
                              }
                            >
                              CONFIRM
                            </Btn>
                            <Btn
                              small
                              variant="ghost"
                              onClick={() =>
                                setRejecting((r) => {
                                  const n = { ...r };
                                  delete n[w.id];
                                  return n;
                                })
                              }
                            >
                              CANCEL
                            </Btn>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded[w.id] &&
                    w.segments?.map((seg, i) => (
                      <tr
                        key={`${w.id}-seg-${i}`}
                        style={{ background: "#08131c" }}
                      >
                        <td
                          colSpan={2}
                          style={{
                            paddingLeft: 32,
                            color: "#7a9ab0",
                            fontSize: 11,
                          }}
                        >
                          Segment {i + 1}
                        </td>
                        <td
                          colSpan={4}
                          style={{ color: "#7a9ab0", fontSize: 11 }}
                        >
                          {seg.startTime} → {seg.endTime}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
