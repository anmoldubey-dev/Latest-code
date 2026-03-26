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

import React from 'react'
import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'

export default function Layout({ children }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{
        marginLeft: 'var(--sidebar-w)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <TopBar />
        <main style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
        }}>
          {children}
        </main>
      </div>
    </div>
  )
}
