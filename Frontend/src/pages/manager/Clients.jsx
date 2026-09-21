import { useState } from 'react'
import { getCompanies, createCompany, updateCompany } from '../../api'
import { useFetch } from '../../hooks/useFetch'
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
  errorText,
} from '../../components/ui'

const EMPTY = { name: '', contactEmail: '', contactPhone: '', address: '' }

export default function Clients() {
  const { data, loading, error, reload } = useFetch(getCompanies, [])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [actionError, setActionError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')

  const companies = (data ?? []).filter((c) =>
    `${c.name} ${c.contactEmail ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  )

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setActionError(null)
    setDrawerOpen(true)
  }

  function openEdit(c) {
    setEditing(c)
    setForm({
      name: c.name ?? '',
      contactEmail: c.contactEmail ?? '',
      contactPhone: c.contactPhone ?? '',
      address: c.address ?? '',
    })
    setActionError(null)
    setDrawerOpen(true)
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setActionError(null)
    try {
      if (editing) await updateCompany(editing.id, form)
      else await createCompany(form)
      setDrawerOpen(false)
      reload()
    } catch (err) {
      setActionError(errorText(err, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { key: 'name', header: 'Company', primary: true },
    {
      key: 'contactEmail',
      header: 'Billing contact',
      render: (c) =>
        c.contactEmail ? <a href={`mailto:${c.contactEmail}`}>{c.contactEmail}</a> : '—',
    },
    { key: 'contactPhone', header: 'Phone', render: (c) => c.contactPhone || '—' },
    {
      key: 'address',
      header: 'Address',
      hideOnMobile: true,
      render: (c) => <span className="t-mute">{c.address || '—'}</span>,
    },
    {
      key: 'active',
      header: 'Status',
      render: (c) => <StatusPill value={c.active === false ? 'INACTIVE' : 'ACTIVE'} />,
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Delivery"
        title="Clients"
        subtitle="The companies you supply contractors to. Invoices are emailed to the billing contact."
      >
        <Btn icon="plus" onClick={openCreate}>
          Add client
        </Btn>
      </PageHeader>

      {error && <Alert>{error}</Alert>}

      <Card>
        <div className="card-header">
          <input
            type="search"
            placeholder="Search clients…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 320 }}
            aria-label="Search clients"
          />
          <span className="t-sm t-mute t-nowrap">{companies.length} shown</span>
        </div>
        {loading ? (
          <LoadingRows />
        ) : (
          <DataTable
            columns={columns}
            rows={companies}
            actions={(c) => (
              <Btn small variant="secondary" icon="edit" onClick={() => openEdit(c)}>
                Edit
              </Btn>
            )}
            empty={
              <EmptyState
                icon="building"
                title={query ? 'No clients match' : 'No clients yet'}
                action={
                  !query && (
                    <Btn icon="plus" onClick={openCreate}>
                      Add your first client
                    </Btn>
                  )
                }
              >
                {query ? 'Try a different search.' : 'Clients own contracts and receive invoices.'}
              </EmptyState>
            }
          />
        )}
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? 'Edit client' : 'Add client'}
        subtitle={editing ? editing.name : 'A company you supply contractors to'}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Btn>
            <Btn type="submit" form="client-form" loading={saving}>
              {editing ? 'Save changes' : 'Create client'}
            </Btn>
          </>
        }
      >
        {actionError && <Alert>{actionError}</Alert>}
        <form id="client-form" onSubmit={handleSubmit}>
          <Field label="Company name">
            <input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Billing email" hint="Approved invoices are sent here.">
            <input type="email" value={form.contactEmail} onChange={set('contactEmail')} required />
          </Field>
          <Field label="Phone">
            <input type="tel" value={form.contactPhone} onChange={set('contactPhone')} />
          </Field>
          <Field label="Address">
            <textarea rows={3} value={form.address} onChange={set('address')} />
          </Field>
        </form>
      </Drawer>
    </>
  )
}
