// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | Layout()                  |
// | * shell wrapper component |
// +---------------------------+
//     |
//     |----> Sidebar()
//     |        * fixed left nav
//     |
//     |----> TopBar()
//     |        * sticky header bar
//     |
//     |----> children()
//     |        * page content slot
//     |
//     v
// [ END ]
//
// ================================================================

import React, { useState, createContext, useContext } from 'react'
import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'

export const SidebarContext = createContext({ open: false, toggle: () => {} })
export const useSidebar = () => useContext(SidebarContext)

export default function Layout({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <SidebarContext.Provider value={{ open, toggle: () => setOpen(o => !o) }}>
      <div className="layout-root" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {open && (
          <div onClick={() => setOpen(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 99, display: 'none',
          }} className="sidebar-overlay" />
        )}
        <Sidebar />
        <div className="layout-content" style={{
          marginLeft: 'var(--sidebar-w)',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <TopBar />
          <main className="layout-main" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {children}
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  )
}
