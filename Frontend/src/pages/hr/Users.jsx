import { useState } from 'react'
import {
  getUsers, createUser, updateUserRoles, deactivateUser, resetUserPassword, getRoles,
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
const EMPTY = { username: '', email: '', password: '', roleIds: [] }

export default function Users() {
  const users = useFetch(getUsers, [])
  const roles = useFetch(getRoles, [])

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm]             = useState(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState(null)

  const [rolesEditor, setRolesEditor] = useState(null)
  const [editorRoleIds, setEditorRoleIds] = useState([])
  const [editorSaving, setEditorSaving]   = useState(false)

  const [pwdUser, setPwdUser]     = useState(null)
  const [pwd, setPwd]             = useState('')

  const userList = users.data ?? []
  const roleList = roles.data ?? []

  function toggleRole(idSet, id) {
    return idSet.includes(id) ? idSet.filter(x => x !== id) : [...idSet, id]
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createUser(form)
      setCreateOpen(false)
      setForm(EMPTY)
      users.reload()
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  function openRolesEditor(u) {
    setRolesEditor(u)
    setEditorRoleIds(u.roleIds ?? [])
    setError(null)
  }

  async function saveRoles() {
    setEditorSaving(true)
    setError(null)
    try {
      await updateUserRoles(rolesEditor.id, editorRoleIds)
      setRolesEditor(null)
      users.reload()
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Update failed')
    } finally {
      setEditorSaving(false)
    }
  }

  async function handleDeactivate(id) {
    try {
      await deactivateUser(id)
      users.reload()
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Deactivate failed')
    }
  }

  async function submitReset(e) {
    e.preventDefault()
    try {
      await resetUserPassword(pwdUser.id, pwd)
      setPwdUser(null)
      setPwd('')
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Reset failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="HR · System users and role assignment"
        action={<Btn onClick={() => { setForm(EMPTY); setError(null); setCreateOpen(true) }}>+ ADD USER</Btn>}
      />
      <div style={{ padding: '24px 32px' }}>
        {(users.error || error) && <div style={ERR}>ERROR: {users.error || error}</div>}
        {users.loading ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {userList.map(u => (
                <tr key={u.id}>
                  <td style={{ color: '#f0f2f5', fontWeight: 600 }}>{u.username}</td>
                  <td>{u.email}</td>
                  <td style={{ color: '#7a9ab0', fontSize: 11 }}>{(u.roleNames ?? []).join(', ') || '—'}</td>
                  <td><StatusPill value={u.active ? 'ACTIVE' : 'INACTIVE'} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small variant="ghost" onClick={() => openRolesEditor(u)}>ROLES</Btn>
                      <Btn small variant="ghost" onClick={() => { setPwdUser(u); setPwd('') }}>RESET PWD</Btn>
                      {u.active && (
                        <Btn small variant="danger" onClick={() => handleDeactivate(u.id)}>DEACTIVATE</Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="ADD USER">
        {error && <div style={ERR}>ERROR: {error}</div>}
        <form onSubmit={handleCreate}>
          <div style={FIELD}>
            <label style={LABEL}>Username</label>
            <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Password</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Roles</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {roleList.map(r => (
                <label key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#f0f2f5', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={form.roleIds.includes(r.id)}
                    onChange={() => setForm(f => ({ ...f, roleIds: toggleRole(f.roleIds, r.id) }))}
                  />
                  {r.name}
                </label>
              ))}
            </div>
          </div>
          <Btn type="submit" disabled={saving}>{saving ? 'CREATING...' : 'CREATE USER'}</Btn>
        </form>
      </Drawer>

      <Drawer open={!!rolesEditor} onClose={() => setRolesEditor(null)} title={`ROLES — ${rolesEditor?.username ?? ''}`}>
        {error && <div style={ERR}>ERROR: {error}</div>}
        <div style={FIELD}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {roleList.map(r => (
              <label key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#f0f2f5', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={editorRoleIds.includes(r.id)}
                  onChange={() => setEditorRoleIds(ids => toggleRole(ids, r.id))}
                />
                {r.name}
              </label>
            ))}
          </div>
        </div>
        <Btn onClick={saveRoles} disabled={editorSaving}>{editorSaving ? 'SAVING...' : 'SAVE ROLES'}</Btn>
      </Drawer>

      <Drawer open={!!pwdUser} onClose={() => setPwdUser(null)} title={`RESET PASSWORD — ${pwdUser?.username ?? ''}`}>
        <form onSubmit={submitReset}>
          <div style={FIELD}>
            <label style={LABEL}>New Password</label>
            <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} minLength={6} required />
          </div>
          <Btn type="submit">RESET</Btn>
        </form>
      </Drawer>
    </div>
  )
}
