// ================================================================
// AICallOverview.jsx — Tabbed AI Call Analytics
// Tabs: Overview · Volume Trends · Language & Sentiment · Agents
// All data from /api/analytics (call_records table, Neon/pgvector)
// ================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  PhoneCall, Clock, MessageSquare, Zap, RefreshCw, Bot,
  Globe2, TrendingUp, Users, BarChart3,
} from 'lucide-react'

const BACKEND = '/api/backend'

const LANG_NAMES = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', ta: 'Tamil',
  te: 'Telugu', bn: 'Bengali', gu: 'Gujarati', ml: 'Malayalam',
  pa: 'Punjabi', ar: 'Arabic', es: 'Spanish',
}

const PIE_COLORS   = ['#9b72e8','#3ec97a','#d4a853','#f0503c','#14b8a6','#f97316','#0ea5e9','#ec4899']
const SENT_COLORS  = { positive: '#3ec97a', neutral: '#9b72e8', negative: '#f0503c' }
const CHART_STYLE  = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }

function fmtDuration(s) {
  if (!s) return '—'
  const m = Math.floor(s / 60), sec = Math.round(s % 60)
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

// ── Shared components ──────────────────────────────────────────

function Empty({ h = 180 }) {
  return (
    <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
      No data yet — appears after calls are made
    </div>
  )
}

function Card({ title, children, style }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 16px',
      ...style,
    }}>
      {title && (
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
          {title}
        </div>
      )}
      {children}
    </div>
  )
}

