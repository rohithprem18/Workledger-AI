import { useState, useCallback } from 'react'
import {
  getAllInvoices, getInvoiceAudit, runInvoiceAudit,
  overrideInvoiceAudit, approveInvoice,
} from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Btn from '../../components/Btn'
import StatusPill from '../../components/StatusPill'

const ERR = {
  padding: '10px 16px', background: '#ef444415', color: '#ef4444',
  borderLeft: '2px solid #ef4444', marginBottom: 16,
  fontFamily: 'monospace', fontSize: 12,
}
const OK = {
  padding: '10px 16px', background: '#00c85115', color: '#00c851',
  borderLeft: '2px solid #00c851', marginBottom: 16,
  fontFamily: 'monospace', fontSize: 12,
}
const MUTED = { color: '#7a9ab0', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }
const CARD = { border: '1px solid #1e3a4a', borderRadius: 3, background: '#03121d' }

const VERDICT_COLOR = { CLEAN: '#00c851', ADVISORY: '#ff6b00', BLOCKED: '#ef4444' }
const SEVERITY_COLOR = { BLOCKER: '#ef4444', WARNING: '#ff6b00', INFO: '#7a9ab0' }

export default function InvoiceAudit() {
  const invoices = useFetch(getAllInvoices, [])

  const [selected, setSelected] = useState(null)
  const [run, setRun] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [overrideText, setOverrideText] = useState('')

  const invList = invoices.data ?? []

  const select = useCallback(async (invoice) => {
    setSelected(invoice)
    setRun(null)
    setError(null)
    setNotice(null)
    setOverrideText('')
    try {
      setRun(await getInvoiceAudit(invoice.id))
    } catch {
      // No audit yet is the normal starting state, not an error worth showing.
      setRun(null)
    }
  }, [])

  async function handleRun() {
    setBusy('audit')
    setError(null)
    setNotice(null)
    try {
      setRun(await runInvoiceAudit(selected.id))
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Audit failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleOverride() {
    setBusy('override')
    setError(null)
    try {
      await overrideInvoiceAudit(selected.id, overrideText)
      setNotice('Override recorded. This invoice can now be approved.')
      setOverrideText('')
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Could not record the override')
    } finally {
      setBusy(null)
    }
  }

  async function handleApprove() {
    setBusy('approve')
    setError(null)
    try {
      await approveInvoice(selected.id)
      setNotice('Invoice approved and sent to the client.')
      invoices.reload()
      setSelected((s) => ({ ...s, status: 'APPROVED' }))
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Approval failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Invoice Auditor"
        subtitle="Reconcile every invoice against the contract, the approved work, and its own line items"
      />

      <div style={{ padding: '24px 32px', display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ------------------------------------------------- invoice list */}
        <div style={{ ...CARD, width: 320, flexShrink: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e3a4a', ...MUTED, fontWeight: 700, letterSpacing: '0.1em' }}>
            INVOICES ({invList.length})
          </div>
          {invoices.loading ? (
            <div style={{ padding: 16, ...MUTED }}>Loading…</div>
          ) : invList.length === 0 ? (
            <div style={{ padding: 16, ...MUTED }}>No invoices yet</div>
          ) : (
            invList.map((inv) => (
              <button
                key={inv.id}
                onClick={() => select(inv)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  padding: '10px 16px', border: 'none',
                  borderBottom: '1px solid #0f2433',
                  borderLeft: selected?.id === inv.id ? '2px solid #ff6b00' : '2px solid transparent',
                  background: selected?.id === inv.id ? '#ff6b0010' : 'transparent',
                }}
              >
                <div style={{ color: '#f0f2f5', fontSize: 12, fontWeight: 600 }}>
                  {inv.contractTitle ?? 'Contract'}
                </div>
                <div style={{ ...MUTED, fontSize: 10, marginTop: 4 }}>
                  {inv.periodStart} → {inv.periodEnd} · {inv.status}
                </div>
                <div style={{ color: '#ff6b00', fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                  {Number(inv.totalAmount ?? 0).toFixed(2)}
                </div>
              </button>
            ))
          )}
        </div>

        {/* ------------------------------------------------------ audit view */}
        <div style={{ flex: 1, minWidth: 440 }}>
          {!selected ? (
            <div style={{ ...CARD, padding: 48, textAlign: 'center', ...MUTED }}>
              Select an invoice to reconcile it
            </div>
          ) : (
            <>
              {error && <div style={ERR}>ERROR: {error}</div>}
              {notice && <div style={OK}>{notice}</div>}

              <div style={{ ...CARD, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: '#f0f2f5', fontSize: 15, fontWeight: 600 }}>
                      {selected.contractTitle ?? 'Invoice'}
                    </div>
                    <div style={{ ...MUTED, marginTop: 6 }}>
                      {selected.periodStart} → {selected.periodEnd} ·{' '}
                      <StatusPill value={selected.status} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn onClick={handleRun} disabled={busy === 'audit'}>
                      {busy === 'audit' ? 'RECONCILING…' : run ? 'RE-RUN AUDIT' : 'RUN AUDIT'}
                    </Btn>
                    {selected.status === 'DRAFT' && (
                      <Btn variant="approve" onClick={handleApprove} disabled={busy === 'approve'}>
                        {busy === 'approve' ? 'APPROVING…' : 'APPROVE INVOICE'}
                      </Btn>
                    )}
                  </div>
                </div>

                {!run && (
                  <div style={{ ...MUTED, marginTop: 16, lineHeight: 1.6 }}>
                    This invoice has not been reconciled. Approval is refused until it has been —
                    an unchecked invoice is not the same as a clean one.
                  </div>
                )}
              </div>

              {run && <AuditResult run={run} />}

              {run?.verdict === 'BLOCKED' && (
                <div style={{ ...CARD, padding: 20, marginTop: 16, borderColor: '#ef444450' }}>
                  <div style={{ ...MUTED, fontWeight: 700, letterSpacing: '0.1em', color: '#ef4444' }}>
                    OVERRIDE
                  </div>
                  <div style={{ ...MUTED, marginTop: 8, lineHeight: 1.6 }}>
                    Approving despite blocking findings requires a reason. It is stored against the
                    invoice with your identity and appears in the audit trail.
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <input
                      value={overrideText}
                      onChange={(e) => setOverrideText(e.target.value)}
                      placeholder="Why are these findings being accepted?"
                      style={{ flex: 1, minWidth: 260 }}
                    />
                    <Btn
                      variant="danger"
                      onClick={handleOverride}
                      disabled={busy === 'override' || overrideText.trim().length < 10}
                    >
                      {busy === 'override' ? 'RECORDING…' : 'RECORD OVERRIDE'}
                    </Btn>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function AuditResult({ run }) {
  const color = VERDICT_COLOR[run.verdict] ?? '#7a9ab0'
  const aiWritten = run.narrativeEngine && run.narrativeEngine !== 'deterministic'

  return (
    <>
      {/* ------------------------------------------------ three sources */}
      <div style={{ ...CARD, padding: 20, marginTop: 16, borderColor: `${color}50` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ color, fontSize: 22, fontWeight: 700, letterSpacing: '0.04em' }}>
            {run.verdict}
          </div>
          <div style={{ ...MUTED }}>
            {run.blockerCount} blocker · {run.warningCount} warning · {run.infoCount} info
            {' · '}rules v{run.rulesVersion}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 32, marginTop: 20, flexWrap: 'wrap' }}>
          <Source label="1 · Contract authorises" value={run.contractTotal} />
          <Source label="2 · Approved work worth" value={run.approvedWorkTotal} />
          <Source label="3 · Invoice presents" value={run.invoicedTotal} accent="#ff6b00" />
        </div>

        {run.narrative && (
          <div style={{
            marginTop: 20, padding: '12px 14px', borderRadius: 2,
            background: '#7a9ab008', borderLeft: '2px solid #7a9ab0',
          }}>
            <div style={{ ...MUTED, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>
              {aiWritten ? `SUMMARY · AI-ASSISTED (${run.narrativeEngine})` : 'SUMMARY'}
            </div>
            <div style={{ color: '#c3d4e0', fontSize: 13, marginTop: 6, lineHeight: 1.65 }}>
              {run.narrative}
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- findings */}
      {(run.findings ?? []).length === 0 ? (
        <div style={{ ...CARD, padding: 32, marginTop: 16, textAlign: 'center', ...MUTED }}>
          All three sources agree. Nothing flagged.
        </div>
      ) : (
        run.findings.map((f) => <Finding key={f.id} finding={f} />)
      )}
    </>
  )
}

function Source({ label, value, accent = '#f0f2f5' }) {
  return (
    <div>
      <div style={{ ...MUTED, fontSize: 10, letterSpacing: '0.1em', fontWeight: 700 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ color: accent, fontSize: 19, fontWeight: 700, marginTop: 3 }}>
        {value == null ? '—' : Number(value).toFixed(2)}
      </div>
    </div>
  )
}

function Finding({ finding }) {
  const color = SEVERITY_COLOR[finding.severity] ?? '#7a9ab0'

  return (
    <div style={{ ...CARD, padding: 16, marginTop: 12, borderLeft: `2px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ color: '#f0f2f5', fontSize: 14, fontWeight: 600 }}>{finding.title}</div>
        <div style={{ ...MUTED, color, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em' }}>
          {finding.severity} · {finding.ruleCode}
        </div>
      </div>

      {/* The computed statement: always present, always authoritative. */}
      <div style={{ color: '#c3d4e0', fontSize: 13, marginTop: 8, lineHeight: 1.65 }}>
        {finding.detail}
      </div>

      {(finding.expectedValue != null || finding.actualValue != null) && (
        <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
          {finding.expectedValue != null && (
            <Cell label="Expected" value={finding.expectedValue} />
          )}
          {finding.actualValue != null && (
            <Cell label="Actual" value={finding.actualValue} accent={color} />
          )}
          {finding.delta != null && (
            <Cell label="Delta" value={Number(finding.delta).toFixed(2)} accent={color} />
          )}
        </div>
      )}

      {/* Model prose, clearly separated from the computed numbers above. */}
      {finding.explanation && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 2,
          background: '#7a9ab008', borderLeft: '2px solid #7a9ab040',
        }}>
          <div style={{ ...MUTED, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>
            AI EXPLANATION
          </div>
          <div style={{ color: '#a8bfd0', fontSize: 12, marginTop: 5, lineHeight: 1.6 }}>
            {finding.explanation}
          </div>
        </div>
      )}
    </div>
  )
}

function Cell({ label, value, accent = '#f0f2f5' }) {
  return (
    <div>
      <div style={{ ...MUTED, fontSize: 9, letterSpacing: '0.1em', fontWeight: 700 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ color: accent, fontSize: 14, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  )
}
