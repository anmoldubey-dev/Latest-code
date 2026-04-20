// ================================================================
// Dashboard.jsx — AI Call Intelligence Hub
// Inspired by UI_01/Admindashboard.jsx, adapted for human-to-AI calls
// Data: /api/analytics + /api/sessions (real call_records)
// ================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { RefreshCw, Bot, PhoneCall, Clock, MessageSquare, Globe2, Activity } from 'lucide-react'
import { useServiceHealth } from '../hooks/useServiceHealth.js'

const BACKEND = '/api/backend'

const LANG_NAMES = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', ta: 'Tamil',
  te: 'Telugu', bn: 'Bengali', gu: 'Gujarati', ml: 'Malayalam',
  pa: 'Punjabi', ar: 'Arabic', es: 'Spanish',
}

const PIE_COLORS = ['#9b72e8','#3ec97a','#d4a853','#f0503c','#14b8a6','#f97316','#0ea5e9']
const SENT_COLORS = { positive: '#3ec97a', neutral: '#9b72e8', negative: '#f0503c' }

function fmtDuration(s) {
  if (!s) return '—'
  const m = Math.floor(s / 60), sec = Math.round(s % 60)
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Stat pill ──────────────────────────────────────────────────
function StatPill({ label, value, accent }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: `1px solid ${accent}22`,
      borderRadius: 12,
      padding: '14px 18px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
    </div>
  )
}

// ── Tab button ─────────────────────────────────────────────────
function Tab({ label, icon: Icon, active, onClick, accent }) {
  const ac = accent || 'var(--purple)'
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 16px',
        borderRadius: 20,
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
        border: active ? `1px solid ${ac}66` : '1px solid transparent',
        background: active ? `${ac}22` : 'var(--bg-overlay)',
        color: active ? ac : 'var(--text-muted)',
        display: 'flex', alignItems: 'center', gap: 6,
        transition: 'all 0.15s',
      }}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}

// ── Call log row ───────────────────────────────────────────────
function CallRow({ session }) {
  const sentColor = SENT_COLORS[session.sentiment] ?? 'var(--text-muted)'
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '10px 14px',
      display: 'flex', flexDirection: 'column', gap: 6,
      transition: 'border-color 0.15s',
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bot size={13} style={{ color: 'var(--purple)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {session.session_id?.slice(0, 8)}…
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-overlay)', padding: '2px 6px', borderRadius: 4 }}>
            {LANG_NAMES[session.lang] ?? session.lang}
          </span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: sentColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {session.sentiment}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-muted)' }}>
        <span><PhoneCall size={10} style={{ marginRight: 3 }} />{session.phone || 'unknown'}</span>
        <span><Clock size={10} style={{ marginRight: 3 }} />{fmtDuration(session.duration_secs)}</span>
        <span><MessageSquare size={10} style={{ marginRight: 3 }} />{session.total_turns} turns</span>
        <span style={{ marginLeft: 'auto' }}>{fmtDate(session.created_at)}</span>
      </div>
      {session.turns?.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          <span style={{ color: 'var(--purple)', marginRight: 4 }}>User:</span>
          {session.turns.find(t => t.role === 'user')?.text?.slice(0, 90) ?? '—'}
        </div>
      )}
    </div>
  )
}

// ── Services mini-bar ──────────────────────────────────────────
function ServiceDot({ name, ok }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? '#3ec97a' : '#f0503c' }} />
      {name}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────
