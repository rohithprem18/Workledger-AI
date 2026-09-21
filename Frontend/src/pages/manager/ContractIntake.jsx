import { useCallback, useState } from 'react'
import {
  getContractDocuments,
  getContractDocument,
  getContractDocumentText,
  uploadContractDocument,
  runContractExtraction,
  reviewExtraction,
  applyExtractions,
  getContracts,
} from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Btn from '../../components/Btn'
import Icon from '../../components/Icon'
import Drawer from '../../components/Drawer'
import StatusPill from '../../components/StatusPill'
import {
  Alert,
  Card,
  EmptyState,
  Field,
  LoadingRows,
  Stat,
  errorText,
  fmtDateTime,
} from '../../components/ui'

const TYPE_ORDER = ['RATE', 'BILLING_TERM', 'MILESTONE', 'DATE']
const TYPE_LABEL = {
  RATE: 'Rates',
  BILLING_TERM: 'Billing terms',
  MILESTONE: 'Milestones',
  DATE: 'Dates',
}

/**
 * Contract intake: upload a document, let both engines propose attributes,
 * then decide on each one. Nothing reaches the contract until every attribute
 * has been accepted, corrected or rejected by a person.
 */
export default function ContractIntake() {
  const documents = useFetch(() => getContractDocuments(), [])
  const contracts = useFetch(getContracts, [])

  const [selected, setSelected] = useState(null)
  const [contractId, setContractId] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [source, setSource] = useState(null)
  const [focusRow, setFocusRow] = useState(null)

  const docs = documents.data ?? []

  const openDocument = useCallback(async (id) => {
    setError(null)
    try {
      setSelected(await getContractDocument(id))
    } catch (e) {
      setError(errorText(e, 'Could not load the document'))
    }
  }, [])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy('upload')
    setError(null)
    setNotice(null)
    try {
      const created = await uploadContractDocument(file, { contractId: contractId || undefined })
      documents.reload()
      await openDocument(created.id)
      setNotice(`${file.name} uploaded. Run extraction to propose its terms.`)
    } catch (err) {
      setError(errorText(err, 'Upload failed'))
    } finally {
      setBusy(null)
      e.target.value = ''
    }
  }

  async function handleExtract(id) {
    setBusy('extract')
    setError(null)
    setNotice(null)
    try {
      const doc = await runContractExtraction(id)
      setSelected(doc)
      documents.reload()
      setNotice(`${doc.attributeCount} attributes proposed — review each one below.`)
    } catch (err) {
      setError(errorText(err, 'Extraction failed'))
    } finally {
      setBusy(null)
    }
  }

  async function handleReview(extractionId, decision, correctedValue) {
    setError(null)
    try {
      await reviewExtraction(extractionId, { decision, correctedValue: correctedValue ?? null })
      await openDocument(selected.id)
      documents.reload()
    } catch (err) {
      setError(errorText(err, 'Could not record that decision'))
    }
  }

  async function handleApply(id) {
    setBusy('apply')
    setError(null)
    try {
      await applyExtractions(id)
      await openDocument(id)
      documents.reload()
      setNotice('Validated attributes applied to the contract.')
    } catch (err) {
      setError(errorText(err, 'Could not apply extractions'))
    } finally {
      setBusy(null)
    }
  }

  async function showInSource(row) {
    setFocusRow(row)
    if (source?.id === selected.id) return
    try {
      setSource(await getContractDocumentText(selected.id))
    } catch (err) {
      setError(errorText(err, 'Could not load the document text'))
    }
  }

  const rows = selected?.extractions ?? []
  const pending = rows.filter((r) => r.reviewStatus === 'PENDING').length
  const verified = rows.filter((r) => r.citationVerified).length
  const canApply =
    selected && rows.length > 0 && pending === 0 && selected.contractId && selected.status !== 'APPLIED'

  return (
    <>
      <PageHeader
        eyebrow="Contract intelligence"
        title="Contract intake"
        subtitle="Extract rates, billing terms, milestones and dates — each with a quote that is checked against the source text."
      />

      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
      {notice && (
        <Alert tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <div className="grid grid-sidebar">
        {/* ---------------------------------------------------- left rail */}
        <div className="stack gap-16">
          <Card pad="sm">
            <Field label="Link to contract" hint="Needed before validated dates can be applied.">
              <select value={contractId} onChange={(e) => setContractId(e.target.value)}>
                <option value="">Review without linking</option>
                {(contracts.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </Field>
            <label className="file-drop mt-12">
              <input
                type="file"
                accept=".pdf,.txt,.md,text/plain,application/pdf"
                onChange={handleUpload}
                disabled={busy === 'upload'}
              />
              {busy === 'upload' ? <span className="spinner" /> : <Icon name="upload" />}
              <span className="t-label">{busy === 'upload' ? 'Uploading…' : 'Upload a contract'}</span>
              <span className="t-sm t-mute">PDF, TXT or Markdown · up to 10 MB</span>
            </label>
          </Card>

          <Card>
            <div className="card-header">
              <span className="eyebrow">Documents</span>
              <span className="t-sm t-mute">{docs.length}</span>
            </div>
            {documents.loading ? (
              <LoadingRows rows={3} />
            ) : docs.length === 0 ? (
              <div className="card-pad-sm t-sm t-mute">Nothing uploaded yet.</div>
            ) : (
              <div className="list" style={{ maxHeight: 420, overflowY: 'auto' }}>
                {docs.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`list-item${selected?.id === d.id ? ' active' : ''}`}
                    onClick={() => openDocument(d.id)}
                  >
                    <Icon name="file" />
                    <div className="grow">
                      <div className="t-label t-wrap">{d.fileName}</div>
                      <div className="t-sm t-mute t-wrap">
                        {d.contractTitle ?? 'Unlinked'} · {d.pageCount} page{d.pageCount === 1 ? '' : 's'}
                      </div>
                    </div>
                    <StatusPill value={d.status} />
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ------------------------------------------------ review panel */}
        <div className="stack gap-16" style={{ minWidth: 0 }}>
          {!selected ? (
            <Card>
              <EmptyState icon="sparkles" title="Pick or upload a document">
                Try <span className="mono">docs/samples/sample-contract.txt</span> from the repository to see
                the full flow.
              </EmptyState>
            </Card>
          ) : (
            <>
              <Card pad>
                <div className="row between wrap gap-12">
                  <div className="grow">
                    <div className="row gap-8 wrap">
                      <h2 className="t-h2 t-wrap">{selected.fileName}</h2>
                      <StatusPill value={selected.status} />
                    </div>
                    <div className="t-sm t-mute mt-4">
                      {selected.contractTitle ? `Linked to ${selected.contractTitle}` : 'Not linked to a contract'}
                      {selected.extractionEngine && ` · engine: ${selected.extractionEngine}`}
                      {selected.extractedAt && ` · ${fmtDateTime(selected.extractedAt)}`}
                    </div>
                  </div>
                  <div className="cluster">
                    <Btn
                      variant={rows.length ? 'secondary' : 'primary'}
                      icon="sparkles"
                      loading={busy === 'extract'}
                      disabled={selected.status === 'APPLIED'}
                      onClick={() => handleExtract(selected.id)}
                    >
                      {rows.length ? 'Re-extract' : 'Run extraction'}
                    </Btn>
                    {rows.length > 0 && (
                      <Btn
                        icon="check"
                        loading={busy === 'apply'}
                        disabled={!canApply}
                        onClick={() => handleApply(selected.id)}
                        title={
                          !selected.contractId
                            ? 'Link this document to a contract first'
                            : pending
                              ? 'Review every attribute first'
                              : undefined
                        }
                      >
                        Apply to contract
                      </Btn>
                    )}
                  </div>
                </div>
                {selected.extractionError && (
                  <div className="mt-16">
                    <Alert>{selected.extractionError}</Alert>
                  </div>
                )}
              </Card>

              {rows.length > 0 && (
                <div className="grid grid-3">
                  <Stat label="Attributes" value={rows.length} foot="Across four families" />
                  <Stat
                    label="Awaiting review"
                    value={pending}
                    tone={pending ? 'warning' : 'success'}
                    foot={pending ? 'Decide on each before applying' : 'All decided'}
                  />
                  <Stat
                    label="Citations verified"
                    value={`${verified}/${rows.length}`}
                    tone={verified === rows.length ? 'success' : 'warning'}
                    foot="Quote found verbatim in the source"
                  />
                </div>
              )}

              {rows.length === 0 ? (
                <Card>
                  <EmptyState icon="sparkles" title="Ready to extract">
                    Both engines run: a language model for recall, and a pattern matcher whose citations are
                    exact by construction.
                  </EmptyState>
                </Card>
              ) : (
                TYPE_ORDER.map((type) => {
                  const group = rows.filter((r) => r.attributeType === type)
                  if (group.length === 0) return null
                  return (
                    <div key={type}>
                      <div className="row between" style={{ marginBottom: 10 }}>
                        <h3 className="t-h3">{TYPE_LABEL[type]}</h3>
                        <span className="t-sm t-mute">{group.length}</span>
                      </div>
                      <div className="stack gap-12">
                        {group.map((row) => (
                          <ExtractionRow
                            key={row.id}
                            row={row}
                            frozen={selected.status === 'APPLIED'}
                            onReview={handleReview}
                            onShowSource={() => showInSource(row)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </>
          )}
        </div>
      </div>

      <Drawer
        open={!!focusRow}
        onClose={() => setFocusRow(null)}
        title="Source"
        subtitle={focusRow ? `${focusRow.fieldLabel} · page ${focusRow.citationPage ?? '—'}` : ''}
      >
        {focusRow && <SourceView text={source?.sourceText} row={focusRow} />}
      </Drawer>
    </>
  )
}

/** The stored document text with the cited span highlighted in place. */
function SourceView({ text, row }) {
  if (!text) return <LoadingRows rows={6} />
  if (row.citationStart == null || row.citationEnd == null) {
    return <Alert tone="warning">This quote was not found in the source, so there is nothing to highlight.</Alert>
  }
  const from = Math.max(0, row.citationStart - 600)
  const to = Math.min(text.length, row.citationEnd + 600)
  return (
    <div className="quote" style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: '21px' }}>
      {from > 0 && '…'}
      {text.slice(from, row.citationStart)}
      <mark
        ref={(el) => el?.scrollIntoView({ block: 'center' })}
        style={{ background: '#fff3b0', color: 'var(--ink)', padding: '1px 0', borderRadius: 3 }}
      >
        {text.slice(row.citationStart, row.citationEnd)}
      </mark>
      {text.slice(row.citationEnd, to)}
      {to < text.length && '…'}
    </div>
  )
}

function ExtractionRow({ row, frozen, onReview, onShowSource }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.effectiveValue ?? row.rawValue ?? '')
  const confidence = Math.round((Number(row.confidence) || 0) * 100)

  return (
    <Card pad="sm">
      <div className="row between gap-12" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="eyebrow">{row.fieldLabel}</div>
          <div className="t-h3 mt-4 t-wrap">
            {row.effectiveValue ?? row.rawValue ?? '—'}
            {row.currency && <span className="t-mute mono t-sm"> {row.currency}</span>}
          </div>
          {row.rawValue && row.rawValue !== row.effectiveValue && (
            <div className="t-sm t-mute mt-4">As written: “{row.rawValue}”</div>
          )}
        </div>
        <div className="stack gap-4" style={{ alignItems: 'flex-end' }}>
          <StatusPill value={row.reviewStatus} />
          <span className="t-sm t-mute t-num">{confidence}% confidence</span>
        </div>
      </div>

      <div className={`quote mt-12 ${row.citationVerified ? 'verified' : 'unverified'}`}>
        <div className="row between gap-8" style={{ marginBottom: 6 }}>
          <span
            className={`t-sm ${row.citationVerified ? 't-success' : 't-error'}`}
            style={{ fontFamily: 'var(--sans)', fontWeight: 500 }}
          >
            {row.citationVerified
              ? `Found in source${row.citationPage ? ` · page ${row.citationPage}` : ''}`
              : 'Not found in source — verify manually'}
          </span>
          {row.citationVerified && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onShowSource}>
              <Icon name="eye" /> View
            </button>
          )}
        </div>
        {row.citationQuote ? `“${row.citationQuote}”` : 'No supporting quote was produced.'}
      </div>

      {!frozen &&
        (editing ? (
          <div className="row gap-8 wrap mt-12">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ flex: 1, minWidth: 180 }}
              placeholder={`Corrected ${row.valueKind.toLowerCase()} value`}
              aria-label="Corrected value"
            />
            <Btn
              small
              icon="check"
              onClick={() => {
                setEditing(false)
                onReview(row.id, 'EDITED', draft)
              }}
            >
              Save
            </Btn>
            <Btn small variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Btn>
          </div>
        ) : (
          <div className="cluster mt-12">
            <Btn small variant="approve" icon="check" onClick={() => onReview(row.id, 'ACCEPTED')}>
              Accept
            </Btn>
            <Btn
              small
              variant="secondary"
              icon="edit"
              onClick={() => {
                setDraft(row.effectiveValue ?? '')
                setEditing(true)
              }}
            >
              Correct
            </Btn>
            <Btn small variant="reject" icon="x" onClick={() => onReview(row.id, 'REJECTED')}>
              Reject
            </Btn>
          </div>
        ))}
    </Card>
  )
}
