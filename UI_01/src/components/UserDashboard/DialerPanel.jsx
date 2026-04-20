import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Delete, Loader } from 'lucide-react';
import { useCall } from '../../context/CallContext';

// 1. Consolidated imports from the same service
import { initiatePhoneCall, startCall as apiStartCall } from '../../services/callApiService';

// ======================== Dialer Panel Orchestrator ========================
// DialerPanel -> Primary interface for outbound SIP telephony. It synchronizes 
// manual digit entry, hardware keyboard mapping, and a multi-stage signaling 
// handshake (IVR -> Exotel SIP -> LiveKit Bridge).
// ||
// ||
// ||
// Functions -> DialerPanel()-> Root component for SIP dialing orchestration:
// ||           |
// ||           |--- handleCall()-> [async Action Trigger]: Executes the signaling pipeline:
// ||           |    ├── Step 1: IVR registration via apiStartCall()->
// ||           |    ├── Step 2: Outbound SIP trigger via initiatePhoneCall()->
// ||           |    └── Step 3: Room token negotiation via fetch()->
// ||           |
// ||           |--- handleEndCall()-> [Action Trigger]: Executes session teardown and state reset.
// ||           |
// ||           |--- renderStatus()-> [Logic Branch]: Resolves visual state based on PHASE registry.
// ||           |
// ||           └── Keyboard Effect -> [Sub-process]: Maps hardware key codes to telephony actions.
// ||
// ===========================================================================

// ---------------------------------------------------------------
// SECTION: CONFIGURATION & CONSTANTS
// ---------------------------------------------------------------

// 2. ✅ VITE FIX: process.env ko import.meta.env se replace kiya
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880';

const KEYS = [
  { digit: '1', sub: '' }, { digit: '2', sub: 'ABC' }, { digit: '3', sub: 'DEF' },
  { digit: '4', sub: 'GHI' }, { digit: '5', sub: 'JKL' }, { digit: '6', sub: 'MNO' },
  { digit: '7', sub: 'PQRS' }, { digit: '8', sub: 'TUV' }, { digit: '9', sub: 'WXYZ' },
  { digit: '*', sub: '' }, { digit: '0', sub: '+' }, { digit: '#', sub: '' },
];

const PHASE = {
  IDLE: 'idle',
  DIALING: 'dialing',
  RINGING: 'ringing',
  CONNECTED: 'connected',
  ERROR: 'error',
};

// ---------------------------------------------------------------
// SECTION: DESIGN TOKENS (STYLES)
// ---------------------------------------------------------------

function statusBox(color, bg, border) {
  // Initialization -> statusBox()-> Normalizes alert containers for connection telemetry
  return {
    display: 'flex', alignItems: 'center', gap: '8px',
    fontSize: '11px', color,
    background: bg,
    border: '1px solid ' + border,
    borderRadius: '8px', padding: '9px 12px',
    fontFamily: 'var(--font-mono)',
  };
}

// ---------------------------------------------------------------
// SECTION: MAIN DIALER COMPONENT
// ---------------------------------------------------------------

