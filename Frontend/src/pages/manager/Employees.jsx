import { useMemo, useState } from 'react'
import { getEmployees } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import StatusPill from '../../components/StatusPill'
import { Alert, Card, EmptyState, Skeleton, initials } from '../../components/ui'

/**
 * The delivery manager's view of the bench: who exists, what they can do, and
 * at what level. Read-only — onboarding and edits belong to HR.
 */
export default function Employees() {
  const { data, loading, error } = useFetch(getEmployees, [])
  const [query, setQuery] = useState('')
  const [skill, setSkill] = useState('')

  const employees = useMemo(() => data ?? [], [data])
  const skillNames = useMemo(
    () => [...new Set(employees.flatMap((e) => (e.skills ?? []).map((s) => s.name)))].sort(),
    [employees],
  )

  const visible = employees.filter((e) => {
    const text = `${e.firstName} ${e.lastName} ${e.email} ${e.username}`.toLowerCase()
    const matchesSkill = !skill || (e.skills ?? []).some((s) => s.name === skill)
    return text.includes(query.toLowerCase()) && matchesSkill
  })

  return (
    <>
      <PageHeader
        eyebrow="Delivery"
        title="Workforce"
        subtitle="Contractors on the bench and their skills. HR onboards and edits people."
      />

      {error && <Alert>{error}</Alert>}

      <div className="cluster" style={{ marginBottom: 16 }}>
        <input
          type="search"
          placeholder="Search people…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 300 }}
          aria-label="Search people"
        />
        <select
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          style={{ maxWidth: 220 }}
          aria-label="Filter by skill"
        >
          <option value="">All skills</option>
          {skillNames.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="t-sm t-mute">{visible.length} people</span>
      </div>

      {loading ? (
        <div className="grid grid-3">
          {[0, 1, 2].map((i) => (
            <Card pad key={i}>
              <Skeleton height={30} width={30} style={{ borderRadius: 999 }} />
              <Skeleton height={16} width="60%" style={{ marginTop: 14 }} />
              <Skeleton height={12} width="80%" style={{ marginTop: 8 }} />
            </Card>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState icon="users" title={employees.length ? 'Nobody matches' : 'No contractors yet'}>
            {employees.length
              ? 'Try a different name or skill.'
              : 'HR adds contractors from the People section.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-3">
          {visible.map((e) => (
            <Card pad key={e.id}>
              <div className="row gap-12">
                <span className="avatar">{initials(`${e.firstName} ${e.lastName}`)}</span>
                <div className="grow">
                  <div className="t-label t-wrap">
                    {e.firstName} {e.lastName}
                  </div>
                  <div className="t-sm t-mute t-wrap">{e.email}</div>
                </div>
                <StatusPill value={e.active === false ? 'INACTIVE' : 'ACTIVE'} />
              </div>
              <hr className="divider mt-16" />
              <div className="eyebrow mt-12">Skills</div>
              <div className="cluster mt-8">
                {(e.skills ?? []).length === 0 ? (
                  <span className="t-sm t-faint">No skills recorded</span>
                ) : (
                  e.skills.map((s) => (
                    <span key={s.id} className="badge badge-outline badge-plain">
                      {s.name}
                      <span className="t-mute mono">L{s.proficiencyLevel}</span>
                    </span>
                  ))
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
