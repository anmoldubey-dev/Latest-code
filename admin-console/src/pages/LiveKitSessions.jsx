// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | TokenForm()               |
// | * JWT token generator     |
// +---------------------------+
//     |
//     |----> generate()
//     |        * fetches /livekit/token
//     |
//     v
// +---------------------------+
// | LiveKitSessions()         |
// | * WebRTC sessions page    |
// +---------------------------+
//     |
//     |----> useCallback() -> refresh()
//     |        * fetches liveness health
//     |
//     |----> useManualRefresh()
//     |        * auto-refreshes every 8s
//     |
//     |----> TokenForm()
//     |        * renders token generator
//     |
//     v
// [ END ]
//
// ================================================================

import React, { useState, useCallback } from 'react'
import { Radio, RefreshCw, Key, Users, Clock } from 'lucide-react'
import Btn from '../components/ui/Btn.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import SectionHeader from '../components/ui/SectionHeader.jsx'
import { backendApi } from '../api/client.js'
import { useManualRefresh } from '../hooks/usePolling.js'

const LANGS = ['en', 'hi', 'mr', 'ta', 'te', 'fr', 'de', 'es']
const LLM_OPTS = ['gemini', 'qwen']

function TokenForm() {
  const [lang, setLang] = useState('en')
  const [llm, setLlm] = useState('gemini')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  async function generate() {
    setLoading(true); setErr(null); setResult(null)
    try {
      const data = await fetch(`/api/backend/livekit/token?lang=${lang}&llm=${llm}`)
      if (!data.ok) throw new Error(await data.text())
      setResult(await data.json())
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Generate LiveKit Token
      </div>
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Language</label>
            <select value={lang} onChange={e => setLang(e.target.value)} style={{ width: '100%' }}>
              {LANGS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>LLM Backend</label>
            <select value={llm} onChange={e => setLlm(e.target.value)} style={{ width: '100%' }}>
              {LLM_OPTS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <Btn variant="primary" onClick={generate} loading={loading} icon={Key}>Generate Token</Btn>

        {err && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--red-dim)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 'var(--radius-sm)', fontSize: 11.5, color: 'var(--red)' }}>
            {err}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['Room',       result.room],
              ['Session ID', result.session_id],
              ['Agent',      result.agent_name],
              ['URL',        result.url],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', width: 70, flexShrink: 0, paddingTop: 2 }}>{k}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all', flex: 1 }}>{v}</span>
              </div>
            ))}
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>JWT Token</div>
              <div style={{
                fontSize: 10, fontFamily: 'var(--font-mono)',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '8px 10px',
                wordBreak: 'break-all', color: 'var(--cyan)', lineHeight: 1.6,
              }}>
                {result.token?.slice(0, 80)}…
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function LiveKitSessions() {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const d = await backendApi.livenessHealth()
      setHealth(d)
    } catch {
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const manualRefresh = useManualRefresh(refresh, 8000)

  const active = health?.active_sessions ?? 0

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="LiveKit Sessions"
        subtitle="Active WebRTC rooms, token generation, and session health"
        action={<Btn variant="secondary" icon={RefreshCw} loading={loading} onClick={manualRefresh}>Refresh</Btn>}
      />

      {/* Health row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Active Sessions',  value: loading ? '…' : active,                         icon: Users,  color: 'var(--cyan)'   },
          { label: 'LiveKit URL',      value: health?.livekit_url ?? 'ws://localhost:7880',    icon: Radio,  color: 'var(--purple)' },
          { label: 'API Key',          value: health?.api_key ? '●●●●●●●●' : 'devkey',         icon: Key,    color: 'var(--green)'  },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Icon size={13} style={{ color }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: label !== 'Active Sessions' ? 'var(--font-mono)' : undefined }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* Session list */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Active Rooms
            </span>
            <StatusPill status={health?.status === 'ok' ? 'online' : 'offline'} label={health?.status === 'ok' ? 'LiveKit online' : 'LiveKit offline'} />
          </div>
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            {active === 0 ? (
              <>
                <Radio size={28} style={{ opacity: 0.2, marginBottom: 8 }} />
                <div>No active sessions</div>
                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>Rooms appear here when callers connect via LiveKit</div>
              </>
            ) : (
              <div>{active} active session(s)</div>
            )}
          </div>
        </div>

        {/* Token form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TokenForm />

          {/* Config reference */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Environment Config
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['LIVEKIT_URL',        'ws://localhost:7880'],
                ['LIVEKIT_API_KEY',    'devkey'],
                ['LIVEKIT_API_SECRET', '●●●●●●●●●●'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{k}</span>
                  <span style={{ fontSize: 11, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
