import { useState } from 'react'
import {
  getEmployees, createEmployee, deactivateEmployee,
  getSkills, getEmployeeSkills, assignSkill, removeSkill,
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
const EMPTY = { firstName: '', lastName: '', email: '', phone: '', username: '', password: '' }

export default function Employees() {
  const employees = useFetch(getEmployees, [])
  const allSkills = useFetch(getSkills, [])

  const [createDrawer, setCreateDrawer] = useState(false)
  const [form, setForm]                 = useState(EMPTY)
  const [createError, setCreateError]   = useState(null)
  const [saving, setSaving]             = useState(false)

  const [skillsEmp, setSkillsEmp]       = useState(null)
  const [empSkills, setEmpSkills]       = useState([])
  const [empSkillsLoading, setEmpSkillsLoading] = useState(false)
  const [skillForm, setSkillForm]       = useState({ skillId: '', proficiencyLevel: 3 })
  const [skillError, setSkillError]     = useState(null)
  const [skillSaving, setSkillSaving]   = useState(false)

  const [actionError, setActionError]   = useState(null)

  const empList   = employees.data ?? []
  const skillList = allSkills.data ?? []

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setCreateError(null)
    try {
      await createEmployee(form)
      setCreateDrawer(false)
      setForm(EMPTY)
      employees.reload()
    } catch (err) {
      setCreateError(err?.response?.data?.message ?? err?.message ?? 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(id) {
    setActionError(null)
    try {
      await deactivateEmployee(id)
      employees.reload()
    } catch (err) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Deactivate failed')
    }
  }

  async function openSkillsDrawer(emp) {
    setSkillsEmp(emp)
    setSkillForm({ skillId: '', proficiencyLevel: 3 })
    setSkillError(null)
    setEmpSkillsLoading(true)
    try {
      const data = await getEmployeeSkills(emp.id)
      setEmpSkills(Array.isArray(data) ? data : [])
    } catch {
      setEmpSkills([])
    } finally {
      setEmpSkillsLoading(false)
    }
  }

  async function handleAssignSkill(e) {
    e.preventDefault()
    if (!skillForm.skillId) { setSkillError('Select a skill'); return }
    setSkillSaving(true)
    setSkillError(null)
    try {
      await assignSkill(skillsEmp.id, {
        skillId: skillForm.skillId,
        proficiencyLevel: Number(skillForm.proficiencyLevel),
      })
      const data = await getEmployeeSkills(skillsEmp.id)
      setEmpSkills(Array.isArray(data) ? data : [])
      setSkillForm({ skillId: '', proficiencyLevel: 3 })
    } catch (err) {
      setSkillError(err?.response?.data?.message ?? err?.message ?? 'Assign failed')
    } finally {
      setSkillSaving(false)
    }
  }

  async function handleRemoveSkill(skillId) {
    setSkillError(null)
    try {
      await removeSkill(skillsEmp.id, skillId)
      const data = await getEmployeeSkills(skillsEmp.id)
      setEmpSkills(Array.isArray(data) ? data : [])
    } catch (err) {
      setSkillError(err?.response?.data?.message ?? err?.message ?? 'Remove failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="HR · Workforce roster"
        action={<Btn onClick={() => { setForm(EMPTY); setCreateError(null); setCreateDrawer(true) }}>+ ADD EMPLOYEE</Btn>}
      />
      <div style={{ padding: '24px 32px' }}>
        {(employees.error || actionError) && (
          <div style={ERR}>ERROR: {employees.error || actionError}</div>
        )}

        {employees.loading ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : empList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7a9ab0', fontFamily: 'monospace', fontSize: 13 }}>
            <div style={{ marginBottom: 16 }}>No employees found</div>
            <Btn onClick={() => setCreateDrawer(true)}>+ Add first employee</Btn>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Username</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {empList.map(emp => (
                <tr key={emp.id}>
                  <td style={{ color: '#f0f2f5', fontWeight: 600 }}>
                    {emp.firstName} {emp.lastName}
                  </td>
                  <td>{emp.email}</td>
                  <td>{emp.phone ?? '—'}</td>
                  <td style={{ color: '#7a9ab0' }}>{emp.username}</td>
                  <td><StatusPill value={emp.status ?? 'ACTIVE'} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small variant="ghost" onClick={() => openSkillsDrawer(emp)}>SKILLS</Btn>
                      {emp.status !== 'INACTIVE' && (
                        <Btn small variant="danger" onClick={() => handleDeactivate(emp.id)}>DEACTIVATE</Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer open={createDrawer} onClose={() => setCreateDrawer(false)} title="ADD EMPLOYEE">
        {createError && <div style={ERR}>ERROR: {createError}</div>}
        <form onSubmit={handleCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div>
              <label style={LABEL}>First Name</label>
              <input value={form.firstName} onChange={set('firstName')} required />
            </div>
            <div>
              <label style={LABEL}>Last Name</label>
              <input value={form.lastName} onChange={set('lastName')} required />
            </div>
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Email</label>
            <input type="email" value={form.email} onChange={set('email')} required />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Phone</label>
            <input value={form.phone} onChange={set('phone')} />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Username</label>
            <input value={form.username} onChange={set('username')} required />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Password</label>
            <input type="password" value={form.password} onChange={set('password')} required />
          </div>
          <Btn type="submit" disabled={saving}>
            {saving ? 'CREATING...' : 'CREATE EMPLOYEE'}
          </Btn>
        </form>
      </Drawer>

      <Drawer
        open={!!skillsEmp}
        onClose={() => setSkillsEmp(null)}
        title={`SKILLS — ${skillsEmp ? `${skillsEmp.firstName} ${skillsEmp.lastName}` : ''}`}
        width={500}
      >
        {skillError && <div style={ERR}>ERROR: {skillError}</div>}
        {empSkillsLoading ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12, marginBottom: 20 }}>Loading skills...</div>
        ) : empSkills.length === 0 ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12, marginBottom: 20 }}>No skills assigned</div>
        ) : (
          <table style={{ marginBottom: 24 }}>
            <thead><tr><th>Skill</th><th>Proficiency</th><th></th></tr></thead>
            <tbody>
              {empSkills.map(s => (
                <tr key={s.skillId ?? s.id}>
                  <td>{s.skillName ?? s.name ?? '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {[1,2,3,4,5].map(n => (
                        <div key={n} style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: n <= (s.proficiencyLevel ?? 0) ? '#ff6b00' : '#1e3a4a',
                        }} />
                      ))}
                    </div>
                  </td>
                  <td>
                    <Btn small variant="danger" onClick={() => handleRemoveSkill(s.skillId ?? s.id)}>REMOVE</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ borderTop: '1px solid #1e3a4a', paddingTop: 20 }}>
          <div style={{ ...LABEL, marginBottom: 12 }}>Add Skill</div>
          <form onSubmit={handleAssignSkill}>
            <div style={FIELD}>
              <label style={LABEL}>Skill</label>
              <select
                value={skillForm.skillId}
                onChange={e => setSkillForm(f => ({ ...f, skillId: e.target.value }))}
              >
                <option value="">— Select skill —</option>
                {skillList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div style={FIELD}>
              <label style={LABEL}>Proficiency Level (1–5)</label>
              <input
                type="number" min={1} max={5}
                value={skillForm.proficiencyLevel}
                onChange={e => setSkillForm(f => ({ ...f, proficiencyLevel: e.target.value }))}
              />
            </div>
            <Btn type="submit" disabled={skillSaving}>
              {skillSaving ? 'ADDING...' : 'ADD SKILL'}
            </Btn>
          </form>
        </div>
      </Drawer>
    </div>
  )
}
