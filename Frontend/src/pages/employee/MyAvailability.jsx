import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { getAvailability, setAvailability } from '../../api'
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

const DAYS = [
  { num: 1, label: 'Monday' },
  { num: 2, label: 'Tuesday' },
  { num: 3, label: 'Wednesday' },
  { num: 4, label: 'Thursday' },
  { num: 5, label: 'Friday' },
  { num: 6, label: 'Saturday' },
  { num: 7, label: 'Sunday' },
]

const EMPTY_FORM = { startTime: '', endTime: '', maxHoursPerDay: '' }

export default function MyAvailability() {
  const { user } = useAuth()
  const empId    = user?.employeeId ?? null

  const { data, loading, error, reload } = useFetch(
    () => empId ? getAvailability(empId) : Promise.resolve([]),
    [empId],
  )

  const [drawerDay, setDrawerDay]       = useState(null)   // { num, label }
  const [form, setForm]                 = useState(EMPTY_FORM)
  const [saveError, setSaveError]       = useState(null)
  const [saving, setSaving]             = useState(false)

  const availability = data ?? []

  function getDay(dayNum) {
    return availability.find(a => a.dayOfWeek === dayNum) ?? null
  }

  function openEdit(day) {
    const existing = getDay(day.num)
    setForm({
      startTime:      existing?.startTime?.slice(0, 5)  ?? '',
      endTime:        existing?.endTime?.slice(0, 5)    ?? '',
      maxHoursPerDay: existing?.maxHoursPerDay != null ? String(existing.maxHoursPerDay) : '',
    })
    setSaveError(null)
    setDrawerDay(day)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.startTime || !form.endTime) { setSaveError('Start and end time are required'); return }
    setSaving(true)
    setSaveError(null)
    try {
      await setAvailability(empId, {
        dayOfWeek:      drawerDay.num,
        startTime:      form.startTime + ':00',
        endTime:        form.endTime   + ':00',
        maxHoursPerDay: form.maxHoursPerDay ? Number(form.maxHoursPerDay) : null,
      })
      setDrawerDay(null)
      reload()
    } catch (err) {
      setSaveError(err?.response?.data?.message ?? err?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!empId) {
    return (
      <div>
        <PageHeader title="My Availability" subtitle="Weekly schedule preferences" />
        <div style={{ padding: '60px 32px', textAlign: 'center' }}>
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 13, marginBottom: 8 }}>
            Employee profile not linked to this account.
          </div>
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 11 }}>
            Contact your manager to have your employee record associated with your login.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="My Availability" subtitle="Weekly schedule preferences" />
      <div style={{ padding: '24px 32px' }}>
        {error && <div style={ERR}>ERROR: {error}</div>}

        {loading ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Max Hours / Day</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map(day => {
                const entry = getDay(day.num)
                const isSet = !!entry
                return (
                  <tr key={day.num}>
                    <td style={{
                      fontWeight: 700,
                      color: isSet ? '#f0f2f5' : '#7a9ab0',
                    }}>
                      {day.label}
                    </td>
                    <td style={{ color: isSet ? '#f0f2f5' : '#1e3a4a' }}>
                      {entry?.startTime?.slice(0, 5) ?? '—'}
                    </td>
                    <td style={{ color: isSet ? '#f0f2f5' : '#1e3a4a' }}>
                      {entry?.endTime?.slice(0, 5) ?? '—'}
                    </td>
                    <td style={{ color: isSet ? '#ff6b00' : '#1e3a4a' }}>
                      {entry?.maxHoursPerDay != null ? `${entry.maxHoursPerDay}h` : '—'}
                    </td>
                    <td>
                      <Btn small variant={isSet ? 'ghost' : 'primary'} onClick={() => openEdit(day)}>
                        {isSet ? 'EDIT' : 'SET'}
                      </Btn>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div style={{
          marginTop: 24, padding: '12px 16px',
          background: '#0d1b2a', border: '1px solid #1e3a4a', borderRadius: 3,
          fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11, color: '#7a9ab0',
        }}>
          Each day's entry is saved independently. Setting availability for a day replaces any previous entry for that day.
        </div>
      </div>

      <Drawer
        open={!!drawerDay}
        onClose={() => setDrawerDay(null)}
        title={`SET AVAILABILITY — ${drawerDay?.label?.toUpperCase() ?? ''}`}
      >
        {saveError && <div style={ERR}>ERROR: {saveError}</div>}
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div>
              <label style={LABEL}>Start Time</label>
              <input
                type="time"
                value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                required
              />
            </div>
            <div>
              <label style={LABEL}>End Time</label>
              <input
                type="time"
                value={form.endTime}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                required
              />
            </div>
          </div>
          <div style={FIELD}>
            <label style={LABEL}>Max Hours / Day</label>
            <input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={form.maxHoursPerDay}
              onChange={e => setForm(f => ({ ...f, maxHoursPerDay: e.target.value }))}
              placeholder="e.g. 8"
              style={{ maxWidth: 120 }}
            />
          </div>
          <Btn type="submit" disabled={saving}>
            {saving ? 'SAVING...' : 'SAVE AVAILABILITY'}
          </Btn>
        </form>
      </Drawer>
    </div>
  )
}
