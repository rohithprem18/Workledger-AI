import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getAllInvoices,
  getInvoiceAudit,
  runInvoiceAudit,
  overrideInvoiceAudit,
  approveInvoice,
} from '../../api'
import { useFetch } from '../../hooks/useFetch'
import { useAuth } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import Btn from '../../components/Btn'
import Icon from '../../components/Icon'
import StatusPill from '../../components/StatusPill'
import {
  Alert,
  Card,
  EmptyState,
  Field,
  LoadingRows,
  errorText,
  fmtDateTime,
  fmtRange,
  money,
} from '../../components/ui'

const VERDICT = {
  CLEAN: { tone: 'success', icon: 'checkCircle', text: 'All three sources reconcile.' },
  ADVISORY: { tone: 'warning', icon: 'info', text: 'Worth a look, but nothing blocks approval.' },
  BLOCKED: { tone: 'error', icon: 'alert', text: 'Approval is refused until these are resolved or overridden.' },
}

const SEVERITY_TONE = { BLOCKER: 'error', WARNING: 'warning', INFO: 'neutral' }

/**
 * The deterministic invoice auditor. Every number on this screen is computed
 * in code from the contract, the approved work and the invoice; the AI only
 * writes the prose explaining them, and is labelled wherever it appears.
 */
export default function InvoiceAudit() {
  const { hasPermission } = useAuth()
  const canRun = hasPermission('RUN_INVOICE_AUDIT')
  const canApprove = hasPermission('APPROVE_INVOICE')
  const canOverride = hasPermission('OVERRIDE_INVOICE_AUDIT')

  const [params, setParams] = useSearchParams()
  const invoices = useFetch(getAllInvoices, [])
  const [selected, setSelected] = useState(null)
  const [run, setRun] = useState(null)
  const [runLoading, setRunLoading] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [overrideText, setOverrideText] = useState('')

  const list = useMemo(() => invoices.data ?? [], [invoices.data])

  const select = useCallback(
    async (invoice) => {
      setSelected(invoice)
      setRun(null)
      setError(null)
      setNotice(null)
      setOverrideText('')
      setParams({ invoice: invoice.id }, { replace: true })
      setRunLoading(true)
      try {
        // No audit yet comes back as `data: null`, which the client's unwrap
        // turns into the bare envelope — so only a real run has a verdict.
        const result = await getInvoiceAudit(invoice.id)
        setRun(result?.verdict ? result : null)
      } catch {
        setRun(null) // not audited yet — the normal starting state
      } finally {
        setRunLoading(false)
      }
    },
    [setParams],
  )

  // Deep link: /finance/audit?invoice=<id>
  const wanted = params.get('invoice')
  useEffect(() => {
    if (!wanted || selected?.id === wanted) return
    const match = list.find((i) => i.id === wanted)
    if (match) select(match)
  }, [wanted, list, selected, select])

  async function handleRun() {
    setBusy('audit')
    setError(null)
    setNotice(null)
    try {
      setRun(await runInvoiceAudit(selected.id))
    } catch (e) {
      setError(errorText(e, 'Audit failed'))
    } finally {
      setBusy(null)
    }
  }

  async function handleOverride() {
    setBusy('override')
    setError(null)
    try {
      await overrideInvoiceAudit(selected.id, overrideText)
      setNotice('Override recorded against this invoice. It can now be approved.')
      setOverrideText('')
    } catch (e) {
      setError(errorText(e, 'Could not record the override'))
    } finally {
      setBusy(null)
    }
  }

  async function handleApprove() {
    setBusy('approve')
    setError(null)
    try {
      await approveInvoice(selected.id)
      setNotice('Invoice approved.')
      setSelected((s) => ({ ...s, status: 'APPROVED' }))
      invoices.reload()
    } catch (e) {
      setError(errorText(e, 'Approval failed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Invoice auditor"
        title="Three-way reconciliation"
        subtitle="Each invoice is checked against the contract that authorises it and the approved work behind it — before anyone can approve it."
      />

      <div className="grid grid-sidebar">
        {/* ------------------------------------------------ invoice rail */}
        <Card>
          <div className="card-header">
            <span className="eyebrow">Invoices</span>
            <span className="t-sm t-mute">{list.length}</span>
          </div>
          {invoices.loading ? (
            <LoadingRows rows={4} />
          ) : list.length === 0 ? (
            <div className="card-pad-sm t-sm t-mute">No invoices yet.</div>
          ) : (
            <div className="list" style={{ maxHeight: 560, overflowY: 'auto' }}>
              {list.map((inv) => (
                <button
                  key={inv.id}
                  type="button"
                  className={`list-item${selected?.id === inv.id ? ' active' : ''}`}
                  onClick={() => select(inv)}
                >
                  <div className="grow">
                    <div className="t-label t-wrap">{inv.contractTitle ?? 'Invoice'}</div>
                    <div className="t-sm t-mute">{fmtRange(inv.periodStart, inv.periodEnd)}</div>
                  </div>
                  <div className="stack gap-4" style={{ alignItems: 'flex-end' }}>
                    <span className="t-label t-num">{money(inv.totalAmount)}</span>
                    <StatusPill value={inv.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* ------------------------------------------------- audit panel */}
        <div className="stack gap-16" style={{ minWidth: 0 }}>
          {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
          {notice && (
            <Alert tone="success" onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          )}

          {!selected ? (
            <Card>
              <EmptyState icon="scan" title="Select an invoice to reconcile">
                The auditor checks arithmetic, authorised rates, approved hours, the contract term and
                duplicate billing.
              </EmptyState>
            </Card>
          ) : (
            <>
              <Card pad>
                <div className="row between wrap gap-12">
                  <div className="grow">
                    <div className="row gap-8 wrap">
                      <h2 className="t-h2">{selected.contractTitle}</h2>
                      <StatusPill value={selected.status} />
                    </div>
                    <div className="t-sm t-mute mt-4">
                      {fmtRange(selected.periodStart, selected.periodEnd)} ·{' '}
                      {selected.milestoneId ? 'Milestone invoice' : 'Hourly invoice'}
                    </div>
                  </div>
                  <div className="cluster">
                    {canRun && (
                      <Btn
                        variant={run ? 'secondary' : 'primary'}
                        icon="scan"
                        loading={busy === 'audit'}
                        onClick={handleRun}
                      >
                        {run ? 'Re-run audit' : 'Run audit'}
                      </Btn>
                    )}
                    {selected.status === 'DRAFT' && canApprove && (
                      <Btn variant="approve" icon="check" loading={busy === 'approve'} onClick={handleApprove}>
                        Approve
                      </Btn>
                    )}
                  </div>
                </div>
                {!runLoading && !run && (
                  <div className="mt-16">
                    <Alert tone="info">
                      Not reconciled yet. An unchecked invoice is not the same as a clean one, so approval is
                      refused until an audit has run.
                    </Alert>
                  </div>
                )}
              </Card>

              {runLoading ? (
                <Card>
                  <LoadingRows rows={5} />
                </Card>
              ) : (
                run && <AuditResult run={run} />
              )}

              {run?.verdict === 'BLOCKED' && selected.status === 'DRAFT' && canOverride && (
                <Card pad>
                  <div className="row gap-8">
                    <Icon name="lock" />
                    <h3 className="t-h3">Approve anyway</h3>
                  </div>
                  <p className="t-sm t-body mt-8">
                    Record why the blocking findings are acceptable. The reason is stored against the invoice
                    with your name and appears in the audit trail.
                  </p>
                  <Field label="Reason">
                    <textarea
                      value={overrideText}
                      onChange={(e) => setOverrideText(e.target.value)}
                      placeholder="e.g. Rate change agreed with the client by email on 3 April; contract amendment pending"
                    />
                  </Field>
                  <div className="row end mt-12">
                    <Btn
                      variant="danger"
                      loading={busy === 'override'}
                      disabled={overrideText.trim().length < 10}
                      onClick={handleOverride}
                    >
                      Record override
                    </Btn>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

function AuditResult({ run }) {
  const verdict = VERDICT[run.verdict] ?? VERDICT.ADVISORY
  const aiWritten = run.narrativeEngine && run.narrativeEngine !== 'deterministic'
  const sources = [
    { label: 'Contract authorises', value: run.contractTotal, n: 1 },
    { label: 'Approved work is worth', value: run.approvedWorkTotal, n: 2 },
    { label: 'Invoice presents', value: run.invoicedTotal, n: 3 },
  ]
  const agree = new Set(sources.map((s) => Number(s.value).toFixed(2))).size === 1

  return (
    <>
      <Card>
        <div
          className={`card-body${run.verdict === 'CLEAN' ? ' mesh mesh-soft' : ''}`}
          style={{ borderRadius: '12px 12px 0 0' }}
        >
          <div className="row between wrap gap-12">
            <div className="row gap-12">
              <span className={`badge badge-${verdict.tone}`} style={{ height: 28, padding: '0 12px', fontSize: 14 }}>
                {run.verdict}
              </span>
              <span className="t-body">{verdict.text}</span>
            </div>
            <span className="t-sm t-mute">
              {run.blockerCount} blocker · {run.warningCount} warning · {run.infoCount} info · rules v
              {run.rulesVersion}
            </span>
          </div>
        </div>

        <div className="grid grid-3" style={{ gap: 0, borderTop: '1px solid var(--hairline)' }}>
          {sources.map((s, i) => (
            <div
              key={s.n}
              className="stat"
              style={{ borderLeft: i ? '1px solid var(--hairline)' : 0 }}
            >
              <div className="eyebrow">
                {s.n} · {s.label}
              </div>
              <div className="stat-value">{money(s.value)}</div>
            </div>
          ))}
        </div>
        <div className="card-footer" style={{ justifyContent: 'flex-start' }}>
          <span className={`t-sm ${agree ? 't-success' : 't-warning'}`}>
            {agree ? 'All three sources agree.' : 'The sources disagree — see the findings below.'}
          </span>
          <span className="grow" />
          <span className="t-sm t-mute">{fmtDateTime(run.createdAt)}</span>
        </div>
      </Card>

      {run.narrative && (
        <Card pad>
          <div className="row gap-8">
            <span className="eyebrow">Summary</span>
            {aiWritten && <span className="badge badge-violet badge-plain">AI · {run.narrativeEngine}</span>}
          </div>
          <p className="t-body-lg mt-8">{run.narrative}</p>
        </Card>
      )}

      {(run.findings ?? []).length === 0 ? (
        <Card>
          <EmptyState icon="checkCircle" title="No findings">
            Arithmetic, rates, approved hours, contract term and duplicate billing all check out.
          </EmptyState>
        </Card>
      ) : (
        <div className="stack gap-12">
          {run.findings.map((f) => (
            <Card key={f.id} pad="sm" style={{ boxShadow: `inset 3px 0 0 var(--${f.severity === 'BLOCKER' ? 'error' : f.severity === 'WARNING' ? 'warning' : 'hairline-strong'})` }}>
              <div className="row between wrap gap-8">
                <div className="t-label">{f.title}</div>
                <div className="cluster">
                  <span className="t-sm t-mute mono">{f.ruleCode}</span>
                  <span className={`badge badge-${SEVERITY_TONE[f.severity] ?? 'neutral'}`}>{f.severity.toLowerCase()}</span>
                </div>
              </div>
              <p className="t-body mt-8">{f.detail}</p>

              {(f.expectedValue != null || f.actualValue != null) && (
                <div className="cluster gap-16 mt-12">
                  {f.expectedValue != null && (
                    <div>
                      <div className="eyebrow">Expected</div>
                      <div className="mono t-ink">{f.expectedValue}</div>
                    </div>
                  )}
                  {f.actualValue != null && (
                    <div>
                      <div className="eyebrow">Actual</div>
                      <div className="mono t-ink">{f.actualValue}</div>
                    </div>
                  )}
                  {f.delta != null && Number(f.delta) !== 0 && (
                    <div>
                      <div className="eyebrow">Delta</div>
                      <div className={`mono ${Number(f.delta) > 0 ? 't-error' : 't-warning'}`}>
                        {Number(f.delta) > 0 ? '+' : ''}
                        {Number(f.delta).toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {f.explanation && (
                <div className="quote mt-12" style={{ fontFamily: 'var(--sans)', fontSize: 13 }}>
                  <span className="badge badge-violet badge-plain" style={{ marginBottom: 6 }}>
                    AI explanation
                  </span>
                  <div className="t-body">{f.explanation}</div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
