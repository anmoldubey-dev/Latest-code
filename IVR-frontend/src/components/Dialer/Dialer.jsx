import { useCallback, useEffect } from 'react';
import {
  Phone, PhoneOff, Mic, MicOff, Pause, Play,
  PhoneForwarded, Users, Delete,
} from 'lucide-react';
import { useCall } from '../../context/CallContext';
import { startCall as apiStartCall, endCall as apiEndCall } from '../../services/callApiService';
import { useWebRTCCall } from '../../hooks/useWebRTCCall';
import WebRTCCall from '../WebRTCCall/WebRTCCall';

// ── Keypad layout ─────────────────────────────────────────────────────────────
const KEYS = [
  { digit: '1', sub: ''     },
  { digit: '2', sub: 'ABC'  },
  { digit: '3', sub: 'DEF'  },
  { digit: '4', sub: 'GHI'  },
  { digit: '5', sub: 'JKL'  },
  { digit: '6', sub: 'MNO'  },
  { digit: '7', sub: 'PQRS' },
  { digit: '8', sub: 'TUV'  },
  { digit: '9', sub: 'WXYZ' },
  { digit: '*', sub: ''     },
  { digit: '0', sub: '+'    },
  { digit: '#', sub: ''     },
];

const STATE_META = {
  idle:        { label: 'Ready',         color: '#4b5563' },
  dialing:     { label: 'Dialing\u2026', color: '#eab308' },
  ringing:     { label: 'Ringing\u2026', color: '#f97316' },
  connected:   { label: 'Connected',     color: '#22c55e' },
  on_hold:     { label: 'On Hold',       color: '#818cf8' },
  transferring:{ label: 'Transferring',  color: '#a78bfa' },
  conference:  { label: 'Conference',    color: '#38bdf8' },
  ended:       { label: 'Ended',         color: '#ef4444' },
};

function formatDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ── Animated state indicator ──────────────────────────────────────────────────
function StateIndicator({ state }) {
  const meta    = STATE_META[state] ?? STATE_META.idle;
  const isPulse = ['dialing','ringing','connected','conference'].includes(state);
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{
          background: meta.color,
          boxShadow: `0 0 6px ${meta.color}80`,
          animation: isPulse ? 'pulse-dot 1.2s ease-in-out infinite' : 'none',
        }}
      />
      <span className="text-xs font-medium" style={{ color: meta.color }}>
        {meta.label}
      </span>
    </div>
  );
}

