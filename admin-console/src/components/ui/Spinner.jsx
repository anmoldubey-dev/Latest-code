// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | Spinner()                 |
// | * animated SVG spinner    |
// +---------------------------+
//     |
//     v
// [ END ]
//
// ================================================================

import React from 'react'

export default function Spinner({ size = 16, color = '#d4a853' }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24" fill="none"
      style={{ animation: 'spin 0.65s linear infinite', flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" stroke={color} strokeOpacity="0.14" strokeWidth="2.5" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
