import { useState } from 'react'
import { getSkills, createSkill, getEmployees } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Drawer from '../../components/Drawer'
import Btn from '../../components/Btn'
import { Alert, Card, EmptyState, Field, Skeleton, errorText } from '../../components/ui'

/**
 * The skill catalogue. Contract requirements name one of these, and a
 * contractor must hold it at the required level to be assignable — so each
 * card shows how deep the bench is for that skill.
 */
export default function Skills() {
  const { data, loading, error, reload } = useFetch(getSkills, [])
  const employees = useFetch(() => getEmployees().catch(() => []), [])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [actionError, setActionError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')

  const skills = (data ?? []).filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))

  // skill id -> proficiency levels held across the bench
  const bench = new Map()
  for (const e of employees.data ?? []) {
    for (const s of e.skills ?? []) {
      if (!bench.has(s.id)) bench.set(s.id, [])
      bench.get(s.id).push(s.proficiencyLevel)
    }
  }

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
      setActionError(errorText(err, 'Could not create the skill'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Skills"
        subtitle="The catalogue contract requirements are matched against. Proficiency runs from 1 to 5."
      >
        <Btn icon="plus" onClick={openCreate}>
          Add skill
        </Btn>
      </PageHeader>

      {error && <Alert>{error}</Alert>}

      <div className="cluster" style={{ marginBottom: 16 }}>
        <input
          type="search"
          placeholder="Search skills…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 300 }}
          aria-label="Search skills"
        />
        <span className="t-sm t-mute">{skills.length} skills</span>
      </div>

      {loading ? (
        <div className="grid grid-3">
          {[0, 1, 2].map((i) => (
            <Card pad key={i}>
              <Skeleton height={18} width="50%" />
              <Skeleton height={12} width="80%" style={{ marginTop: 10 }} />
            </Card>
          ))}
        </div>
      ) : skills.length === 0 ? (
        <Card>
          <EmptyState
            icon="tag"
            title={query ? 'No skills match' : 'No skills yet'}
            action={
              !query && (
                <Btn icon="plus" onClick={openCreate}>
                  Add the first skill
                </Btn>
              )
            }
          >
            {query ? 'Try another search.' : 'Skills describe what contractors can do.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-3">
          {skills.map((s) => {
            const levels = bench.get(s.id) ?? []
            const strong = levels.filter((l) => l >= 4).length
            return (
              <Card pad key={s.id}>
                <div className="row between gap-8">
                  <div className="t-h3 t-wrap">{s.name}</div>
                  <span className="badge badge-neutral badge-plain t-num">{levels.length} people</span>
                </div>
                <p className="t-sm t-body mt-8" style={{ minHeight: 32 }}>
                  {s.description || <span className="t-faint">No description</span>}
                </p>
                <div className="segmented-bar mt-16" aria-label="Proficiency distribution">
                  {[1, 2, 3, 4, 5].map((level) => {
                    const count = levels.filter((l) => l === level).length
                    return count ? (
                      <span
                        key={level}
                        title={`Level ${level}: ${count}`}
                        style={{ flex: count, background: `rgba(23,23,23,${0.2 + level * 0.16})` }}
                      />
                    ) : null
                  })}
                </div>
                <div className="t-sm t-mute mt-8">
                  {levels.length ? `${strong} at level 4 or above` : 'Nobody holds this skill yet'}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Add skill"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Btn>
            <Btn type="submit" form="skill-form" loading={saving}>
              Create skill
            </Btn>
          </>
        }
      >
        {actionError && <Alert>{actionError}</Alert>}
        <form id="skill-form" onSubmit={handleSubmit}>
          <Field label="Name">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Java, Kubernetes, Project management"
              required
            />
          </Field>
          <Field label="Description">
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What this skill covers"
            />
          </Field>
        </form>
      </Drawer>
    </>
  )
}
