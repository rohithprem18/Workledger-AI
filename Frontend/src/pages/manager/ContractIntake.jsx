import { useState, useCallback } from 'react'
import {
  getContractDocuments, getContractDocument, uploadContractDocument,
  runContractExtraction, reviewExtraction, applyExtractions, getContracts,
} from '../../api'
import { useFetch } from '../../hooks/useFetch'
import PageHeader from '../../components/PageHeader'
import Btn from '../../components/Btn'
import StatusPill from '../../components/StatusPill'

const ERR = {
  padding: '10px 16px', background: '#ef444415', color: '#ef4444',
  borderLeft: '2px solid #ef4444', marginBottom: 16,
  fontFamily: 'monospace', fontSize: 12,
}
const MUTED = { color: '#7a9ab0', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }
const CARD = { border: '1px solid #1e3a4a', borderRadius: 3, background: '#03121d' }
const LABEL = {
  display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
  color: '#7a9ab0', fontFamily: 'ui-monospace, Consolas, monospace',
  marginBottom: 6, textTransform: 'uppercase',
}

const TYPE_ORDER = ['RATE', 'BILLING_TERM', 'MILESTONE', 'DATE']
const TYPE_LABEL = {
  RATE: 'Rates',
  BILLING_TERM: 'Billing terms',
  MILESTONE: 'Milestones',
  DATE: 'Dates',
}

