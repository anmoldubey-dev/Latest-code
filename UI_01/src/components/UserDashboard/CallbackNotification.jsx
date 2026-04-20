import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, UserCheck } from 'lucide-react';
import { LiveKitRoom, RoomAudioRenderer, useRemoteParticipants } from '@livekit/components-react';

// ======================== Callback Notification Orchestrator ========================
// CallbackNotification -> Client-side signaling node responsible for handling inbound
// agent callback requests. It manages WebSocket event streams, connection backoff,
// and the transition from a ringer state to a live LiveKit media session.
// ||
// ||
// ||
// Functions -> CallbackNotification()-> Root container for callback orchestration:
// ||           |
// ||           |--- connect()-> [Sub-process]: Persistent WebSocket signaling tunnel.
// ||           |    └── onmessage handler: Logic Branch -> Dispatches pickup/cancel signals.
// ||           |
// ||           |--- handleAccept()-> [Action Trigger]: Internal Call -> Executes token fetch.
// ||           |
// ||           |--- dismiss()-> [Action Trigger]: Action Trigger -> Cleans up session state.
// ||           |
// ||           └── AgentJoinWatcher()-> [Sub-module]: Tracks remote agent entry events.
// ||                └── useEffect()-> [Sub-process]: Injects terminal state upon agent ingress.
// ||
// ====================================================================================

// ---------------------------------------------------------------
// SECTION: CONFIGURATION & CONSTANTS
// ---------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

// ---------------------------------------------------------------
// SECTION: ATOMIC SUB-COMPONENTS
// ---------------------------------------------------------------

function AgentJoinWatcher({ onJoined }) {
  // Initialization -> AgentJoinWatcher()-> Monitors the room for agent participation
  const remoteParticipants = useRemoteParticipants();
  const triggeredRef = useRef(false);

  useEffect(() => {
    // Logic Branch -> Join Detection: Triggers callback once a remote participant is detected
    if (remoteParticipants.length > 0 && !triggeredRef.current) {
      triggeredRef.current = true;
      onJoined();
    }
  }, [remoteParticipants, onJoined]);
  return null;
}

// ---------------------------------------------------------------
// SECTION: MAIN NOTIFICATION COMPONENT
// ---------------------------------------------------------------

