// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | Btn()                     |
// | * styled button component |
// +---------------------------+
//     |
//     |----> Spinner()
//     |        * shown when loading=true
//     |
//     | OR
//     |
//     |----> Icon()
//     |        * shown when icon prop set
//     |
//     v
// [ END ]
//
// ================================================================

import React from 'react'
import Spinner from './Spinner.jsx'

export default function Btn({
  children, variant = 'secondary', size = 'md',
  loading, disabled, onClick, icon: Icon, style: extra, ...props
}) {
  const pad    = size === 'sm' ? '5px 12px'  : size === 'lg' ? '10px 22px' : '7px 15px'
  const fs     = size === 'sm' ? 11.5 : size === 'lg' ? 13.5 : 12.5
  const radius = size === 'sm' ? 'var(--r-sm)' : 'var(--r-pill)'

  const base = {
    primary: {
      background: 'linear-gradient(145deg, #c8952a 0%, #d4a853 50%, #f0c36b 100%)',
      borderColor: 'rgba(212,168,83,0.35)',
      color: 'rgba(10,8,4,0.92)',
      fontWeight: 600,
      boxShadow: '0 4px 16px rgba(212,168,83,0.28), inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -1px 0 rgba(0,0,0,0.15)',
    },
    secondary: {
      background: 'rgba(255,255,255,0.06)',
      borderColor: 'rgba(255,255,255,0.10)',
      color: '#f0ece3',
      fontWeight: 500,
      boxShadow: '0 2px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)',
    },
    danger: {
      background: 'rgba(240,80,60,0.10)',
      borderColor: 'rgba(240,80,60,0.28)',
      color: '#f0503c',
      fontWeight: 500,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
    },
    ghost: {
      background: 'transparent',
      borderColor: 'transparent',
      color: 'rgba(240,236,227,0.42)',
      fontWeight: 400,
      boxShadow: 'none',
    },
  }

  const s = base[variant] ?? base.secondary

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: pad,
        borderRadius: radius,
        fontSize: fs,
        fontFamily: 'var(--font)',
        letterSpacing: '0.005em',
        border: '1px solid',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all var(--t-fast)',
        whiteSpace: 'nowrap',
        ...s,
        ...extra,
      }}
      onMouseEnter={e => {
        if (disabled || loading) return
        e.currentTarget.style.filter = 'brightness(1.08)'
        e.currentTarget.style.transform = 'translateY(-0.5px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.filter = ''
        e.currentTarget.style.transform = ''
      }}
      onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)' }}
      onMouseUp={e => { e.currentTarget.style.transform = '' }}
      {...props}
    >
      {loading
        ? <Spinner size={12} color={variant === 'primary' ? 'rgba(10,8,4,0.6)' : 'rgba(212,168,83,0.7)'} />
        : Icon && <Icon size={12} style={{ flexShrink: 0 }} />
      }
      {children}
    </button>
  )
}
