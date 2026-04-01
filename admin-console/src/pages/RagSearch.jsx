// ================================================================
// RagSearch — test HAUP v3.0 RAG retrieval directly from admin console
// POST /sessions → POST /sessions/{id}/ask → show answer + citations
// ================================================================

import React, { useState, useEffect, useRef } from 'react'
import { Search, Zap, BookOpen, Clock, CheckCircle, XCircle, Loader } from 'lucide-react'
import SectionHeader from '../components/ui/SectionHeader.jsx'

const HAUP = '/api/backend/haup'

export default function RagSearch() {
  const [query, setQuery]       = useState('')
  const [answer, setAnswer]     = useState(null)
  const [citations, setCitations] = useState([])
  const [latency, setLatency]   = useState(null)
  const [cacheHit, setCacheHit] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (loading) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [loading])

  async function search() {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    setCitations([])
    try {
      // 1. Create session if needed
      let sid = sessionId
      if (!sid) {
        const r = await fetch(`${HAUP}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ call_id: 'admin-test' }),
          signal: AbortSignal.timeout(15000),
        })
        if (!r.ok) throw new Error(`Session create failed: HTTP ${r.status}`)
        const d = await r.json()
        sid = d.session_id
        setSessionId(sid)
      }

      // 2. Ask
      const r2 = await fetch(`${HAUP}/sessions/${sid}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query }),
        signal: AbortSignal.timeout(600000),
      })
      if (!r2.ok) {
        const txt = await r2.text().catch(() => '')
        throw new Error(`Ask failed: HTTP ${r2.status} — ${txt.slice(0, 120)}`)
      }
      const data = await r2.json()
      setAnswer(data.answer)
      setCitations(data.citations || [])
      setLatency(data.latency_ms)
      setCacheHit(data.cache_hit)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); search() }
  }

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="RAG Search"
        subtitle="Test HAUP v3.0 retrieval — queries your Neon DB via pgvector + Ollama qwen2.5:7b"
      />

      {/* Search box */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask a question about your data… (Enter to search)"
            style={{ width: '100%', paddingLeft: 36, borderRadius: 'var(--radius-sm)' }}
            disabled={loading}
          />
        </div>
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          style={{
            padding: '0 18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-cyan)',
            background: loading ? 'var(--bg-elevated)' : 'var(--cyan-dim)', color: 'var(--cyan)',
            fontSize: 12.5, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {loading ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={12} />}
          {loading ? `Waiting… ${elapsed}s` : 'Search'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.25)', borderRadius: 'var(--radius)', fontSize: 12, color: '#e05252', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 16 }}>
          <XCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Answer */}
      {answer !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Meta bar */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
            <CheckCircle size={12} style={{ color: 'var(--green)' }} />
            <span style={{ color: 'var(--green)' }}>Answer retrieved</span>
            {latency != null && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={10} />{latency.toFixed(0)} ms</span>}
            {cacheHit && <span style={{ padding: '1px 7px', borderRadius: 4, background: 'var(--bg-elevated)', color: 'var(--yellow)', fontSize: 10 }}>cache hit</span>}
            {sessionId && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>session: {sessionId.slice(0, 8)}…</span>}
          </div>

          {/* Answer box */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-cyan)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cyan)', marginBottom: 10 }}>Answer (Ollama qwen2.5:7b)</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{answer}</div>
          </div>

          {/* Citations */}
          {citations.length > 0 && (
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={10} /> Retrieved Rows ({citations.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {citations.map((c, i) => (
                  <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'center', fontSize: 11 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontSize: 10, minWidth: 18 }}>#{c.index ?? i + 1}</span>
                    <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.rowid || c.source || 'unknown'}</span>
                    <span style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 10, flexShrink: 0 }}>{((c.similarity || 0) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && answer === null && !error && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 12 }}>
          Enter a question to search your Neon data via HAUP RAG
        </div>
      )}
    </div>
  )
}
