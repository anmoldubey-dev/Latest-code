import React, { useState, useEffect, useRef } from 'react';
import { Phone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// ======================== Outbound Call Notification Orchestrator ========================
// OutboundCallNotification -> Real-time signaling node that subscribes to the project's 
// event hub to facilitate outbound callback requests and agent-to-user reconciliation.
// ||
// ||
// ||
// Functions -> OutboundCallNotification()-> Primary orchestrator for outbound signals:
// ||           |
// ||           |--- connect()-> [Sub-process]: Establishes persistent WebSocket tunnel.
// ||           |    └── onmessage handler: Logic Branch -> Dispatches callback/accept/cancel events.
// ||           |
// ||           |--- Timer Effect -> [Sub-process]: Executes 500ms polling for notification pruning.
// ||           |
// ||           |--- handleAccept()-> [Action Trigger]: Internal Call -> Commits agent to the call room.
// ||           |
// ||           |--- submitDecline()-> [Action Trigger]: Internal Call -> Dispatches snooze/reason signal.
// ||           |
// ||           └── (Lifecycle Helpers):
// ||                ├── stopRing()-> Resets local audio stream.
// ||                └── removeNotification()-> UI Cleanup logic.
// ||
// =========================================================================================

// ---------------------------------------------------------------
// SECTION: CONFIGURATION & CONSTANTS
// ---------------------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

export default function OutboundCallNotification({ onAccept }) {

  // ---------------------------------------------------------------
  // SECTION: STATE & CONTEXT INITIALIZATION
  // ---------------------------------------------------------------
  const { user } = useAuth();
  const agentEmail = user?.email || user?.id || '';

  const [notifications, setNotifications] = useState([]);
  const wsRef = useRef(null);
  const audioRef = useRef(null);

  // ---------------------------------------------------------------
  // SECTION: SIGNALING & LIFECYCLE (WEBSOCKET)
  // ---------------------------------------------------------------

  // Initialization -> connect()-> Subscribes to the central event stream for outbound requests
  useEffect(() => {
    if (!agentEmail) return;

    let isMounted = true;
    let reconnectTimer = null;

    const connect = () => {
      // Sub-process -> connect()-> Manages the signaling bridge and duplicate socket prevention
      if (!isMounted) return;
      if (wsRef.current && wsRef.current.readyState < 2) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }

      wsRef.current = new WebSocket(`${WS_BASE}/api/ws/events`);

      wsRef.current.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);

          // Logic Branch -> outbound_callback: Injects new request into the local notification registry
          if (msg.type === 'outbound_callback' && msg.target_agent === agentEmail) {
            setNotifications(prev => {
              if (prev.some(n => n.outbound_id === msg.outbound_id)) return prev;
              if (audioRef.current) audioRef.current.play().catch(() => { });
              return [...prev, {
                outbound_id: msg.outbound_id,
                user_email: msg.user_email,
                department: msg.department,
                expiresAt: Date.now() + (msg.countdown || 20) * 1000,
                declining: false,
                declineReason: '',
                accepting: false,
              }];
            });

          }
          // Logic Branch -> outbound_accepted: Silently removes request handled by another node
          else if (msg.type === 'outbound_accepted') {
            setNotifications(prev => prev.filter(n => n.outbound_id !== msg.outbound_id));

          }
          // Logic Branch -> outbound_cancelled: Cleans up UI after server-side expiration
          else if (msg.type === 'outbound_cancelled') {
            setNotifications(prev =>
              prev.filter(n => n.user_email !== msg.user_email)
            );
          }
        } catch { /* malformed signaling frame */ }
      };

      wsRef.current.onclose = () => {
        if (isMounted) reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      isMounted = false;
      clearTimeout(reconnectTimer);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [agentEmail]);

  // ---------------------------------------------------------------
  // SECTION: TEMPORAL MANAGEMENT (COUNTDOWN)
  // ---------------------------------------------------------------

  // Sub-process -> Timer Loop: Executes real-time pruning of expired outbound session tokens
  useEffect(() => {
    if (notifications.length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      setNotifications(prev => {
        const next = prev.filter(n => n.expiresAt > now);
        if (next.length < prev.length && audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
        return next;
      });
    }, 500);
    return () => clearInterval(id);
  }, [notifications.length]);

  // ---------------------------------------------------------------
  // SECTION: LIFECYCLE UTILITIES
  // ---------------------------------------------------------------

  // Internal Call -> stopRing()-> Terminates the local notification audio stream
  const stopRing = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
  };

  // Internal Call -> removeNotification()-> Purges a specific session ID from the local view
  const removeNotification = (outbound_id) => {
    setNotifications(prev => {
      const next = prev.filter(n => n.outbound_id !== outbound_id);
      if (next.length === 0) stopRing();
      return next;
    });
  };

  // ---------------------------------------------------------------
  // SECTION: ACTION HANDLERS (RPC LAYER)
  // ---------------------------------------------------------------

  // Action Trigger -> handleAccept()-> Commits the agent to the outbound media room
  const handleAccept = async (outbound_id) => {
    setNotifications(prev =>
      prev.map(n => n.outbound_id === outbound_id ? { ...n, accepting: true } : n)
    );
    try {
      const res = await fetch(`${API_BASE}/api/cc/outbound/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outbound_id, agent_identity: agentEmail }),
      });
      const data = await res.json();

      if (data.already_handled) {
        removeNotification(outbound_id);
        return;
      }

      if (data.token && data.room) {
        removeNotification(outbound_id);
        stopRing();
        onAccept && onAccept({
          token: data.token,
          room: data.room,
          url: data.url,
          outbound_id: data.outbound_id,
        });
      }
    } catch (e) {
      console.error('[OutboundCallNotification] Accept failed:', e);
      setNotifications(prev =>
        prev.map(n => n.outbound_id === outbound_id ? { ...n, accepting: false } : n)
      );
    }
  };

  // Action Trigger -> startDecline()-> Transitions the UI to the reason-entry state
  const startDecline = (outbound_id) =>
    setNotifications(prev =>
      prev.map(n => n.outbound_id === outbound_id ? { ...n, declining: true } : n)
    );

  const cancelDecline = (outbound_id) =>
    setNotifications(prev =>
      prev.map(n => n.outbound_id === outbound_id ? { ...n, declining: false, declineReason: '' } : n)
    );

  const setReason = (outbound_id, value) =>
    setNotifications(prev =>
      prev.map(n => n.outbound_id === outbound_id ? { ...n, declineReason: value } : n)
    );

  // Action Trigger -> submitDecline()-> Commits a snooze request with metadata to the backend
  const submitDecline = async (outbound_id, reason) => {
    try {
      await fetch(`${API_BASE}/api/cc/outbound/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outbound_id,
          agent_identity: agentEmail,
          reason,
          snooze_minutes: 10,
        }),
      });
    } catch (e) {
      console.error('[OutboundCallNotification] Decline failed:', e);
    }
    removeNotification(outbound_id);
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  if (notifications.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 30, right: 30, zIndex: 9998,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <audio ref={audioRef} src="/ringtone.mp3" loop />

      {notifications.map(n => {
        const secs = Math.max(0, Math.ceil((n.expiresAt - Date.now()) / 1000));
        return (
          <div key={n.outbound_id} style={{
            background: '#0f172a',
            border: '1px solid #f59e0b',
            padding: 20, borderRadius: 14, color: 'white', width: 340,
            boxShadow: '0 0 28px rgba(245,158,11,0.25)',
          }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                background: '#f59e0b', padding: 10, borderRadius: '50%',
                display: 'flex', flexShrink: 0, animation: 'outboundPulse 1.5s infinite',
              }}>
                <Phone size={18} color="white" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Callback Request</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.user_email}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                  {n.department}
                </div>
              </div>
              <div style={{
                fontSize: 13, color: secs <= 5 ? '#ef4444' : '#f59e0b',
                fontWeight: 700,
                background: secs <= 5 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                padding: '4px 8px', borderRadius: 6, flexShrink: 0,
              }}>
                {secs}s
              </div>
            </div>

            {!n.declining ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => startDecline(n.outbound_id)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
                    color: '#ef4444', fontSize: 13, fontWeight: 600,
                  }}
                >
                  Decline
                </button>
                <button
                  onClick={() => handleAccept(n.outbound_id)}
                  disabled={n.accepting}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                    cursor: n.accepting ? 'not-allowed' : 'pointer',
                    background: n.accepting
                      ? '#374151'
                      : 'linear-gradient(135deg,#f59e0b,#d97706)',
                    color: 'white', fontSize: 13, fontWeight: 700,
                  }}
                >
                  {n.accepting ? 'Connecting…' : 'Call Back'}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                  Reason for declining (required):
                </div>
                <textarea
                  value={n.declineReason}
                  onChange={e => setReason(n.outbound_id, e.target.value)}
                  placeholder="e.g. On another call, will retry later…"
                  rows={2}
                  style={{
                    width: '100%', background: '#1e293b',
                    border: '1px solid #334155', borderRadius: 8,
                    padding: '8px 10px', color: '#e2e8f0', fontSize: 13,
                    resize: 'none', boxSizing: 'border-box',
                    marginBottom: 8, outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => cancelDecline(n.outbound_id)}
                    style={{
                      flex: 1, padding: '9px', borderRadius: 8, cursor: 'pointer',
                      background: 'rgba(100,116,139,0.1)', border: '1px solid #334155',
                      color: '#94a3b8', fontSize: 13,
                    }}
                  >
                    Back
                  </button>
                  <button
                    onClick={() => submitDecline(n.outbound_id, n.declineReason)}
                    disabled={!n.declineReason.trim()}
                    style={{
                      flex: 1, padding: '9px', borderRadius: 8, cursor: n.declineReason.trim() ? 'pointer' : 'not-allowed',
                      background: n.declineReason.trim() ? '#ef4444' : 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.35)',
                      color: n.declineReason.trim() ? 'white' : '#ef4444',
                      fontSize: 13, fontWeight: 700,
                    }}
                  >
                    Confirm Decline
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <style>{`
        @keyframes outboundPulse {
          0%   { box-shadow: 0 0 0 0   rgba(245,158,11,0.7); }
          70%  { box-shadow: 0 0 0 14px rgba(245,158,11,0);   }
          100% { box-shadow: 0 0 0 0   rgba(245,158,11,0);   }
        }
      `}</style>
    </div>
  );
}