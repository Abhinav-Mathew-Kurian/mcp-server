import { useState, useRef, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3456'

interface NoteInput {
  id: string
  text: string
  fileName?: string
}

interface ZkSummary {
  ageRange: string
  icdChapter: number
  icdChapterName: string
  matchedDiagnosis: string
  verified: boolean
  provingSystem: string
  constraintCount: number
}

interface NoteResult {
  id: string
  status: 'success' | 'failed'
  error?: string
  anonymizedText?: string
  facts?: {
    diagnoses: unknown[]
    medications: unknown[]
    ageYears?: number
    ageRange?: string
    sex?: string
    chiefComplaint?: string
  }
  zkSummary?: ZkSummary
  totalPhiTokens?: number
  durationMs?: number
}

interface BatchResult {
  batchId: string
  totalNotes: number
  succeeded: number
  failed: number
  durationMs: number
  icdDistribution: Record<string, number>
  totalPhiTokens: number
  results: NoteResult[]
}

type AppState = 'idle' | 'running' | 'done' | 'error'

export default function App() {
  const [notes, setNotes] = useState<NoteInput[]>([{ id: 'note_1', text: '' }])
  const [state, setState] = useState<AppState>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [expandedNote, setExpandedNote] = useState<string | null>(null)
  const [fullNoteTexts, setFullNoteTexts] = useState<Record<string, NoteResult>>({})
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [mode, setMode] = useState<'text' | 'files'>('text')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const ALLOWED_EXTS = ['.txt', '.md', '.pdf', '.docx']
  const isAllowed = (name: string) => ALLOWED_EXTS.some(ext => name.toLowerCase().endsWith(ext))
  const isBinary = (name: string) => ['.pdf', '.docx'].some(ext => name.toLowerCase().endsWith(ext))

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => isAllowed(f.name))
    if (dropped.length === 0) return

    const hasBinary = dropped.some(f => isBinary(f.name))
    if (hasBinary) {
      setMode('files')
      setUploadedFiles(prev => {
        const existing = new Set(prev.map(f => f.name))
        return [...prev, ...dropped.filter(f => !existing.has(f.name))]
      })
    } else {
      setMode('text')
      const readers = dropped.map(file =>
        new Promise<NoteInput>(resolve => {
          const reader = new FileReader()
          reader.onload = () => resolve({
            id: file.name.replace(/\.[^.]+$/, '').replace(/\s+/g, '_'),
            text: reader.result as string,
            fileName: file.name,
          })
          reader.readAsText(file)
        })
      )
      Promise.all(readers).then(loaded => {
        setNotes(prev => [...prev.filter(n => n.text.trim()), ...loaded])
      })
    }
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).filter(f => isAllowed(f.name))
    if (picked.length === 0) return
    const hasBinary = picked.some(f => isBinary(f.name))
    if (hasBinary) {
      setMode('files')
      setUploadedFiles(prev => {
        const existing = new Set(prev.map(f => f.name))
        return [...prev, ...picked.filter(f => !existing.has(f.name))]
      })
    } else {
      setMode('text')
      const readers = picked.map(file =>
        new Promise<NoteInput>(resolve => {
          const reader = new FileReader()
          reader.onload = () => resolve({
            id: file.name.replace(/\.[^.]+$/, '').replace(/\s+/g, '_'),
            text: reader.result as string,
            fileName: file.name,
          })
          reader.readAsText(file)
        })
      )
      Promise.all(readers).then(loaded => {
        setNotes(prev => [...prev.filter(n => n.text.trim()), ...loaded])
      })
    }
    e.target.value = ''
  }

  const removeFile = (idx: number) => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))
  const addNote = () => setNotes(prev => [...prev, { id: `note_${prev.length + 1}`, text: '' }])
  const removeNote = (idx: number) => setNotes(prev => prev.filter((_, i) => i !== idx))
  const updateNote = (idx: number, field: 'id' | 'text', value: string) =>
    setNotes(prev => prev.map((n, i) => i === idx ? { ...n, [field]: value } : n))

  const submitBatch = async () => {
    setState('running')
    setErrorMsg(null)
    setBatchResult(null)
    setExpandedNote(null)
    setFullNoteTexts({})
    try {
      let jid: string

      if (mode === 'files' && uploadedFiles.length > 0) {
        const form = new FormData()
        uploadedFiles.forEach(f => form.append('files', f))
        const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: form })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Upload failed')
        const data = await res.json()
        jid = data.jobId
      } else {
        const valid = notes.filter(n => n.text.trim() && n.id.trim())
        if (valid.length === 0) { setState('idle'); return }
        const res = await fetch(`${API_BASE}/api/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: valid.map(n => ({ id: n.id, text: n.text })) }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Submit failed')
        const data = await res.json()
        jid = data.jobId
      }

      setJobId(jid)
      startPolling(jid)
    } catch (err) {
      setState('error')
      setErrorMsg((err as Error).message)
    }
  }

  const startPolling = (jid: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/batch/${jid}`)
        const data = await res.json()
        if (data.status === 'done') {
          clearInterval(pollRef.current!)
          setBatchResult(data.result)
          setState('done')
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current!)
          setState('error')
          setErrorMsg(data.error ?? 'Batch failed')
        }
      } catch {
        clearInterval(pollRef.current!)
        setState('error')
        setErrorMsg('Lost connection to API server')
      }
    }, 2000)
  }

  const expandNote = async (noteId: string) => {
    if (expandedNote === noteId) { setExpandedNote(null); return }
    setExpandedNote(noteId)
    if (fullNoteTexts[noteId] || !jobId) return
    try {
      const res = await fetch(`${API_BASE}/api/batch/${jobId}/note/${noteId}`)
      const data: NoteResult = await res.json()
      setFullNoteTexts(prev => ({ ...prev, [noteId]: data }))
    } catch { /* silent */ }
  }

  const downloadZip = () => { if (jobId) window.open(`${API_BASE}/api/batch/${jobId}/download`, '_blank') }

  const validNotes = notes.filter(n => n.text.trim() && n.id.trim())

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100" style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <header style={{ borderBottom: '1px solid #1f2937', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 }}>C</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'white' }}>Corti De-identification</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>ZK-proved PHI redaction · Batch pipeline</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399' }} />
          <span style={{ fontSize: 12, color: '#6b7280' }}>API ready</span>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        {/* INPUT STATE */}
        {(state === 'idle' || state === 'error') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? '#7c3aed' : '#374151'}`,
                borderRadius: 12,
                padding: '28px',
                textAlign: 'center',
                cursor: 'pointer',
                background: isDragging ? 'rgba(124,58,237,0.08)' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
              <div style={{ color: '#9ca3af', fontSize: 14 }}>
                Drop files or <strong style={{ color: '#a78bfa' }}>click to browse</strong>
              </div>
              <div style={{ color: '#6b7280', fontSize: 12, marginTop: 6 }}>
                Supports&nbsp;
                <span style={{ color: 'white' }}>.pdf</span>&nbsp;·&nbsp;
                <span style={{ color: 'white' }}>.docx</span>&nbsp;·&nbsp;
                <span style={{ color: 'white' }}>.txt</span>&nbsp;·&nbsp;
                <span style={{ color: 'white' }}>.md</span>
                &nbsp;— up to 20 files at once
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md"
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
            </div>

            {/* Uploaded binary files list */}
            {mode === 'files' && uploadedFiles.length > 0 && (
              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #1f2937', fontSize: 12, color: '#6b7280', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} queued for upload</span>
                  <button onClick={() => { setUploadedFiles([]); setMode('text') }} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}>Clear all</button>
                </div>
                {uploadedFiles.map((f, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: idx === 0 ? 'none' : '1px solid #1f2937' }}>
                    <span style={{ fontSize: 16 }}>{f.name.endsWith('.pdf') ? '📄' : f.name.endsWith('.docx') ? '📝' : '📃'}</span>
                    <span style={{ fontSize: 13, color: '#d1d5db', flex: 1, fontFamily: 'monospace' }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: '#4b5563' }}>{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeFile(idx)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Divider if showing both */}
            {mode === 'text' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, height: 1, background: '#1f2937' }} />
                <span style={{ fontSize: 11, color: '#4b5563' }}>or paste text directly</span>
                <div style={{ flex: 1, height: 1, background: '#1f2937' }} />
              </div>
            )}

            {/* Note inputs */}
            {notes.map((note, idx) => (
              <div key={idx} style={{ background: '#111827', borderRadius: 12, border: '1px solid #1f2937', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid #1f2937' }}>
                  <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>ID</span>
                  <input
                    value={note.id}
                    onChange={e => updateNote(idx, 'id', e.target.value)}
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#d1d5db', fontSize: 13 }}
                    placeholder={`patient_${idx + 1}`}
                  />
                  {note.fileName && (
                    <span style={{ fontSize: 11, color: '#a78bfa', background: 'rgba(124,58,237,0.15)', padding: '2px 8px', borderRadius: 4 }}>
                      {note.fileName}
                    </span>
                  )}
                  <button onClick={() => removeNote(idx)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
                <textarea
                  value={note.text}
                  onChange={e => updateNote(idx, 'text', e.target.value)}
                  rows={6}
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', padding: '12px 16px', color: '#d1d5db', fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
                  placeholder="Paste clinical note here..."
                />
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={addNote}
                style={{ fontSize: 13, color: '#9ca3af', background: 'none', border: '1px solid #374151', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}
              >+ Add note</button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: '#4b5563' }}>
                {mode === 'files' ? `${uploadedFiles.length} file${uploadedFiles.length !== 1 ? 's' : ''} ready` : `${validNotes.length} note${validNotes.length !== 1 ? 's' : ''} ready`}
              </span>
              <button
                onClick={submitBatch}
                disabled={mode === 'files' ? uploadedFiles.length === 0 : validNotes.length === 0}
                style={{
                  background: validNotes.length === 0 ? '#374151' : '#7c3aed',
                  color: 'white',
                  border: 'none',
                  padding: '9px 24px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: validNotes.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >Run Batch →</button>
            </div>

            {state === 'error' && errorMsg && (
              <div style={{ background: 'rgba(127,29,29,0.4)', border: '1px solid #991b1b', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#fca5a5' }}>
                {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* RUNNING STATE */}
        {state === 'running' && (
          <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1f2937', padding: 48, textAlign: 'center' }}>
            <div style={{
              width: 40, height: 40, border: '3px solid #7c3aed', borderTopColor: 'transparent',
              borderRadius: '50%', margin: '0 auto 20px',
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ color: 'white', fontWeight: 500, fontSize: 15 }}>Processing batch...</div>
            <div style={{ color: '#6b7280', fontSize: 13, marginTop: 6 }}>De-identifying · Extracting facts · Generating ZK proofs</div>
            {jobId && <div style={{ color: '#374151', fontSize: 11, marginTop: 12, fontFamily: 'monospace' }}>Job: {jobId}</div>}
          </div>
        )}

        {/* RESULTS STATE */}
        {state === 'done' && batchResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Notes Processed', value: batchResult.totalNotes, color: 'white' },
                { label: 'Succeeded', value: batchResult.succeeded, color: '#34d399' },
                { label: 'PHI Tokens Removed', value: batchResult.totalPhiTokens, color: '#a78bfa' },
                { label: 'Runtime', value: `${(batchResult.durationMs / 1000).toFixed(1)}s`, color: '#60a5fa' },
              ].map(card => (
                <div key={card.label} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.value}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{card.label}</div>
                </div>
              ))}
            </div>

            {/* ICD distribution */}
            {Object.keys(batchResult.icdDistribution).length > 0 && (
              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>ICD-10 Chapter Distribution</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(batchResult.icdDistribution).map(([label, count]) => (
                    <span key={label} style={{ fontSize: 12, color: '#c4b5fd', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.4)', padding: '4px 12px', borderRadius: 20 }}>
                      {label} · {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Results table */}
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1f2937' }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'white' }}>Results</span>
                <button onClick={downloadZip} style={{ fontSize: 12, color: '#a78bfa', background: 'none', border: '1px solid rgba(124,58,237,0.4)', padding: '5px 14px', borderRadius: 8, cursor: 'pointer' }}>
                  ↓ Download all outputs
                </button>
              </div>

              {batchResult.results.map((r, idx) => (
                <div key={r.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid #1f2937' }}>
                  <div
                    onClick={() => expandNote(r.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: r.status === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                      color: r.status === 'success' ? '#34d399' : '#f87171',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                    }}>
                      {r.status === 'success' ? '✓' : '✗'}
                    </div>

                    <span style={{ fontSize: 13, fontFamily: 'monospace', color: 'white', width: 140, overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>{r.id}</span>

                    {r.zkSummary && (
                      <span style={{ fontSize: 11, color: '#c4b5fd', background: 'rgba(124,58,237,0.15)', padding: '3px 10px', borderRadius: 4, flexShrink: 0 }}>
                        Ch {r.zkSummary.icdChapter} — {r.zkSummary.icdChapterName}
                      </span>
                    )}
                    {r.zkSummary && <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>Age {r.zkSummary.ageRange}</span>}
                    {r.zkSummary?.verified && (
                      <span style={{ fontSize: 11, color: '#34d399', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>ZK ✓</span>
                    )}
                    {r.totalPhiTokens !== undefined && <span style={{ fontSize: 11, color: '#4b5563', flexShrink: 0 }}>{r.totalPhiTokens} PHI</span>}
                    <div style={{ flex: 1 }} />
                    {r.durationMs !== undefined && <span style={{ fontSize: 11, color: '#4b5563' }}>{(r.durationMs / 1000).toFixed(1)}s</span>}
                    <span style={{ fontSize: 11, color: '#4b5563', marginLeft: 8 }}>{expandedNote === r.id ? '▲' : '▼'}</span>
                  </div>

                  {/* Expanded */}
                  {expandedNote === r.id && (
                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid #1f2937', background: 'rgba(0,0,0,0.2)' }}>
                      {r.status === 'failed' && (
                        <div style={{ background: 'rgba(127,29,29,0.4)', border: '1px solid #991b1b', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5', marginTop: 12 }}>
                          {r.error}
                        </div>
                      )}

                      {r.status === 'success' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                          {/* Facts */}
                          {r.facts && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 12 }}>
                                <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Diagnoses</div>
                                {(r.facts.diagnoses ?? []).map((d, i) => (
                                  <div key={i} style={{ fontSize: 12, color: '#d1d5db', marginBottom: 4 }}>• {String(typeof d === 'object' ? JSON.stringify(d) : d)}</div>
                                ))}
                              </div>
                              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 12 }}>
                                <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Medications</div>
                                {(r.facts.medications ?? []).map((m, i) => (
                                  <div key={i} style={{ fontSize: 12, color: '#d1d5db', marginBottom: 4 }}>• {String(typeof m === 'object' ? JSON.stringify(m) : m)}</div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ZK proof */}
                          {r.zkSummary && (
                            <div style={{ background: '#111827', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, padding: 12 }}>
                              <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Zero-Knowledge Proof</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 12 }}>
                                {[
                                  ['System', r.zkSummary.provingSystem],
                                  ['Constraints', r.zkSummary.constraintCount],
                                  ['Age range', r.zkSummary.ageRange],
                                  ['Verified', '✓ Yes'],
                                ].map(([k, v]) => (
                                  <div key={String(k)}>
                                    <div style={{ color: '#6b7280' }}>{k}</div>
                                    <div style={{ color: k === 'Verified' ? '#34d399' : '#d1d5db', marginTop: 2 }}>{String(v)}</div>
                                  </div>
                                ))}
                              </div>
                              <div style={{ fontSize: 11, color: '#4b5563', marginTop: 8 }}>Matched: {r.zkSummary.matchedDiagnosis}</div>
                            </div>
                          )}

                          {/* Anonymized text */}
                          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Anonymized Note</div>
                            <pre style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 280, overflowY: 'auto', margin: 0 }}>
                              {fullNoteTexts[r.id]?.anonymizedText ?? r.anonymizedText ?? 'Loading...'}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => { setState('idle'); setBatchResult(null); setJobId(null) }}
                style={{ fontSize: 13, color: '#9ca3af', background: 'none', border: '1px solid #374151', padding: '9px 24px', borderRadius: 8, cursor: 'pointer' }}
              >← Run another batch</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
