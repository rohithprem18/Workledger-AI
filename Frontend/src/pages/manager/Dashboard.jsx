import { useFetch } from '../../hooks/useFetch'
import { getContracts, getPendingWorklogs } from '../../api'
import PageHeader from '../../components/PageHeader'
import StatusPill from '../../components/StatusPill'

const ERR = {
  padding: '10px 16px', background: '#ef444415', color: '#ef4444',
  borderLeft: '2px solid #ef4444', marginBottom: 16,
  fontFamily: 'monospace', fontSize: 12,
}

function MetricCard({ value, label }) {
  return (
    <div style={{
      flex: 1, background: '#0d1b2a', border: '1px solid #1e3a4a',
      borderRadius: 3, padding: '24px 28px',
    }}>
      <div style={{
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: 42, fontWeight: 700, color: '#ff6b00', lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        marginTop: 10, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: '#7a9ab0',
        fontFamily: 'ui-monospace, Consolas, monospace',
      }}>
        {label}
      </div>
    </div>
  )
}

function getDateRange(daysBack) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - daysBack)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

export default function Dashboard() {
  const { from, to } = getDateRange(30)

  const contracts = useFetch(() => getContracts(), [])
  const worklogs  = useFetch(() => getPendingWorklogs(from, to), [])

  const contractList  = contracts.data ?? []
  const worklogList   = worklogs.data  ?? []

  const activeContracts = contractList.filter(c => c.active === true).length
  const pendingApprovals = worklogList.filter(w => w.status === 'SUBMITTED').length
  const pendingWorklogs  = worklogList.filter(w => w.status === 'SUBMITTED').slice(0, 5)

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Operational overview" />
      <div style={{ padding: '24px 32px' }}>
        {(contracts.error || worklogs.error) && (
          <div style={ERR}>ERROR: {contracts.error || worklogs.error}</div>
        )}

        {/* Metric strip */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
          <MetricCard
            value={contracts.loading ? '—' : activeContracts}
            label="Active Contracts"
          />
          <MetricCard value="—" label="On Assignment" />
          <MetricCard
            value={worklogs.loading ? '—' : pendingApprovals}
            label="Pending Approvals"
          />
          <MetricCard value="—" label="Outstanding Invoices" />
        </div>

        {/* Two-column lower section */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Recent pending approvals */}
          <div style={{ background: '#0d1b2a', border: '1px solid #1e3a4a', borderRadius: 3 }}>
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid #1e3a4a',
              fontFamily: 'ui-monospace, Consolas, monospace',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#7a9ab0',
            }}>
              RECENT PENDING APPROVALS
            </div>
            {worklogs.loading ? (
              <div style={{ padding: 20, color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
            ) : pendingWorklogs.length === 0 ? (
              <div style={{ padding: 20, color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>No pending approvals</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Hours</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingWorklogs.map(w => (
                    <tr key={w.id}>
                      <td>{w.employeeName ?? w.employeeId ?? '—'}</td>
                      <td>{w.workDate}</td>
                      <td>{w.totalHours ?? '—'}</td>
                      <td><StatusPill value={w.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Upcoming invoice periods placeholder */}
          <div style={{ background: '#0d1b2a', border: '1px solid #1e3a4a', borderRadius: 3 }}>
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid #1e3a4a',
              fontFamily: 'ui-monospace, Consolas, monospace',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#7a9ab0',
            }}>
              UPCOMING INVOICE PERIODS
            </div>
            <div style={{ padding: '20px 16px' }}>
              {contractList.slice(0, 5).map(c => (
                <div key={c.id} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '1px solid #0d1b2a15',
                  fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12,
                }}>
                  <span style={{ color: '#f0f2f5' }}>{c.title}</span>
                  <span style={{ color: '#7a9ab0' }}>{c.endDate}</span>
                </div>
              ))}
              {contractList.length === 0 && !contracts.loading && (
                <span style={{ color: '#7a9ab0', fontSize: 12, fontFamily: 'monospace' }}>No contracts found</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