export default function ContractIntake() {
  const documents = useFetch(() => getContractDocuments(), [])
  const contracts = useFetch(getContracts, [])

  const [selected, setSelected] = useState(null)
  const [contractId, setContractId] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const docs = documents.data ?? []
  const contractList = contracts.data ?? []

  const openDocument = useCallback(async (id) => {
    setError(null)
    try {
      setSelected(await getContractDocument(id))
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Could not load document')
    }
  }, [])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy('upload')
    setError(null)
    try {
      const created = await uploadContractDocument(file, { contractId: contractId || undefined })
      documents.reload()
      await openDocument(created.id)
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Upload failed')
    } finally {
      setBusy(null)
      e.target.value = ''
    }
  }

  async function handleExtract(id) {
    setBusy('extract')
    setError(null)
    try {
      setSelected(await runContractExtraction(id))
      documents.reload()
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Extraction failed')
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
      setError(typeof err === 'string' ? err : 'Could not record that decision')
    }
  }

  async function handleApply(id) {
    setBusy('apply')
    setError(null)
    try {
      await applyExtractions(id)
      await openDocument(id)
      documents.reload()
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Could not apply extractions')
    } finally {
      setBusy(null)
    }
  }

  const rows = selected?.extractions ?? []
  const pending = rows.filter((r) => r.reviewStatus === 'PENDING').length
  const canApply = selected && rows.length > 0 && pending === 0
                   && selected.contractId && selected.status !== 'APPLIED'

  return (
    <div>
      <PageHeader
        title="Contract Intake"
        subtitle="Upload a contract · extract rates, billing terms, milestones and dates · validate every one"
      />

      <div style={{ padding: '24px 32px' }}>
        {(documents.error || error) && <div style={ERR}>ERROR: {documents.error || error}</div>}

        {/* ---------------------------------------------------------- upload */}
        <div style={{ ...CARD, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 260, flex: 1 }}>
              <label style={LABEL}>Attach to contract (optional)</label>
              <select value={contractId} onChange={(e) => setContractId(e.target.value)}>
                <option value="">— Review without linking a contract —</option>
                {contractList.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 260, flex: 1 }}>
              <label style={LABEL}>Contract document</label>
              <input
                type="file"
                accept=".pdf,.txt,.md,text/plain,application/pdf"
                onChange={handleUpload}
                disabled={busy === 'upload'}
              />
            </div>
          </div>
          <div style={{ ...MUTED, marginTop: 12 }}>
            Text-based PDF, plain text or Markdown, up to 10 MB. Scanned images have no
            extractable text and are rejected.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* ------------------------------------------------ document list */}
          <div style={{ ...CARD, width: 300, flexShrink: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e3a4a', ...MUTED, fontWeight: 700, letterSpacing: '0.1em' }}>
              DOCUMENTS ({docs.length})
            </div>
            {documents.loading ? (
              <div style={{ padding: 16, ...MUTED }}>Loading…</div>
            ) : docs.length === 0 ? (
              <div style={{ padding: 16, ...MUTED }}>Nothing uploaded yet</div>
            ) : (
              docs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => openDocument(d.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: '10px 16px', border: 'none',
                    borderBottom: '1px solid #0f2433',
                    borderLeft: selected?.id === d.id ? '2px solid #ff6b00' : '2px solid transparent',
                    background: selected?.id === d.id ? '#ff6b0010' : 'transparent',
                  }}
                >
                  <div style={{ color: '#f0f2f5', fontSize: 12, fontWeight: 600, wordBreak: 'break-all' }}>
                    {d.fileName}
                  </div>
                  <div style={{ ...MUTED, fontSize: 10, marginTop: 4 }}>
                    {d.status} · {d.pageCount} page{d.pageCount === 1 ? '' : 's'}
                    {d.contractTitle ? ` · ${d.contractTitle}` : ''}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* -------------------------------------------- extraction review */}
          <div style={{ flex: 1, minWidth: 420 }}>
            {!selected ? (
              <div style={{ ...CARD, padding: 48, textAlign: 'center', ...MUTED }}>
                Select a document to review its extracted attributes
              </div>
            ) : (
              <>
                <DocumentSummary
                  document={selected}
                  pending={pending}
                  busy={busy}
                  canApply={canApply}
                  onExtract={() => handleExtract(selected.id)}
                  onApply={() => handleApply(selected.id)}
                />

                {rows.length === 0 ? (
                  <div style={{ ...CARD, padding: 32, textAlign: 'center', ...MUTED, marginTop: 16 }}>
                    {selected.status === 'UPLOADED'
                      ? 'Run extraction to propose attributes from this document.'
                      : 'No attributes were extracted from this document.'}
                  </div>
                ) : (
                  TYPE_ORDER.map((type) => {
                    const group = rows.filter((r) => r.attributeType === type)
                    if (group.length === 0) return null
                    return (
                      <AttributeGroup
                        key={type}
                        title={TYPE_LABEL[type]}
                        rows={group}
                        frozen={selected.status === 'APPLIED'}
                        onReview={handleReview}
                      />
                    )
                  })
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DocumentSummary({ document, pending, busy, canApply, onExtract, onApply }) {
  const verified = document.verifiedCitationCount ?? 0
  const total = document.attributeCount ?? 0

  return (
    <div style={{ ...CARD, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#f0f2f5', fontSize: 15, fontWeight: 600, wordBreak: 'break-all' }}>
            {document.fileName}
          </div>
          <div style={{ ...MUTED, marginTop: 6 }}>
            <StatusPill value={document.status} />
            {document.extractionEngine && <> · engine: {document.extractionEngine}</>}
            {document.contractTitle && <> · {document.contractTitle}</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={onExtract} disabled={busy === 'extract' || document.status === 'APPLIED'}>
            {busy === 'extract' ? 'EXTRACTING…' : total > 0 ? 'RE-EXTRACT' : 'RUN EXTRACTION'}
          </Btn>
          {total > 0 && (
            <Btn variant="approve" onClick={onApply} disabled={!canApply || busy === 'apply'}>
              {busy === 'apply' ? 'APPLYING…' : 'APPLY TO CONTRACT'}
            </Btn>
          )}
        </div>
      </div>

      {total > 0 && (
        <div style={{ display: 'flex', gap: 28, marginTop: 18, flexWrap: 'wrap' }}>
          <Stat label="Attributes" value={total} />
          <Stat label="Awaiting review" value={pending} accent={pending > 0 ? '#ff6b00' : '#00c851'} />
          <Stat
            label="Citations verified"
            value={`${verified}/${total}`}
            accent={verified === total ? '#00c851' : '#ff6b00'}
          />
        </div>
      )}

      {document.extractionError && (
        <div style={{ ...ERR, marginTop: 16, marginBottom: 0 }}>{document.extractionError}</div>
      )}

      {total > 0 && pending > 0 && (
        <div style={{ ...MUTED, marginTop: 16, lineHeight: 1.6 }}>
          Nothing here reaches the contract until a person decides on it. Accept a value,
          correct it, or reject it — all {pending} remaining must be resolved before this
          document can be applied.
        </div>
      )}
      {!document.contractId && total > 0 && (
        <div style={{ ...MUTED, marginTop: 10, color: '#ff6b00' }}>
          This document is not linked to a contract, so validated values cannot be applied.
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent = '#f0f2f5' }) {
  return (
    <div>
      <div style={{ ...MUTED, fontSize: 10, letterSpacing: '0.1em', fontWeight: 700 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ color: accent, fontSize: 20, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function AttributeGroup({ title, rows, frozen, onReview }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ ...MUTED, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 8 }}>
        {title.toUpperCase()} ({rows.length})
      </div>
      {rows.map((row) => (
        <ExtractionRow key={row.id} row={row} frozen={frozen} onReview={onReview} />
      ))}
    </div>
  )
}

function ExtractionRow({ row, frozen, onReview }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.effectiveValue ?? row.rawValue ?? '')

  const decided = row.reviewStatus !== 'PENDING'
  const confidence = Math.round((Number(row.confidence) || 0) * 100)

  return (
    <div style={{ ...CARD, padding: 16, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ ...MUTED, fontSize: 10, letterSpacing: '0.1em', fontWeight: 700 }}>
            {row.fieldLabel.toUpperCase()}
          </div>
          <div style={{ color: '#f0f2f5', fontSize: 16, fontWeight: 600, marginTop: 4 }}>
            {row.effectiveValue ?? row.rawValue ?? '—'}
            {row.currency && <span style={{ ...MUTED, marginLeft: 8 }}>{row.currency}</span>}
          </div>
          {row.rawValue && row.rawValue !== row.effectiveValue && (
            <div style={{ ...MUTED, marginTop: 2 }}>as written: “{row.rawValue}”</div>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          <StatusPill value={row.reviewStatus} />
          <div style={{ ...MUTED, marginTop: 6 }}>{confidence}% confidence</div>
        </div>
      </div>

      {/* ------------------------------------------------------- citation */}
      <div
        style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 2,
          background: row.citationVerified ? '#00c85108' : '#ef444408',
          borderLeft: `2px solid ${row.citationVerified ? '#00c851' : '#ef4444'}`,
        }}
      >
        <div style={{
          ...MUTED, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
          color: row.citationVerified ? '#00c851' : '#ef4444',
        }}>
          {row.citationVerified
            ? `✓ FOUND IN SOURCE${row.citationPage ? ` · PAGE ${row.citationPage}` : ''}`
            : '✗ NOT FOUND IN SOURCE — VERIFY MANUALLY'}
        </div>
        <div style={{ color: '#c3d4e0', fontSize: 12, marginTop: 6, lineHeight: 1.6, fontStyle: 'italic' }}>
          {row.citationQuote ? `“${row.citationQuote}”` : 'No supporting quote was produced.'}
        </div>
      </div>

      {/* --------------------------------------------------------- actions */}
      {!frozen && (
        editing ? (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
              placeholder={`Corrected ${row.valueKind.toLowerCase()} value`}
            />
            <Btn small variant="approve" onClick={() => { setEditing(false); onReview(row.id, 'EDITED', draft) }}>
              SAVE
            </Btn>
            <Btn small variant="ghost" onClick={() => setEditing(false)}>CANCEL</Btn>
          </div>
        ) : (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn small variant="approve" onClick={() => onReview(row.id, 'ACCEPTED')}>ACCEPT</Btn>
            <Btn small variant="ghost" onClick={() => { setDraft(row.effectiveValue ?? ''); setEditing(true) }}>
              CORRECT
            </Btn>
            <Btn small variant="reject" onClick={() => onReview(row.id, 'REJECTED')}>REJECT</Btn>
            {decided && (
              <span style={{ ...MUTED, marginLeft: 4 }}>
                reviewed {row.reviewedAt ? new Date(row.reviewedAt).toLocaleString() : ''}
              </span>
            )}
          </div>
        )
      )}
    </div>
  )
}
