import React, { useState } from 'react';
import { Phone, Globe, PhoneCall, GitBranch, Clock, ChevronRight, Radio, Cpu } from 'lucide-react';
import { useCall } from '../../context/CallContext';
import { useSession } from '../../context/SessionContext';

import LiveCallPanel from './LiveCallPanel';
import DialerPanel from './DialerPanel';
import BrowserCallPanel from './BrowserCallPanel';
import ActiveCallsPanel from './ActiveCallsPanel';
import IVRBuilderPanel from './IVRBuilderPanel';
import HistoryPanel from './HistoryPanel';
import BroadcastPanel from './BroadcastPanel';
import LiveCallConsole from './LiveCallConsole';

// ======================== IVR Dashboard Orchestrator ========================
// IVRDashboard -> Central layout engine coordinating call panels, sidebar navigation,
// and global live call state visibility. It manages the conditional mounting of 
// the LiveCallPanel against static administrative views.
// ||
// ||
// ||
// Functions -> IVRDashboard()-> Primary entry point for dashboard orchestration:
// ||           |
// ||           |--- renderPanel()-> Logic Branch: Dynamically dispatches static panels.
// ||           |
// ||           |--- getBreadcrumb()-> [Internal Utility]: Maps state to navigation labels.
// ||           |
// ||           └── (Atomic UI Components Tree):
// ||                ├── SectionLabel()-> Visual grouping for nav categories.
// ||                ├── NavBtn()-> Managed nav node with status signaling.
// ||                └── OtherCallBanner()-> Contextual alerting for cross-view calls.
// ||
// ============================================================================

// ---------------------------------------------------------------
// SECTION: ATOMIC UI COMPONENTS
// ---------------------------------------------------------------

// Presentation -> SectionLabel()-> Renders semantic grouping headers for the sidebar
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase',
      color: '#3a4a5a', padding: '10px 6px 4px',
    }}>
      {children}
    </div>
  );
}

// Presentation -> NavBtn()-> Standardized navigational element with active state tracking and status dots
function NavBtn({ id, label, icon: Icon, activeNav, onClick, accentColor, dot }) {
  const isActive = activeNav === id;
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        display: 'flex', alignItems: 'center', gap: '9px',
        padding: '9px 11px', borderRadius: '8px', width: '100%',
        textAlign: 'left', fontSize: '11px', cursor: 'pointer',
        letterSpacing: '0.04em', transition: 'all 0.15s',
        fontFamily: 'var(--font-mono)',
        border: isActive ? `1px solid ${accentColor}33` : '1px solid transparent',
        background: isActive ? `${accentColor}12` : 'transparent',
        color: isActive ? accentColor : '#5a7a9a',
      }}
    >
      <Icon size={14} />
      {label}
      {dot && (
        <span style={{
          marginLeft: 'auto', width: '7px', height: '7px', borderRadius: '50%',
          background: dot, boxShadow: `0 0 6px ${dot}99`,
          animation: 'pulse 2s infinite',
        }} />
      )}
    </button>
  );
}

// Presentation -> OtherCallBanner()-> Contextual banner for background call signaling
function OtherCallBanner({ callType, activeNav }) {
  if (callType === 'browser' && activeNav === 'phone') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        background: 'rgba(99,102,241,0.06)',
        border: '1px solid rgba(99,102,241,0.18)',
        borderRadius: '10px', padding: '10px 14px',
        marginBottom: '16px', fontSize: '11px', color: '#818cf8',
      }}>
        💻 A browser call is currently active — click <strong style={{ margin: '0 4px' }}>Browser Call</strong> in the sidebar to view it
      </div>
    );
  }
  if (callType === 'phone' && activeNav === 'browser') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        background: 'rgba(34,197,94,0.06)',
        border: '1px solid rgba(34,197,94,0.18)',
        borderRadius: '10px', padding: '10px 14px',
        marginBottom: '16px', fontSize: '11px', color: '#22c55e',
      }}>
        📞 A phone call is currently active — click <strong style={{ margin: '0 4px' }}>Phone Call</strong> in the sidebar to view it
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------
// SECTION: MAIN DASHBOARD COMPONENT
// ---------------------------------------------------------------

