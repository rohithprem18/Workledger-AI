import { Link, useNavigate } from 'react-router-dom'
import { useFetch } from '../../hooks/useFetch'
import { getAllInvoices, getContracts, getPendingWorklogs } from '../../api'
import PageHeader from '../../components/PageHeader'
import StatusPill from '../../components/StatusPill'
import Btn from '../../components/Btn'
import Icon from '../../components/Icon'
import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  LoadingRows,
  Stat,
  fmtDate,
  hours,
  money,
} from '../../components/ui'

function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function daysUntil(isoDate) {
  const end = new Date(`${isoDate}T00:00:00`)
  return Math.ceil((end - new Date()) / 86_400_000)
}

export default function Dashboard() {
  const navigate = useNavigate()
  const contracts = useFetch(() => getContracts(), [])
  const worklogs = useFetch(() => getPendingWorklogs(isoDaysAgo(60), isoDaysAgo(-1)), [])
  // Invoices are informational here; a role without access simply sees a dash.
  const invoices = useFetch(() => getAllInvoices().catch(() => []), [])

  const contractList = contracts.data ?? []
  const pending = (worklogs.data ?? []).filter((w) => w.status === 'SUBMITTED')
  const invoiceList = invoices.data ?? []

  const active = contractList.filter((c) => c.active)
  const requirements = active.flatMap((c) => c.requirements ?? [])
  const placed = requirements.reduce((n, r) => n + (r.fulfilledCount ?? 0), 0)
  const seats = requirements.reduce((n, r) => n + (r.requiredEmployeeCount ?? 0), 0)
  const drafts = invoiceList.filter((i) => i.status === 'DRAFT')
  const draftValue = drafts.reduce((n, i) => n + Number(i.totalAmount ?? 0), 0)

  const endingSoon = [...active]
    .filter((c) => c.endDate)
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .slice(0, 5)

  const loadingStat = (value, isLoading) => (isLoading ? '—' : value)

  return (
    <>
      <PageHeader
        eyebrow="Delivery"
        title="Overview"
        subtitle="What needs attention across your contracts, staffing and timesheets."
      >
        <Btn variant="secondary" icon="sparkles" onClick={() => navigate('/contracts/intake')}>
          Upload contract
        </Btn>
        <Btn icon="plus" onClick={() => navigate('/contracts')}>
          New contract
        </Btn>
      </PageHeader>

      {(contracts.error || worklogs.error) && <Alert>{contracts.error || worklogs.error}</Alert>}

      <div className="grid grid-4">
        <Stat
          label="Active contracts"
          value={loadingStat(active.length, contracts.loading)}
          foot={`${contractList.length} in total`}
        />
        <Stat
          label="Seats filled"
          value={loadingStat(`${placed}/${seats}`, contracts.loading)}
          foot={seats ? `${Math.round((placed / seats) * 100)}% staffed` : 'No open requirements'}
        />
        <Stat
          label="Awaiting approval"
          value={loadingStat(pending.length, worklogs.loading)}
          foot="Timesheets, last 60 days"
          tone={pending.length > 0 ? 'warning' : undefined}
        />
        <Stat
          label="Draft invoices"
          value={loadingStat(drafts.length, invoices.loading)}
          foot={drafts.length ? `${money(draftValue)} unapproved` : 'Nothing waiting'}
        />
      </div>

      <div className="grid grid-2 mt-24">
        <Card>
          <CardHeader
            title="Pending approvals"
            subtitle="Oldest submissions first"
            action={
              <Link to="/worklogs/pending" className="btn btn-ghost btn-sm">
                Review all <Icon name="arrowRight" />
              </Link>
            }
          />
          {worklogs.loading ? (
            <LoadingRows rows={3} />
          ) : pending.length === 0 ? (
            <EmptyState icon="checkCircle" title="You're all caught up">
              No timesheets are waiting for your approval.
            </EmptyState>
          ) : (
            <div className="list">
              {pending.slice(0, 6).map((w) => (
                <div className="list-item" key={w.id}>
                  <div className="grow">
                    <div className="t-label">{w.employeeName ?? 'Contractor'}</div>
                    <div className="t-sm t-mute">{fmtDate(w.workDate)}</div>
                  </div>
                  <span className="t-num t-body">{hours(w.totalActualMinutes)}</span>
                  <StatusPill value={w.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Contracts ending soon"
            subtitle="Staffing against each contract's requirements"
            action={
              <Link to="/contracts" className="btn btn-ghost btn-sm">
                All contracts <Icon name="arrowRight" />
              </Link>
            }
          />
          {contracts.loading ? (
            <LoadingRows rows={3} />
          ) : endingSoon.length === 0 ? (
            <EmptyState icon="contract" title="No active contracts">
              Create a contract or upload one to extract its terms.
            </EmptyState>
          ) : (
            <div className="list">
              {endingSoon.map((c) => {
                const reqs = c.requirements ?? []
                const need = reqs.reduce((n, r) => n + r.requiredEmployeeCount, 0)
                const have = reqs.reduce((n, r) => n + r.fulfilledCount, 0)
                const left = daysUntil(c.endDate)
                return (
                  <button
                    type="button"
                    className="list-item"
                    key={c.id}
                    onClick={() => navigate(`/contracts/${c.id}`)}
                  >
                    <div className="grow">
                      <div className="row between gap-12">
                        <span className="t-label t-wrap">{c.title}</span>
                        <span className={`t-sm t-nowrap ${left < 14 ? 't-warning' : 't-mute'}`}>
                          {left < 0 ? 'Ended' : `${left}d left`}
                        </span>
                      </div>
                      <div className="row gap-12 mt-8">
                        <div className="progress grow">
                          <span style={{ width: `${need ? (have / need) * 100 : 0}%` }} />
                        </div>
                        <span className="t-sm t-mute t-num">
                          {have}/{need}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
