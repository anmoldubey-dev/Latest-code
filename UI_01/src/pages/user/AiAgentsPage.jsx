import { useState, useEffect } from 'react'

const ADMIN_URL = import.meta.env.VITE_ADMIN_CONSOLE_URL || 'http://localhost:5173'
const LS_KEY    = 'ai_agents_enabled'

export default function AiAgentsPage() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(LS_KEY) === 'true')

  const toggle = () => {
    const next = !enabled
    localStorage.setItem(LS_KEY, String(next))
    setEnabled(next)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 28px', borderBottom: '1px solid var(--bdr)', flexShrink: 0,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🤖 AI Agent Dashboard</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--txt2)' }}>
            {enabled
              ? 'AI agents are active — handling overflow calls when humans are busy.'
              : 'Enable AI agents to handle calls when all human agents are busy.'}
          </p>
        </div>

        <button
          onClick={toggle}
          style={{
            padding: '9px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 13, fontFamily: 'inherit', transition: 'all 0.2s',
            background: enabled ? 'rgba(34,197,94,0.15)' : 'var(--pur)',
            color:      enabled ? 'var(--grn)' : '#fff',
            border:     enabled ? '1px solid rgba(34,197,94,0.35)' : '1px solid transparent',
          }}
        >
          {enabled ? '✓ AI Agents Enabled' : '⚡ Enable AI Agents'}
        </button>
      </div>

      {/* ── Content ── */}
      {enabled ? (
        <iframe
          src={ADMIN_URL}
          title="AI Agent Admin Console"
          style={{ flex: 1, border: 'none', width: '100%' }}
          allow="microphone"
        />
      ) : (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--txt2)',
        }}>
          <div style={{ fontSize: 52 }}>🤖</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)' }}>AI Agents are Disabled</div>
          <p style={{ fontSize: 14, maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
            When enabled, AI agents handle inbound calls when all human agents are busy.
            Callers go through IVR language detection, then get routed to the right AI agent.
          </p>
          <button
            onClick={toggle}
            style={{
              padding: '12px 28px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'var(--pur)', color: '#fff', fontWeight: 700, fontSize: 14,
              fontFamily: 'inherit',
            }}
          >
            ⚡ Enable AI Agents
          </button>
        </div>
      )}
    </div>
  )
}
