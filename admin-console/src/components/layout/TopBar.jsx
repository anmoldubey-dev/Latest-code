// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | TopBar()                  |
// | * sticky top header bar   |
// +---------------------------+
//     |
//     |----> useLocation()
//     |        * reads current route path
//     |
//     |----> useServiceHealth()
//     |        * polls service statuses
//     |
//     |----> StatusPill()
//     |        * renders per-service pill
//     |
//     v
// [ END ]
//
// ================================================================

import React from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import StatusPill from '../ui/StatusPill.jsx'
import { useServiceHealth } from '../../hooks/useServiceHealth.js'

const ROUTE_TITLES = {
  '/':          'Dashboard',
  '/services':  'Services Monitor',
  '/voice-lab': 'Voice Lab',
  '/stt':       'STT Diagnostics',
  '/languages': 'Language Config',
  '/memory':    'Memory Explorer',
  '/llm':       'LLM Config',
}

export default function TopBar() {
  const location = useLocation()
  const title = ROUTE_TITLES[location.pathname] ?? 'Admin Console'
  const { onlineCount, services, lastUpdated } = useServiceHealth(8000)
  const allOnline = onlineCount === services.length && services.length > 0

  const ts = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <header style={{
      height: 'var(--topbar-h)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      background: 'rgba(11,11,15,0.85)',
      backdropFilter: 'blur(48px) saturate(180%)',
      WebkitBackdropFilter: 'blur(48px) saturate(180%)',
      borderBottom: '1px solid rgba(212,168,83,0.09)',
      boxShadow: '0 1px 0 rgba(0,0,0,0.5)',
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: '#f0ece3', letterSpacing: '-0.015em' }}>
        {title}
      </h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {services.map(s => (
            <StatusPill
              key={s.name}
              status={s.ok ? (s.status === 'loading' ? 'loading' : 'online') : 'offline'}
              label={s.name}
              pulse={s.ok && s.status === 'loading'}
            />
          ))}
        </div>

        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />

        {ts && (
          <span style={{ fontSize: 11, color: 'rgba(212,168,83,0.35)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <RefreshCw size={9} />
            {ts}
          </span>
        )}

        <span style={{
          fontSize: 11,
          padding: '3px 10px',
          borderRadius: 999,
          background: allOnline ? 'rgba(62,201,122,0.12)' : 'rgba(232,160,48,0.12)',
          border: `1px solid ${allOnline ? 'rgba(62,201,122,0.28)' : 'rgba(232,160,48,0.28)'}`,
          color: allOnline ? '#3ec97a' : '#e8a030',
          fontWeight: 500,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        }}>
          {onlineCount}/{services.length} online
        </span>
      </div>
    </header>
  )
}
