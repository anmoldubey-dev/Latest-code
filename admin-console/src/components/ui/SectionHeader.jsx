// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | SectionHeader()           |
// | * page title + action row |
// +---------------------------+
//     |
//     v
// [ END ]
//
// ================================================================

import React from 'react'

export default function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)', lineHeight: 1 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ marginTop: 5, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
