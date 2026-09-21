import { useEffect, useState } from 'react'
import Drawer from '../../components/Drawer'
import Btn from '../../components/Btn'
import { suggestAssignments, bulkAssign, getEligibleEmployees } from '../../api'

const LABEL = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.1em',
  color: '#7a9ab0',
  fontFamily: 'ui-monospace, Consolas, monospace',
  marginBottom: 4,
  textTransform: 'uppercase',
}
const ERR = {
  padding: '10px 16px',
  background: '#ef444415',
  color: '#ef4444',
  borderLeft: '2px solid #ef4444',
  marginBottom: 16,
  fontFamily: 'monospace',
  fontSize: 12,
}

function scoreBar(score) {
  const pct = Math.round(score * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 48, height: 4, background: '#1e3a4a', borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#ff6b00', borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#7a9ab0' }}>{pct}%</span>
    </div>
  )
}

export default function AutoAssignDrawer({ contractId, open, onClose, onSuccess }) {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(false)
  // edits keyed by `${requirementId}_${slotIndex}` — manager overrides
  const [edits, setEdits] = useState({})
  // swap state keyed same — { open, loading, options }
  const [swap, setSwap] = useState({})

  useEffect(() => {
    if (!open) return
    setError(null)
    setEdits({})
    setSwap({})
    setSuggestions([])
    setLoading(true)
    suggestAssignments(contractId)
      .then(data => setSuggestions(Array.isArray(data) ? data : []))
      .catch(e => setError(typeof e === 'string' ? e : 'Failed to load suggestions'))
      .finally(() => setLoading(false))
  }, [open, contractId])

  function rowKey(s) {
    return `${s.requirementId}_${s.slotIndex}`
  }

  function getEdit(s) {
    return edits[rowKey(s)] ?? {
      employeeId: s.employeeId ?? null,
      employeeName: s.employeeName ?? null,
      plannedStartTime: s.plannedStartTime ? s.plannedStartTime.slice(0, 5) : '09:00',
      plannedEndTime: s.plannedEndTime ? s.plannedEndTime.slice(0, 5) : '17:00',
    }
  }

  function updateEdit(s, patch) {
    setEdits(prev => ({ ...prev, [rowKey(s)]: { ...getEdit(s), ...patch } }))
  }

  async function openSwap(s) {
    const k = rowKey(s)
    setSwap(prev => ({ ...prev, [k]: { open: true, loading: true, options: [] } }))
    try {
      const opts = await getEligibleEmployees(s.requirementId, s.startDate, s.endDate)
      setSwap(prev => ({ ...prev, [k]: { open: true, loading: false, options: Array.isArray(opts) ? opts : [] } }))
    } catch {
      setSwap(prev => ({ ...prev, [k]: { open: true, loading: false, options: [] } }))
    }
  }

  function pickEmployee(s, emp) {
    updateEdit(s, { employeeId: emp.id, employeeName: `${emp.firstName} ${emp.lastName}` })
    setSwap(prev => ({ ...prev, [rowKey(s)]: { ...prev[rowKey(s)], open: false } }))
  }

  function closeSwap(k) {
    setSwap(prev => ({ ...prev, [k]: { ...prev[k], open: false } }))
  }

  const hasUnresolved = suggestions.some(s => {
    if (s.status !== 'UNASSIGNABLE') return false
    return !getEdit(s).employeeId
  })

  async function handleConfirm(skipUnassignable) {
    setConfirming(true)
    setError(null)
    try {
      const items = suggestions
        .map(s => ({ s, e: getEdit(s) }))
        .filter(({ e }) => !!e.employeeId)
        .map(({ s, e }) => ({
          requirementId: s.requirementId,
          employeeId: e.employeeId,
          startDate: s.startDate,
          endDate: s.endDate,
          plannedStartTime: e.plannedStartTime.length === 5 ? e.plannedStartTime + ':00' : e.plannedStartTime,
          plannedEndTime: e.plannedEndTime.length === 5 ? e.plannedEndTime + ':00' : e.plannedEndTime,
        }))

      if (items.length === 0) {
        setError('No assignable slots — swap employees for unassignable rows first')
        setConfirming(false)
        return
      }

      await bulkAssign({ assignments: items })
      onSuccess?.()
      onClose()
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Bulk assign failed')
    } finally {
      setConfirming(false)
    }
  }

  const assignableCount = suggestions.filter(s => !!getEdit(s).employeeId).length
  const unassignableCount = suggestions.filter(s => !getEdit(s).employeeId).length

  return (
    <Drawer open={open} onClose={onClose} title="AUTO-ASSIGN REVIEW" width={760}>
      {error && <div style={ERR}>ERROR: {error}</div>}

      {loading ? (
        <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>
          Running assignment algorithm...
        </div>
      ) : suggestions.length === 0 ? (
        <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>
          No unfulfilled slots found for this contract.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16, fontFamily: 'monospace', fontSize: 11, color: '#7a9ab0' }}>
            {suggestions.length} slot{suggestions.length !== 1 ? 's' : ''} ·{' '}
            <span style={{ color: '#00c851' }}>{assignableCount} suggested</span>
            {unassignableCount > 0 && (
              <span style={{ color: '#ef4444' }}> · {unassignableCount} unassignable</span>
            )}
          </div>

          <table style={{ marginBottom: 20, width: '100%', fontSize: 11 }}>
            <thead>
              <tr>
                <th>Skill / Slot</th>
                <th>Employee</th>
                <th>Score</th>
                <th>Start Time</th>
                <th>End Time</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map(s => {
                const k = rowKey(s)
                const e = getEdit(s)
                const unassignable = !e.employeeId
                const swapS = swap[k] ?? { open: false, loading: false, options: [] }

                return (
                  <tr
                    key={k}
                    style={{ background: unassignable ? '#ef444408' : undefined }}
                  >
                    <td>
                      <div style={{ color: '#f0f2f5', fontWeight: 600 }}>{s.skillName}</div>
                      <div style={{ color: '#7a9ab0', fontSize: 10 }}>
                        slot {s.slotIndex} · {s.startDate} → {s.endDate}
                      </div>
                    </td>
                    <td>
                      {unassignable && !swapS.open ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: '#ef4444', fontFamily: 'monospace', fontSize: 10 }}>
                            NO MATCH
                          </span>
                          <Btn small variant="ghost" onClick={() => openSwap(s)}>
                            PICK
                          </Btn>
                        </div>
                      ) : swapS.open ? (
                        <div>
                          {swapS.loading ? (
                            <span style={{ color: '#7a9ab0', fontSize: 10, fontFamily: 'monospace' }}>
                              loading...
                            </span>
                          ) : swapS.options.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: '#ef4444', fontSize: 10, fontFamily: 'monospace' }}>
                                none eligible
                              </span>
                              <Btn small variant="ghost" onClick={() => closeSwap(k)}>✕</Btn>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <select
                                style={{ fontSize: 11, padding: '2px 4px' }}
                                defaultValue=""
                                onChange={ev => {
                                  const emp = swapS.options.find(o => o.id === ev.target.value)
                                  if (emp) pickEmployee(s, emp)
                                }}
                              >
                                <option value="" disabled>— select —</option>
                                {swapS.options.map(emp => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.firstName} {emp.lastName}
                                  </option>
                                ))}
                              </select>
                              <Btn small variant="ghost" onClick={() => closeSwap(k)}>✕</Btn>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: '#f0f2f5' }}>{e.employeeName}</span>
                          <Btn small variant="ghost" onClick={() => openSwap(s)}>
                            CHANGE
                          </Btn>
                        </div>
                      )}
                    </td>
                    <td>
                      {s.status === 'SUGGESTED' ? scoreBar(s.score) : (
                        <span style={{ color: '#7a9ab0', fontSize: 10 }}>—</span>
                      )}
                    </td>
                    <td>
                      <input
                        type="time"
                        value={e.plannedStartTime}
                        onChange={ev => updateEdit(s, { plannedStartTime: ev.target.value })}
                        style={{ fontSize: 11, padding: '2px 4px', width: 90 }}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        value={e.plannedEndTime}
                        onChange={ev => updateEdit(s, { plannedEndTime: ev.target.value })}
                        style={{ fontSize: 11, padding: '2px 4px', width: 90 }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Btn
              onClick={() => handleConfirm(false)}
              disabled={confirming || hasUnresolved}
            >
              {confirming ? 'CREATING...' : `CONFIRM ALL (${assignableCount})`}
            </Btn>
            {hasUnresolved && (
              <Btn
                variant="ghost"
                onClick={() => handleConfirm(true)}
                disabled={confirming}
              >
                SKIP UNASSIGNABLE & CONFIRM ({assignableCount})
              </Btn>
            )}
            {hasUnresolved && (
              <span style={{ color: '#ef4444', fontFamily: 'monospace', fontSize: 10 }}>
                {unassignableCount} slot{unassignableCount !== 1 ? 's' : ''} need manual pick
              </span>
            )}
          </div>
        </>
      )}
    </Drawer>
  )
}