// ── Number display with gradient border ───────────────────────────────────────
function NumberDisplay({ value, onClear, callState }) {
  const isActive = ['connected','on_hold','conference','transferring'].includes(callState);
  const gradient = isActive
    ? 'linear-gradient(135deg,#22c55e40,#6366f140)'
    : 'linear-gradient(135deg,#6366f120,#8b5cf620)';

  return (
    <div className="relative rounded-xl p-px mb-4" style={{ background: gradient }}>
      <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: '#020617' }}>
        <div
          className="text-xl font-light tracking-widest flex-1 text-center"
          style={{
            color: value ? '#fff' : 'rgba(255,255,255,0.2)',
            letterSpacing: '0.18em',
            minHeight: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {value || 'Enter number\u2026'}
        </div>
        {value && callState === 'idle' && (
          <button
            type="button"
            onClick={onClear}
            className="p-1.5 rounded-lg transition-colors duration-150 ml-2 flex-shrink-0"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            <Delete size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Control button ────────────────────────────────────────────────────────────
function CtrlBtn({ icon, label, onClick, active, disabled, activeColor, activeBg }) {
  const bg     = active && activeBg ? activeBg : 'rgba(255,255,255,0.04)';
  const fg     = active && activeColor ? activeColor : disabled ? 'rgba(255,255,255,0.2)' : '#94a3b8';
  const border = active ? `1px solid ${activeColor}40` : '1px solid rgba(255,255,255,0.07)';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-all duration-150"
      style={{ background: bg, border, color: fg, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1 }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Main Dialer ───────────────────────────────────────────────────────────────
export default function Dialer() {
  const {
    callState, CALL_STATES,
    dialNumber, isMuted, isHeld, callDuration,
    canEndCall, canMute, canHold, canTransfer, canConference,
    dial, clearDigit, startCall, endCall,
    toggleMute, toggleHold, startTransfer, startConference,
    backendCallId, setBackendCallId, setCallState,
  } = useCall();

  const webrtc = useWebRTCCall();

  // ── Sync WebRTC state → UI call state ────────────────────────────────────
  useEffect(() => {
    if (webrtc.rtcState === 'connected' && callState !== CALL_STATES.CONNECTED) {
      setCallState(CALL_STATES.CONNECTED);
    }
    if (
      (webrtc.rtcState === 'ended' || webrtc.rtcState === 'error') &&
      callState !== CALL_STATES.IDLE &&
      callState !== CALL_STATES.ENDED
    ) {
      endCall();
    }
  }, [webrtc.rtcState]); // eslint-disable-line

  // ── Keyboard support ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (/^[0-9*#]$/.test(e.key)) dial(e.key);
      if (e.key === 'Backspace') clearDigit();
      if (e.key === 'Enter' && !canEndCall) handleStartCall();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dial, clearDigit, canEndCall]); // eslint-disable-line

  const handleStartCall = useCallback(async () => {
    // Advance UI state immediately
    startCall();
    // Log to backend DB (optional, non-blocking)
    if (dialNumber) {
      try {
        const data = await apiStartCall(dialNumber, 'General');
        setBackendCallId?.(data.id);
      } catch (_) { /* backend offline — local simulation continues */ }
    }
  }, [startCall, dialNumber, setBackendCallId]);

  const handleEndCall = useCallback(async () => {
    // Hang up the real WebRTC call first
    webrtc.hangup();
    endCall();
    if (backendCallId) {
      try { await apiEndCall(backendCallId); } catch (_) {}
    }
  }, [webrtc, endCall, backendCallId]);

  const handleToggleMute = useCallback(() => {
    webrtc.toggleMute();
    toggleMute();
  }, [webrtc, toggleMute]);

  const isConnected  = callState === CALL_STATES.CONNECTED;
  const showKeypad   = callState === CALL_STATES.IDLE;
  const showControls = [CALL_STATES.CONNECTED, CALL_STATES.ON_HOLD].includes(callState);
  const showSpinner  = [CALL_STATES.DIALING, CALL_STATES.RINGING].includes(callState);

  // Show WebRTC panel whenever not in a pure "ended" or mid-transfer/conference state
  const showWebRTC = [
    CALL_STATES.IDLE, CALL_STATES.CONNECTED, CALL_STATES.ON_HOLD, CALL_STATES.ENDED,
  ].includes(callState);

  return (
    <div className="flex flex-col gap-0 h-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-white">Dialer</h2>
          <p className="text-xs text-gray-500 mt-0.5">Professional call control</p>
        </div>
        <div className="flex items-center gap-3">
          <StateIndicator state={callState} />
          {isConnected && (
            <div className="font-mono text-sm text-gray-500">{formatDuration(callDuration)}</div>
          )}
        </div>
      </div>

      {/* Number display */}
      <NumberDisplay value={dialNumber} onClear={clearDigit} callState={callState} />

      {/* Keypad */}
      {showKeypad && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {KEYS.map(({ digit, sub }) => (
            <button
              key={digit}
              type="button"
              className="dial-key"
              onClick={() => dial(digit)}
            >
              <span>{digit}</span>
              {sub && <span className="sub">{sub}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Dialing / Ringing animation */}
      {showSpinner && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="text-sm text-gray-400">
            {callState === CALL_STATES.DIALING ? 'Connecting to ' : 'Ringing '}
            <span className="text-white">{dialNumber || 'AI Agent'}</span>
          </div>
          <div className="flex gap-2">
            {[0,1,2,3].map(i => (
              <span
                key={i}
                className="w-2 h-2 rounded-full"
                style={{
                  background: STATE_META[callState]?.color ?? '#6366F1',
                  animation: `pulse-dot 1.2s ease-in-out ${i * 0.18}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Active call controls */}
      {showControls && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <CtrlBtn
            icon={isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            label={isMuted ? 'Unmute' : 'Mute'}
            onClick={handleToggleMute}
            active={isMuted}
            disabled={!canMute}
            activeColor="#f87171"
            activeBg="rgba(239,68,68,0.12)"
          />
          <CtrlBtn
            icon={isHeld ? <Play size={16} /> : <Pause size={16} />}
            label={isHeld ? 'Resume' : 'Hold'}
            onClick={toggleHold}
            active={isHeld}
            disabled={!canHold}
            activeColor="#818cf8"
            activeBg="rgba(99,102,241,0.15)"
          />
          <CtrlBtn
            icon={<PhoneForwarded size={16} />}
            label="Transfer"
            onClick={startTransfer}
            disabled={!canTransfer}
          />
          <CtrlBtn
            icon={<Users size={16} />}
            label="Conference"
            onClick={startConference}
            disabled={!canConference}
          />
        </div>
      )}

      {/* Ended */}
      {callState === CALL_STATES.ENDED && (
        <div className="flex justify-center py-6">
          <span className="text-sm text-gray-500">
            Call ended · {formatDuration(callDuration)}
          </span>
        </div>
      )}

      {/* Primary action */}
      <div className="mt-auto pt-3">
        {!canEndCall ? (
          <button
            type="button"
            onClick={handleStartCall}
            className="btn-success w-full gap-2 py-4 text-base"
          >
            <Phone size={18} /> Call
          </button>
        ) : (
          <button
            type="button"
            onClick={handleEndCall}
            className="btn-danger w-full gap-2 py-4 text-base"
          >
            <PhoneOff size={18} /> End Call
          </button>
        )}
      </div>

      {/* WebRTC call panel — config + live captions + controls */}
      {showWebRTC && (
        <div className="mt-4 border-t border-white/5 pt-4">
          <WebRTCCall
            rtcState={webrtc.rtcState}
            agentName={webrtc.agentName}
            transcript={webrtc.transcript}
            aiResponse={webrtc.aiResponse}
            isMuted={webrtc.isMuted}
            errorMsg={webrtc.errorMsg}
            remoteAudioRef={webrtc.remoteAudioRef}
            startCall={webrtc.startCall}
            hangup={webrtc.hangup}
            interrupt={webrtc.interrupt}
            toggleMute={webrtc.toggleMute}
          />
        </div>
      )}
    </div>
  );
}
