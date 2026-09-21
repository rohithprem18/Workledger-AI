import { useState } from 'react'
import { getMilestonesByStatus, approveMilestone } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Btn from '../../components/Btn'
import StatusPill from '../../components/StatusPill'
import {
  Alert,
  Card,
  DataTable,
  EmptyState,
  LoadingRows,
  Stat,
  Tabs,
  errorText,
  fmtDateTime,
  money,
} from '../../components/ui'

/**
 * Finance sign-off for milestones a delivery manager has marked reached.
 * Approving raises the fixed-amount invoice in the same transaction, and the
 * person who marked a milestone reached cannot also approve it.
 */
export default function Milestones() {
  const [status, setStatus] = useState('REACHED')
  const list = useFetch(() => getMilestonesByStatus(status), [status])
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(null)

  const rows = list.data ?? []
  const total = rows.reduce((n, m) => n + Number(m.amount ?? 0), 0)

  async function handleApprove(m) {
    setBusy(m.id)
    setError(null)
    try {
      await approveMilestone(m.id)
      setNotice(`"${m.label}" approved — a ${money(m.amount)} invoice was raised as a draft.`)
      list.reload()
    } catch (err) {
      setError(errorText(err, 'Approval failed'))
    } finally {
      setBusy(null)
    }
  }

  const columns = [
    {
      key: 'label',
      header: 'Milestone',
      primary: true,
      render: (m) => (
        <div>
          <div className="t-ink" style={{ fontWeight: 500 }}>
            #{m.sequenceOrder} · {m.label}
          </div>
          <div className="t-sm t-mute">{m.contractTitle}</div>
        </div>
      ),
    },
    {
      key: 'tasks',
      header: 'Tasks',
      render: (m) => (m.totalTasks ? `${m.completedTasks}/${m.totalTasks}` : '—'),
    },
    { key: 'marked', header: 'Reached', render: (m) => fmtDateTime(m.markedAt) },
    { key: 'status', header: 'Status', render: (m) => <StatusPill value={m.status} /> },
    { key: 'amount', header: 'Amount', align: 'right', render: (m) => money(m.amount) },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Milestones"
        subtitle="Approve reached milestones to raise their invoices. Each is billed exactly once."
      />

      {(list.error || error) && <Alert onClose={() => setError(null)}>{list.error || error}</Alert>}
      {notice && (
        <Alert tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <div className="grid grid-2" style={{ marginBottom: 24 }}>
        <Stat
          label={status === 'REACHED' ? 'Awaiting approval' : 'Invoiced'}
          value={list.loading ? '—' : rows.length}
          foot={status === 'REACHED' ? 'Marked reached by delivery' : 'Approved and billed'}
        />
        <Stat label="Value" value={list.loading ? '—' : money(total)} foot="Sum of milestone amounts" />
      </div>

      <Card>
        <div className="card-header">
          <Tabs
            value={status}
            onChange={setStatus}
            options={[
              { value: 'REACHED', label: 'Awaiting approval' },
              { value: 'APPROVED_INVOICED', label: 'Invoiced' },
              { value: 'PENDING', label: 'Not reached' },
            ]}
          />
        </div>
        {list.loading ? (
          <LoadingRows />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            actions={
              status === 'REACHED'
                ? (m) => (
                    <Btn small variant="approve" icon="check" loading={busy === m.id} onClick={() => handleApprove(m)}>
                      Approve & invoice
                    </Btn>
                  )
                : undefined
            }
            empty={
              <EmptyState icon="flag" title="Nothing here">
                {status === 'REACHED'
                  ? 'No milestones are waiting for finance approval.'
                  : 'No milestones in this state.'}
              </EmptyState>
            }
          />
        )}
      </Card>
    </>
  )
}
