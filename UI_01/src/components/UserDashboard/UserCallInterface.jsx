import React, { useState } from 'react';
// Exact path to your context based on your screenshot
import { useCall } from '../../context/CallContext.js';
import BrowserCallPanel from './BrowserCallPanel.jsx';
import DialerPanel from './DialerPanel.jsx';

// ======================== User Call Interface Orchestrator ========================
// UserCallInterface -> High-level modal orchestration layer that provides a 
// multi-modal entry point for communication. Manages the lifecycle of 
// communication protocol selection (WebRTC vs SIP) and visibility logic based 
// on global active session telemetry.
// ||
// ||
// ||
// Functions -> UserCallInterface()-> Root container for interaction setup:
// ||           |
// ||           |--- setActiveTab()-> Action Trigger: Transitions the UI state 
// ||           |    between 'browser' (WebRTC) and 'phone' (SIP) channels.
// ||           |
// ||           |--- onClose()-> Action Trigger: Dispatches the termination 
// ||           |    signal to the parent state manager.
// ||           |
// ||           └── isActive context -> Logic Branch: Locks navigational controls 
// ||                during an established media session to prevent state collision.
// ||
// =================================================================================

export default function UserCallInterface({ onClose }) {

  // ---------------------------------------------------------------
  // SECTION: STATE & CONTEXT INITIALIZATION
  // ---------------------------------------------------------------

  // Initialization -> setActiveTab()-> Manages the active communication protocol state
  const [activeTab, setActiveTab] = useState('browser');

  // Initialization -> useCall()-> Retrieves global session telemetry for navigational locking
  const { isActive } = useCall();

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div style={{
        width: '450px', background: '#0f172a', border: '1px solid #1e293b',
        borderRadius: '16px', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        position: 'relative'
      }}>

        {!isActive && (
          <button
            onClick={onClose}
            style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#64748b', fontSize: '20px', cursor: 'pointer' }}
          >
            ✖
          </button>
        )}

        <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#fff', marginBottom: '4px', textAlign: 'center' }}>
          Start a Connection
        </h2>
        <p style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginBottom: '24px' }}>
          Choose how you want to connect with our AI Agent.
        </p>

        {!isActive && (
          <div style={{ display: 'flex', background: '#1e293b', borderRadius: '10px', padding: '4px', marginBottom: '24px' }}>
            <button
              onClick={() => setActiveTab('browser')}
              style={{
                flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none',
                background: activeTab === 'browser' ? '#6366f1' : 'transparent',
                color: activeTab === 'browser' ? '#fff' : '#94a3b8',
                transition: 'all 0.2s'
              }}
            >
              🌐 Browser Call
            </button>
            <button
              onClick={() => setActiveTab('phone')}
              style={{
                flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none',
                background: activeTab === 'phone' ? '#22c55e' : 'transparent',
                color: activeTab === 'phone' ? '#fff' : '#94a3b8',
                transition: 'all 0.2s'
              }}
            >
              📱 Phone Call
            </button>
          </div>
        )}

        <div>
          {activeTab === 'browser' ? <BrowserCallPanel /> : <DialerPanel />}
        </div>

      </div>
    </div>
  );
}