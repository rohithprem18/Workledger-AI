import { getApprovedWorklogs } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import StatusPill from '../../components/StatusPill'

const ERR = {
  padding: '10px 16px', background: '#ef444415', color: '#ef4444',
  borderLeft: '2px solid #ef4444', marginBottom: 16,
  fontFamily: 'monospace', fontSize: 12,
}

export default function Worklogs() {
  const { data, loading, error } = useFetch(getApprovedWorklogs, [])
  const logs = data ?? []

  return (
    <div>
      <PageHeader
        title="Approved Worklogs"
        subtitle="Finance · Approved time ready to invoice"
      />
      <div style={{ padding: '24px 32px' }}>
        {error && <div style={ERR}>ERROR: {error}</div>}
        {loading ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7a9ab0', fontFamily: 'monospace', fontSize: 13 }}>
            No approved worklogs
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Hours</th>
                <th>Approved At</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(w => (
                <tr key={w.id}>
                  <td>{w.workDate}</td>
                  <td style={{ color: '#f0f2f5' }}>{w.employeeName}</td>
                  <td style={{ color: '#ff6b00', fontWeight: 700 }}>
                    {(w.totalActualMinutes / 60).toFixed(2)}
                  </td>
                  <td>{w.approvedAt?.replace('T', ' ').slice(0, 16) ?? '—'}</td>
                  <td><StatusPill value={w.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
