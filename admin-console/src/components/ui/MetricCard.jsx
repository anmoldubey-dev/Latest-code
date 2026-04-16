// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | MetricCard()              |
// | * KPI stat card widget    |
// +---------------------------+
//     |
//     |----> Icon()
//     |        * optional accent icon
//     |
//     v
// [ END ]
//
// ================================================================

import React from 'react'

export default function MetricCard({ label, value, sub, accent = '#d4a853', icon: Icon }) {
  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      background: 'var(--glass-1)',
      backdropFilter: 'blur(32px) saturate(140%)',
      WebkitBackdropFilter: 'blur(32px) saturate(140%)',
      border: '1px solid var(--glass-border)',
      borderRadius: 'var(--r-lg)',
      padding: '18px 20px',
      boxShadow: 'var(--shadow-sm)',
      transition: 'box-shadow var(--t-fast), transform var(--t-fast)',
      cursor: 'default',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.boxShadow = `var(--shadow-md), 0 0 0 1px ${accent}28`
      e.currentTarget.style.transform = 'translateY(-1px)'
    }}
    onMouseLeave={e => {
      e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
      e.currentTarget.style.transform = ''
    }}
    >
      {/* Accent glow in corner */}
      <div style={{
        position: 'absolute',
        top: -12, right: -12,
        width: 80, height: 80,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${accent}18 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {label}
        </span>
        {Icon && <Icon size={13} style={{ color: accent, opacity: 0.6 }} />}
      </div>

      <div style={{ fontSize: 27, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.035em', marginBottom: 6 }}>
        {value ?? '—'}
      </div>

      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{sub}</div>
      )}
    </div>
  )
}
