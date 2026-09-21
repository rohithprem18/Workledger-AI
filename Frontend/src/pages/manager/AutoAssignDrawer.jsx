import { useEffect, useState } from 'react'
import Drawer from '../../components/Drawer'
import Btn from '../../components/Btn'
import { suggestAssignments, bulkAssign, getEligibleEmployees } from '../../api'
import { Alert, EmptyState, Field, LoadingRows, errorText, fmtRange, initials } from '../../components/ui'

/** The API ranks longest-idle first: a very large score means "never worked". */
function idleLabel(score) {
  if (score >= 100000) return 'Never billed — top priority'
  if (!score) return 'Worked recently'
  return `Idle ${score} day${score === 1 ? '' : 's'}`
}

const hhmm = (t) => (t ? String(t).slice(0, 5) : '')
const withSeconds = (t) => (t.length === 5 ? `${t}:00` : t)

/**
 * Review screen for the allocator's proposal.
 *
 * The suggestion is only a starting point: the manager can swap anyone, change
 * hours, and leave slots empty. Confirming sends everything as one batch, which
 * the API applies all-or-nothing through the same validated write path as a
 * manual assignment.
 */
export default function AutoAssignDrawer({ contractId, open, onClose, onSuccess }) {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [edits, setEdits] = useState({})
  const [swap, setSwap] = useState({})

  useEffect(() => {
    if (!open) return
    setError(null)
    setEdits({})
    setSwap({})
    setSuggestions([])
    setLoading(true)
    suggestAssignments(contractId)
      .then((data) => setSuggestions(Array.isArray(data) ? data : []))
      .catch((e) => setError(errorText(e, 'Could not load suggestions')))
      .finally(() => setLoading(false))
  }, [open, contractId])

  const key = (s) => `${s.requirementId}_${s.slotIndex}`

  function getEdit(s) {
    return (
      edits[key(s)] ?? {
        employeeId: s.employeeId ?? null,
        employeeName: s.employeeName ?? null,
        plannedStartTime: hhmm(s.plannedStartTime) || '09:00',
        plannedEndTime: hhmm(s.plannedEndTime) || '17:00',
      }
    )
  }

  function updateEdit(s, patch) {
    setEdits((prev) => ({ ...prev, [key(s)]: { ...getEdit(s), ...patch } }))
  }

  async function openSwap(s) {
    const k = key(s)
    setSwap((prev) => ({ ...prev, [k]: { open: true, loading: true, options: [] } }))
    try {
      const options = await getEligibleEmployees(s.requirementId, s.startDate, s.endDate)
      setSwap((prev) => ({ ...prev, [k]: { open: true, loading: false, options: options ?? [] } }))
    } catch {
      setSwap((prev) => ({ ...prev, [k]: { open: true, loading: false, options: [] } }))
    }
  }

  function pick(s, employee) {
    updateEdit(s, {
      employeeId: employee?.id ?? null,
      employeeName: employee ? `${employee.firstName} ${employee.lastName}` : null,
    })
    setSwap((prev) => ({ ...prev, [key(s)]: { ...prev[key(s)], open: false } }))
  }

  const filled = suggestions.filter((s) => !!getEdit(s).employeeId)
  const empty = suggestions.length - filled.length

  async function confirm() {
    setConfirming(true)
    setError(null)
    try {
      await bulkAssign({
        assignments: filled.map((s) => {
          const e = getEdit(s)
          return {
            requirementId: s.requirementId,
            employeeId: e.employeeId,
            startDate: s.startDate,
            endDate: s.endDate,
            plannedStartTime: withSeconds(e.plannedStartTime),
            plannedEndTime: withSeconds(e.plannedEndTime),
          }
        }),
      })
      onSuccess?.()
      onClose()
    } catch (e) {
      setError(errorText(e, 'Bulk assignment failed'))
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Auto-assign"
      subtitle="Longest-idle contractors first, filtered by the same rules as manual assignment."
      footer={
        suggestions.length > 0 && (
          <>
            <Btn variant="secondary" onClick={onClose}>
              Cancel
            </Btn>
            <Btn icon="check" loading={confirming} disabled={filled.length === 0} onClick={confirm}>
              Assign {filled.length} {filled.length === 1 ? 'person' : 'people'}
            </Btn>
          </>
        )
      }
    >
      {error && <Alert>{error}</Alert>}

      {loading ? (
        <LoadingRows rows={4} />
      ) : suggestions.length === 0 ? (
        <EmptyState icon="checkCircle" title="Fully staffed">
          Every requirement on this contract already has its headcount.
        </EmptyState>
      ) : (
        <>
          <div className="cluster">
            <span className="badge badge-success">{filled.length} proposed</span>
            {empty > 0 && <span className="badge badge-error">{empty} without a match</span>}
          </div>
          {empty > 0 && (
            <p className="t-sm t-mute mt-8">
              Empty slots are skipped. Pick someone manually, or leave them for later.
            </p>
          )}

          <div className="stack gap-12 mt-16">
            {suggestions.map((s) => {
              const k = key(s)
              const e = getEdit(s)
              const swapState = swap[k] ?? { open: false, loading: false, options: [] }
              return (
                <div key={k} className={`card card-pad-sm${e.employeeId ? '' : ' '}`}>
                  <div className="row between gap-8">
                    <div>
                      <div className="t-label">
                        {s.skillName} <span className="t-mute">· slot {s.slotIndex + 1}</span>
                      </div>
                      <div className="t-sm t-mute">{fmtRange(s.startDate, s.endDate)}</div>
                    </div>
                    {s.status === 'SUGGESTED' && e.employeeId === s.employeeId && (
                      <span className="badge badge-violet badge-plain">Suggested</span>
                    )}
                  </div>

                  <div className="row gap-12 mt-12">
                    {e.employeeId ? (
                      <>
                        <span className="avatar avatar-sm">{initials(e.employeeName ?? '')}</span>
                        <div className="grow">
                          <div className="t-label">{e.employeeName}</div>
                          {e.employeeId === s.employeeId && (
                            <div className="t-sm t-mute">{idleLabel(s.score)}</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <span className="grow t-sm t-error">No eligible contractor found</span>
                    )}
                    {!swapState.open && (
                      <Btn small variant="secondary" onClick={() => openSwap(s)}>
                        {e.employeeId ? 'Change' : 'Pick'}
                      </Btn>
                    )}
                  </div>

                  {swapState.open && (
                    <div className="mt-12">
                      {swapState.loading ? (
                        <div className="t-sm t-mute">Finding eligible contractors…</div>
                      ) : (
                        <div className="row gap-8">
                          <select
                            defaultValue={e.employeeId ?? ''}
                            onChange={(ev) =>
                              pick(s, swapState.options.find((o) => o.id === ev.target.value) ?? null)
                            }
                            aria-label="Choose contractor"
                          >
                            <option value="">Leave empty</option>
                            {swapState.options.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.firstName} {o.lastName}
                              </option>
                            ))}
                          </select>
                          <Btn
                            small
                            variant="ghost"
                            icon="x"
                            aria-label="Close"
                            onClick={() =>
                              setSwap((prev) => ({ ...prev, [k]: { ...prev[k], open: false } }))
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {e.employeeId && (
                    <div className="field-row mt-12">
                      <Field label="Starts">
                        <input
                          type="time"
                          value={e.plannedStartTime}
                          onChange={(ev) => updateEdit(s, { plannedStartTime: ev.target.value })}
                        />
                      </Field>
                      <Field label="Ends">
                        <input
                          type="time"
                          value={e.plannedEndTime}
                          onChange={(ev) => updateEdit(s, { plannedEndTime: ev.target.value })}
                        />
                      </Field>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </Drawer>
  )
}
