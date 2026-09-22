import { useCallback, useRef, useState } from 'react'
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
  Skeleton,
  errorText,
  fmtDate,
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

  const [loadingId, setLoadingId] = useState(null)
  // The document the user most recently asked for. A slow response for an
  // earlier click must not replace it, nor reopen one they backed out of.
  const wanted = useRef(null)

  const docs = documents.data ?? []

  const openDocument = useCallback(async (id, { quiet = false } = {}) => {
    setError(null)
    // A first open shows a skeleton; a refresh after a decision keeps the
    // current rows on screen so the list does not jump.
    wanted.current = id
    if (!quiet) setLoadingId(id)
    try {
      const doc = await getContractDocument(id)
      if (wanted.current === id) setSelected(doc)
    } catch (e) {
      if (wanted.current === id) setError(errorText(e, 'Could not load the document'))
    } finally {
      if (!quiet && wanted.current === id) setLoadingId(null)
    }
  }, [])

  function pick(id) {
    if (id === selected?.id) return
    setSelected(null)
    setSource(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    openDocument(id)
  }

  function backToList() {
    wanted.current = null
    setSelected(null)
    setLoadingId(null)
  }

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
      await openDocument(selected.id, { quiet: true })
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
      await openDocument(id, { quiet: true })
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

      <div className="grid grid-sidebar intake" data-view={selected || loadingId ? 'detail' : 'list'}>
        {/* ---------------------------------------------------- left rail */}
        <aside className="stack gap-16 intake-rail">
          <Card pad="sm">
            <Field label="Link to contract" hint="Needed before validated terms can be applied.">
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
              <span className="badge badge-neutral badge-plain t-num">{docs.length}</span>
            </div>
            {documents.loading && !documents.data ? (
              <LoadingRows rows={3} />
            ) : docs.length === 0 ? (
              <div className="card-pad-sm t-sm t-mute">Nothing uploaded yet.</div>
            ) : (
              <div className="doc-list">
                {docs.map((d) => {
                  const active = (selected?.id ?? loadingId) === d.id
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className={`doc-item${active ? ' active' : ''}`}
                      aria-current={active ? 'true' : undefined}
                      onClick={() => pick(d.id)}
                    >
                      <span className="doc-tile">
                        {loadingId === d.id ? <span className="spinner" /> : <Icon name="file" />}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span className="doc-name" style={{ display: 'block' }} title={d.fileName}>
                          {d.fileName}
                        </span>
                        <span className="doc-meta" style={{ display: 'block' }}>
                          {d.contractTitle ?? 'Unlinked'} · {d.pageCount} page{d.pageCount === 1 ? '' : 's'}
                        </span>
                      </span>
                      <StatusPill value={d.status} />
                    </button>
                  )
                })}
              </div>
            )}
          </Card>
        </aside>

        {/* ------------------------------------------------ review panel */}
        <section className="stack gap-16 intake-detail" style={{ minWidth: 0 }}>
          <button type="button" className="btn btn-ghost btn-sm intake-back" onClick={backToList}>
            <Icon name="arrowLeft" /> All documents
          </button>

          {loadingId && !selected ? (
            <Card pad>
              <div className="stack gap-12" aria-busy="true">
                <Skeleton height={24} width="45%" />
                <Skeleton height={14} width="65%" />
                <Skeleton height={120} style={{ marginTop: 8 }} />
                <Skeleton height={120} />
              </div>
            </Card>
          ) : !selected ? (
            <Card>
              <EmptyState icon="sparkles" title="Pick or upload a document">
                Choose a document on the left, or upload{' '}
                <span className="mono">docs/samples/sample-contract.txt</span> from the repository to see the
                full flow.
              </EmptyState>
            </Card>
          ) : (
            <>
              <Card>
                <div className="card-pad">
                  <div className="row between wrap gap-12" style={{ alignItems: 'flex-start' }}>
                    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
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

                  {rows.length > 0 && (
                    <div className="mt-16">
                      <div className="row between t-sm" style={{ marginBottom: 6 }}>
                        <span className="t-mute">Review progress</span>
                        <span className="t-num t-ink">
                          {rows.length - pending} of {rows.length} decided
                        </span>
                      </div>
                      <div className="progress">
                        <span style={{ width: `${((rows.length - pending) / rows.length) * 100}%` }} />
                      </div>
                      {!selected.contractId && selected.status !== 'APPLIED' && (
                        <div className="t-sm t-warning mt-8">
                          Not linked to a contract — decisions are saved, but can't be applied yet.
                        </div>
                      )}
                    </div>
                  )}

                  {selected.extractionError && (
                    <div className="mt-16">
                      <Alert>{selected.extractionError}</Alert>
                    </div>
                  )}
                </div>

                {rows.length > 0 && (
                  <div className="review-summary">
                    <div>
                      <div className="eyebrow">Attributes</div>
                      <div className="num mt-4">{rows.length}</div>
                    </div>
                    <div>
                      <div className="eyebrow">To review</div>
                      <div className={`num mt-4 ${pending ? 't-warning' : 't-success'}`}>{pending}</div>
                    </div>
                    <div>
                      <div className="eyebrow">Cited</div>
                      <div className={`num mt-4 ${verified === rows.length ? 't-success' : 't-warning'}`}>
                        {verified}/{rows.length}
                      </div>
                    </div>
                  </div>
                )}
              </Card>

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
                  const open = group.filter((r) => r.reviewStatus === 'PENDING').length
                  return (
                    <div key={type}>
                      <div className="family-head">
                        <h3 className="t-h3">{TYPE_LABEL[type]}</h3>
                        <span className="badge badge-neutral badge-plain t-num">{group.length}</span>
                        {open > 0 && <span className="t-sm t-warning">{open} to review</span>}
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
        </section>
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

/**
 * Values are stored as normalised strings (\`9600000\`, \`2027-03-31\`); show them
 * the way a person reads a contract. Anything unparseable is shown as-is.
 */
function displayValue(row) {
  const value = row.effectiveValue ?? row.rawValue
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (row.valueKind === 'MONEY' && Number.isFinite(n)) {
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: row.currency || 'INR',
        minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(n)
    } catch {
      return `${n.toLocaleString('en-IN')} ${row.currency ?? ''}`.trim()
    }
  }
  if (row.valueKind === 'DATE') return fmtDate(value)
  if (row.valueKind === 'NUMBER' && Number.isFinite(n)) return n.toLocaleString('en-IN')
  return value
}

const DECISION_LABEL = { ACCEPTED: 'Accepted', EDITED: 'Corrected', REJECTED: 'Rejected' }

function ExtractionRow({ row, frozen, onReview, onShowSource }) {
  const [editing, setEditing] = useState(false)
  const [reopened, setReopened] = useState(false)
  const [draft, setDraft] = useState(row.effectiveValue ?? row.rawValue ?? '')
  const confidence = Math.round((Number(row.confidence) || 0) * 100)
  const decided = row.reviewStatus !== 'PENDING'
  // Decided rows fold their buttons away so the eye goes to what is left.
  const showActions = !frozen && (!decided || reopened)

  function decide(decision, value) {
    setEditing(false)
    setReopened(false)
    onReview(row.id, decision, value)
  }

  return (
    <Card pad="sm" className={`extraction${decided ? ' is-decided' : ''}`}>
      <div className="row between gap-12" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="eyebrow">{row.fieldLabel}</div>
          <div className={`t-h3 mt-4 t-wrap${row.reviewStatus === 'REJECTED' ? ' t-mute' : ''}`}>
            {row.reviewStatus === 'REJECTED' ? <s>{displayValue(row)}</s> : displayValue(row)}
          </div>
          {row.rawValue && row.rawValue !== row.effectiveValue && (
            <div className="t-sm t-mute mt-4 t-wrap">As written: “{row.rawValue}”</div>
          )}
        </div>
        <StatusPill value={row.reviewStatus} label={DECISION_LABEL[row.reviewStatus]} />
      </div>

      <blockquote className={`quote mt-12 ${row.citationVerified ? 'verified' : 'unverified'}`}>
        {row.citationQuote ? `“${row.citationQuote}”` : 'No supporting quote was produced.'}
      </blockquote>

      <div className="row between wrap gap-8 mt-8 t-sm">
        <div className="row gap-8 wrap">
          <span className={row.citationVerified ? 't-success' : 't-error'} style={{ fontWeight: 500 }}>
            {row.citationVerified
              ? `Found in source${row.citationPage ? ` · p.${row.citationPage}` : ''}`
              : 'Not found in source — verify manually'}
          </span>
          {row.citationVerified && (
            <button type="button" className="link-btn" onClick={onShowSource}>
              View in document
            </button>
          )}
        </div>
        <span className="t-mute t-num">{confidence}% confidence</span>
      </div>

      {showActions &&
        (editing ? (
          <div className="row gap-8 wrap mt-12">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ flex: '1 1 180px', minWidth: 0 }}
              placeholder={`Corrected ${row.valueKind.toLowerCase()} value`}
              aria-label="Corrected value"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && draft.trim() && decide('EDITED', draft.trim())}
            />
            <Btn small icon="check" disabled={!draft.trim()} onClick={() => decide('EDITED', draft.trim())}>
              Save
            </Btn>
            <Btn small variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Btn>
          </div>
        ) : (
          <div className="cluster mt-12 extraction-actions">
            <Btn small variant="approve" icon="check" onClick={() => decide('ACCEPTED')}>
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
            <Btn small variant="reject" icon="x" onClick={() => decide('REJECTED')}>
              Reject
            </Btn>
            {reopened && (
              <Btn small variant="ghost" onClick={() => setReopened(false)}>
                Keep decision
              </Btn>
            )}
          </div>
        ))}

      {!frozen && decided && !reopened && (
        <div className="mt-8">
          <button type="button" className="link-btn t-sm" onClick={() => setReopened(true)}>
            Change decision
          </button>
        </div>
      )}
    </Card>
  )
}
