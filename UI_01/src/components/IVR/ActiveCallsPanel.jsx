// ======================== Active Calls Supervision Center ========================
// ActiveCallsPage -> High-fidelity administrative hub for real-time session monitoring,
// providing orchestration for WebRTC (Browser) and PSTN (Phone) call streams.
// ||
// ||
// ||
// Functions -> ActiveCallsPage()-> Primary orchestrator for call telemetry and view states:
// ||           |
// ||           |--- displayCalls Logic: Branch -> Computes visible buffer based on ActiveTab.
// ||           |
// ||           |--- handleDelete()-> [Action Trigger]: Internal Call -> Dispatches terminal purge.
// ||           |
// ||           |--- (Sub-Component Tree):
// ||           |    ├── TranscriptModal()-> [async Lifecycle]: Manages NLP data fetch and note commit.
// ||           |    ├── CallsTable()-> [Context Renderer]: Iterates over session registries.
// ||           |    │   └── ActiveCallRow()-> [Action Gate]: Dispatches End, Transfer, and Takeover.
// ||           |    └── HistoryRow()-> [Audit Renderer]: Visualizes terminal session metadata.
// ||           |
// ||           └── (Atomic UI Nodes):
// ||                ├── LiveDuration()-> Temporal synchronization for connected nodes.
// ||                └── RecordingPlayer()-> Action Trigger: Toggles remote audio streams.
// ||
// ==================================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  Phone, PhoneOff, Play, PhoneForwarded,
  ChevronDown, RefreshCw, AlertCircle, Clock,
  MessageSquare, Activity, Search, X, Trash2,
  Monitor, PhoneCall, ShieldAlert
} from 'lucide-react';
import { useActiveCalls } from '../../hooks/useActiveCalls';

const IVR_API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ---------------------------------------------------------------
// SECTION: UTILITY ORCHESTRATION
// ---------------------------------------------------------------

