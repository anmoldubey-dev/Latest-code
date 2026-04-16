import React, { useState, useEffect, useRef } from 'react';
import { Phone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// ======================== Incoming Call Notification Orchestrator ========================
// IncomingCallNotification -> Reactive signaling node that establishes a persistent 
// WebSocket tunnel to monitor departmental call queues and dispatch inbound ringer events.
// ||
// ||
// ||
// Functions -> IncomingCallNotification()-> Primary orchestrator for real-time signaling:
// ||           |
// ||           |--- connectWs()-> [Sub-process]: Manages persistent WebSocket lifecycle and auth.
// ||           |    └── onmessage Handler -> Logic Branch: Processes incoming, accepted, and cancelled signals.
// ||           |
// ||           |--- handleAccept()-> [Action Trigger]: Internal Call -> Dispatches POST signal to accept gateway.
// ||           |
// ||           └── stopRing()-> [Internal Call]: Presentation -> Resets the local ringer audio stream.
// ||
// =========================================================================================

// ---------------------------------------------------------------
// SECTION: CONFIGURATION & CONSTANTS
// ---------------------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const WS_URL = API_BASE.replace(/^http/, 'ws');

export default function IncomingCallNotification({ onAccept, department = "General" }) {

  // ---------------------------------------------------------------
  // SECTION: STATE & CONTEXT INITIALIZATION
  // ---------------------------------------------------------------
  const { user } = useAuth();
  const [incomingCalls, setIncomingCalls] = useState([]);
  const [acceptingCallId, setAcceptingCallId] = useState(null);
  const wsRef = useRef(null);
  const audioRef = useRef(null);

  // ---------------------------------------------------------------
  // SECTION: SIGNALING HANDLERS
  // ---------------------------------------------------------------

  // Internal Call -> stopRing()-> Terminates the local ringer audio stream
  const stopRing = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
  };

  // Initialization -> connectWs()-> Orchestrates real-time WebSocket signaling based on department context
  useEffect(() => {
    if (!user?.id && !user?.email) return;
    if (!department) return;
    const agentId = user.id || user.email;

    let isMounted = true;
    let reconnectTimer = null;

    const connectWs = () => {
      // Sub-process -> connectWs()-> Establishes the signaling bridge for the active agent session
      if (!isMounted) return;

      if (wsRef.current && wsRef.current.readyState < 2) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }

      const qs = new URLSearchParams({ department }).toString();
      wsRef.current = new WebSocket(`${WS_URL}/api/webrtc/ws/${agentId}?${qs}`);

      wsRef.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // Logic Branch -> incoming_call: Triggers local ringer and updates registry
          if (msg.type === 'incoming_call') {
            setIncomingCalls(prev => {
              if (prev.some(c => c.call_id === msg.data.call_id)) return prev;
              return [...prev, msg.data];
            });
            if (audioRef.current) audioRef.current.play().catch(() => { });

          }
          // Logic Branch -> call_accepted: Discards notification after terminal answer elsewhere
          else if (msg.type === 'call_accepted') {
            setIncomingCalls(prev => prev.filter(c => c.call_id !== msg.data.call_id));
            setIncomingCalls(prev => { if (prev.length === 0) stopRing(); return prev; });

          }
          // Logic Branch -> call_cancelled: Cleans up UI after user-side disconnect
          else if (msg.type === 'call_cancelled') {
            setIncomingCalls(prev => {
              const next = prev.filter(c => c.call_id !== msg.data.call_id);
              if (next.length === 0) stopRing();
              return next;
            });
          }
        } catch { /* malformed signaling handling */ }
      };

      wsRef.current.onclose = () => {
        if (isMounted) {
          reconnectTimer = setTimeout(connectWs, 3000);
        }
      };
    };

    connectWs();
    return () => {
      isMounted = false;
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [user, department]);

  // ---------------------------------------------------------------
  // SECTION: ACTION DISPATCHERS
  // ---------------------------------------------------------------

  // Action Trigger -> handleAccept()-> Dispatches call acceptance signal to the RTC gateway
  const handleAccept = async (callId) => {
    setAcceptingCallId(callId);

    const acceptedCall = incomingCalls.find(c => c.call_id === callId);
    setIncomingCalls(prev => {
      const next = prev.filter(c => c.call_id !== callId);
      if (next.length === 0) stopRing();
      return next;
    });

    const agentId = user.id || user.email;
    try {
      const res = await fetch(`${API_BASE}/api/webrtc/calls/accept/${callId}?agent_id=${agentId}`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'accepted' && acceptedCall) {
        onAccept(acceptedCall);
      }
    } catch (e) {
      console.error("Failed to accept", e);
      if (acceptedCall) setIncomingCalls(prev => [...prev, acceptedCall]);
    } finally {
      setAcceptingCallId(null);
    }
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  if (incomingCalls.length === 0) return null;

  return (
    <div style={{ position: 'fixed', bottom: 30, right: 30, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 15 }}>
      <audio ref={audioRef} src="/ringtone.mp3" loop />
      {incomingCalls.map(call => (
        <div key={call.call_id} style={{ background: '#0f172a', border: '1px solid #22c55e', padding: 20, borderRadius: 12, color: 'white', width: 320, boxShadow: '0 0 25px rgba(34,197,94,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 15 }}>
            <div style={{ background: '#22c55e', padding: 12, borderRadius: '50%', display: 'flex', animation: 'pulse 1.5s infinite' }}>
              <Phone size={20} color="white" />
            </div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: 16 }}>Incoming {call.call_type} Call</div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{call.caller_name} - {call.department}</div>
            </div>
          </div>
          <button onClick={() => handleAccept(call.call_id)} disabled={acceptingCallId === call.call_id} style={{ width: '100%', padding: 12, background: 'linear-gradient(135deg, #16a34a, #15803d)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 }}>
            {acceptingCallId === call.call_id ? 'Connecting...' : 'Accept Call'}
          </button>
        </div>
      ))}
      <style>{`@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.7); } 70% { box-shadow: 0 0 0 15px rgba(34,197,94,0); } 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } }`}</style>
    </div>
  );
}