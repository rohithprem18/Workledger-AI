import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getContracts, getCompanies, createContract, getBillingTypes } from '../../api'
import { useFetch } from '../../hooks/useFetch'
import { useAuth } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import Drawer from '../../components/Drawer'
import Btn from '../../components/Btn'
import StatusPill from '../../components/StatusPill'
import {
  Alert,
  Card,
  DataTable,
  EmptyState,
  Field,
  LoadingRows,
  Tabs,
  errorText,
  fmtDate,
} from '../../components/ui'

const EMPTY = {
  title: '',
  description: '',
  companyId: '',
  billingTypeId: '',
  startDate: '',
  endDate: '',
}

function staffing(contract) {
  const reqs = contract.requirements ?? []
  return {
    have: reqs.reduce((n, r) => n + (r.fulfilledCount ?? 0), 0),
    need: reqs.reduce((n, r) => n + (r.requiredEmployeeCount ?? 0), 0),
  }
}

export default function Contracts() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('CREATE_CONTRACT')

  const contracts = useFetch(getContracts, [])
  const companies = useFetch(() => (canCreate ? getCompanies() : Promise.resolve([])), [canCreate])
  const billingTypes = useFetch(getBillingTypes, [])

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [actionError, setActionError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('ALL')
  const [query, setQuery] = useState('')

  const all = contracts.data ?? []
  const companyList = companies.data ?? []
  const btList = billingTypes.data ?? []

  const visible = all
    .filter((c) => {
      if (filter === 'ACTIVE') return c.active
      if (filter === 'HOURLY' || filter === 'MILESTONE') return c.billingTypeCode === filter
      return true
    })
    .filter((c) =>
      `${c.title} ${c.companyName ?? ''}`.toLowerCase().includes(query.toLowerCase()),
    )

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  function openCreate() {
    const hourly = btList.find((bt) => bt.code === 'HOURLY')?.id ?? ''
    setForm({ ...EMPTY, billingTypeId: hourly })
    setActionError(null)
    setDrawerOpen(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setActionError(null)
    try {
      const created = await createContract(form)
      setDrawerOpen(false)
      contracts.reload()
      if (created?.id) navigate(`/contracts/${created.id}`)
    } catch (err) {
      setActionError(errorText(err, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      key: 'title',
      header: 'Contract',
      primary: true,
      render: (c) => (
        <div>
          <div className="t-ink" style={{ fontWeight: 500 }}>
            {c.title}
          </div>
          <div className="t-sm t-mute">{c.companyName ?? '—'}</div>
        </div>
      ),
    },
    { key: 'billing', header: 'Billing', render: (c) => <StatusPill value={c.billingTypeCode} dot={false} /> },
    {
      key: 'term',
      header: 'Term',
      render: (c) => (
        <span className="t-nowrap">
          {fmtDate(c.startDate)} – {fmtDate(c.endDate)}
        </span>
      ),
    },
    {
      key: 'staffing',
      header: 'Staffing',
      render: (c) => {
        const { have, need } = staffing(c)
        return (
          <div className="row gap-8" style={{ minWidth: 110 }}>
            <div className="progress grow">
              <span style={{ width: `${need ? (have / need) * 100 : 0}%` }} />
            </div>
            <span className="t-sm t-num t-mute">
              {have}/{need}
            </span>
          </div>
        )
      },
    },
    { key: 'status', header: 'Status', render: (c) => <StatusPill value={c.active ? 'ACTIVE' : 'INACTIVE'} /> },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Delivery"
        title="Contracts"
        subtitle="Client agreements, the roles they need filled, and the rates they authorise."
      >
        {canCreate && (
          <>
            <Btn variant="secondary" icon="sparkles" onClick={() => navigate('/contracts/intake')}>
              Extract from document
            </Btn>
            <Btn icon="plus" onClick={openCreate}>
              New contract
            </Btn>
          </>
        )}
      </PageHeader>

      {(contracts.error || companies.error) && <Alert>{contracts.error || companies.error}</Alert>}

      <Card>
        <div className="card-header wrap">
          <Tabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'ALL', label: 'All', count: all.length },
              { value: 'ACTIVE', label: 'Active', count: all.filter((c) => c.active).length },
              { value: 'HOURLY', label: 'Hourly' },
              { value: 'MILESTONE', label: 'Milestone' },
            ]}
          />
          <input
            type="search"
            placeholder="Search by title or client…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 280 }}
            aria-label="Search contracts"
          />
        </div>

        {contracts.loading ? (
          <LoadingRows />
        ) : (
          <DataTable
            columns={columns}
            rows={visible}
            onRowClick={(c) => navigate(`/contracts/${c.id}`)}
            empty={
              <EmptyState
                icon="contract"
                title={all.length ? 'Nothing matches' : 'No contracts yet'}
                action={
                  canCreate &&
                  all.length === 0 && (
                    <Btn icon="plus" onClick={openCreate}>
                      Create a contract
                    </Btn>
                  )
                }
              >
                {all.length
                  ? 'Try another filter or search term.'
                  : 'Create one by hand, or upload a document and let the extractor propose its terms.'}
              </EmptyState>
            }
          />
        )}
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="New contract"
        subtitle="Requirements and milestones are added on the next screen."
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Btn>
            <Btn type="submit" form="contract-form" loading={saving}>
              Create contract
            </Btn>
          </>
        }
      >
        {actionError && <Alert>{actionError}</Alert>}
        <form id="contract-form" onSubmit={handleSubmit}>
          <Field label="Title">
            <input value={form.title} onChange={set('title')} placeholder="Platform engineering — FY27" required />
          </Field>
          <Field label="Client">
            <select value={form.companyId} onChange={set('companyId')} required>
              <option value="">Select a client</option>
              {companyList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Billing model" hint="Hourly bills approved hours; milestone bills fixed amounts on sign-off.">
            <select value={form.billingTypeId} onChange={set('billingTypeId')} required>
              <option value="">Select a billing model</option>
              {btList.map((bt) => (
                <option key={bt.id} value={bt.id}>
                  {bt.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="field-row">
            <Field label="Starts">
              <input type="date" value={form.startDate} onChange={set('startDate')} required />
            </Field>
            <Field label="Ends">
              <input type="date" value={form.endDate} onChange={set('endDate')} min={form.startDate} required />
            </Field>
          </div>
          <Field label="Description">
            <textarea rows={3} value={form.description} onChange={set('description')} />
          </Field>
        </form>
      </Drawer>
    </>
  )
}
