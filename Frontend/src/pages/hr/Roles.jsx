import { useState } from 'react'
import {
  getRoles, createRole, deleteRole, updateRolePermissions, getPermissions,
} from '../../api'
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

export default function Roles() {
  const roles = useFetch(getRoles, [])
  const permissions = useFetch(getPermissions, [])

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', permissionIds: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [permsEditor, setPermsEditor] = useState(null)
  const [editorPerms, setEditorPerms] = useState([])
  const [editorSaving, setEditorSaving] = useState(false)

  const roleList = roles.data ?? []
  const permList = permissions.data ?? []

  function toggle(arr, id) {
    return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createRole(form)
      setCreateOpen(false)
      setForm({ name: '', description: '', permissionIds: [] })
      roles.reload()
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete role "${name}"? This cannot be undone.`)) return
    setError(null)
    try {
      await deleteRole(id)
      roles.reload()
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Delete failed')
    }
  }

  function openPermsEditor(r) {
    setPermsEditor(r)
    setEditorPerms((r.permissions ?? []).map(p => p.id))
    setError(null)
  }

  async function savePerms() {
    setEditorSaving(true)
    setError(null)
    try {
      await updateRolePermissions(permsEditor.id, editorPerms)
      setPermsEditor(null)
      roles.reload()
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Update failed')
    } finally {
      setEditorSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Roles"
        subtitle="HR · Role definitions and permissions"
        action={<Btn onClick={() => { setForm({ name: '', description: '', permissionIds: [] }); setError(null); setCreateOpen(true) }}>+ NEW ROLE</Btn>}
      />
      <div style={{ padding: '24px 32px' }}>
        {(roles.error || error) && <div style={ERR}>ERROR: {roles.error || error}</div>}
        {roles.loading ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Permissions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roleList.map(r => (
                <tr key={r.id}>
                  <td style={{ color: '#f0f2f5', fontWeight: 600 }}>{r.name}</td>
                  <td style={{ color: '#7a9ab0' }}>{r.description ?? '—'}</td>
                  <td style={{ color: '#7a9ab0', fontSize: 11 }}>
                    {(r.permissions ?? []).length} perm(s)
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small variant="ghost" onClick={() => openPermsEditor(r)}>EDIT PERMS</Btn>
                      <Btn small variant="danger" onClick={() => handleDelete(r.id, r.name)}>DELETE</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="NEW ROLE" width={560}>
        {error && <div style={ERR}>ERROR: {error}</div>}
        <form onSubmit={handleCreate}>
          <div style={FIELD}>
            <label style={LABEL}>Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Description</label>
            <textarea rows={2} style={{ width: '100%' }}
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Permissions</label>
            <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid #1e3a4a', padding: 10 }}>
              {permList.map(p => (
                <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#f0f2f5', fontSize: 11, padding: '3px 0' }}>
                  <input
                    type="checkbox"
                    checked={form.permissionIds.includes(p.id)}
                    onChange={() => setForm(f => ({ ...f, permissionIds: toggle(f.permissionIds, p.id) }))}
                  />
                  <span>
                    <span style={{ fontFamily: 'monospace', color: '#ff6b00' }}>{p.code}</span>
                    <span style={{ color: '#7a9ab0', marginLeft: 6 }}>{p.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <Btn type="submit" disabled={saving}>{saving ? 'CREATING...' : 'CREATE ROLE'}</Btn>
        </form>
      </Drawer>

      <Drawer open={!!permsEditor} onClose={() => setPermsEditor(null)} title={`PERMISSIONS — ${permsEditor?.name ?? ''}`} width={560}>
        {error && <div style={ERR}>ERROR: {error}</div>}
        <div style={FIELD}>
          <div style={{ maxHeight: 480, overflowY: 'auto', border: '1px solid #1e3a4a', padding: 10 }}>
            {permList.map(p => (
              <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#f0f2f5', fontSize: 11, padding: '3px 0' }}>
                <input
                  type="checkbox"
                  checked={editorPerms.includes(p.id)}
                  onChange={() => setEditorPerms(ids => toggle(ids, p.id))}
                />
                <span>
                  <span style={{ fontFamily: 'monospace', color: '#ff6b00' }}>{p.code}</span>
                  <span style={{ color: '#7a9ab0', marginLeft: 6 }}>{p.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <Btn onClick={savePerms} disabled={editorSaving}>{editorSaving ? 'SAVING...' : 'SAVE PERMISSIONS'}</Btn>
      </Drawer>
    </div>
  )
}
