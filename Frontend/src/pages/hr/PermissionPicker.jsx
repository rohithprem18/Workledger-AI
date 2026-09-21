/** Permission checklist, grouped by the area each permission governs. */
import { groupPermissions } from './permissionGroups'

export default function PermissionPicker({ permissions, selected, onChange }) {
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  return (
    <div className="stack gap-16">
      {groupPermissions(permissions).map(([group, items]) => {
        const ids = items.map((p) => p.id)
        const all = ids.every((id) => selected.includes(id))
        return (
          <div key={group} className="card">
            <div className="card-header" style={{ padding: '10px 14px' }}>
              <span className="t-label">{group}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  onChange(all ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])])
                }
              >
                {all ? 'Clear' : 'Select all'}
              </button>
            </div>
            <div className="list">
              {items.map((p) => (
                <label key={p.id} className="list-item" style={{ cursor: 'pointer', padding: '10px 14px' }}>
                  <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                  <div className="grow">
                    <div className="mono t-sm t-ink">{p.code}</div>
                    {p.description && <div className="t-sm t-mute">{p.description}</div>}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
