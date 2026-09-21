import { useState } from 'react'
import { getMilestonesByStatus, approveMilestone } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Btn from '../../components/Btn'
import StatusPill from '../../components/StatusPill'

const ERR = {
  padding: '10px 16px', background: '#ef444415', color: '#ef4444',
  borderLeft: '2px solid #ef4444', marginBottom: 16,
  fontFamily: 'monospace', fontSize: 12,
}

export default function Milestones() {
  const reached = useFetch(() => getMilestonesByStatus('REACHED'), [])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  const list = reached.data ?? []

  async function handleApprove(id) {
    setBusy(id)
    setError(null)
    try {
      await approveMilestone(id)
      reached.reload()
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Approve failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Milestones"
        subtitle="Finance · Manager-marked milestones awaiting invoicing"
      />
      <div style={{ padding: '24px 32px' }}>
        {(reached.error || error) && <div style={ERR}>ERROR: {reached.error || error}</div>}
        {reached.loading ? (
          <div style={{ color: '#7a9ab0', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#7a9ab0', fontFamily: 'monospace', fontSize: 13 }}>
            No milestones waiting for approval
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Milestone</th>
                <th>Threshold %</th>
                <th>Amount</th>
                <th>Marked At</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map(m => (
                <tr key={m.id}>
                  <td style={{ color: '#f0f2f5', fontWeight: 600 }}>{m.contractTitle}</td>
                  <td>#{m.sequenceOrder} · {m.label}</td>
                  <td style={{ color: '#7a9ab0' }}>{m.thresholdPercent != null ? `${m.thresholdPercent}%` : '—'}</td>
                  <td style={{ color: '#ff6b00', fontWeight: 700 }}>${Number(m.amount).toFixed(2)}</td>
                  <td>{m.markedAt?.replace('T', ' ').slice(0, 16) ?? '—'}</td>
                  <td><StatusPill value={m.status} /></td>
                  <td>
                    <Btn small variant="approve" disabled={busy === m.id} onClick={() => handleApprove(m.id)}>
                      {busy === m.id ? 'APPROVING...' : 'APPROVE & INVOICE'}
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
