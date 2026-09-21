import { useMemo, useState } from 'react'
import { getPendingWorklogs, approveWorklog } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Btn from '../../components/Btn'
import Drawer from '../../components/Drawer'
import Calendar from '../../components/Calendar'
import {
  Alert,
  Card,
  EmptyState,
  Field,
  LoadingRows,
  Tabs,
  errorText,
  fmtDate,
  fmtTime,
  hours,
  initials,
} from '../../components/ui'

function isoOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function toMinutes(t) {
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + m
}

/** A 24-hour strip with each logged segment drawn to scale. */
function DayStrip({ segments = [] }) {
  return (
    <div
      style={{
        position: 'relative',
        height: 10,
        borderRadius: 999,
        background: 'var(--well)',
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      {segments.map((s, i) => {
        const start = toMinutes(s.startTime)
        let end = toMinutes(s.endTime)
        if (end <= start) end = 1440
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${(start / 1440) * 100}%`,
              width: `${((end - start) / 1440) * 100}%`,
              background: 'var(--ink)',
              borderRadius: 999,
            }}
          />
        )
      })}
    </div>
  )
}

export default function WorklogApproval() {
  // Timesheets are logged after the fact, so the window reaches back.
  const [from, setFrom] = useState(() => isoOffset(-60))
  const [to, setTo] = useState(() => isoOffset(7))
  const [view, setView] = useState('queue')
  const [reviewing, setReviewing] = useState(null)
  const [reason, setReason] = useState('')
  const [rejectMode, setRejectMode] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [acting, setActing] = useState(null)

  const { data, loading, error, reload } = useFetch(() => getPendingWorklogs(from, to), [from, to])

  const submitted = useMemo(
    () =>
      (data ?? [])
        .filter((w) => w.status === 'SUBMITTED')
        .sort((a, b) => a.workDate.localeCompare(b.workDate)),
    [data],
  )
  const totalMinutes = submitted.reduce((n, w) => n + (w.totalActualMinutes ?? 0), 0)

  const events = useMemo(
    () =>
      submitted.flatMap((w) =>
        (w.segments ?? []).map((seg, i) => ({
          id: `${w.id}-${i}`,
          title: w.employeeName ?? 'Contractor',
          start: `${w.workDate}T${seg.startTime}`,
          end: `${w.workDate}T${seg.endTime}`,
          classNames: ['wb-submitted'],
          extendedProps: { worklog: w },
        })),
      ),
    [submitted],
  )

  function openReview(w, reject = false) {
    setReviewing(w)
    setRejectMode(reject)
    setReason('')
    setActionError(null)
  }

  async function decide(w, approved, why) {
    setActing(w.id)
    setActionError(null)
    try {
      await approveWorklog(w.id, { approved, rejectionReason: approved ? null : why })
      setReviewing(null)
      setNotice(
        approved
          ? `Approved ${hours(w.totalActualMinutes)} for ${w.employeeName} on ${fmtDate(w.workDate)}.`
          : `Returned ${w.employeeName}'s timesheet for ${fmtDate(w.workDate)}.`,
      )
      reload()
    } catch (err) {
      setActionError(errorText(err, 'Action failed'))
    } finally {
      setActing(null)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Delivery"
        title="Approvals"
        subtitle="Approved timesheets become the billing record — they are immutable once approved."
      />

      {error && <Alert>{error}</Alert>}
      {notice && (
        <Alert tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {!reviewing && actionError && <Alert>{actionError}</Alert>}

      <Card>
        <div className="card-header wrap">
          <div className="cluster">
            <Field label="From">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <Tabs
            value={view}
            onChange={setView}
            options={[
              { value: 'queue', label: 'Queue', count: submitted.length },
              { value: 'calendar', label: 'Calendar' },
            ]}
          />
        </div>

        {!loading && submitted.length > 0 && (
          <div className="card-body row between wrap gap-8" style={{ paddingBottom: 0 }}>
            <span className="t-sm t-body">
              <strong className="t-ink">{submitted.length}</strong> timesheets ·{' '}
              <strong className="t-ink">{hours(totalMinutes)}</strong> awaiting review
            </span>
            <Btn small variant="ghost" icon="refresh" onClick={reload}>
              Refresh
            </Btn>
          </div>
        )}

        {loading ? (
          <LoadingRows />
        ) : submitted.length === 0 ? (
          <EmptyState icon="checkCircle" title="Nothing to review">
            No submitted timesheets between {fmtDate(from)} and {fmtDate(to)}.
          </EmptyState>
        ) : view === 'calendar' ? (
          <div className="card-body">
            <Calendar
              events={events}
              view="timeGridWeek"
              initialDate={submitted[0]?.workDate}
              onEventClick={(info) => openReview(info.event.extendedProps.worklog)}
              height={620}
            />
          </div>
        ) : (
          <div className="list mt-12">
            {submitted.map((w) => (
              <div key={w.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <span className="avatar">{initials(w.employeeName ?? '')}</span>
                <div className="grow">
                  <div className="row between wrap gap-8">
                    <div>
                      <div className="t-label">{w.employeeName ?? 'Contractor'}</div>
                      <div className="t-sm t-mute">
                        {fmtDate(w.workDate)} · {(w.segments ?? []).length} segment
                        {(w.segments ?? []).length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="t-h3 t-num">{hours(w.totalActualMinutes)}</div>
                  </div>
                  <div className="mt-12">
                    <DayStrip segments={w.segments} />
                    <div className="cluster mt-8">
                      {(w.segments ?? []).map((s, i) => (
                        <span key={i} className="badge badge-outline badge-plain mono">
                          {fmtTime(s.startTime)}–{fmtTime(s.endTime)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="cluster mt-12">
                    <Btn
                      small
                      variant="approve"
                      icon="check"
                      loading={acting === w.id}
                      onClick={() => decide(w, true)}
                    >
                      Approve
                    </Btn>
                    <Btn small variant="reject" icon="x" onClick={() => openReview(w, true)}>
                      Reject
                    </Btn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Drawer
        open={!!reviewing}
        onClose={() => setReviewing(null)}
        title={rejectMode ? 'Reject timesheet' : 'Review timesheet'}
        subtitle={reviewing ? `${reviewing.employeeName} · ${fmtDate(reviewing.workDate)}` : ''}
        footer={
          reviewing &&
          (rejectMode ? (
            <>
              <Btn variant="secondary" onClick={() => setRejectMode(false)}>
                Back
              </Btn>
              <Btn
                variant="danger"
                disabled={!reason.trim()}
                loading={acting === reviewing.id}
                onClick={() => decide(reviewing, false, reason.trim())}
              >
                Reject timesheet
              </Btn>
            </>
          ) : (
            <>
              <Btn variant="reject" onClick={() => setRejectMode(true)}>
                Reject
              </Btn>
              <Btn icon="check" loading={acting === reviewing.id} onClick={() => decide(reviewing, true)}>
                Approve
              </Btn>
            </>
          ))
        }
      >
        {reviewing && (
          <>
            {actionError && <Alert>{actionError}</Alert>}
            <div className="stat" style={{ padding: 0 }}>
              <div className="eyebrow">Total logged</div>
              <div className="stat-value">{hours(reviewing.totalActualMinutes)}</div>
              <div className="stat-foot">Computed on the server from the segments below</div>
            </div>
            <div className="mt-24">
              <DayStrip segments={reviewing.segments} />
            </div>
            <div className="card mt-16">
              <div className="list">
                {(reviewing.segments ?? []).map((s, i) => (
                  <div className="list-item" key={i}>
                    <span className="t-sm t-mute">Segment {i + 1}</span>
                    <span className="grow" />
                    <span className="mono t-ink">
                      {fmtTime(s.startTime)} → {fmtTime(s.endTime)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {rejectMode && (
              <div className="mt-24">
              <Field label="Reason for rejection" hint="The contractor sees this and can resubmit.">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Hours on the 14th exceed the planned window"
                  autoFocus
                />
              </Field>
              </div>
            )}
          </>
        )}
      </Drawer>
    </>
  )
}
