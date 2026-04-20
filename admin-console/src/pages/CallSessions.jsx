// ================================================================
// CallSessions — real call history from SQLite LTM
// Shows: session list, full transcript per session, diarization segments
// Data source: GET /api/sessions  +  GET /api/sessions/{id}
// ================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  PhoneCall, Clock, Globe2, MessageSquare, ChevronRight,
  ChevronDown, Mic, Bot, Users, RefreshCw, AlertCircle,
} from 'lucide-react'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import Btn from '../components/ui/Btn.jsx'

const BACKEND = '/api/backend'

const LANG_NAMES = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', ta: 'Tamil',
  te: 'Telugu', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi',
}

const SENTIMENT_COLOR = {
  positive: 'var(--green)',
  neutral:  'var(--cyan)',
  negative: '#e05252',
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtPhone(phone) {
  if (!phone) return 'unknown'
  if (phone.length > 12) return phone.slice(0, 4) + '…' + phone.slice(-4)
  return phone
}

// ── Speaker timeline derived from transcript turns ─────────────
function SpeakerTimeline({ turns }) {
  if (!turns || turns.length === 0) return (
    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', padding: '8px 0' }}>
      No turns recorded.
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {turns.map((t, i) => {
        const isUser = t.role === 'user'
        const timeStr = t.ts
          ? new Date(t.ts * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : null
        const color = isUser ? 'var(--cyan)' : 'var(--purple)'
        const label = isUser ? 'Caller' : 'Agent'
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
            {timeStr && (
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: 80, fontSize: 10.5 }}>
                {timeStr}
              </span>
            )}
            <span style={{
              padding: '1px 8px', borderRadius: 4,
              background: color + '18', border: `1px solid ${color}44`,
              color, fontSize: 10.5, fontFamily: 'var(--font-mono)', minWidth: 52, textAlign: 'center',
            }}>{label}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>
              {t.text}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Full transcript view ───────────────────────────────────────
function TranscriptView({ turns }) {
  if (!turns || turns.length === 0) return (
    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', padding: '8px 0' }}>
      No transcript turns recorded.
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {turns.map((t, i) => {
        const isUser = t.role === 'user'
        return (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{
              width: 24, height: 24, borderRadius: 6, flexShrink: 0,
              background: isUser ? 'var(--cyan-dim)' : 'rgba(120,80,200,0.15)',
              border: `1px solid ${isUser ? 'var(--border-cyan)' : 'rgba(120,80,200,0.3)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isUser
                ? <Mic size={11} style={{ color: 'var(--cyan)' }} />
                : <Bot size={11} style={{ color: 'var(--purple)' }} />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {isUser ? 'Caller' : 'Agent'}
                {t.ts && (
                  <span style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>
                    {new Date(t.ts * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
              </div>
              <div style={{
                fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.55,
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                border: '1px solid var(--border)',
              }}>
                {t.text}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Session row (expandable) ──────────────────────────────────
function SessionRow({ session, onExpand, expanded, detail, loadingDetail }) {

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${expanded ? 'var(--border-strong)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      transition: 'border-color var(--t-fast)',
    }}>
      {/* Header row */}
      <div
        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
        onClick={onExpand}
      >
        {/* Icon */}
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'var(--cyan-dim)', border: '1px solid var(--border-cyan)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <PhoneCall size={13} style={{ color: 'var(--cyan)' }} />
        </div>

        {/* Session ID + phone */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {session.session_id.slice(0, 8)}…
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
            {fmtPhone(session.phone)}
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: 'var(--bg-elevated)', color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
            {LANG_NAMES[session.lang] ?? session.lang}
          </span>
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: 'var(--bg-elevated)', color: SENTIMENT_COLOR[session.sentiment] ?? 'var(--text-secondary)' }}>
            {session.sentiment || 'neutral'}
          </span>
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <MessageSquare size={9} />{session.total_turns}
          </span>

          <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={9} />{fmtDate(session.created_at)}
          </span>
          {expanded
            ? <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
            : <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
          }
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}>
          {loadingDetail ? (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Loading…</div>
          ) : detail ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Transcript */}
              <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={10} /> Transcript
                </div>
                <TranscriptView turns={detail.turns} />
              </div>

              {/* Speaker Timeline */}
              <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={10} /> Speaker Timeline
                </div>
                <SpeakerTimeline turns={detail.turns} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Could not load session detail.</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function CallSessions() {
  const [sessions, setSessions] = useState([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [details, setDetails]   = useState({})   // session_id → detail
  const [loadingDetail, setLoadingDetail] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND}/api/sessions?limit=100`, { timeout: 8000 })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSessions(data.sessions || [])
      setTotal(data.total || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleExpand(session) {
    const id = session.session_id
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (details[id]) return   // already loaded
    setLoadingDetail(id)
    try {
      const res = await fetch(`${BACKEND}/api/sessions/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setDetails(d => ({ ...d, [id]: data }))
    } catch (e) {
      setDetails(d => ({ ...d, [id]: null }))
    } finally {
      setLoadingDetail(null)
    }
  }

  // Summary stats
  const langs = [...new Set(sessions.map(s => s.lang))].filter(Boolean)

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Call Sessions"
        subtitle="Full call history — transcripts, speaker diarization, sentiment"
        action={<Btn icon={RefreshCw} onClick={load} disabled={loading}>Refresh</Btn>}
      />

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total Sessions', value: total,             color: 'var(--cyan)'   },
          { label: 'Languages',     value: langs.length || '—', color: 'var(--purple)' },
          { label: 'Avg Turns',     value: sessions.length ? Math.round(sessions.reduce((a, s) => a + (s.total_turns || 0), 0) / sessions.length) : '—', color: 'var(--green)' },
          { label: 'Data Source',   value: 'Neon pgvector',   color: 'var(--yellow)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <PhoneCall size={13} style={{ color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Body */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 12 }}>
          Loading sessions…
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: '12px 16px', background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.25)', borderRadius: 'var(--radius)', fontSize: 12, color: '#e05252', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <AlertCircle size={13} />
          Backend unreachable — make sure backend is running on :8000. ({error})
        </div>
      )}

      {!loading && sessions.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 12 }}>
          No call sessions recorded yet. Sessions appear here after calls complete.
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sessions.map(s => (
            <SessionRow
              key={s.session_id}
              session={s}
              expanded={expandedId === s.session_id}
              detail={details[s.session_id]}
              loadingDetail={loadingDetail === s.session_id}
              onExpand={() => toggleExpand(s)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