function KPICard({ label, value, icon: Icon, accent }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: `1px solid ${accent}22`,
      borderRadius: 12, padding: '14px 18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: accent, lineHeight: 1, marginBottom: 5 }}>{value}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
        </div>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${accent}33` }}>
          <Icon size={15} style={{ color: accent }} />
        </div>
      </div>
    </div>
  )
}

function TabBtn({ label, icon: Icon, active, onClick, accent = 'var(--purple)' }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '7px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 600,
      cursor: 'pointer',
      border: active ? `1px solid ${accent}66` : '1px solid transparent',
      background: active ? `${accent}22` : 'var(--bg-overlay)',
      color: active ? accent : 'var(--text-muted)',
      transition: 'all 0.15s',
    }}>
      <Icon size={13} />
      {label}
    </button>
  )
}

// ── Tab: Overview ──────────────────────────────────────────────
function OverviewTab({ kpis, sentDist, llmDist, analytics }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <KPICard label="Total AI Calls"   value={kpis.total_calls ?? 0}                             icon={PhoneCall}     accent="var(--purple)" />
        <KPICard label="Avg Duration"     value={fmtDuration(kpis.avg_duration)}                    icon={Clock}         accent="var(--gold)" />
        <KPICard label="Avg Turns / Call" value={(kpis.avg_turns ?? 0).toFixed(1)}                  icon={MessageSquare} accent="var(--green)" />
        <KPICard label="Avg AI Response"  value={kpis.avg_response_ms ? `${Math.round(kpis.avg_response_ms)}ms` : '—'} icon={Zap} accent="#f59e0b" />
      </div>

      {/* Sentiment + LLM side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Sentiment Breakdown">
          {sentDist.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sentDist.map(d => {
                const total = sentDist.reduce((s, x) => s + x.count, 0)
                const pct = total > 0 ? Math.round(d.count / total * 100) : 0
                const col = SENT_COLORS[d.sentiment] ?? 'var(--purple)'
                return (
                  <div key={d.sentiment}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: col, textTransform: 'capitalize', fontWeight: 600 }}>{d.sentiment}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{d.count} calls · {pct}%</span>
                    </div>
                    <div style={{ background: 'var(--bg-base)', borderRadius: 4, height: 7, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 4, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card title="LLM Usage">
          {llmDist.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {llmDist.map((d, i) => {
                const total = llmDist.reduce((s, x) => s + x.count, 0)
                const pct   = total > 0 ? Math.round(d.count / total * 100) : 0
                const col   = PIE_COLORS[i % PIE_COLORS.length]
                return (
                  <div key={d.llm}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Bot size={12} style={{ color: col }} />
                        <span style={{ textTransform: 'capitalize', color: 'var(--text-primary)' }}>{d.llm}</span>
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>{d.count} calls · {pct}%</span>
                    </div>
                    <div style={{ background: 'var(--bg-base)', borderRadius: 4, height: 7, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 4, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Info footer */}
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center', padding: '2px 0' }}>
        Source: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>call_records</code> (Neon/pgvector) ·
        Routing analytics will appear once routing rules are configured
      </div>
    </div>
  )
}

// ── Tab: Volume Trends ─────────────────────────────────────────
function TrendsTab({ dailyVol }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card title="Daily Call Volume">
        {dailyVol.length === 0 ? <Empty h={220} /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyVol} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={CHART_STYLE} />
              <Bar dataKey="calls" fill="var(--purple)" radius={[3,3,0,0]} name="Calls" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Cumulative Call Trend">
        {dailyVol.length === 0 ? <Empty h={180} /> : (() => {
          let cum = 0
          const cumData = dailyVol.map(d => ({ day: d.day, cumulative: (cum += d.calls) }))
          return (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={cumData} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
                <Tooltip contentStyle={CHART_STYLE} />
                <Line type="monotone" dataKey="cumulative" stroke="var(--gold)" strokeWidth={2} dot={false} name="Total Calls" />
              </LineChart>
            </ResponsiveContainer>
          )
        })()}
      </Card>
    </div>
  )
}

// ── Tab: Language & Sentiment ──────────────────────────────────
function LangSentTab({ langDist, sentDist }) {
  const langPie  = langDist.map((d, i) => ({ name: LANG_NAMES[d.lang] ?? d.lang, value: d.count, fill: PIE_COLORS[i % PIE_COLORS.length] }))
  const sentPie  = sentDist.map(d => ({ name: d.sentiment, value: d.count, fill: SENT_COLORS[d.sentiment] ?? 'var(--purple)' }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Language Distribution (Pie)">
          {langPie.length === 0 ? <Empty h={200} /> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={langPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {langPie.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={CHART_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Sentiment Distribution (Pie)">
          {sentPie.length === 0 ? <Empty h={200} /> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={sentPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {sentPie.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={CHART_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card title="Language Volume (Bar)">
        {langDist.length === 0 ? <Empty h={160} /> : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={langDist.map((d, i) => ({ name: LANG_NAMES[d.lang] ?? d.lang, calls: d.count, fill: PIE_COLORS[i % PIE_COLORS.length] }))}
              margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={CHART_STYLE} />
              <Bar dataKey="calls" radius={[3,3,0,0]} name="Calls">
                {langDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  )
}

// ── Tab: Agent Analytics ───────────────────────────────────────
function AgentsTab({ agentDist, llmDist }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card title="AI Agent Call Volume">
        {agentDist.length === 0 ? <Empty h={220} /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={agentDist.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
              <YAxis type="category" dataKey="agent" width={130} tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickFormatter={v => v.length > 20 ? v.slice(0, 20) + '…' : v} />
              <Tooltip contentStyle={CHART_STYLE} />
              <Bar dataKey="count" fill="var(--green)" radius={[0,3,3,0]} name="Calls" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="LLM Breakdown">
        {llmDist.length === 0 ? <Empty h={100} /> : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {llmDist.map((d, i) => {
              const total = llmDist.reduce((s, x) => s + x.count, 0)
              const pct = total > 0 ? Math.round(d.count / total * 100) : 0
              const col = PIE_COLORS[i % PIE_COLORS.length]
              return (
                <div key={d.llm} style={{
                  background: 'var(--bg-surface)', border: `1px solid ${col}33`,
                  borderRadius: 10, padding: '12px 16px', minWidth: 140, flex: '1 1 140px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Bot size={14} style={{ color: col }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: col, textTransform: 'capitalize' }}>{d.llm}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{d.count}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>calls · {pct}%</div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Future: routing rules will go here */}
      <Card title="Routing Rules" style={{ opacity: 0.6 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
          🔧 Routing rules coming next — the <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>ai_routing_rules</code> table is ready.
          Configure rules to auto-route calls to specific agents based on language, time, or caller history.
        </div>
      </Card>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────
export default function AICallOverview() {
  const [tab, setTab]       = useState('overview')
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays]     = useState(30)
  const [error, setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${BACKEND}/api/analytics?days=${days}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  const kpis      = data?.kpis ?? { total_calls: 0, avg_duration: 0, avg_turns: 0, avg_response_ms: 0 }
  const langDist  = data?.lang_distribution  ?? []
  const sentDist  = data?.sentiment_distribution ?? []
  const agentDist = data?.agent_distribution ?? []
  const llmDist   = data?.llm_distribution   ?? []
  const dailyVol  = data?.daily_volume       ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '18px 0 14px',
        borderBottom: '1px solid var(--border)',
        marginBottom: 16,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            AI Call Overview
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Human-to-AI analytics · source: call_records (Neon)
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--text-primary)',
            }}
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(155,114,232,0.15)', border: '1px solid rgba(155,114,232,0.3)',
              borderRadius: 8, padding: '6px 12px', fontSize: 12,
              color: loading ? 'var(--text-muted)' : 'var(--purple)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(240,80,60,0.1)', border: '1px solid rgba(240,80,60,0.3)',
          borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#f0503c', marginBottom: 14,
        }}>
          Failed to load: {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <TabBtn label="Overview"          icon={BarChart3}   active={tab === 'overview'}   onClick={() => setTab('overview')}   accent="var(--purple)" />
        <TabBtn label="Volume Trends"     icon={TrendingUp}  active={tab === 'trends'}     onClick={() => setTab('trends')}     accent="var(--gold)" />
        <TabBtn label="Language & Sentiment" icon={Globe2}   active={tab === 'lang'}       onClick={() => setTab('lang')}       accent="var(--green)" />
        <TabBtn label="Agents & LLMs"    icon={Users}        active={tab === 'agents'}     onClick={() => setTab('agents')}     accent="#14b8a6" />
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 20 }}>Loading analytics…</div>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab kpis={kpis} sentDist={sentDist} llmDist={llmDist} analytics={data} />}
          {tab === 'trends'   && <TrendsTab dailyVol={dailyVol} />}
          {tab === 'lang'     && <LangSentTab langDist={langDist} sentDist={sentDist} />}
          {tab === 'agents'   && <AgentsTab agentDist={agentDist} llmDist={llmDist} />}
        </>
      )}
    </div>
  )
}
