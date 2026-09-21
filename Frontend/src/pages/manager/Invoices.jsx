import { useState } from 'react'
import { getContracts, getInvoicesByContract, generateInvoice, approveInvoice } from '../../api'
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

function ContractInvoices({ contract, onActionError }) {
  const { data, loading, reload } = useFetch(
    () => getInvoicesByContract(contract.id),
    [contract.id],
  )
  const [expanded, setExpanded] = useState(false)
  const invoices = data ?? []

  async function handleApprove(id) {
    try {
      await approveInvoice(id)
      reload()
    } catch (err) {
      onActionError(err?.response?.data?.message ?? err?.message ?? 'Approve failed')
    }
  }

  return (
    <div style={{ marginBottom: 24, background: '#0d1b2a', border: '1px solid #1e3a4a', borderRadius: 3 }}>
      <div
        style={{
          padding: '10px 16px', borderBottom: expanded ? '1px solid #1e3a4a' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(x => !x)}
      >
        <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, color: '#f0f2f5', fontWeight: 600 }}>
          {contract.title}
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {!loading && (
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#7a9ab0' }}>
              {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
            </span>
          )}
          <span style={{ color: '#7a9ab0', fontSize: 14 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        loading ? (
          <div style={{ padding: '12px 16px', color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: '12px 16px', color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>No invoices for this contract</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Period Start</th>
                <th>Period End</th>
                <th>Status</th>
                <th>Total Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td>{inv.periodStart}</td>
                  <td>{inv.periodEnd}</td>
                  <td><StatusPill value={inv.status} /></td>
                  <td style={{ color: '#ff6b00', fontWeight: 700 }}>
                    {inv.totalAmount != null ? `$${Number(inv.totalAmount).toFixed(2)}` : '—'}
                  </td>
                  <td>
                    {inv.status === 'PENDING_APPROVAL' && (
                      <Btn small variant="approve" onClick={() => handleApprove(inv.id)}>APPROVE</Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}

export default function Invoices() {
  const contracts = useFetch(getContracts, [])

  const [drawerOpen, setDrawerOpen]     = useState(false)
  const [form, setForm]                 = useState({ contractId: '', periodStart: '', periodEnd: '' })
  const [genError, setGenError]         = useState(null)
  const [generating, setGenerating]     = useState(false)
  const [actionError, setActionError]   = useState(null)
  const [refreshKey, setRefreshKey]     = useState(0)

  const contractList = contracts.data ?? []

  function openDrawer() {
    setForm({ contractId: '', periodStart: '', periodEnd: '' })
    setGenError(null)
    setDrawerOpen(true)
  }

  async function handleGenerate(e) {
    e.preventDefault()
    setGenerating(true)
    setGenError(null)
    try {
      await generateInvoice(form)
      setDrawerOpen(false)
      setRefreshKey(k => k + 1)
    } catch (err) {
      setGenError(err?.response?.data?.message ?? err?.message ?? 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Billing and invoice management"
        action={<Btn onClick={openDrawer}>+ GENERATE INVOICE</Btn>}
      />
      <div style={{ padding: '24px 32px' }}>
        {(contracts.error || actionError) && (
          <div style={ERR}>ERROR: {contracts.error || actionError}</div>
        )}

        {contracts.loading ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : contractList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7a9ab0', fontFamily: 'monospace', fontSize: 13 }}>
            No contracts found. Create a contract first.
          </div>
        ) : (
          contractList.map(c => (
            <ContractInvoices
              key={`${c.id}-${refreshKey}`}
              contract={c}
              onActionError={setActionError}
            />
          ))
        )}
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="GENERATE INVOICE">
        {genError && <div style={ERR}>ERROR: {genError}</div>}
        <form onSubmit={handleGenerate}>
          <div style={FIELD}>
            <label style={LABEL}>Contract</label>
            <select
              value={form.contractId}
              onChange={e => setForm(f => ({ ...f, contractId: e.target.value }))}
              required
            >
              <option value="">— Select contract —</option>
              {contractList.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Period Start</label>
            <input
              type="date"
              value={form.periodStart}
              onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))}
              required
            />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Period End</label>
            <input
              type="date"
              value={form.periodEnd}
              onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))}
              required
            />
          </div>
          <Btn type="submit" disabled={generating}>
            {generating ? 'GENERATING...' : 'GENERATE INVOICE'}
          </Btn>
        </form>
      </Drawer>
    </div>
  )
}