function formatDuration(s) {
  // Utility -> formatDuration()-> Normalizes temporal seconds into human-readable strings
  if (!s && s !== 0) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

function formatDate(iso) {
  // Utility -> formatDate()-> Serializes ISO timestamps for audit log presentation
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const toUTC = (iso) => (!iso ? null : iso.endsWith('Z') ? iso : iso + 'Z');

function isPhoneNumber(num) {
  // Utility -> isPhoneNumber()-> Logic Branch: Identifies PSTN vs WebRTC origin strings
  if (!num || typeof num !== 'string') return false;
  const cleaned = num.replace(/[\s\-\(\)\.]/g, '');
  return cleaned.startsWith('+') || /^\d{10,15}$/.test(cleaned);
}

// ---------------------------------------------------------------
// SECTION: ATOMIC UI MODULES
// ---------------------------------------------------------------

function LiveDuration({ startedAt, status }) {
  // Initialization -> LiveDuration()-> Executes temporal synchronization for active sessions
  const [secs, setSecs] = useState(() =>
    startedAt ? Math.max(0, Math.floor((Date.now() - new Date(toUTC(startedAt))) / 1000)) : 0
  );
  useEffect(() => {
    // Sub-process -> useEffect()-> Setup 1s timer for real-time duration increments
    if (!startedAt || !['connected', 'on_hold', 'conference'].includes(status)) return;
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [startedAt, status]);
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{formatDuration(secs)}</span>;
}

function StatusBadge({ status }) {
  // Presentation -> StatusBadge()-> Maps operational status to semantic design tokens
  const cfg = {
    connected: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'Connected' },
    on_hold: { bg: 'rgba(129,140,248,0.12)', color: '#818cf8', label: 'On Hold' },
    conference: { bg: 'rgba(56,189,248,0.12)', color: '#38bdf8', label: 'Conference' },
    ringing: { bg: 'rgba(249,115,22,0.12)', color: '#f97316', label: 'Ringing' },
    dialing: { bg: 'rgba(234,179,8,0.12)', color: '#eab308', label: 'Dialing' },
    ended: { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', label: 'Ended' },
    transferred: { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', label: 'Transferred' },
  }[status] ?? { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', label: status };
  return (
    <span style={{
      fontSize: '9px', padding: '2px 7px', borderRadius: '3px', fontWeight: 500,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40`,
      textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap',
    }}>{cfg.label}</span>
  );
}

function SLABadge({ call, live = false }) {
  // Logic Branch -> SLABadge()-> Evaluates session duration against departmental targets
  const target = call.sla_target_seconds, elapsed = call.duration_seconds || 0;
  if (!target) return <span style={{ fontSize: '10px', color: '#5a7a9a' }}>—</span>;
  if (live) {
    const pct = elapsed / target;
    const color = pct >= 1 ? '#f87171' : pct >= 0.8 ? '#eab308' : '#22c55e';
    const bg = pct >= 1 ? 'rgba(239,68,68,0.12)' : pct >= 0.8 ? 'rgba(234,179,8,0.1)' : 'rgba(34,197,94,0.08)';
    return (
      <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '3px', background: bg, color, border: `1px solid ${color}40`, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {pct >= 1 ? 'Breached' : pct >= 0.8 ? 'Warning' : `${target}s`}
      </span>
    );
  }
  return (
    <span style={{
      fontSize: '9px', padding: '2px 7px', borderRadius: '3px',
      background: call.sla_breached ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.1)',
      color: call.sla_breached ? '#f87171' : '#22c55e',
      border: `1px solid ${call.sla_breached ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.2)'}`,
      textTransform: 'uppercase', letterSpacing: '0.08em',
    }}>{call.sla_breached ? 'Breached' : 'Met'}</span>
  );
}

function ConsentBadge({ consent }) {
  // Presentation -> ConsentBadge()-> Standardizes visualization of data processing permissions
  if (consent === null || consent === undefined) {
    return <span style={{
      fontSize: '9px', padding: '2px 7px', borderRadius: '3px',
      background: 'rgba(234,179,8,0.12)', color: '#eab308',
      border: '1px solid rgba(234,179,8,0.3)', letterSpacing: '0.08em'
    }}>PENDING</span>;
  }
  if (consent === true) {
    return <span style={{
      fontSize: '9px', padding: '2px 7px', borderRadius: '3px',
      background: 'rgba(34,197,94,0.12)', color: '#22c55e',
      border: '1px solid rgba(34,197,94,0.25)', letterSpacing: '0.08em'
    }}>✔ CONSENT</span>;
  }
  return <span style={{
    fontSize: '9px', padding: '2px 7px', borderRadius: '3px',
    background: 'rgba(239,68,68,0.12)', color: '#f87171',
    border: '1px solid rgba(239,68,68,0.25)', letterSpacing: '0.08em'
  }}>✕ OPT-OUT</span>;
}

function RecordingPlayer({ callId, hasRecording }) {
  // Action Trigger -> RecordingPlayer()-> Orchestrates the remote audio stream lifecycle
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const toggle = useCallback(() => {
    // Internal Call -> toggle()-> Executes play/pause on the native Audio buffer
    if (!hasRecording) return;
    if (!audioRef.current) {
      const a = new Audio(`${IV_API}/calls/${callId}/recording`);
      a.onended = () => setPlaying(false);
      audioRef.current = a;
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play().catch(() => { }); setPlaying(true); }
  }, [callId, hasRecording, playing]);
  if (!hasRecording) return <span style={{ fontSize: '10px', color: '#5a7a9a' }}>Not recorded</span>;
  return (
    <button onClick={toggle} style={{
      display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px',
      color: playing ? '#22c55e' : '#38bdf8',
      background: playing ? 'rgba(34,197,94,0.1)' : 'rgba(56,189,248,0.08)',
      border: `1px solid ${playing ? 'rgba(34,197,94,0.2)' : 'rgba(56,189,248,0.15)'}`,
      borderRadius: '5px', padding: '3px 9px', cursor: 'pointer',
    }}>
      {playing ? '■ Stop' : <><Play size={10} /> Play</>}
    </button>
  );
}

// ---------------------------------------------------------------
// SECTION: MODAL & OVERLAY NODES
// ---------------------------------------------------------------

function TranscriptModal({ callId, callerNumber, onClose }) {
  // Initialization -> TranscriptModal()-> Portal component for real-time NLP transcript exploration
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [speaker, setSpeaker] = useState('agent');
  const [sending, setSending] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    // Sub-process -> useEffect()-> Executes asynchronous retrieval of historical dialogue items
    fetch(`${IV_API}/calls/${callId}/transcript`)
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => setItems(Array.isArray(data) ? data : data.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [callId]);

  useEffect(() => {
    // Sub-process -> useEffect()-> Maintains scroll alignment for new transcript entries
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [items]);

  useEffect(() => {
    // Sub-process -> useEffect()-> Attaches global Escape-key listener for modal termination
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleAdd = async () => {
    // Action Trigger -> handleAdd()-> Commits a manual annotation to the persistent transcript record
    const text = newText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${IV_API}/calls/${callId}/transcript`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speaker, text }),
      });
      if (!res.ok) throw new Error();
      const entry = await res.json();
      setItems(prev => [...(prev ?? []), entry]);
      setNewText('');
    } catch (_) { } finally { setSending(false); }
  };

  const speakerColor = { agent: '#818cf8', caller: '#22c55e', system: '#5a7a9a' };

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: '560px', maxHeight: '80vh',
          background: '#0e1419', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={14} color="#818cf8" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#e8f0f8' }}>Transcript</span>
            <span style={{ fontSize: '11px', color: '#5a7a9a' }}>· {callerNumber}</span>
          </div>
          <button onClick={onClose} style={{ width: '26px', height: '26px', borderRadius: '7px', border: 'none', background: 'rgba(255,255,255,0.05)', color: '#5a7a9a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={13} />
          </button>
        </div>

        <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '24px 0', color: '#5a7a9a', fontSize: '12px' }}>
              <RefreshCw size={12} /> Loading…
            </div>
          ) : !items?.length ? (
            <p style={{ fontSize: '12px', color: '#5a7a9a', textAlign: 'center', padding: '24px 0' }}>No transcript available.</p>
          ) : items.map((entry, i) => (
            <div key={entry.id ?? i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, minWidth: '44px', textAlign: 'right', paddingTop: '8px', color: speakerColor[entry.speaker] ?? '#5a7a9a', textTransform: 'capitalize' }}>
                {entry.speaker}
              </span>
              <div style={{
                flex: 1, padding: '7px 11px', borderRadius: '8px', fontSize: '12px', color: '#c4cdd8', lineHeight: 1.6,
                background: entry.speaker === 'system' ? 'transparent' : 'rgba(255,255,255,0.03)',
                border: entry.speaker === 'system' ? 'none' : '1px solid rgba(255,255,255,0.06)',
                fontStyle: entry.speaker === 'system' ? 'italic' : 'normal',
              }}>{entry.text}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: '8px', flexShrink: 0 }}>
          <select value={speaker} onChange={e => setSpeaker(e.target.value)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', color: '#8899aa', fontSize: '11px', padding: '6px 8px' }}>
            <option value="agent">Agent</option>
            <option value="caller">Caller</option>
            <option value="system">System</option>
          </select>
          <input value={newText} onChange={e => setNewText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }} placeholder="Add a note…"
            style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '6px 10px', color: '#e8f0f8', fontSize: '12px', outline: 'none' }} />
          <button onClick={handleAdd} disabled={!newText.trim() || sending}
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '7px', color: '#818cf8', fontSize: '11px', padding: '6px 14px', cursor: !newText.trim() || sending ? 'not-allowed' : 'pointer', opacity: !newText.trim() || sending ? 0.5 : 1 }}>
            {sending ? '…' : 'Add'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TransferMini({ callId, onTransfer, onCancel }) {
  // Initialization -> TransferMini()-> Reactive UI node for departmental call routing
  const [dept, setDept] = useState('');
  const [busy, setBusy] = useState(false);
  const depts = ['Sales', 'Support', 'Billing', 'Operations', 'General'];
  const doTransfer = async () => {
    // Action Trigger -> doTransfer()-> Executes cross-departmental session migration
    if (!dept || busy) return;
    setBusy(true);
    try { await onTransfer(callId, dept); } catch (_) { } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px', borderRadius: '8px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
      <select value={dept} onChange={e => setDept(e.target.value)} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e8f0f8', fontSize: '11px', padding: '5px 8px' }}>
        <option value="">Select department…</option>
        {depts.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <button disabled={!dept || busy} onClick={doTransfer} style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '6px', color: '#a78bfa', fontSize: '11px', padding: '5px 12px', cursor: !dept || busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {busy ? <RefreshCw size={11} /> : <PhoneForwarded size={11} />} Transfer
      </button>
      <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#5a7a9a', fontSize: '11px', cursor: 'pointer', padding: '5px 8px' }}>Cancel</button>
    </div>
  );
}

// ---------------------------------------------------------------
// SECTION: ROW INTERACTION LOGIC
// ---------------------------------------------------------------

const TH_STYLE = { padding: '9px 12px', fontSize: '10px', fontWeight: 500, color: '#5a7a9a', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', textAlign: 'left' };
const COL_HEADS = ['Caller', 'Agent', 'Dept', 'Duration', 'Status', 'SLA', 'Consent', 'Recording', 'Actions', ''];

const TABLE_WRAPPER = {
  borderRadius: '10px',
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,0.07)',
  overflowX: 'auto',
};

function ActiveCallRow({ call, onEnd, onTransfer, onTakeover, onShowTranscript, callType }) {
  // Initialization -> ActiveCallRow()-> Interaction node for live session management
  const [showTransfer, setShowTransfer] = useState(false);
  const [ending, setEnding] = useState(false);
  const statusColor = { connected: '#22c55e', on_hold: '#818cf8', conference: '#38bdf8', ringing: '#f97316', dialing: '#eab308' }[call.status] ?? '#94a3b8';

  const CallIcon = callType === 'phone' ? PhoneCall : Monitor;

  const handleEnd = async () => {
    // Action Trigger -> handleEnd()-> Commits a terminal signal to the session buffer
    setEnding(true);
    try { await onEnd(call.id); } catch (_) { setEnding(false); }
  };

  return (
    <>
      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: `${statusColor}08` }}>
        <td style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '7px', flexShrink: 0, background: `${statusColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CallIcon size={12} color={statusColor} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e8f0f8', whiteSpace: 'nowrap' }}>{call.caller_number}</span>
              <span style={{ fontSize: '9px', color: '#5a7a9a', textTransform: 'uppercase' }}>
                {callType === 'phone' ? 'PSTN' : 'WebRTC'}
              </span>
            </div>
          </div>
        </td>
        <td style={{ padding: '10px 12px', fontSize: '12px', color: '#8899aa', whiteSpace: 'nowrap' }}>{call.agent_name ?? '—'}</td>
        <td style={{ padding: '10px 12px', fontSize: '12px', color: '#8899aa', whiteSpace: 'nowrap' }}>{call.department ?? 'General'}</td>
        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}><LiveDuration startedAt={call.started_at} status={call.status} /></td>
        <td style={{ padding: '10px 12px' }}><StatusBadge status={call.status} /></td>
        <td style={{ padding: '10px 12px' }}><SLABadge call={call} live={true} /></td>
        <td style={{ padding: '10px 12px' }}><ConsentBadge consent={call.recording_consent} /></td>
        <td style={{ padding: '10px 12px' }}><RecordingPlayer callId={call.id} hasRecording={!!call.recording_path} /></td>
        <td style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button onClick={() => onShowTranscript(call)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#818cf8', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '5px', padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <MessageSquare size={10} /> Transcript
            </button>

            <button
              onClick={() => onTakeover(call.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px',
                color: '#f59e0b', background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.2)', borderRadius: '5px',
                padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap'
              }}
              title="Takeover this call"
            >
              <ShieldAlert size={10} /> Takeover
            </button>

            <button onClick={() => setShowTransfer(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#a78bfa', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '5px', padding: '4px 8px', cursor: 'pointer' }}>
              <PhoneForwarded size={10} />
            </button>
            <button disabled={ending} onClick={handleEnd} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '5px', padding: '4px 8px', cursor: ending ? 'not-allowed' : 'pointer', opacity: ending ? 0.5 : 1 }}>
              {ending ? <RefreshCw size={10} /> : <PhoneOff size={10} />} End
            </button>
          </div>
        </td>
        <td />
      </tr>
      {showTransfer && (
        <tr style={{ background: 'rgba(139,92,246,0.04)' }}>
          <td colSpan={10} style={{ padding: '8px 12px' }}>
            <TransferMini callId={call.id} onTransfer={async (id, dept) => { await onTransfer(id, dept, null); setShowTransfer(false); }} onCancel={() => setShowTransfer(false)} />
          </td>
        </tr>
      )}
    </>
  );
}

function HistoryRow({ call, onDelete, onShowTranscript }) {
  // Initialization -> HistoryRow()-> Static data node for historical audit exploration
  const [expanded, setExpanded] = useState(false);
  const routeLabel = call.routes?.length ? `→ ${call.routes[call.routes.length - 1].to_department ?? 'Agent'}` : '';
  const callType = isPhoneNumber(call.caller_number) ? 'phone' : 'browser';

  return (
    <>
      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.1s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.015)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <td style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '6px', flexShrink: 0, background: callType === 'phone' ? 'rgba(56,189,248,0.15)' : 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {callType === 'phone' ? <PhoneCall size={11} color="#38bdf8" /> : <Monitor size={11} color="#22c55e" />}
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#e8f0f8', whiteSpace: 'nowrap' }}>{call.caller_number}</div>
              <div style={{ fontSize: '10px', color: '#5a7a9a', marginTop: '2px', whiteSpace: 'nowrap' }}>{formatDate(call.created_at)}</div>
            </div>
          </div>
        </td>
        <td style={{ padding: '10px 12px', fontSize: '12px', color: '#8899aa', whiteSpace: 'nowrap' }}>{call.agent_name ?? '—'}</td>
        <td style={{ padding: '10px 12px', fontSize: '12px', color: '#8899aa', whiteSpace: 'nowrap' }}>{call.department ?? '—'}</td>
        <td style={{ padding: '10px 12px', fontSize: '12px', color: '#8899aa', whiteSpace: 'nowrap' }}>{formatDuration(call.duration_seconds)}</td>
        <td style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <StatusBadge status={call.status} />
            {routeLabel && <span style={{ fontSize: '10px', color: '#a78bfa' }}>{routeLabel}</span>}
          </div>
        </td>
        <td style={{ padding: '10px 12px' }}><SLABadge call={call} live={false} /></td>
        <td style={{ padding: '10px 12px' }}><ConsentBadge consent={call.recording_consent} /></td>
        <td style={{ padding: '10px 12px' }}><RecordingPlayer callId={call.id} hasRecording={!!call.recording_path} /></td>
        <td style={{ padding: '10px 12px' }}>
          <button onClick={() => onShowTranscript(call)} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#818cf8', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <MessageSquare size={11} /> Transcript
          </button>
        </td>
        <td style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {call.routes?.length > 0 && (
              <button onClick={() => setExpanded(p => !p)} style={{ width: '26px', height: '26px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.04)', color: '#5a7a9a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronDown size={12} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '.2s' }} />
              </button>
            )}
            <button onClick={() => onDelete(call.id)} style={{ width: '26px', height: '26px', borderRadius: '6px', border: 'none', background: 'rgba(239,68,68,0.06)', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trash2 size={11} />
            </button>
          </div>
        </td>
      </tr>
      {expanded && call.routes?.map((r, i) => (
        <tr key={r.id ?? i} style={{ background: 'rgba(139,92,246,0.04)' }}>
          <td colSpan={10} style={{ padding: '6px 12px 6px 40px' }}>
            <span style={{ fontSize: '10px', color: '#a78bfa' }}>{r.action_type} · {r.from_department ?? '—'} → {r.to_department ?? '—'}</span>
          </td>
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------
// SECTION: COLLECTION RENDERERS
// ---------------------------------------------------------------

function CallsTable({ calls, callType, onEnd, onTransfer, onTakeover, onShowTranscript, loading, emptyIcon, emptyTitle, emptySubtitle }) {
  // Initialization -> CallsTable()-> Higher-order layout for session collection visualization
  const EmptyIcon = emptyIcon;

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#5a7a9a', fontSize: '12px', padding: '16px 0' }}>
        <RefreshCw size={13} className="animate-spin" /> Loading…
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '36px', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.06)', textAlign: 'center' }}>
        <EmptyIcon size={24} color="#3a4a5a" />
        <p style={{ fontSize: '12px', color: '#5a7a9a' }}>{emptyTitle}</p>
        <p style={{ fontSize: '10px', color: '#3a4a5a' }}>{emptySubtitle}</p>
      </div>
    );
  }

  return (
    <div style={TABLE_WRAPPER}>
      <table style={{ width: '100%', minWidth: '860px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {COL_HEADS.map(h => <th key={h} style={TH_STYLE}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {calls.map(call => (
            <ActiveCallRow
              key={call.id}
              call={call}
              callType={callType}
              onEnd={onEnd}
              onTransfer={onTransfer}
              onTakeover={onTakeover}
              onShowTranscript={onShowTranscript}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------
// SECTION: MAIN PAGE DEFINITION
// ---------------------------------------------------------------

export default function ActiveCallsPage() {
  // Initialization -> ActiveCallsPage()-> Main orchestrator for team-wide call orchestration and audit
  const { activeCalls, callHistory, loading, error, refresh, handleTransfer, handleEndCall, handleTakeover, wsConnected } = useActiveCalls();
  const [search, setSearch] = useState('');
  const [deletedIds, setDeletedIds] = useState(new Set());
  const [transcriptCall, setTranscriptCall] = useState(null);
  const [activeTab, setActiveTab] = useState('browser');

  const phoneCalls = useMemo(() =>
    // Logic Branch -> phoneCalls extraction: Isolates PSTN sessions for dedicated view
    activeCalls.filter(c =>
      c.call_type === 'phone' || isPhoneNumber(c.caller_number)
    ),
    [activeCalls]
  );

  const browserCalls = useMemo(() =>
    // Logic Branch -> browserCalls extraction: Isolates WebRTC sessions for dedicated view
    activeCalls.filter(c =>
      c.call_type === 'browser' ||
      (c.call_type !== 'phone' && !isPhoneNumber(c.caller_number))
    ),
    [activeCalls]
  );

  const handleDelete = useCallback(async (id) => {
    // Action Trigger -> handleDelete()-> Executes deletion signal for terminal audit logs
    setDeletedIds(prev => new Set([...prev, id]));
    try {
      await fetch(`${IV_API}/calls/${id}`, { method: 'DELETE' });
    } catch (_) {
      setDeletedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, []);

  const handleShowTranscript = useCallback((call) => setTranscriptCall(call), []);
  const handleCloseTranscript = useCallback(() => setTranscriptCall(null), []);

  const filtered = useMemo(() =>
    // Logic Branch -> filtered history: Computes visible audit logs based on search query
    callHistory.filter(c =>
      !deletedIds.has(c.id) && (!search ||
        c.caller_number?.toLowerCase().includes(search.toLowerCase()) ||
        c.agent_name?.toLowerCase().includes(search.toLowerCase()) ||
        c.department?.toLowerCase().includes(search.toLowerCase()))
    ),
    [callHistory, deletedIds, search]
  );

  const displayCalls = activeTab === 'browser' ? browserCalls : phoneCalls;

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#e8f0f8' }}>Active Calls</h2>
          <p style={{ fontSize: '11px', color: '#5a7a9a', marginTop: '2px' }}>Live monitoring · polls every 3 s</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: wsConnected ? '#22c55e' : '#eab308' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: wsConnected ? '#22c55e' : '#eab308', boxShadow: wsConnected ? '0 0 5px rgba(34,197,94,0.5)' : '0 0 5px rgba(234,179,8,0.5)' }} />
            {wsConnected ? 'Live' : 'Polling'}
          </div>
          <button onClick={refresh} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#8899aa', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer' }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '10px', fontSize: '12px', color: '#f87171', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertCircle size={13} /> Backend unavailable — {error}
        </div>
      )}

      <section>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: '0' }}>
          <button
            onClick={() => setActiveTab('browser')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', fontSize: '12px', fontWeight: 500,
              color: activeTab === 'browser' ? '#22c55e' : '#5a7a9a',
              background: activeTab === 'browser' ? 'rgba(34,197,94,0.1)' : 'transparent',
              border: 'none', borderBottom: activeTab === 'browser' ? '2px solid #22c55e' : '2px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s ease', marginBottom: '-1px',
            }}
          >
            <Monitor size={14} /> Browser Calls
            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', background: activeTab === 'browser' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)', color: activeTab === 'browser' ? '#22c55e' : '#5a7a9a' }}>
              {browserCalls.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('phone')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', fontSize: '12px', fontWeight: 500,
              color: activeTab === 'phone' ? '#38bdf8' : '#5a7a9a',
              background: activeTab === 'phone' ? 'rgba(56,189,248,0.1)' : 'transparent',
              border: 'none', borderBottom: activeTab === 'phone' ? '2px solid #38bdf8' : '2px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s ease', marginBottom: '-1px',
            }}
          >
            <PhoneCall size={14} /> Phone Calls (PSTN)
            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', background: activeTab === 'phone' ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.05)', color: activeTab === 'phone' ? '#38bdf8' : '#5a7a9a' }}>
              {phoneCalls.length}
            </span>
          </button>
        </div>
        <CallsTable
          calls={displayCalls}
          callType={activeTab}
          onEnd={handleEndCall}
          onTransfer={handleTransfer}
          onTakeover={handleTakeover}
          onShowTranscript={handleShowTranscript}
          loading={loading}
          emptyIcon={activeTab === 'phone' ? PhoneCall : Activity}
          emptyTitle={activeTab === 'phone' ? 'No active phone calls' : 'No active browser calls'}
          emptySubtitle={activeTab === 'phone' ? 'Requires PSTN provider (Exotel/Twilio) integration' : 'Use the "Start Call" button to initiate a WebRTC call'}
        />
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={13} color="#5a7a9a" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#e8f0f8' }}>Call History</span>
            <span style={{ fontSize: '11px', color: '#5a7a9a' }}>({filtered.length})</span>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#5a7a9a' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '6px 10px 6px 28px', color: '#e8f0f8', fontSize: '11px', outline: 'none', width: '160px' }} />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '32px', textAlign: 'center' }}>
            <Clock size={20} color="#3a4a5a" />
            <p style={{ fontSize: '12px', color: '#5a7a9a' }}>No call history yet</p>
          </div>
        ) : (
          <div style={TABLE_WRAPPER}>
            <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {COL_HEADS.map(h => <th key={h} style={TH_STYLE}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map(call => (
                  <HistoryRow key={call.id} call={call} onDelete={handleDelete} onShowTranscript={handleShowTranscript} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {transcriptCall && (
        <TranscriptModal callId={transcriptCall.id} callerNumber={transcriptCall.caller_number} onClose={handleCloseTranscript} />
      )}
    </div>
  );
}