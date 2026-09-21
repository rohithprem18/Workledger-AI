import { useState } from 'react'
import { getCompanies, createCompany, updateCompany } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Drawer from '../../components/Drawer'
import Btn from '../../components/Btn'

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

const EMPTY = { name: '', contactEmail: '', contactPhone: '', address: '' }

export default function Clients() {
  const { data, loading, error, reload } = useFetch(getCompanies, [])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing]       = useState(null)   // null = create
  const [form, setForm]             = useState(EMPTY)
  const [actionError, setActionError] = useState(null)
  const [saving, setSaving]         = useState(false)

  const companies = data ?? []

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setActionError(null)
    setDrawerOpen(true)
  }

  function openEdit(c) {
    setEditing(c)
    setForm({ name: c.name, contactEmail: c.contactEmail, contactPhone: c.contactPhone, address: c.address ?? '' })
    setActionError(null)
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setEditing(null)
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setActionError(null)
    try {
      if (editing) {
        await updateCompany(editing.id, form)
      } else {
        await createCompany(form)
      }
      closeDrawer()
      reload()
    } catch (err) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Company accounts"
        action={<Btn onClick={openCreate}>+ ADD CLIENT</Btn>}
      />
      <div style={{ padding: '24px 32px' }}>
        {error && <div style={ERR}>ERROR: {error}</div>}

        {loading ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : companies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7a9ab0', fontFamily: 'monospace', fontSize: 13 }}>
            <div style={{ marginBottom: 16 }}>No clients found</div>
            <Btn onClick={openCreate}>+ Create first client</Btn>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Contact Email</th>
                <th>Contact Phone</th>
                <th>Address</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(c => (
                <tr key={c.id}>
                  <td style={{ color: '#f0f2f5', fontWeight: 600 }}>{c.name}</td>
                  <td>{c.contactEmail}</td>
                  <td>{c.contactPhone}</td>
                  <td style={{ color: '#7a9ab0' }}>{c.address ?? '—'}</td>
                  <td>
                    <Btn small variant="ghost" onClick={() => openEdit(c)}>EDIT</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? 'EDIT CLIENT' : 'ADD CLIENT'}
      >
        {actionError && <div style={ERR}>ERROR: {actionError}</div>}
        <form onSubmit={handleSubmit}>
          <div style={FIELD}>
            <label style={LABEL}>Company Name</label>
            <input value={form.name} onChange={set('name')} required />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Contact Email</label>
            <input type="email" value={form.contactEmail} onChange={set('contactEmail')} required />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Contact Phone</label>
            <input value={form.contactPhone} onChange={set('contactPhone')} />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Address</label>
            <input value={form.address} onChange={set('address')} />
          </div>
          <Btn type="submit" disabled={saving}>
            {saving ? 'SAVING...' : editing ? 'UPDATE CLIENT' : 'CREATE CLIENT'}
          </Btn>
        </form>
      </Drawer>
    </div>
  )
}
