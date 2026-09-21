import { useState } from 'react'
import { getSkills, createSkill } from '../../api'
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

export default function Skills() {
  const { data, loading, error, reload } = useFetch(getSkills, [])
  const [drawerOpen, setDrawerOpen]       = useState(false)
  const [form, setForm]                   = useState({ name: '', description: '' })
  const [actionError, setActionError]     = useState(null)
  const [saving, setSaving]               = useState(false)

  const skills = data ?? []

  function openCreate() {
    setForm({ name: '', description: '' })
    setActionError(null)
    setDrawerOpen(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setActionError(null)
    try {
      await createSkill(form)
      setDrawerOpen(false)
      reload()
    } catch (err) {
      setActionError(err?.response?.data?.message ?? err?.message ?? 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Skills"
        subtitle="Skill catalogue"
        action={<Btn onClick={openCreate}>+ ADD SKILL</Btn>}
      />
      <div style={{ padding: '24px 32px' }}>
        {(error || actionError) && (
          <div style={ERR}>ERROR: {error || actionError}</div>
        )}

        {loading ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : skills.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7a9ab0', fontFamily: 'monospace', fontSize: 13 }}>
            <div style={{ marginBottom: 16 }}>No skills defined</div>
            <Btn onClick={openCreate}>+ Create first skill</Btn>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Skill Name</th>
                <th>Description</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {skills.map(s => (
                <tr key={s.id}>
                  <td style={{ color: '#f0f2f5', fontWeight: 600 }}>{s.name}</td>
                  <td style={{ color: '#7a9ab0' }}>{s.description ?? '—'}</td>
                  <td style={{ color: '#1e3a4a', fontSize: 10 }}>{s.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="ADD SKILL">
        {actionError && <div style={ERR}>ERROR: {actionError}</div>}
        <form onSubmit={handleSubmit}>
          <div style={FIELD}>
            <label style={LABEL}>Skill Name</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
              placeholder="e.g. Java, Project Management"
            />
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
              placeholder="Brief description of this skill"
            />
          </div>
          <Btn type="submit" disabled={saving}>
            {saving ? 'CREATING...' : 'CREATE SKILL'}
          </Btn>
        </form>
      </Drawer>
    </div>
  )
}
