import { useState } from 'react'
import { getUsers, createUser, updateUserRoles, deactivateUser, resetUserPassword, getRoles } from '../../api'
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
  errorText,
  initials,
} from '../../components/ui'

const EMPTY = { username: '', email: '', password: '', roleIds: [] }

/** Mirrors the API's password rules so the form fails before the round trip does. */
function passwordProblem(pwd) {
  if (pwd.length < 12) return 'At least 12 characters'
  if (!/[A-Z]/.test(pwd)) return 'Add an uppercase letter'
  if (!/[a-z]/.test(pwd)) return 'Add a lowercase letter'
  if (!/[0-9]/.test(pwd)) return 'Add a digit'
  if (!/[^A-Za-z0-9]/.test(pwd)) return 'Add a symbol'
  if (/\s/.test(pwd)) return 'No spaces'
  return null
}

function RoleChecklist({ roles, selected, onChange }) {
  return (
    <div className="card list">
      {roles.map((r) => (
        <label key={r.id} className="list-item" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={selected.includes(r.id)}
            onChange={() =>
              onChange(selected.includes(r.id) ? selected.filter((x) => x !== r.id) : [...selected, r.id])
            }
          />
          <div className="grow">
            <div className="mono t-sm t-ink">{r.name}</div>
            {r.description && <div className="t-sm t-mute">{r.description}</div>}
          </div>
        </label>
      ))}
    </div>
  )
}

