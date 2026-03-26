// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | StatusPill()              |
// | * colored status badge    |
// +---------------------------+
//     |
//     |----> V[status]
//     |        * resolves color/label variant
//     |
//     v
// [ END ]
//
// ================================================================

import React from 'react'

const V = {
  online:  { color: '#3ec97a', bg: 'rgba(62,201,122,0.10)',   border: 'rgba(62,201,122,0.22)',  label: 'Online'  },
  offline: { color: '#f0503c', bg: 'rgba(240,80,60,0.10)',    border: 'rgba(240,80,60,0.22)',   label: 'Offline' },
  loading: { color: '#e8a030', bg: 'rgba(232,160,48,0.10)',   border: 'rgba(232,160,48,0.22)',  label: 'Loading' },
  ready:   { color: '#3ec97a', bg: 'rgba(62,201,122,0.10)',   border: 'rgba(62,201,122,0.22)',  label: 'Ready'   },
  error:   { color: '#f0503c', bg: 'rgba(240,80,60,0.10)',    border: 'rgba(240,80,60,0.22)',   label: 'Error'   },
  warning: { color: '#e8a030', bg: 'rgba(232,160,48,0.10)',   border: 'rgba(232,160,48,0.22)',  label: 'Warning' },
}

export default function StatusPill({ status = 'offline', label, pulse = false }) {
  const v = V[status] ?? V.offline
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 9px',
      borderRadius: 999,
      background: v.bg,
      border: `1px solid ${v.border}`,
      fontSize: 11,
      fontWeight: 500,
      color: v.color,
      letterSpacing: '0.01em',
      lineHeight: 1,
      whiteSpace: 'nowrap',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
    }}>
      <span style={{
        width: 5, height: 5,
        borderRadius: '50%',
        background: v.color,
        flexShrink: 0,
        animation: pulse ? 'pulse-dot 1.4s ease-in-out infinite' : 'none',
      }} />
      {label ?? v.label}
    </span>
  )
}