// Initialization -> IVRDashboard()-> Root orchestrator for the call center workspace
export default function IVRDashboard() {
  const [activeNav, setActiveNav] = useState('browser');
  const { callState, CALL_STATES, callType } = useCall();
  const agent = useSession();

  // Logic Branch -> isLive: Determines if a session is in a terminal connected state
  const isLive = [
    CALL_STATES.CONNECTED,
    CALL_STATES.ON_HOLD,
    CALL_STATES.CONFERENCE,
    CALL_STATES.TRANSFERRING,
  ].includes(callState);

  // Logic Branch -> isInProgress: Tracks early-stage signaling (dialing/ringing)
  const isInProgress = isLive || [
    CALL_STATES.DIALING,
    CALL_STATES.RINGING,
  ].includes(callState);

  // ✅ THE FIX: Force the callType to 'browser' if it's missing, so the UI always opens
  const effectiveCallType = callType || 'browser';

  // Logic Branch -> shouldShowLive: Validates if the active view matches the live call stream
  const shouldShowLive = isLive && (
    (activeNav === 'phone' && effectiveCallType === 'phone') ||
    (activeNav === 'browser' && effectiveCallType === 'browser')
  );

  const LABELS = {
    phone: 'Phone Call',
    browser: 'Browser Call',
    calls: 'Active Calls',
    ivr: 'IVR Builder',
    history: 'History',
    broadcast: 'Broadcast',
    console: 'Live Console',
  };

  // ---------------------------------------------------------------
  // SECTION: RENDER UTILITIES
  // ---------------------------------------------------------------

  // Logic Branch -> renderPanel()-> Selects the static panel to mount based on navigation state
  const renderPanel = () => {
    switch (activeNav) {
      case 'phone':
        return (
          <>
            <OtherCallBanner callType={effectiveCallType} activeNav={activeNav} />
            <DialerPanel />
          </>
        );
      case 'browser':
        return (
          <>
            <OtherCallBanner callType={effectiveCallType} activeNav={activeNav} />
            <BrowserCallPanel />
          </>
        );
      case 'calls': return <ActiveCallsPanel />;
      case 'ivr': return <IVRBuilderPanel />;
      case 'history': return <HistoryPanel />;
      case 'broadcast': return <BroadcastPanel />;
      case 'console': return <LiveCallConsole />;
      default: return <DialerPanel />;
    }
  };

  // Internal Utility -> getBreadcrumb()-> Resolves current view state to UI labels
  const getBreadcrumb = () => {
    if (shouldShowLive) return 'Live Call';
    return LABELS[activeNav];
  };

  const showLiveIndicator = shouldShowLive;

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: '#080c10', fontFamily: 'var(--font-mono)',
    }}>

      <aside style={{
        width: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.25)',
      }}>

        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '9px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px',
            }}>📞</div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#e8f0f8', letterSpacing: '0.04em' }}>SR Comsoft</div>
              <div style={{ fontSize: '10px', color: '#5a7a9a' }}>Call Center</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>

          <SectionLabel>Calls</SectionLabel>

          <NavBtn
            id="phone" label="Phone Call" icon={Phone}
            activeNav={activeNav} onClick={setActiveNav}
            accentColor="#22c55e"
            dot={isInProgress && effectiveCallType === 'phone' ? '#22c55e' : null}
          />

          <NavBtn
            id="browser" label="Browser Call" icon={Globe}
            activeNav={activeNav} onClick={setActiveNav}
            accentColor="#818cf8"
            dot={isInProgress && effectiveCallType === 'browser' ? '#818cf8' : null}
          />

          <NavBtn
            id="broadcast" label="Broadcast" icon={Radio}
            activeNav={activeNav} onClick={setActiveNav}
            accentColor="#f97316"
          />

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '6px 0' }} />
          <SectionLabel>Monitor</SectionLabel>

          <NavBtn
            id="calls" label="Active Calls" icon={PhoneCall}
            activeNav={activeNav} onClick={setActiveNav}
            accentColor="#00e5ff"
            dot={isInProgress ? '#22c55e' : null}
          />

          <NavBtn
            id="ivr" label="IVR Builder" icon={GitBranch}
            activeNav={activeNav} onClick={setActiveNav}
            accentColor="#00e5ff"
          />

          <NavBtn
            id="history" label="History" icon={Clock}
            activeNav={activeNav} onClick={setActiveNav}
            accentColor="#00e5ff"
          />

          <NavBtn
            id="console" label="Live Console" icon={Cpu}
            activeNav={activeNav} onClick={setActiveNav}
            accentColor="#f43f5e"
          />
        </nav>

        <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '11px', fontWeight: 500, color: '#8899aa' }}>{agent?.name}</div>
          <div style={{ fontSize: '10px', color: '#5a7a9a', textTransform: 'capitalize' }}>{agent?.role}</div>
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.1)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
            <span style={{ color: '#5a7a9a' }}>Dashboard</span>
            <ChevronRight size={12} style={{ color: '#3a4a5a' }} />
            <span style={{ color: '#e8f0f8', fontWeight: 500 }}>
              {getBreadcrumb()}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {showLiveIndicator && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#22c55e' }}>
                <span style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.6)',
                  animation: 'pulse 2s infinite',
                }} />
                Live Call Active
              </div>
            )}
            {isLive && !showLiveIndicator && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#eab308' }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: '#eab308',
                }} />
                {effectiveCallType === 'phone' ? 'Phone call active' : 'Browser call active'}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#5a7a9a' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} />
              Backend ready
            </div>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

          {isInProgress && effectiveCallType && (
            <div style={{
              display: shouldShowLive ? 'block' : 'none',
            }}>
              <LiveCallPanel callMode={effectiveCallType} />
            </div>
          )}

          {!shouldShowLive && renderPanel()}
        </div>
      </main>
    </div>
  );
}