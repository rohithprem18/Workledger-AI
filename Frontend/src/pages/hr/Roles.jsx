import { useState } from 'react'
import { getRoles, createRole, deleteRole, updateRolePermissions, getPermissions } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Drawer from '../../components/Drawer'
import Btn from '../../components/Btn'
import Icon from '../../components/Icon'
import PermissionPicker from './PermissionPicker'
import { groupPermissions } from './permissionGroups'
import { Alert, Card, EmptyState, Field, Skeleton, errorText } from '../../components/ui'

const EMPTY = { name: '', description: '', permissionIds: [] }

/**
 * Roles are data, not code: every endpoint checks a permission, never a role
 * name, so a new role works everywhere the moment it is granted permissions.
 */
export default function Roles() {
  const roles = useFetch(getRoles, [])
  const permissions = useFetch(getPermissions, [])

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const [editor, setEditor] = useState(null)
  const [editorPerms, setEditorPerms] = useState([])
  const [editorSaving, setEditorSaving] = useState(false)

  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const roleList = roles.data ?? []
  const permList = permissions.data ?? []

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      await createRole(form)
      setCreateOpen(false)
      setNotice(`Role ${form.name} created.`)
      setForm(EMPTY)
      roles.reload()
    } catch (err) {
      setFormError(errorText(err, 'Could not create the role'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleteBusy(true)
    setError(null)
    try {
      await deleteRole(deleting.id)
      setNotice(`Role ${deleting.name} deleted.`)
      roles.reload()
    } catch (err) {
      setError(errorText(err, 'Could not delete the role'))
    } finally {
      setDeleteBusy(false)
      setDeleting(null)
    }
  }

  function openEditor(r) {
    setEditor(r)
    setEditorPerms((r.permissions ?? []).map((p) => p.id))
    setFormError(null)
  }

  async function savePerms() {
    setEditorSaving(true)
    setFormError(null)
    try {
      await updateRolePermissions(editor.id, editorPerms)
      setNotice(`Permissions for ${editor.name} updated. They apply on the next request.`)
      setEditor(null)
      roles.reload()
    } catch (err) {
      setFormError(errorText(err, 'Could not update permissions'))
    } finally {
      setEditorSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Roles"
        subtitle="Bundles of permissions. Changes take effect on each user's next request — no redeploy."
      >
        <Btn
          icon="plus"
          onClick={() => {
            setForm(EMPTY)
            setFormError(null)
            setCreateOpen(true)
          }}
        >
          New role
        </Btn>
      </PageHeader>

      {(roles.error || error) && <Alert onClose={() => setError(null)}>{roles.error || error}</Alert>}
      {notice && (
        <Alert tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {roles.loading ? (
        <div className="grid grid-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={150} />
          ))}
        </div>
      ) : roleList.length === 0 ? (
        <Card>
          <EmptyState icon="shield" title="No roles defined" />
        </Card>
      ) : (
        <div className="grid grid-2">
          {roleList.map((r) => {
            const groups = groupPermissions(r.permissions ?? [])
            return (
              <Card key={r.id} className="stack">
                <div className="card-body grow">
                  <div className="row between gap-8">
                    <div className="row gap-8">
                      <Icon name="shield" />
                      <span className="mono t-label">{r.name}</span>
                    </div>
                    <span className="badge badge-neutral badge-plain t-num">
                      {(r.permissions ?? []).length} permissions
                    </span>
                  </div>
                  <p className="t-sm t-body mt-8">{r.description || <span className="t-faint">No description</span>}</p>
                  <div className="cluster gap-4 mt-12">
                    {groups.length === 0 ? (
                      <span className="t-sm t-faint">No permissions granted</span>
                    ) : (
                      groups.map(([group, items]) => (
                        <span key={group} className="badge badge-outline badge-plain">
                          {group} <span className="t-mute">{items.length}</span>
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="card-footer">
                  <Btn small variant="ghost" icon="trash" onClick={() => setDeleting(r)}>
                    Delete
                  </Btn>
                  <Btn small variant="secondary" icon="edit" onClick={() => openEditor(r)}>
                    Permissions
                  </Btn>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New role"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Btn>
            <Btn type="submit" form="role-form" loading={saving}>
              Create role
            </Btn>
          </>
        }
      >
        {formError && <Alert>{formError}</Alert>}
        <form id="role-form" onSubmit={handleCreate}>
          <Field label="Name" hint="Upper snake case, e.g. PROJECT_LEAD">
            <input
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))
              }
              pattern="[A-Z][A-Z0-9_]*"
              className="mono"
              required
            />
          </Field>
          <Field label="Description">
            <textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <div className="eyebrow mt-24" style={{ marginBottom: 12 }}>
            Permissions · {form.permissionIds.length} selected
          </div>
          <PermissionPicker
            permissions={permList}
            selected={form.permissionIds}
            onChange={(ids) => setForm((f) => ({ ...f, permissionIds: ids }))}
          />
        </form>
      </Drawer>

      <Drawer
        open={!!editor}
        onClose={() => setEditor(null)}
        title="Permissions"
        subtitle={editor ? `${editor.name} · ${editorPerms.length} selected` : ''}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEditor(null)}>
              Cancel
            </Btn>
            <Btn loading={editorSaving} onClick={savePerms}>
              Save permissions
            </Btn>
          </>
        }
      >
        {formError && <Alert>{formError}</Alert>}
        <PermissionPicker permissions={permList} selected={editorPerms} onChange={setEditorPerms} />
      </Drawer>

      <Drawer
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete role?"
        subtitle={deleting?.name}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleting(null)}>
              Keep role
            </Btn>
            <Btn variant="danger" loading={deleteBusy} onClick={handleDelete}>
              Delete
            </Btn>
          </>
        }
      >
        <p className="t-body">
          This cannot be undone. A role still assigned to users cannot be deleted — reassign them first.
        </p>
      </Drawer>
    </>
  )
}
