import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAllInvoices,
  getContracts,
  generateInvoice,
  approveInvoice,
  downloadInvoiceReport,
} from '../../api'
import { useFetch } from '../../hooks/useFetch'
import { useAuth } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import Drawer from '../../components/Drawer'
import Btn from '../../components/Btn'
import StatusPill from '../../components/StatusPill'
import {
  Alert,
  Card,
  DataTable,
  EmptyState,
  Field,
  LoadingRows,
  Stat,
  Tabs,
  errorText,
  fmtRange,
  money,
} from '../../components/ui'

function monthBounds(offset = 0) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: iso(start), end: iso(end) }
}

export default function Invoices() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const invoices = useFetch(getAllInvoices, [])
  const contracts = useFetch(getContracts, [])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState({ contractId: '', periodStart: '', periodEnd: '' })
  const [error, setError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(null)
  const [filter, setFilter] = useState('ALL')

  const all = invoices.data ?? []
  const rows = all.filter((i) => filter === 'ALL' || i.status === filter)
  const hourlyContracts = (contracts.data ?? []).filter((c) => c.billingTypeCode === 'HOURLY')
  const drafts = all.filter((i) => i.status === 'DRAFT')
  const approved = all.filter((i) => i.status === 'APPROVED')
  const sum = (list) => list.reduce((n, i) => n + Number(i.totalAmount ?? 0), 0)

  function openGenerate() {
    const { start, end } = monthBounds(-1)
    setForm({ contractId: '', periodStart: start, periodEnd: end })
    setFormError(null)
    setDrawerOpen(true)
  }

  async function handleApprove(inv) {
    setError(null)
    setBusy(inv.id)
    try {
      await approveInvoice(inv.id)
      setNotice(`Invoice for ${inv.contractTitle} approved.`)
      invoices.reload()
    } catch (err) {
      setError(errorText(err, 'Approval failed'))
    } finally {
      setBusy(null)
    }
  }

  async function handleDownload(inv) {
    setError(null)
    try {
      const blob = await downloadInvoiceReport(inv.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${inv.id}-report.txt`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Report download failed')
    }
  }

  async function handleGenerate(e) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      const created = await generateInvoice(form)
      setDrawerOpen(false)
      invoices.reload()
      setNotice(`Draft invoice of ${money(created?.totalAmount)} generated. Audit it before approving.`)
    } catch (err) {
      setFormError(errorText(err, 'Generation failed'))
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      key: 'contract',
      header: 'Invoice',
      primary: true,
      render: (i) => (
        <div>
          <div className="t-ink" style={{ fontWeight: 500 }}>
            {i.contractTitle ?? '—'}
          </div>
          <div className="t-sm t-mute mono">{i.id.slice(0, 8)}</div>
        </div>
      ),
    },
    { key: 'period', header: 'Period', render: (i) => <span className="t-nowrap">{fmtRange(i.periodStart, i.periodEnd)}</span> },
    { key: 'kind', header: 'Type', render: (i) => <StatusPill value={i.milestoneId ? 'MILESTONE' : 'HOURLY'} dot={false} /> },
    { key: 'status', header: 'Status', render: (i) => <StatusPill value={i.status} /> },
    { key: 'amount', header: 'Amount', align: 'right', render: (i) => <span className="t-ink" style={{ fontWeight: 500 }}>{money(i.totalAmount)}</span> },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Invoices"
        subtitle="Hourly invoices are built from approved timesheets. Every invoice must pass the audit before approval."
      >
        {hasPermission('GENERATE_INVOICE') && (
          <Btn icon="plus" onClick={openGenerate}>
            Generate invoice
          </Btn>
        )}
      </PageHeader>

      {(invoices.error || error) && <Alert onClose={() => setError(null)}>{invoices.error || error}</Alert>}
      {notice && (
        <Alert tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <Stat label="Drafts" value={invoices.loading ? '—' : drafts.length} foot={money(sum(drafts))} tone={drafts.length ? 'warning' : undefined} />
        <Stat label="Approved" value={invoices.loading ? '—' : approved.length} foot={money(sum(approved))} />
        <Stat label="All invoices" value={invoices.loading ? '—' : all.length} foot={money(sum(all))} />
      </div>

      <Card>
        <div className="card-header">
          <Tabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'ALL', label: 'All', count: all.length },
              { value: 'DRAFT', label: 'Draft', count: drafts.length },
              { value: 'APPROVED', label: 'Approved', count: approved.length },
            ]}
          />
        </div>
        {invoices.loading ? (
          <LoadingRows />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            actions={(inv) => (
              <>
                <Btn small variant="secondary" icon="scan" onClick={() => navigate(`/finance/audit?invoice=${inv.id}`)}>
                  Audit
                </Btn>
                {inv.status === 'DRAFT' && hasPermission('APPROVE_INVOICE') && (
                  <Btn small variant="approve" icon="check" loading={busy === inv.id} onClick={() => handleApprove(inv)}>
                    Approve
                  </Btn>
                )}
                <Btn small variant="ghost" icon="download" aria-label="Download report" title="Download report" onClick={() => handleDownload(inv)} />
              </>
            )}
            empty={
              <EmptyState icon="receipt" title="No invoices">
                Generate one from approved timesheets, or approve a reached milestone.
              </EmptyState>
            }
          />
        )}
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Generate invoice"
        subtitle="Totals approved hours × contracted rate for the period."
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Btn>
            <Btn type="submit" form="invoice-form" loading={saving}>
              Generate draft
            </Btn>
          </>
        }
      >
        {formError && <Alert>{formError}</Alert>}
        <form id="invoice-form" onSubmit={handleGenerate}>
          <Field label="Contract" hint="Hourly contracts only — milestone invoices are raised on approval.">
            <select value={form.contractId} onChange={(e) => setForm((f) => ({ ...f, contractId: e.target.value }))} required>
              <option value="">Select a contract</option>
              {hourlyContracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
          <div className="field-row">
            <Field label="From">
              <input type="date" value={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} required />
            </Field>
            <Field label="To">
              <input type="date" value={form.periodEnd} min={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} required />
            </Field>
          </div>
          <div className="cluster mt-12">
            {[
              ['Last month', -1],
              ['This month', 0],
            ].map(([label, offset]) => (
              <button
                key={label}
                type="button"
                className="btn btn-secondary btn-sm btn-pill"
                onClick={() => {
                  const { start, end } = monthBounds(offset)
                  setForm((f) => ({ ...f, periodStart: start, periodEnd: end }))
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </form>
      </Drawer>
    </>
  )
}
