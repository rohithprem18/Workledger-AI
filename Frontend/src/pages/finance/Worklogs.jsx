import { useState } from 'react'
import { getApprovedWorklogs } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import StatusPill from '../../components/StatusPill'
import {
  Alert,
  Card,
  DataTable,
  EmptyState,
  LoadingRows,
  Stat,
  fmtDate,
  fmtDateTime,
  hours,
} from '../../components/ui'

/** Approved time — the immutable record hourly invoices are built from. */
export default function Worklogs() {
  const { data, loading, error } = useFetch(getApprovedWorklogs, [])
  const [query, setQuery] = useState('')

  const all = data ?? []
  const rows = all.filter((w) => (w.employeeName ?? '').toLowerCase().includes(query.toLowerCase()))
  const minutes = rows.reduce((n, w) => n + (w.totalActualMinutes ?? 0), 0)
  const people = new Set(rows.map((w) => w.employeeId)).size

  const columns = [
    { key: 'employee', header: 'Contractor', primary: true, render: (w) => w.employeeName ?? '—' },
    { key: 'date', header: 'Worked', render: (w) => fmtDate(w.workDate) },
    { key: 'approved', header: 'Approved', render: (w) => fmtDateTime(w.approvedAt), hideOnMobile: true },
    { key: 'status', header: 'Status', render: (w) => <StatusPill value={w.status} /> },
    { key: 'hours', header: 'Hours', align: 'right', render: (w) => hours(w.totalActualMinutes) },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Approved work"
        subtitle="Timesheets that have been approved. They cannot change, which is what makes them billable."
      />

      {error && <Alert>{error}</Alert>}

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <Stat label="Timesheets" value={loading ? '—' : rows.length} />
        <Stat label="Hours" value={loading ? '—' : hours(minutes)} />
        <Stat label="Contractors" value={loading ? '—' : people} />
      </div>

      <Card>
        <div className="card-header">
          <input
            type="search"
            placeholder="Filter by contractor…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 300 }}
            aria-label="Filter by contractor"
          />
        </div>
        {loading ? (
          <LoadingRows />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            empty={
              <EmptyState icon="clock" title="No approved work yet">
                Timesheets appear here once a delivery manager approves them.
              </EmptyState>
            }
          />
        )}
      </Card>
    </>
  )
}