export default function Users() {
  const { user: me } = useAuth()
  const users = useFetch(getUsers, [])
  const roles = useFetch(getRoles, [])

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const [rolesEditor, setRolesEditor] = useState(null)
  const [editorRoleIds, setEditorRoleIds] = useState([])
  const [editorSaving, setEditorSaving] = useState(false)

  const [pwdUser, setPwdUser] = useState(null)
  const [pwd, setPwd] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)

  const [confirmUser, setConfirmUser] = useState(null)
  const [deactivating, setDeactivating] = useState(false)
  const [query, setQuery] = useState('')

  const roleList = roles.data ?? []
  const rows = (users.data ?? []).filter((u) =>
    `${u.username} ${u.email} ${(u.roleNames ?? []).join(' ')}`.toLowerCase().includes(query.toLowerCase()),
  )
  const createProblem = form.password ? passwordProblem(form.password) : null
  const resetProblem = pwd ? passwordProblem(pwd) : null

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      await createUser(form)
      setCreateOpen(false)
      setNotice(`User ${form.username} created.`)
      setForm(EMPTY)
      users.reload()
    } catch (err) {
      setFormError(errorText(err, 'Could not create the user'))
    } finally {
      setSaving(false)
    }
  }

  async function saveRoles() {
    setEditorSaving(true)
    setFormError(null)
    try {
      await updateUserRoles(rolesEditor.id, editorRoleIds)
      setNotice(`Roles for ${rolesEditor.username} updated.`)
      setRolesEditor(null)
      users.reload()
    } catch (err) {
      setFormError(errorText(err, 'Could not update roles'))
    } finally {
      setEditorSaving(false)
    }
  }

  async function handleDeactivate() {
    setDeactivating(true)
    setError(null)
    try {
      await deactivateUser(confirmUser.id)
      setNotice(`${confirmUser.username} can no longer sign in.`)
      users.reload()
    } catch (err) {
      setError(errorText(err, 'Could not deactivate'))
    } finally {
      setDeactivating(false)
      setConfirmUser(null)
    }
  }

  async function submitReset(e) {
    e.preventDefault()
    setPwdSaving(true)
    setFormError(null)
    try {
      await resetUserPassword(pwdUser.id, pwd)
      setNotice(`Password reset for ${pwdUser.username}.`)
      setPwdUser(null)
      setPwd('')
    } catch (err) {
      setFormError(errorText(err, 'Could not reset the password'))
    } finally {
      setPwdSaving(false)
    }
  }

  const columns = [
    {
      key: 'username',
      header: 'User',
      primary: true,
      render: (u) => (
        <div className="row gap-12">
          <span className="avatar avatar-sm">{initials(u.username)}</span>
          <div>
            <div className="t-ink mono" style={{ fontWeight: 500 }}>
              {u.username}
              {u.username === me?.username && <span className="t-mute t-sm"> (you)</span>}
            </div>
            <div className="t-sm t-mute t-wrap">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (u) =>
        (u.roleNames ?? []).length ? (
          <div className="cluster gap-4">
            {u.roleNames.map((r) => (
              <span key={r} className="badge badge-outline badge-plain mono">
                {r}
              </span>
            ))}
          </div>
        ) : (
          <span className="t-faint">None</span>
        ),
    },
    { key: 'status', header: 'Status', render: (u) => <StatusPill value={u.active ? 'ACTIVE' : 'INACTIVE'} /> },
  ]

  return (
    <>
      <PageHeader eyebrow="People" title="Users" subtitle="Sign-in accounts and the roles that decide what each can do.">
        <Btn
          icon="plus"
          onClick={() => {
            setForm(EMPTY)
            setFormError(null)
            setCreateOpen(true)
          }}
        >
          Add user
        </Btn>
      </PageHeader>

      {(users.error || error) && <Alert onClose={() => setError(null)}>{users.error || error}</Alert>}
      {notice && (
        <Alert tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <Card>
        <div className="card-header">
          <input
            type="search"
            placeholder="Search users or roles…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 300 }}
            aria-label="Search users"
          />
          <span className="t-sm t-mute t-nowrap">{rows.length} users</span>
        </div>
        {users.loading ? (
          <LoadingRows />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            actions={(u) => (
              <>
                <Btn
                  small
                  variant="secondary"
                  icon="shield"
                  onClick={() => {
                    setRolesEditor(u)
                    setEditorRoleIds(u.roleIds ?? [])
                    setFormError(null)
                  }}
                >
                  Roles
                </Btn>
                <Btn
                  small
                  variant="ghost"
                  icon="key"
                  onClick={() => {
                    setPwdUser(u)
                    setPwd('')
                    setFormError(null)
                  }}
                >
                  Reset
                </Btn>
                {u.active && u.username !== me?.username && (
                  <Btn small variant="ghost" onClick={() => setConfirmUser(u)}>
                    Deactivate
                  </Btn>
                )}
              </>
            )}
            empty={<EmptyState icon="key" title="No users match" />}
          />
        )}
      </Card>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add user"
        subtitle="For staff accounts. Contractors are onboarded from Employees."
        footer={
          <>
            <Btn variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Btn>
            <Btn
              type="submit"
              form="user-form"
              loading={saving}
              disabled={!!createProblem || form.roleIds.length === 0}
            >
              Create user
            </Btn>
          </>
        }
      >
        {formError && <Alert>{formError}</Alert>}
        <form id="user-form" onSubmit={handleCreate}>
          <Field label="Username">
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              autoCapitalize="none"
              autoComplete="off"
              required
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </Field>
          <Field
            label="Password"
            hint={
              createProblem ? (
                <span className="t-warning">{createProblem}</span>
              ) : (
                '12+ characters with upper, lower, digit and symbol.'
              )
            }
          >
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
              required
            />
          </Field>
          <div className="eyebrow mt-24" style={{ marginBottom: 10 }}>
            Roles
          </div>
          <RoleChecklist roles={roleList} selected={form.roleIds} onChange={(ids) => setForm((f) => ({ ...f, roleIds: ids }))} />
        </form>
      </Drawer>

      <Drawer
        open={!!rolesEditor}
        onClose={() => setRolesEditor(null)}
        title="Roles"
        subtitle={rolesEditor?.username}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setRolesEditor(null)}>
              Cancel
            </Btn>
            <Btn loading={editorSaving} disabled={editorRoleIds.length === 0} onClick={saveRoles}>
              Save roles
            </Btn>
          </>
        }
      >
        {formError && <Alert>{formError}</Alert>}
        <RoleChecklist roles={roleList} selected={editorRoleIds} onChange={setEditorRoleIds} />
      </Drawer>

      <Drawer
        open={!!pwdUser}
        onClose={() => setPwdUser(null)}
        title="Reset password"
        subtitle={pwdUser?.username}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPwdUser(null)}>
              Cancel
            </Btn>
            <Btn type="submit" form="pwd-form" loading={pwdSaving} disabled={!pwd || !!resetProblem}>
              Reset password
            </Btn>
          </>
        }
      >
        {formError && <Alert>{formError}</Alert>}
        <form id="pwd-form" onSubmit={submitReset}>
          <Field
            label="New password"
            hint={resetProblem ? <span className="t-warning">{resetProblem}</span> : '12+ characters with upper, lower, digit and symbol.'}
          >
            <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" required />
          </Field>
        </form>
      </Drawer>

      <Drawer
        open={!!confirmUser}
        onClose={() => setConfirmUser(null)}
        title="Deactivate user?"
        subtitle={confirmUser?.username}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setConfirmUser(null)}>
              Keep active
            </Btn>
            <Btn variant="danger" loading={deactivating} onClick={handleDeactivate}>
              Deactivate
            </Btn>
          </>
        }
      >
        <p className="t-body">Their sign-in stops working on their next request. Their history is kept.</p>
      </Drawer>
    </>
  )
}
