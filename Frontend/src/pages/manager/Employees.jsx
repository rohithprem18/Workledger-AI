import { getEmployees } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import StatusPill from '../../components/StatusPill'

const ERR = {
  padding: '10px 16px', background: '#ef444415', color: '#ef4444',
  borderLeft: '2px solid #ef4444', marginBottom: 16,
  fontFamily: 'monospace', fontSize: 12,
}

export default function Employees() {
  const { data, loading, error } = useFetch(getEmployees, [])
  const empList = data ?? []

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Read-only roster · Contact HR to create or edit"
      />
      <div style={{ padding: '24px 32px' }}>
        {error && <div style={ERR}>ERROR: {error}</div>}

        {loading ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : empList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7a9ab0', fontFamily: 'monospace', fontSize: 13 }}>
            No employees found
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
                  <td><StatusPill value={emp.status ?? (emp.active === false ? 'INACTIVE' : 'ACTIVE')} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