export default function DialerPanel() {
  // Initialization -> Contextual state retrieval for global telephony orchestration
  const {
    dialNumber,
    dial, clearDigit, startCall, endCall,
    setBackendCallId, setLivekitSession,
  } = useCall();

  const [phase, setPhase] = useState(PHASE.IDLE);
  const [sipError, setSipError] = useState('');
  const [roomName, setRoomName] = useState('');
  const timerRef = useRef(null);

  // ---------------------------------------------------------------
  // SECTION: HARDWARE INTEGRATION (KEYBOARD)
  // ---------------------------------------------------------------

  // Sub-process -> keyboard mapping: Captures hardware input for telephony digit registration
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (/^[0-9*#]$/.test(e.key)) dial(e.key);
      if (e.key === 'Backspace') clearDigit();
      if (e.key === 'Enter' && phase === PHASE.IDLE && dialNumber) handleCall();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dial, clearDigit, phase, dialNumber]);

  // Lifecycle -> Cleanup: Ensures terminal timers are flushed on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  // ---------------------------------------------------------------
  // SECTION: SIGNALING LOGIC (SIP HANDSHAKE)
  // ---------------------------------------------------------------

  // Action Trigger -> handleCall()-> Orchestrates the multi-stage SIP handshake with the backend
  const handleCall = useCallback(async () => {
    if (!dialNumber.trim()) return;
    setSipError('');
    setPhase(PHASE.DIALING);

    try {
      // STEP 1: IVR registration
      // Internal Call -> apiStartCall(): Initializes call record in CRM/IVR logs
      const ivrData = await apiStartCall(dialNumber, 'General');
      setBackendCallId?.(ivrData.id);

      // STEP 2: Dial via Exotel SIP trunk
      // Internal Call -> initiatePhoneCall(): Triggers hardware dialing via the Exotel gateway
      const sipData = await initiatePhoneCall(dialNumber, '');
      const sip_room = sipData.room_name;
      setRoomName(sip_room);

      // STEP 3: Get a browser token for that same room
      // Internal Call -> fetch(): Requests agent monitoring token for the WebRTC bridge
      const tokenRes = await fetch(`${API_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_name: sip_room,
          identity: `agent-${Date.now()}`,
          display_name: 'Agent (monitor)',
        }),
      });
      if (!tokenRes.ok) throw new Error(`Token error: ${tokenRes.statusText}`);
      const tokenData = await tokenRes.json();

      setLivekitSession({
        token: tokenData.token,
        url: tokenData.livekit_url || LIVEKIT_URL,
        room: sip_room,
      });

      // STEP 4: Advance UI state
      setPhase(PHASE.RINGING);
      startCall();
      timerRef.current = setTimeout(() => setPhase(PHASE.CONNECTED), 4000);

    } catch (err) {
      // Logic Branch -> Error Path: Normalizes SIP trunking failures for the UI
      setPhase(PHASE.ERROR);
      setSipError(err.message || 'SIP call failed. Check your trunk configuration.');
      setTimeout(() => { setPhase(PHASE.IDLE); setSipError(''); }, 4000);
    }
  }, [dialNumber, startCall, setBackendCallId, setLivekitSession]);

  // Action Trigger -> handleEndCall()-> Executes graceful termination of the telephony session
  const handleEndCall = useCallback(() => {
    clearTimeout(timerRef.current);
    setPhase(PHASE.IDLE);
    setRoomName('');
    setSipError('');
    endCall();
  }, [endCall]);

  const isActive = phase === PHASE.RINGING || phase === PHASE.CONNECTED;
  const isBusy = phase === PHASE.DIALING;
  const canDial = phase === PHASE.IDLE;

  // Logic Branch -> renderStatus()-> Maps internal signaling phases to semantic UI alerts
  const renderStatus = () => {
    if (phase === PHASE.IDLE) return null;
    if (phase === PHASE.ERROR) return (
      <div style={statusBox('#f87171', 'rgba(239,68,68,0.08)', 'rgba(239,68,68,0.2)')}>
        {sipError}
      </div>
    );
    if (phase === PHASE.DIALING) return (
      <div style={statusBox('#eab308', 'rgba(234,179,8,0.07)', 'rgba(234,179,8,0.2)')}>
        <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} />
        Calling {dialNumber} via Exotel…
      </div>
    );
    if (phase === PHASE.RINGING) return (
      <div style={statusBox('#f97316', 'rgba(249,115,22,0.07)', 'rgba(249,115,22,0.2)')}>
        <span style={{ fontSize: '13px' }}>📳</span>
        Ringing {dialNumber}…
      </div>
    );
    if (phase === PHASE.CONNECTED) return (
      <div style={statusBox('#22c55e', 'rgba(34,197,94,0.07)', 'rgba(34,197,94,0.2)')}>
        <span style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: '#22c55e', display: 'inline-block',
          boxShadow: '0 0 6px rgba(34,197,94,0.7)',
        }} />
        Connected — {dialNumber}
      </div>
    );
    return null;
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div style={{ maxWidth: '320px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#e8f0f8', marginBottom: '4px' }}>
          Phone Call
        </div>
        <div style={{ fontSize: '10px', color: '#5a7a9a' }}>
          Outbound call via Exotel SIP — AI agent joins automatically
        </div>
      </div>

      {renderStatus()}

      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid ' + (isActive ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'),
        borderRadius: '10px', padding: '14px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'border-color 0.3s',
      }}>
        <span style={{
          fontSize: '18px', letterSpacing: '0.15em',
          color: dialNumber ? '#e8f0f8' : 'rgba(255,255,255,0.2)',
          fontFamily: 'var(--font-mono)',
        }}>
          {dialNumber || 'Enter number…'}
        </span>
        {dialNumber && canDial && (
          <button
            onClick={clearDigit}
            style={{ background: 'none', border: 'none', color: '#5a7a9a', cursor: 'pointer', padding: '2px' }}
          >
            <Delete size={15} />
          </button>
        )}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px',
        opacity: canDial ? 1 : 0.3,
        pointerEvents: canDial ? 'auto' : 'none',
      }}>
        {KEYS.map(({ digit, sub }) => (
          <button
            key={digit}
            onClick={() => dial(digit)}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '10px', padding: '12px 8px', cursor: 'pointer',
              color: '#e8f0f8', fontSize: '15px', fontWeight: 500,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
              transition: 'all 0.12s', fontFamily: 'var(--font-mono)',
            }}
          >
            {digit}
            {sub && <span style={{ fontSize: '8px', color: '#5a7a9a', letterSpacing: '0.1em' }}>{sub}</span>}
          </button>
        ))}
      </div>

      <button
        onClick={isActive ? handleEndCall : handleCall}
        disabled={isBusy || (!isActive && !dialNumber)}
        style={{
          background: isActive
            ? 'linear-gradient(135deg, #ef4444, #dc2626)'
            : isBusy
              ? 'rgba(255,255,255,0.06)'
              : 'linear-gradient(135deg, #16a34a, #15803d)',
          border: 'none', borderRadius: '10px', padding: '14px',
          color: isBusy ? '#5a7a9a' : '#fff',
          fontSize: '13px', fontWeight: 600,
          cursor: isBusy ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          opacity: (!isActive && !dialNumber && !isBusy) ? 0.4 : 1,
          fontFamily: 'var(--font-mono)', transition: 'all 0.2s',
        }}
      >
        {isActive
          ? <><PhoneOff size={16} /> End Call</>
          : isBusy
            ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Connecting…</>
            : <><Phone size={16} /> Call via Phone</>
        }
      </button>

      <div style={{
        background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.12)',
        borderRadius: '10px', padding: '12px 14px',
      }}>
        <div style={{ fontSize: '10px', color: '#22c55e', fontWeight: 500, marginBottom: '5px' }}>
          How phone calls work
        </div>
        <div style={{ fontSize: '10px', color: '#5a7a9a', lineHeight: 1.8 }}>
          <div>1. Backend dials number via <span style={{ color: '#8899aa' }}>Exotel SIP trunk</span></div>
          <div>2. Customer's phone rings normally</div>
          <div>3. On answer — bridged into a <span style={{ color: '#8899aa' }}>LiveKit room</span></div>
          <div>4. Your browser joins the same room to monitor</div>
        </div>
      </div>

    </div>
  );
}