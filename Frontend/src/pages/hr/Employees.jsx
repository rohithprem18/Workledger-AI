import { useState } from 'react'
import {
  getEmployees,
  createEmployee,
  deactivateEmployee,
  getSkills,
  getEmployeeSkills,
  assignSkill,
  removeSkill,
} from '../../api'
import { useFetch } from '../../hooks/useFetch'
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
  Tabs,
  errorText,
  initials,
} from '../../components/ui'

const EMPTY = { firstName: '', lastName: '', email: '', phone: '', username: '', password: '' }

/** Five-step proficiency picker; clearer than a number box. */
function LevelPicker({ value, onChange }) {
  return (
    <div className="tabs" role="radiogroup" aria-label="Proficiency">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={Number(value) === n}
          className={`tab${Number(value) === n ? ' active' : ''}`}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function LevelDots({ level }) {
  return (
    <span className="row gap-4" aria-label={`Level ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: n <= level ? 'var(--ink)' : 'var(--hairline-strong)',
          }}
        />
      ))}
    </span>
  )
}

/** HR's roster: onboarding contractors (which also creates their login) and their skills. */
export default function Employees() {
  const employees = useFetch(getEmployees, [])
  const allSkills = useFetch(getSkills, [])

  const [createDrawer, setCreateDrawer] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [createError, setCreateError] = useState(null)
  const [saving, setSaving] = useState(false)

  const [skillsEmp, setSkillsEmp] = useState(null)
  const [empSkills, setEmpSkills] = useState([])
  const [empSkillsLoading, setEmpSkillsLoading] = useState(false)
  const [skillForm, setSkillForm] = useState({ skillId: '', proficiencyLevel: 3 })
  const [skillError, setSkillError] = useState(null)
  const [skillSaving, setSkillSaving] = useState(false)

  const [confirmEmp, setConfirmEmp] = useState(null)
  const [deactivating, setDeactivating] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [filter, setFilter] = useState('ACTIVE')
  const [query, setQuery] = useState('')

  const all = employees.data ?? []
  const rows = all
    .filter((e) => (filter === 'ALL' ? true : filter === 'ACTIVE' ? e.active !== false : e.active === false))
    .filter((e) =>
      `${e.firstName} ${e.lastName} ${e.email} ${e.username}`.toLowerCase().includes(query.toLowerCase()),
    )
  const held = new Set(empSkills.map((s) => s.id))

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setCreateError(null)
    try {
      await createEmployee(form)
      setCreateDrawer(false)
      setNotice(`${form.firstName} ${form.lastName} onboarded. They can sign in as ${form.username}.`)
      setForm(EMPTY)
      employees.reload()
    } catch (err) {
      setCreateError(errorText(err, 'Could not create the employee'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate() {
    setDeactivating(true)
    setActionError(null)
    try {
      await deactivateEmployee(confirmEmp.id)
      setNotice(`${confirmEmp.firstName} ${confirmEmp.lastName} deactivated. Their login no longer works.`)
      setConfirmEmp(null)
      employees.reload()
    } catch (err) {
      setActionError(errorText(err, 'Could not deactivate'))
      setConfirmEmp(null)
    } finally {
      setDeactivating(false)
    }
  }

  async function loadSkills(emp) {
    const data = await getEmployeeSkills(emp.id)
    setEmpSkills(Array.isArray(data) ? data : [])
  }

  async function openSkills(emp) {
    setSkillsEmp(emp)
    setSkillForm({ skillId: '', proficiencyLevel: 3 })
    setSkillError(null)
    setEmpSkillsLoading(true)
    try {
      await loadSkills(emp)
    } catch {
      setEmpSkills([])
    } finally {
      setEmpSkillsLoading(false)
    }
  }

  async function handleAssignSkill(e) {
    e.preventDefault()
    if (!skillForm.skillId) {
      setSkillError('Choose a skill')
      return
    }
    setSkillSaving(true)
    setSkillError(null)
    try {
      await assignSkill(skillsEmp.id, {
        skillId: skillForm.skillId,
        proficiencyLevel: Number(skillForm.proficiencyLevel),
      })
      await loadSkills(skillsEmp)
      setSkillForm({ skillId: '', proficiencyLevel: 3 })
      employees.reload()
    } catch (err) {
      setSkillError(errorText(err, 'Could not add the skill'))
    } finally {
      setSkillSaving(false)
    }
  }

  async function handleRemoveSkill(skillId) {
    setSkillError(null)
    try {
      await removeSkill(skillsEmp.id, skillId)
      await loadSkills(skillsEmp)
      employees.reload()
    } catch (err) {
      setSkillError(errorText(err, 'Could not remove the skill'))
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Person',
      primary: true,
      render: (e) => (
        <div className="row gap-12">
          <span className="avatar avatar-sm">{initials(`${e.firstName} ${e.lastName}`)}</span>
          <div>
            <div className="t-ink" style={{ fontWeight: 500 }}>
              {e.firstName} {e.lastName}
            </div>
            <div className="t-sm t-mute mono">{e.username}</div>
          </div>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (e) => <span className="t-wrap">{e.email}</span> },
    {
      key: 'skills',
      header: 'Skills',
      render: (e) =>
        (e.skills ?? []).length ? (
          <div className="cluster gap-4">
            {e.skills.slice(0, 3).map((s) => (
              <span key={s.id} className="badge badge-outline badge-plain">
                {s.name} <span className="t-mute mono">L{s.proficiencyLevel}</span>
              </span>
            ))}
            {e.skills.length > 3 && <span className="t-sm t-mute">+{e.skills.length - 3}</span>}
          </div>
        ) : (
          <span className="t-faint">None</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => <StatusPill value={e.active === false ? 'INACTIVE' : 'ACTIVE'} />,
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Employees"
        subtitle="Onboard contractors and record their skills. Onboarding also creates their sign-in."
      >
        <Btn
          icon="userPlus"
          onClick={() => {
            setForm(EMPTY)
            setCreateError(null)
            setCreateDrawer(true)
          }}
        >
          Onboard employee
        </Btn>
      </PageHeader>

      {(employees.error || actionError) && (
        <Alert onClose={() => setActionError(null)}>{employees.error || actionError}</Alert>
      )}
      {notice && (
        <Alert tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <Card>
        <div className="card-header wrap">
          <Tabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'ACTIVE', label: 'Active', count: all.filter((e) => e.active !== false).length },
              { value: 'INACTIVE', label: 'Inactive', count: all.filter((e) => e.active === false).length },
              { value: 'ALL', label: 'All', count: all.length },
            ]}
          />
          <input
            type="search"
            placeholder="Search people…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 260 }}
            aria-label="Search people"
          />
        </div>
        {employees.loading ? (
          <LoadingRows />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            actions={(e) => (
              <>
                <Btn small variant="secondary" icon="tag" onClick={() => openSkills(e)}>
                  Skills
                </Btn>
                {e.active !== false && (
                  <Btn small variant="ghost" onClick={() => setConfirmEmp(e)}>
                    Deactivate
                  </Btn>
                )}
              </>
            )}
            empty={
              <EmptyState icon="users" title={all.length ? 'Nobody matches' : 'No employees yet'}>
                {all.length ? 'Try another filter or search.' : 'Onboard your first contractor to get started.'}
              </EmptyState>
            }
          />
        )}
      </Card>

      {/* ---------------------------------------------------- onboarding */}
      <Drawer
        open={createDrawer}
        onClose={() => setCreateDrawer(false)}
        title="Onboard employee"
        subtitle="Creates their profile and a sign-in with the contractor role."
        footer={
          <>
            <Btn variant="secondary" onClick={() => setCreateDrawer(false)}>
              Cancel
            </Btn>
            <Btn type="submit" form="employee-form" loading={saving}>
              Onboard
            </Btn>
          </>
        }
      >
        {createError && <Alert>{createError}</Alert>}
        <form id="employee-form" onSubmit={handleCreate}>
          <div className="field-row">
            <Field label="First name">
              <input value={form.firstName} onChange={set('firstName')} required />
            </Field>
            <Field label="Last name">
              <input value={form.lastName} onChange={set('lastName')} required />
            </Field>
          </div>
          <Field label="Work email">
            <input type="email" value={form.email} onChange={set('email')} required />
          </Field>
          <Field label="Phone">
            <input type="tel" value={form.phone} onChange={set('phone')} />
          </Field>
          <hr className="divider mt-24" />
          <div className="eyebrow mt-16" style={{ marginBottom: 12 }}>
            Sign-in
          </div>
          <Field label="Username">
            <input
              value={form.username}
              onChange={set('username')}
              autoCapitalize="none"
              autoComplete="off"
              required
            />
          </Field>
          <Field label="Temporary password" hint="At least 8 characters. Ask them to change it.">
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </Field>
        </form>
      </Drawer>

      {/* -------------------------------------------------------- skills */}
      <Drawer
        open={!!skillsEmp}
        onClose={() => setSkillsEmp(null)}
        title="Skills"
        subtitle={skillsEmp ? `${skillsEmp.firstName} ${skillsEmp.lastName}` : ''}
      >
        {skillError && <Alert>{skillError}</Alert>}
        {empSkillsLoading ? (
          <LoadingRows rows={3} />
        ) : empSkills.length === 0 ? (
          <div className="card">
            <EmptyState icon="tag" title="No skills recorded">
              A contractor needs a skill at the required level before they can be assigned.
            </EmptyState>
          </div>
        ) : (
          <div className="card list">
            {empSkills.map((s) => (
              <div className="list-item" key={s.id}>
                <div className="grow">
                  <div className="t-label">{s.name}</div>
                  <div className="mt-4">
                    <LevelDots level={s.proficiencyLevel} />
                  </div>
                </div>
                <Btn small variant="ghost" icon="trash" onClick={() => handleRemoveSkill(s.id)} aria-label={`Remove ${s.name}`} />
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAssignSkill} className="mt-24">
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Add or update a skill
          </div>
          <Field label="Skill">
            <select
              value={skillForm.skillId}
              onChange={(e) => setSkillForm((f) => ({ ...f, skillId: e.target.value }))}
            >
              <option value="">Choose a skill</option>
              {(allSkills.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {held.has(s.id) ? ' (update level)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Proficiency" hint="1 is beginner, 5 is expert.">
            <LevelPicker
              value={skillForm.proficiencyLevel}
              onChange={(n) => setSkillForm((f) => ({ ...f, proficiencyLevel: n }))}
            />
          </Field>
          <Btn type="submit" icon="plus" loading={skillSaving} className="mt-16">
            Save skill
          </Btn>
        </form>
      </Drawer>

      {/* -------------------------------------------------- deactivation */}
      <Drawer
        open={!!confirmEmp}
        onClose={() => setConfirmEmp(null)}
        title="Deactivate employee?"
        subtitle={confirmEmp ? `${confirmEmp.firstName} ${confirmEmp.lastName}` : ''}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setConfirmEmp(null)}>
              Keep active
            </Btn>
            <Btn variant="danger" loading={deactivating} onClick={handleDeactivate}>
              Deactivate
            </Btn>
          </>
        }
      >
        <p className="t-body">
          Their sign-in stops working immediately and they can no longer be assigned. Approved timesheets and
          invoices are kept. Anyone with active assignments must have them cancelled first.
        </p>
      </Drawer>
    </>
  )
}