export default function Dashboard() {
  const [view, setView]         = useState('calls')
  const [analytics, setAnalytics] = useState(null)
  const [sessions, setSessions]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState(false)
  const [langFilter, setLangFilter]   = useState('all')
  const [sentFilter, setSentFilter]   = useState('all')
  const { services } = useServiceHealth(8000)

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true)
    try {
      const [aRes, sRes] = await Promise.all([
        fetch(`${BACKEND}/api/analytics?days=30`),
        fetch(`${BACKEND}/api/sessions?limit=100`),
      ])
      if (aRes.ok) setAnalytics(await aRes.json())
      if (sRes.ok) {
        const d = await sRes.json()
        setSessions(d.sessions ?? [])
      }
    } catch (_) {}
    setLoading(false)
    if (!silent) setTimeout(() => setSyncing(false), 600)
  }, [])

  useEffect(() => { loadAll(false) }, [loadAll])
  useEffect(() => {
    const t = setInterval(() => loadAll(true), 10000)
    return () => clearInterval(t)
  }, [loadAll])

  const kpis     = analytics?.kpis ?? { total_calls: 0, avg_duration: 0, avg_turns: 0 }
  const langDist = analytics?.lang_distribution ?? []
  const sentDist = analytics?.sentiment_distribution ?? []
  const agentDist = analytics?.agent_distribution ?? []
  const dailyVol  = analytics?.daily_volume ?? []

  const filteredSessions = sessions.filter(s => {
    if (langFilter !== 'all' && s.lang !== langFilter) return false
    if (sentFilter !== 'all' && s.sentiment !== sentFilter) return false
    return true
  })

  const uniqueLangs = [...new Set(sessions.map(s => s.lang).filter(Boolean))]
  const onlineCount = services.filter(s => s.ok).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '18px 0 14px',
        borderBottom: '1px solid var(--border)',
        marginBottom: 16,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            AI Call Intelligence
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Real-time human-to-AI call analytics · {sessions.length} sessions loaded
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Service health mini-bar */}
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 12px',
          }}>
            <Activity size={11} style={{ color: onlineCount > 1 ? '#3ec97a' : '#f0503c' }} />
            {services.slice(0, 4).map(s => <ServiceDot key={s.name} name={s.name} ok={s.ok} />)}
          </div>
          <button
            onClick={() => loadAll(false)}
            disabled={syncing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: syncing ? 'var(--bg-elevated)' : 'rgba(155,114,232,0.15)',
              border: '1px solid rgba(155,114,232,0.3)',
              borderRadius: 8, padding: '6px 12px', fontSize: 12,
              color: syncing ? 'var(--text-muted)' : 'var(--purple)',
              cursor: syncing ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={12} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Syncing…' : 'Sync DB'}
          </button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatPill label="Total AI Calls"    value={loading ? '…' : kpis.total_calls}               accent="var(--purple)" />
        <StatPill label="Avg Duration"      value={loading ? '…' : fmtDuration(kpis.avg_duration)} accent="var(--gold)" />
        <StatPill label="Avg Turns"         value={loading ? '…' : (kpis.avg_turns || 0).toFixed(1)} accent="var(--green)" />
        <StatPill label="Services Online"   value={`${onlineCount}/${services.length || 5}`}         accent="var(--cyan)" />
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Tab label="AI Calls"   icon={Bot}         active={view === 'calls'}    onClick={() => setView('calls')}    accent="var(--purple)" />
        <Tab label="Analytics"  icon={Activity}    active={view === 'analytics'} onClick={() => setView('analytics')} accent="var(--gold)" />
        <Tab label="History"    icon={PhoneCall}   active={view === 'history'}  onClick={() => setView('history')}  accent="var(--green)" />
      </div>

      {/* ── AI Calls tab ── */}
      {view === 'calls' && (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14, flex: 1, minHeight: 0 }}>
          {/* Filter sidebar */}
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '14px',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Filters
            </div>

            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>
                Language
              </label>
              <select
                value={langFilter}
                onChange={e => setLangFilter(e.target.value)}
                style={{
                  width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '5px 8px', fontSize: 11.5, color: 'var(--text-primary)',
                }}
              >
                <option value="all">All Languages</option>
                {uniqueLangs.map(l => <option key={l} value={l}>{LANG_NAMES[l] ?? l}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>
                Sentiment
              </label>
              <select
                value={sentFilter}
                onChange={e => setSentFilter(e.target.value)}
                style={{
                  width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '5px 8px', fontSize: 11.5, color: 'var(--text-primary)',
                }}
              >
                <option value="all">All Sentiments</option>
                <option value="positive">Positive</option>
                <option value="neutral">Neutral</option>
                <option value="negative">Negative</option>
              </select>
            </div>

            {(langFilter !== 'all' || sentFilter !== 'all') && (
              <button
                onClick={() => { setLangFilter('all'); setSentFilter('all') }}
                style={{
                  background: 'rgba(240,80,60,0.12)', border: '1px solid rgba(240,80,60,0.3)',
                  borderRadius: 6, padding: '6px', fontSize: 11, color: '#f0503c', cursor: 'pointer',
                }}
              >
                ✕ Clear Filters
              </button>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                Sentiment Split
              </div>
              {sentDist.map(d => {
                const total = sentDist.reduce((s, x) => s + x.count, 0)
                const pct = total > 0 ? Math.round(d.count / total * 100) : 0
                return (
                  <div key={d.sentiment} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 3 }}>
                      <span style={{ color: SENT_COLORS[d.sentiment] ?? 'var(--text-muted)', textTransform: 'capitalize' }}>{d.sentiment}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{pct}%</span>
                    </div>
                    <div style={{ background: 'var(--bg-base)', borderRadius: 3, height: 4 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: SENT_COLORS[d.sentiment] ?? 'var(--purple)', borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
              {sentDist.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No data yet</div>}
            </div>
          </div>

          {/* Call log feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              Showing {filteredSessions.length} sessions
              {(langFilter !== 'all' || sentFilter !== 'all') && ' (filtered)'}
            </div>
            {loading ? (
              <div style={{ color: 'var(--purple)', fontSize: 12.5 }}>Loading sessions…</div>
            ) : filteredSessions.length === 0 ? (
              <div style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 32, textAlign: 'center',
                fontSize: 13, color: 'var(--text-muted)',
              }}>
                No call sessions found. Sessions appear here after calls via <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>/ws/call</code>
              </div>
            ) : (
              filteredSessions.map(s => <CallRow key={s.session_id} session={s} />)
            )}
          </div>
        </div>
      )}

      {/* ── Analytics tab ── */}
      {view === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Daily volume */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Daily Call Volume (last 30 days)
            </div>
            {dailyVol.length === 0
              ? <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)' }}>No data yet</div>
              : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={dailyVol} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                    <Bar dataKey="calls" fill="var(--purple)" radius={[3,3,0,0]} name="Calls" />
                  </BarChart>
                </ResponsiveContainer>
              )
            }
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Language distribution */}
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Language Distribution
              </div>
              {langDist.length === 0
                ? <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)' }}>No data</div>
                : (
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={langDist.map((d, i) => ({ name: LANG_NAMES[d.lang] ?? d.lang, value: d.count, fill: PIE_COLORS[i % PIE_COLORS.length] }))}
                        cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                        dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}
                      >
                        {langDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )
              }
            </div>

            {/* Top agents */}
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Top AI Agents
              </div>
              {agentDist.length === 0
                ? <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)' }}>No agent data yet</div>
                : (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={agentDist.slice(0, 6)} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="agent" width={100} tick={{ fontSize: 9.5, fill: 'var(--text-muted)' }}
                        tickFormatter={v => v.length > 16 ? v.slice(0, 16) + '…' : v} />
                      <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                      <Bar dataKey="count" fill="var(--green)" radius={[0, 3, 3, 0]} name="Calls" />
                    </BarChart>
                  </ResponsiveContainer>
                )
              }
            </div>
          </div>

          {/* Call flow: lang → sentiment (flow table) */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Call Flow Summary (Language → Sentiment)
            </div>
            {sessions.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No sessions loaded</div>
              : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(
                    sessions.reduce((acc, s) => {
                      const key = `${LANG_NAMES[s.lang] ?? s.lang} → ${s.sentiment || 'neutral'}`
                      acc[key] = (acc[key] || 0) + 1
                      return acc
                    }, {})
                  ).sort(([,a],[,b]) => b - a).slice(0, 12).map(([key, count]) => (
                    <div key={key} style={{
                      background: 'var(--bg-surface)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '5px 10px', fontSize: 11,
                      color: 'var(--text-secondary)',
                    }}>
                      <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{count}</span> · {key}
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </div>
      )}

      {/* ── History tab ── */}
      {view === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            {sessions.length} total sessions in call_records
          </div>
          {sessions.length === 0 ? (
            <div style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 40, textAlign: 'center',
              fontSize: 13, color: 'var(--text-muted)',
            }}>
              No call history yet. Make a call via the frontend to see sessions here.
            </div>
          ) : (
            sessions.map(s => <CallRow key={s.session_id} session={s} />)
          )}
        </div>
      )}
    </div>
  )
}
