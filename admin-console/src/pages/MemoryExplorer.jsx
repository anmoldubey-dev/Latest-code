// ================================================================
// MemoryExplorer — HAUP v3.0 RAG + live pgvector conversation turns
// ================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { Search, Database, MessageSquare, Clock, Layers, Zap, CheckCircle, XCircle, RefreshCw, AlertCircle, Mic, Bot } from 'lucide-react'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import Btn from '../components/ui/Btn.jsx'

const BACKEND = '/api/backend'
const LANG_NAMES = { en: 'English', hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi' }

// ── Static info cards ─────────────────────────────────────────
const RAG_STATS = [
  { label: 'RAG Backend',   value: 'HAUP v3.0',  color: 'var(--cyan)',   icon: Layers },
  { label: 'Vector Store',  value: 'pgvector',   color: 'var(--purple)', icon: Database },
  { label: 'Session Port',  value: ':8080',       color: 'var(--green)',  icon: Zap },
  { label: 'Turn Memory',   value: 'Neon DB',     color: 'var(--yellow)', icon: Database },
]

// ── How HAUP works ────────────────────────────────────────────
function HaupInfoPanel() {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginBottom: 20 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cyan)', marginBottom: 10 }}>
        HAUP v3.0 RAG — How it works
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { step: '1. Session Create', desc: 'Each call POSTs to /sessions → gets a session_id scoped to that call.' },
          { step: '2. Query (per turn)', desc: 'Each user utterance POSTs to /sessions/{id}/ask with the user text as query.' },
          { step: '3. Vector Retrieval', desc: 'HAUP embeds the query, searches pgvector for similar rows from the source Neon DB table.' },
          { step: '4. Answer Synthesis', desc: 'Retrieved rows are passed to Ollama/OpenAI/Anthropic → returns answer + citations.' },
          { step: '5. LLM Injection', desc: 'The answer string is injected into the Gemini/Qwen system prompt as "Relevant context".' },
          { step: '6. Session Delete', desc: 'On call end, DELETE /sessions/{id} cleans up HAUP session state and cache.' },
        ].map(({ step, desc }) => (
          <div key={step} style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', flexShrink: 0, marginTop: 5 }} />
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{step}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text-primary)' }}>Input:</strong> User speech text (Whisper STT).{' '}
        <strong style={{ color: 'var(--text-primary)' }}>Output:</strong> Answer injected into LLM system prompt.{' '}
        <strong style={{ color: 'var(--text-primary)' }}>Config:</strong>{' '}
        <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>SahilRagSystem/haup/.env</code>
      </div>
    </div>
  )
}

// ── HAUP health check ─────────────────────────────────────────
function HaupHealthBadge() {
  const [status, setStatus] = useState('unknown')

  async function check() {
    setStatus('checking')
    try {
      const res = await fetch('/api/backend/haup/health', { signal: AbortSignal.timeout(4000) })
      const data = res.ok ? await res.json().catch(() => ({})) : {}
      setStatus(data.status === 'ok' ? 'ok' : 'offline')
    } catch {
      setStatus('offline')
    }
  }

  const color = status === 'ok' ? 'var(--green)' : status === 'offline' ? '#e05252' : 'var(--text-muted)'
  const Icon  = status === 'ok' ? CheckCircle : XCircle

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={check} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
        Check HAUP :8080
      </button>
      {status !== 'unknown' && (
        <span style={{ fontSize: 11, color, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon size={11} />
          {status === 'ok' ? 'Reachable' : status === 'checking' ? '…' : 'Offline'}
        </span>
      )}
    </div>
  )
}

// ── Live turn card ────────────────────────────────────────────
function TurnCard({ item }) {
  const isUser = item.role === 'user'
  const timeStr = item.ts ? new Date(item.ts).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{
        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
        background: isUser ? 'var(--cyan-dim)' : 'rgba(120,80,200,0.15)',
        border: `1px solid ${isUser ? 'var(--border-cyan)' : 'rgba(120,80,200,0.3)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isUser ? <Mic size={11} style={{ color: 'var(--cyan)' }} /> : <Bot size={11} style={{ color: 'var(--purple)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isUser ? 'Caller' : 'Agent'}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5 }}>{item.session_id?.slice(0, 8)}…</span>
          <span style={{ color: 'var(--cyan)', fontSize: 9.5 }}>{LANG_NAMES[item.lang] ?? item.lang}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={9} />{timeStr}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.55, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '5px 9px', border: '1px solid var(--border)' }}>
          {item.text}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function MemoryExplorer() {
  const [query, setQuery]     = useState('')
  const [turns, setTurns]     = useState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND}/api/turns?limit=200`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTurns(data.turns || [])
      setTotal(data.total || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = query
    ? turns.filter(t => t.text?.toLowerCase().includes(query.toLowerCase()))
    : turns

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Memory Explorer"
        subtitle="HAUP v3.0 RAG (pgvector) · live conversation turns from Neon"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <HaupHealthBadge />
            <Btn icon={RefreshCw} onClick={load} disabled={loading}>Refresh</Btn>
          </div>
        }
      />

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {RAG_STATS.map(({ label, value, color, icon: Icon }) => (
          <div key={label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon size={13} style={{ color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      <HaupInfoPanel />

      {/* Live turns */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
          Conversation Turns — Neon pgvector
          {!loading && <span style={{ color: 'var(--cyan)', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>{total}</span>}
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter conversation turns…"
          style={{ width: '100%', paddingLeft: 30, borderRadius: 'var(--radius-sm)' }}
        />
      </div>

      {error && !loading && (
        <div style={{ padding: '10px 14px', background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.25)', borderRadius: 'var(--radius)', fontSize: 12, color: '#e05252', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <AlertCircle size={13} />
          Backend unreachable — make sure backend is running on :8000. ({error})
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 12 }}>
          Loading turns from Neon…
        </div>
      )}

      {!loading && !error && turns.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 12 }}>
          No conversation turns yet. Turns appear here after calls are made.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map((t, i) => <TurnCard key={i} item={t} />)}
        </div>
      )}

      {!loading && query && filtered.length === 0 && turns.length > 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 12 }}>No matches</div>
      )}
    </div>
  )
}
