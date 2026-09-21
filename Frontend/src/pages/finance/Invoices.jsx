import { useState } from 'react'
import {
  getAllInvoices, getContracts, generateInvoice, approveInvoice, downloadInvoiceReport,
} from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Drawer from '../../components/Drawer'
import Btn from '../../components/Btn'
import StatusPill from '../../components/StatusPill'

const ERR = {
  padding: '10px 16px', background: '#ef444415', color: '#ef4444',
  borderLeft: '2px solid #ef4444', marginBottom: 16,
  fontFamily: 'monospace', fontSize: 12,
}
const LABEL = {
  display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
  color: '#7a9ab0', fontFamily: 'ui-monospace, Consolas, monospace',
  marginBottom: 6, textTransform: 'uppercase',
}
const FIELD = { marginBottom: 18 }

export default function Invoices() {
  const invoices  = useFetch(getAllInvoices, [])
  const contracts = useFetch(getContracts, [])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState({ contractId: '', periodStart: '', periodEnd: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const invList = invoices.data ?? []
  const contractList = (contracts.data ?? []).filter(c => c.billingTypeCode === 'HOURLY')
  const titleById = Object.fromEntries((contracts.data ?? []).map(c => [c.id, c.title]))

  async function handleApprove(id) {
    setError(null)
    try {
      await approveInvoice(id)
      invoices.reload()
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Approve failed')
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
    setError(null)
    try {
      await generateInvoice(form)
      setDrawerOpen(false)
      setForm({ contractId: '', periodStart: '', periodEnd: '' })
      invoices.reload()
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Generation failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Finance · Generate and approve invoices"
        action={<Btn onClick={() => { setError(null); setDrawerOpen(true) }}>+ GENERATE HOURLY INVOICE</Btn>}
      />
      <div style={{ padding: '24px 32px' }}>
        {(invoices.error || error) && <div style={ERR}>ERROR: {invoices.error || error}</div>}
        {invoices.loading ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : invList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7a9ab0', fontFamily: 'monospace', fontSize: 13 }}>
            No invoices yet
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Period</th>
                <th>Kind</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invList.map(inv => (
                <tr key={inv.id}>
                  <td style={{ color: '#f0f2f5', fontWeight: 600 }}>
                    {inv.contractTitle ?? titleById[inv.contractId] ?? '—'}
                  </td>
                  <td>{inv.periodStart} → {inv.periodEnd}</td>
                  <td style={{ color: '#7a9ab0' }}>{inv.milestoneId ? 'MILESTONE' : 'HOURLY'}</td>
                  <td style={{ color: '#ff6b00', fontWeight: 700 }}>
                    ${Number(inv.totalAmount ?? 0).toFixed(2)}
                  </td>
                  <td><StatusPill value={inv.status} /></td>
                  <td style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {inv.status === 'DRAFT' && (
                      <Btn small variant="approve" onClick={() => handleApprove(inv.id)}>APPROVE</Btn>
                    )}
                    <Btn small onClick={() => handleDownload(inv)}>⬇ REPORT</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="GENERATE HOURLY INVOICE">
        {error && <div style={ERR}>ERROR: {error}</div>}
        <form onSubmit={handleGenerate}>
          <div style={FIELD}>
            <label style={LABEL}>Contract (hourly)</label>
            <select value={form.contractId} onChange={e => setForm(f => ({ ...f, contractId: e.target.value }))} required>
              <option value="">— Select contract —</option>
              {contractList.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Period Start</label>
            <input type="date" value={form.periodStart} onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))} required />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Period End</label>
            <input type="date" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} required />
          </div>
          <Btn type="submit" disabled={saving}>{saving ? 'GENERATING...' : 'GENERATE'}</Btn>
        </form>
      </Drawer>
    </div>
  )
}