export default function CallbackNotification({ userEmail }) {

  // ---------------------------------------------------------------
  // SECTION: STATE & REFS INITIALIZATION
  // ---------------------------------------------------------------

  const [phase, setPhase] = useState('hidden');
  const [callData, setCallData] = useState(null);
  const [lkSession, setLkSession] = useState(null);
  const [countdown, setCountdown] = useState(20);
  const [agentReady, setAgentReady] = useState(false);

  const wsRef = useRef(null);
  const audioRef = useRef(null);
  const countdownRef = useRef(null);
  const seenOutboundIds = useRef(new Set());
  const dismissedAtRef = useRef(0);

  // ---------------------------------------------------------------
  // SECTION: LIFECYCLE HELPERS
  // ---------------------------------------------------------------

  // Action Trigger -> dismiss()-> Resets the signaling phase and terminates audio/timers
  const dismiss = useCallback(async (isDecline = false) => {
    clearInterval(countdownRef.current);
    dismissedAtRef.current = Date.now();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setPhase('hidden');

    // Logic Branch -> Rejection Signal: Notifies backend if the user explicitly declines
    if (isDecline && callData && userEmail) {
      try {
        await fetch(`${API_BASE}/api/cc/outbound/user-reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_email: userEmail, department: callData.department })
        });
      } catch (e) {
        console.error('Failed to notify rejection', e);
      }
    }

    setCallData(null);
    setLkSession(null);
    setAgentReady(false);
  }, [callData, userEmail]);

  // ---------------------------------------------------------------
  // SECTION: SIGNALING BRIDGE (WEBSOCKET)
  // ---------------------------------------------------------------

  // Initialization -> connect()-> Subscribes to the central event hub for pickup events
  useEffect(() => {
    if (!userEmail) return;

    let isMounted = true;
    let reconnectTimer = null;
    let retryDelay = 3000;

    const connect = () => {
      // Sub-process -> connect()-> Manages WebSocket lifecycle and exponential backoff
      if (!isMounted) return;
      if (wsRef.current && wsRef.current.readyState < 2) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }

      wsRef.current = new WebSocket(`${WS_BASE}/api/ws/events`);

      wsRef.current.onopen = () => {
        retryDelay = 3000;
      };

      wsRef.current.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);

          // Logic Branch -> caller_pickup: Validates identity and triggers the ringer phase
          if (msg.type === 'caller_pickup' && msg.user_email === userEmail) {
            const outboundId = msg.outbound_id || msg.room;

            if (seenOutboundIds.current.has(outboundId)) return;
            if (Date.now() - dismissedAtRef.current < 10_000) return;

            seenOutboundIds.current.add(outboundId);

            setPhase(prev => {
              if (prev !== 'hidden') return prev;
              setCallData({ room: msg.room, department: msg.department || 'Support' });
              setCountdown(20);
              if (audioRef.current) audioRef.current.play().catch(() => { });
              return 'ringing';
            });

          }
          // Logic Branch -> outbound_cancelled: Cleans up UI if the agent aborts
          else if (msg.type === 'outbound_cancelled' && msg.user_email === userEmail) {
            dismiss();
          }
        } catch { /* malformed signaling handler */ }
      };

      wsRef.current.onclose = () => {
        if (isMounted) {
          reconnectTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30000);
            connect();
          }, retryDelay);
        }
      };
    };

    connect();
    return () => {
      isMounted = false;
      clearTimeout(reconnectTimer);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [userEmail, dismiss]);

  // ---------------------------------------------------------------
  // SECTION: TEMPORAL TRACKING (COUNTDOWN)
  // ---------------------------------------------------------------

  // Sub-process -> Countdown Effect: Executes 1s interval polling for ringer expiration
  useEffect(() => {
    if (phase !== 'ringing') {
      clearInterval(countdownRef.current);
      return;
    }
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          dismiss(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [phase, dismiss]);

  // ---------------------------------------------------------------
  // SECTION: ACTION HANDLERS
  // ---------------------------------------------------------------

  // Action Trigger -> handleAccept()-> Transitions session to active media state via token fetch
  const handleAccept = async () => {
    if (!callData) return;
    clearInterval(countdownRef.current);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setPhase('connecting');
    try {
      // Internal Call -> fetch(): Requests valid LiveKit token for the specified room
      const res = await fetch(
        `${API_BASE}/api/cc/outbound/caller-token?room=${encodeURIComponent(callData.room)}&user_email=${encodeURIComponent(userEmail)}`
      );
      const data = await res.json();
      setLkSession({
        token: data.token,
        url: data.url || import.meta.env.VITE_LIVEKIT_URL || 'ws://127.0.0.1:7880',
      });
      setPhase('active');
    } catch (e) {
      console.error('[CallbackNotification] Token fetch failed:', e);
      dismiss();
    }
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  if (phase === 'hidden') return null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(7px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9997,
    }}>
      <audio ref={audioRef} src="/ringtone.mp3" loop />

      <div style={{
        background: '#0f172a',
        border: '1px solid rgba(99,102,241,0.45)',
        borderRadius: 20, padding: '32px 28px', width: 340,
        textAlign: 'center',
        boxShadow: '0 0 45px rgba(99,102,241,0.2)',
      }}>

        {phase === 'ringing' && (
          <>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'rgba(99,102,241,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px auto', position: 'relative',
            }}>
              <div style={{
                position: 'absolute', width: '100%', height: '100%',
                borderRadius: '50%', border: '2px solid #6366f1',
                animation: 'cbPing 1.4s cubic-bezier(0,0,0.2,1) infinite',
              }} />
              <Phone size={32} color="#6366f1" style={{ animation: 'cbRing 0.45s ease-in-out infinite alternate' }} />
            </div>

            <h2 style={{ color: '#fff', fontSize: 20, margin: '0 0 8px 0', fontWeight: 800 }}>
              Agent is Calling Back!
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 4px 0', lineHeight: 1.5 }}>
              A <strong style={{ color: '#818cf8' }}>{callData?.department}</strong> agent is ready to speak with you.
            </p>
            <div style={{
              fontSize: 13, color: countdown <= 5 ? '#ef4444' : '#f59e0b',
              fontWeight: 700, margin: '10px 0 24px 0',
            }}>
              Expires in {countdown}s
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => dismiss(true)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.35)',
                  color: '#ef4444', fontWeight: 600, fontSize: 14,
                }}
              >
                Decline
              </button>
              <button
                onClick={handleAccept}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
                  color: 'white', border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: 14,
                }}
              >
                Accept Call
              </button>
            </div>
          </>
        )}

        {phase === 'connecting' && (
          <div style={{ padding: '24px 0' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              border: '3px solid #1e293b', borderTopColor: '#6366f1',
              animation: 'cbSpin 0.9s linear infinite',
              margin: '0 auto 18px auto',
            }} />
            <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>Connecting you to the agent…</p>
          </div>
        )}

        {phase === 'active' && lkSession && (
          <LiveKitRoom
            video={false}
            audio={true}
            token={lkSession.token}
            serverUrl={lkSession.url}
            connect={true}
            onDisconnected={dismiss}
          >
            <RoomAudioRenderer />
            <AgentJoinWatcher onJoined={() => setAgentReady(true)} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div style={{
                background: agentReady ? '#6366f1' : '#334155',
                padding: 14, borderRadius: '50%',
                transition: 'background 0.3s',
              }}>
                <UserCheck size={28} color="white" />
              </div>

              {agentReady ? (
                <>
                  <h3 style={{ color: '#818cf8', margin: 0, fontSize: 18, fontWeight: 800 }}>
                    Connected to Agent
                  </h3>
                  <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                    Your callback is live — speak freely!
                  </p>
                </>
              ) : (
                <>
                  <h3 style={{ color: '#94a3b8', margin: 0, fontSize: 17 }}>
                    Waiting for agent…
                  </h3>
                  <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                    Agent is joining the call now.
                  </p>
                </>
              )}

              <button
                onClick={dismiss}
                style={{
                  padding: '10px 24px', background: '#ef4444', color: 'white',
                  borderRadius: 8, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontWeight: 700, marginTop: 10, fontSize: 14,
                }}
              >
                <PhoneOff size={16} /> End Call
              </button>
            </div>
          </LiveKitRoom>
        )}
      </div>

      <style>{`
        @keyframes cbPing  { 75%, 100% { transform: scale(2.1); opacity: 0; } }
        @keyframes cbRing  { from { transform: rotate(-14deg); } to { transform: rotate(14deg); } }
        @keyframes cbSpin  { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}