// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | Sidebar()                 |
// | * fixed left navigation   |
// +---------------------------+
//     |
//     |----> useLocation()
//     |        * resolves active route
//     |
//     |----> NavLink()
//     |        * renders nav items from NAV[]
//     |
//     v
// [ END ]
//
// ================================================================

import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useSidebar } from './Layout.jsx'
import {
  LayoutDashboard, Activity, Mic2, Globe2,
  Languages, Database, Radio, BrainCircuit,
  UserCircle2, BarChart3, PhoneCall, Search, Bot, GitBranch,
} from 'lucide-react'

const NAV = [
  { to: '/',           label: 'Dashboard',       icon: LayoutDashboard },
  { to: '/services',   label: 'Services',         icon: Activity },
  { to: '/analytics',  label: 'Analytics',        icon: BarChart3 },
  { to: '/ai-calls',   label: 'AI Call Overview', icon: Bot },
  { to: '/routing',    label: 'Routing Rules',    icon: GitBranch },
  { to: '/voice-lab',  label: 'Voice Lab',        icon: Mic2 },
  { to: '/stt',        label: 'STT Diagnostics',  icon: Radio },
  { to: '/translator', label: 'Translator',        icon: Languages },
  { to: '/languages',  label: 'Language Config',  icon: Globe2 },
  { to: '/sessions',   label: 'Call Sessions',     icon: PhoneCall },
  { to: '/rag-search', label: 'RAG Search',        icon: Search },
  { to: '/memory',     label: 'Memory Explorer',  icon: Database },
  { to: '/avatars',    label: 'Avatar Manager',   icon: UserCircle2 },
]

export default function Sidebar() {
  const location = useLocation()
  const { open, toggle } = useSidebar()
  return (
    <aside className={`sidebar${open ? ' open' : ''}`} style={{
      width: 'var(--sidebar-w)',
      flexShrink: 0,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(12,12,16,0.88)',
      backdropFilter: 'blur(48px) saturate(180%)',
      WebkitBackdropFilter: 'blur(48px) saturate(180%)',
      borderRight: '1px solid rgba(212,168,83,0.10)',
      boxShadow: '1px 0 24px rgba(0,0,0,0.5)',
      position: 'fixed',
      left: 0, top: 0,
      zIndex: 50,
    }}>
      {/* Subtle gold line at top */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, rgba(212,168,83,0.5) 40%, rgba(212,168,83,0.5) 60%, transparent)', flexShrink: 0 }} />

      {/* Logo */}
      <div style={{
        height: 'calc(var(--topbar-h) - 2px)',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '0 18px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 30, height: 30,
          borderRadius: 9,
          background: 'linear-gradient(145deg, #c8952a 0%, #d4a853 50%, #f0c36b 100%)',
          border: '1px solid rgba(255,200,100,0.3)',
          boxShadow: '0 4px 14px rgba(212,168,83,0.35), inset 0 1px 0 rgba(255,255,255,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 10.5 Q7 2.5 11.5 10.5" stroke="rgba(10,8,4,0.85)" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
            <circle cx="7" cy="7" r="1.6" fill="rgba(10,8,4,0.85)"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#f0ece3', lineHeight: 1, letterSpacing: '-0.01em' }}>Voice AI</div>
          <div style={{ fontSize: 9.5, color: 'rgba(212,168,83,0.55)', lineHeight: 1, marginTop: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Admin Console</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
          return (
            <NavLink key={to} to={to} onClick={() => open && toggle()} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '7px 10px',
              borderRadius: 10,
              textDecoration: 'none',
              fontSize: 12.5,
              fontWeight: active ? 500 : 400,
              color: active ? '#d4a853' : 'rgba(240,236,227,0.38)',
              background: active ? 'rgba(212,168,83,0.08)' : 'transparent',
              border: `1px solid ${active ? 'rgba(212,168,83,0.16)' : 'transparent'}`,
              boxShadow: active ? 'inset 0 1px 0 rgba(212,168,83,0.10)' : 'none',
              transition: 'all var(--t-fast)',
              letterSpacing: '0.005em',
            }}
            onMouseEnter={e => {
              if (!active) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.color = 'rgba(240,236,227,0.72)'
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'rgba(240,236,227,0.38)'
              }
            }}
            >
              <Icon size={14} style={{ flexShrink: 0, color: active ? '#d4a853' : 'rgba(255,255,255,0.28)' }} />
              {label}
            </NavLink>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '12px 18px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        fontSize: 10,
        color: 'rgba(212,168,83,0.25)',
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
      }}>
        SR Comsoft · v1.0.0
      </div>
    </aside>
  )
}
