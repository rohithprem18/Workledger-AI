import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getContracts, getCompanies, createContract, getBillingTypes } from '../../api'
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
const EMPTY = { title: '', description: '', companyId: '', billingTypeId: '', startDate: '', endDate: '' }

export default function Contracts() {
  const navigate = useNavigate()
  const contracts = useFetch(getContracts, [])
  const companies = useFetch(getCompanies, [])
  const billingTypes = useFetch(getBillingTypes, [])

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm]             = useState(EMPTY)
  const [actionError, setActionError] = useState(null)
  const [saving, setSaving]         = useState(false)

  const contractList = contracts.data ?? []
  const companyList  = companies.data  ?? []
  const btList       = billingTypes.data ?? []

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function openCreate() {
    const defaultBt = btList.find(bt => bt.code === 'HOURLY')?.id ?? ''
    setForm({ ...EMPTY, billingTypeId: defaultBt })
    setActionError(null)
    setDrawerOpen(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setActionError(null)
    try {
      await createContract(form)
      setDrawerOpen(false)
      contracts.reload()
    } catch (err) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const companyName = (id) => companyList.find(c => c.id === id)?.name ?? id ?? '—'

  return (
    <div>
      <PageHeader
        title="Contracts"
        subtitle="Client contracts and requirements"
        action={<Btn onClick={openCreate}>+ NEW CONTRACT</Btn>}
      />
      <div style={{ padding: '24px 32px' }}>
        {(contracts.error || companies.error) && (
          <div style={ERR}>ERROR: {contracts.error || companies.error}</div>
        )}

        {contracts.loading ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : contractList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7a9ab0', fontFamily: 'monospace', fontSize: 13 }}>
            <div style={{ marginBottom: 16 }}>No contracts found</div>
            <Btn onClick={openCreate}>+ Create first contract</Btn>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Client</th>
                <th>Billing Type</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contractList.map(c => (
                <tr
                  key={c.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/contracts/${c.id}`)}
                >
                  <td style={{ color: '#f0f2f5', fontWeight: 600 }}>{c.title}</td>
                  <td>{companyName(c.companyId)}</td>
                  <td><StatusPill value={c.billingTypeCode ?? c.billingTypeLabel ?? '—'} /></td>
                  <td>{c.startDate}</td>
                  <td>{c.endDate}</td>
                  <td><StatusPill value={c.active ? 'ACTIVE' : 'INACTIVE'} /></td>
                  <td onClick={e => e.stopPropagation()}>
                    <Btn small variant="ghost" onClick={() => navigate(`/contracts/${c.id}`)}>VIEW</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="NEW CONTRACT" width={520}>
        {actionError && <div style={ERR}>ERROR: {actionError}</div>}
        <form onSubmit={handleSubmit}>
          <div style={FIELD}>
            <label style={LABEL}>Title</label>
            <input value={form.title} onChange={set('title')} required />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Description</label>
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Client</label>
            <select value={form.companyId} onChange={set('companyId')} required>
              <option value="">— Select client —</option>
              {companyList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Billing Type</label>
            <select value={form.billingTypeId} onChange={set('billingTypeId')} required>
              <option value="">— Select billing type —</option>
              {btList.map(bt => (
                <option key={bt.id} value={bt.id}>{bt.label} ({bt.code})</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div>
              <label style={LABEL}>Start Date</label>
              <input type="date" value={form.startDate} onChange={set('startDate')} required />
            </div>
            <div>
              <label style={LABEL}>End Date</label>
              <input type="date" value={form.endDate} onChange={set('endDate')} required />
            </div>
          </div>
          <div style={{ marginBottom: 8, padding: '10px 12px', background: '#ff6b0008', border: '1px solid #ff6b0025', borderRadius: 3 }}>
            <span style={{ fontSize: 11, color: '#7a9ab0', fontFamily: 'monospace' }}>
              Requirements, milestones, and assignments are managed from the contract detail page.
            </span>
          </div>
          <Btn type="submit" disabled={saving}>
            {saving ? 'CREATING...' : 'CREATE CONTRACT'}
          </Btn>
        </form>
      </Drawer>
    </div>
  )
}
