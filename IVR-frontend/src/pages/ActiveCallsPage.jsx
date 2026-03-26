import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Phone, PhoneOff, Pause, Play, PhoneForwarded, Users,
  ChevronDown, ChevronRight, AlertCircle, RefreshCw,
  Clock, MessageSquare, Activity, Search, X, Trash2,
} from 'lucide-react';
import { useActiveCalls } from '../hooks/useActiveCalls';
import { getTranscripts } from '../services/callApiService';

const IVR_API = 'http://localhost:8001';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatTime(iso) {
  if (!iso) return '—';
  const utc = iso.endsWith('Z') ? iso : iso + 'Z';
  return new Date(utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  if (!iso) return '—';
  const utc = iso.endsWith('Z') ? iso : iso + 'Z';
  const d = new Date(utc);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
         d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Backend uses datetime.utcnow() without timezone — append Z so browser reads UTC
const toUTC = (iso) => (!iso ? null : iso.endsWith('Z') ? iso : iso + 'Z');

// ── Live duration counter ─────────────────────────────────────────────────────
function LiveDuration({ startedAt, status }) {
  const [secs, setSecs] = useState(() =>
    startedAt ? Math.max(0, Math.floor((Date.now() - new Date(toUTC(startedAt))) / 1000)) : 0
  );

  useEffect(() => {
    if (!startedAt || !['connected', 'on_hold', 'conference'].includes(status)) return;
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [startedAt, status]);

  return <span className="font-mono text-xs">{formatDuration(secs)}</span>;
}

// ── Recording player ──────────────────────────────────────────────────────────
function RecordingPlayer({ callId, hasRecording }) {
  const [playing, setPlaying] = useState(false);
  const [audio,   setAudio]   = useState(null);

  const toggle = useCallback(() => {
    if (!hasRecording) return;
    if (playing && audio) {
      audio.pause();
      setPlaying(false);
      setAudio(null);
      return;
    }
    const a = new Audio(`${IVR_API}/calls/${callId}/recording`);
    a.onended = () => { setPlaying(false); setAudio(null); };
    a.onerror = () => { setPlaying(false); setAudio(null); };
    setAudio(a);
    setPlaying(true);
    a.play().catch(() => { setPlaying(false); setAudio(null); });
  }, [playing, audio, callId, hasRecording]);

  useEffect(() => () => audio?.pause(), [audio]);

  if (!hasRecording) {
    return (
      <span
        className="text-xs px-2 py-1 rounded-lg whitespace-nowrap"
        style={{ color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        Not recorded
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggle(); }}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150"
      style={playing
        ? { background: 'rgba(34,197,94,0.12)',  color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }
        : { background: 'rgba(99,102,241,0.10)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }
      }
    >
      {playing ? <Pause size={11} /> : <Play size={11} />}
      {playing ? 'Stop' : 'Play'}
    </button>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const labels = {
    connected:   'Connected',
    on_hold:     'On Hold',
    conference:  'Conference',
    dialing:     'Dialing',
    ringing:     'Ringing',
    transferred: 'Transferred',
    ended:       'Ended',
  };
  return <span className={`badge-${status.replace(' ', '_')}`}>{labels[status] ?? status}</span>;
}

// ── Transcript modal (rendered at page level, outside <table>) ────────────────
function TranscriptModal({ callId, callerNumber, onClose }) {
  const [items,   setItems]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [speaker, setSpeaker] = useState('agent');
  const [sending, setSending] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    getTranscripts(callId)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [callId]);

  // Scroll to bottom whenever items change
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [items]);

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${IVR_API}/calls/${callId}/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speaker, text }),
      });
      if (!res.ok) throw new Error();
      const entry = await res.json();
      setItems(prev => [...(prev ?? []), entry]);
      setNewText('');
    } catch (_) {}
    finally { setSending(false); }
  };

  const speakerStyle = {
    agent:  { color: '#818cf8', label: 'Agent'  },
    caller: { color: '#22c55e', label: 'Caller' },
    system: { color: '#94a3b8', label: 'System' },
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl flex flex-col overflow-hidden"
        style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '82vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-indigo-400" />
            <span className="text-sm font-semibold text-white">Transcript</span>
            <span className="text-xs text-gray-500">· {callerNumber}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150"
            style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.05)' }}
            title="Close (Esc)"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-gray-500">
              <RefreshCw size={12} className="spin" /> Loading transcript…
            </div>
          ) : !items?.length ? (
            <p className="text-xs text-gray-600 py-6 text-center">No transcript available for this call.</p>
          ) : items.map(entry => {
            const sp = speakerStyle[entry.speaker] ?? speakerStyle.system;
            return (
              <div key={entry.id} className="flex gap-3">
                <span
                  className="text-xs font-semibold flex-shrink-0 w-12 text-right pt-2"
                  style={{ color: sp.color }}
                >
                  {sp.label}
                </span>
                <div
                  className="flex-1 px-3 py-2 rounded-xl text-xs text-gray-300 leading-relaxed"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  {entry.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add entry row */}
        <div
          className="flex items-center gap-2 px-4 py-3 border-t flex-shrink-0"
          style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.015)' }}
        >
          <select
            value={speaker}
            onChange={(e) => setSpeaker(e.target.value)}
            className="input-field text-xs py-1.5 px-2 w-24 flex-shrink-0"
          >
            <option value="agent"  style={{ background: '#0f172a' }}>Agent</option>
            <option value="caller" style={{ background: '#0f172a' }}>Caller</option>
            <option value="system" style={{ background: '#0f172a' }}>System</option>
          </select>
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="Type a line and press Enter…"
            className="input-field text-xs py-1.5 flex-1"
          />
          <button
            type="button"
            disabled={!newText.trim() || sending}
            onClick={handleAdd}
            className="btn-primary text-xs py-1.5 px-3 gap-1 flex-shrink-0"
            style={{ opacity: !newText.trim() || sending ? 0.5 : 1 }}
          >
            {sending ? <RefreshCw size={11} className="spin" /> : <MessageSquare size={11} />}
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Transfer mini-panel ───────────────────────────────────────────────────────
const DEPT_OPTIONS = ['Sales', 'Support', 'Billing', 'Operations', 'HR', 'Voicemail'];

function TransferMini({ callId, onTransfer, onCancel }) {
  const [dept, setDept] = useState('');
  const [busy, setBusy] = useState(false);

  const doTransfer = async () => {
    if (!dept) return;
    setBusy(true);
    try { await onTransfer(callId, dept, null); }
    catch (_) {}
    finally { setBusy(false); }
  };

  return (
    <div
      className="flex items-center gap-2 p-3 rounded-xl mt-2"
      style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <select
        value={dept}
        onChange={(e) => setDept(e.target.value)}
        className="input-field text-xs py-1.5 flex-1"
      >
        <option value="" style={{ background: '#0f172a' }}>Select destination…</option>
        {DEPT_OPTIONS.map(d => (
          <option key={d} value={d} style={{ background: '#0f172a' }}>{d}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={!dept || busy}
        onClick={doTransfer}
        className="btn-primary text-xs py-1.5 px-3 gap-1"
      >
        {busy ? <RefreshCw size={12} className="spin" /> : <PhoneForwarded size={12} />}
        Transfer
      </button>
      <button type="button" onClick={onCancel} className="btn-ghost text-xs py-1.5 px-2">
        Cancel
      </button>
    </div>
  );
}

// ── Active call card ──────────────────────────────────────────────────────────
function ActiveCallCard({ call, onEnd, onTransfer, onShowTranscript }) {
  const [showTransfer, setShowTransfer] = useState(false);
  const [ending,       setEnding]       = useState(false);
  const [hovered,      setHovered]      = useState(false);

  const handleEnd = async () => {
    setEnding(true);
    try { await onEnd(call.id); }
    catch (_) { setEnding(false); }
  };

  const statusColor = {
    connected:  '#22c55e',
    on_hold:    '#818cf8',
    conference: '#38bdf8',
    ringing:    '#f97316',
    dialing:    '#eab308',
  }[call.status] ?? '#94a3b8';

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${statusColor}30`, boxShadow: `0 0 20px ${statusColor}10` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${statusColor}20` }}
          >
            <Phone size={16} style={{ color: statusColor }} />
          </div>
          <div>
            <div className="font-semibold text-white text-sm">{call.caller_number}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {call.department ?? 'General'} · {call.agent_name ?? 'Unassigned'}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            {/* Transcript button — fades in on hover */}
            <button
              type="button"
              onClick={() => onShowTranscript(call)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all duration-200"
              style={{
                background: 'rgba(99,102,241,0.1)',
                color: '#818cf8',
                border: '1px solid rgba(99,102,241,0.2)',
                opacity: hovered ? 1 : 0.3,
              }}
              title="View transcript"
            >
              <MessageSquare size={11} /> Transcript
            </button>
            <StatusBadge status={call.status} />
          </div>
          <LiveDuration startedAt={call.started_at} status={call.status} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setShowTransfer(p => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
          style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}
        >
          <PhoneForwarded size={12} /> Transfer
        </button>

        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
          style={{ background: 'rgba(14,165,233,0.1)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.15)' }}
        >
          <Users size={12} /> Conference
        </button>

        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
          style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
        >
          <Pause size={12} /> Hold
        </button>

        <button
          type="button"
          disabled={ending}
          onClick={handleEnd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ml-auto"
          style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', opacity: ending ? 0.5 : 1 }}
        >
          {ending ? <RefreshCw size={12} className="spin" /> : <PhoneOff size={12} />}
          End
        </button>
      </div>

      {/* Recording row */}
      <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        <span className="text-xs text-gray-600">Recording:</span>
        <RecordingPlayer callId={call.id} hasRecording={!!call.recording_path} />
      </div>

      {showTransfer && (
        <TransferMini
          callId={call.id}
          onTransfer={async (id, dept) => { await onTransfer(id, dept, null); setShowTransfer(false); }}
          onCancel={() => setShowTransfer(false)}
        />
      )}
    </div>
  );
}

// ── History row ───────────────────────────────────────────────────────────────
function HistoryRow({ call, onDelete, onShowTranscript }) {
  const [expanded, setExpanded] = useState(false);

  const routeLabel = call.routes?.length
    ? `→ ${call.routes[call.routes.length - 1].to_department ?? 'Agent'}`
    : '';

  return (
    <>
      <tr
        className="border-b transition-colors duration-150 hover:bg-white/[0.02]"
        style={{ borderColor: 'rgba(255,255,255,0.05)' }}
      >
        {/* Caller */}
        <td className="py-3 px-3">
          <div className="text-sm text-white font-medium whitespace-nowrap">{call.caller_number}</div>
          <div className="text-xs text-gray-600 whitespace-nowrap">{formatDate(call.created_at)}</div>
        </td>

        <td className="py-3 px-3 text-sm text-gray-400 whitespace-nowrap">{call.agent_name ?? '—'}</td>
        <td className="py-3 px-3 text-sm text-gray-400 whitespace-nowrap">{call.department ?? '—'}</td>
        <td className="py-3 px-3 text-sm text-gray-400 whitespace-nowrap">{formatDuration(call.duration_seconds)}</td>

        <td className="py-3 px-3">
          <div className="flex flex-col gap-1">
            <StatusBadge status={call.status} />
            {routeLabel && <span className="text-xs text-purple-400">{routeLabel}</span>}
          </div>
        </td>

        {/* Recording — always shown */}
        <td className="py-3 px-3">
          <RecordingPlayer callId={call.id} hasRecording={!!call.recording_path} />
        </td>

        {/* Transcript — dedicated column */}
        <td className="py-3 px-3">
          <button
            type="button"
            onClick={() => onShowTranscript(call)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap"
            style={{ color: '#818cf8', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            <MessageSquare size={12} /> Transcript
          </button>
        </td>

        {/* Actions */}
        <td className="py-3 px-3">
          <div className="flex items-center gap-1.5">

            {/* Routing expand */}
            {call.routes?.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(p => !p)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150"
                style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.04)' }}
                title="Routing timeline"
              >
                <ChevronDown
                  size={13}
                  style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                />
              </button>
            )}

            {/* Delete (frontend-only) */}
            <button
              type="button"
              onClick={() => onDelete(call.id)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150"
              style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)' }}
              title="Remove from list"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      </tr>

      {/* Routing timeline */}
      {expanded && call.routes?.length > 0 && (
        <tr style={{ background: 'rgba(139,92,246,0.04)' }}>
          <td colSpan={8} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <ChevronRight size={13} className="text-purple-400" />
              <span className="text-xs font-semibold text-gray-300">Routing Timeline</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {call.routes.map((r, i) => (
                <div key={r.id} className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="text-gray-600">{i + 1}.</span>
                  <span className="px-2 py-0.5 rounded-md" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>
                    {r.action_type}
                  </span>
                  <span>{r.from_department ?? 'Unknown'}</span>
                  <ChevronRight size={11} className="text-gray-700" />
                  <span className="text-white">{r.to_department ?? 'Agent'}</span>
                  <span className="ml-auto text-gray-700">{formatTime(r.routed_at)}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ActiveCallsPage() {
  const {
    activeCalls, callHistory, loading, error,
    refresh, handleTransfer, handleEndCall,
  } = useActiveCalls();

  const [search,         setSearch]         = useState('');
  const [deletedIds,     setDeletedIds]     = useState(new Set());
  const [transcriptCall, setTranscriptCall] = useState(null); // lifted modal state

  const handleDelete = useCallback(async (id) => {
    // Optimistically hide immediately
    setDeletedIds(prev => new Set([...prev, id]));
    try {
      await fetch(`${IVR_API}/calls/${id}`, { method: 'DELETE' });
    } catch (_) {
      // If it fails, unhide (restore)
      setDeletedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, []);
  const handleShowTranscript = useCallback((call) => setTranscriptCall(call), []);
  const handleCloseTranscript = useCallback(() => setTranscriptCall(null), []);

  const filtered = callHistory.filter(c =>
    !deletedIds.has(c.id) &&
    (!search ||
      c.caller_number?.includes(search) ||
      c.agent_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.department?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Active Calls</h2>
          <p className="text-xs text-gray-500 mt-0.5">Live monitoring · polls every 3 s</p>
        </div>
        <button type="button" onClick={refresh} className="btn-ghost text-xs gap-1.5 py-2 px-3">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm text-red-300"
          style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}
        >
          <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
          <span>IVR backend unavailable — {error}.{' '}
            <code className="text-xs bg-black/30 px-1.5 py-0.5 rounded">
              python -m uvicorn ivr_backend.app:app --port 8001
            </code>
          </span>
        </div>
      )}

      {/* Live calls */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full" style={{ background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.6)' }} />
          <span className="text-sm font-semibold text-white">Live Calls</span>
          <span className="text-xs text-gray-600 ml-1">({activeCalls.length})</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
            <RefreshCw size={14} className="spin" /> Loading…
          </div>
        ) : activeCalls.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 py-10 rounded-2xl text-center"
            style={{ border: '1px dashed rgba(255,255,255,0.06)' }}
          >
            <Activity size={26} className="text-gray-700" />
            <div>
              <p className="text-sm text-gray-500">No active calls right now</p>
              <p className="text-xs text-gray-700 mt-1">Place a call via the Dialer to see it here</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {activeCalls.map(call => (
              <ActiveCallCard
                key={call.id}
                call={call}
                onEnd={handleEndCall}
                onTransfer={handleTransfer}
                onShowTranscript={handleShowTranscript}
              />
            ))}
          </div>
        )}
      </section>

      {/* Call History */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-gray-500" />
            <span className="text-sm font-semibold text-white">Call History</span>
            <span className="text-xs text-gray-600">({filtered.length})</span>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="input-field text-xs py-1.5 pl-8 pr-3 w-44"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Clock size={22} className="text-gray-700" />
            <p className="text-sm text-gray-600">No call history yet</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-x-auto" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <table className="text-left" style={{ minWidth: '860px', width: '100%' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Caller', 'Agent', 'Dept', 'Duration', 'Status', 'Recording', 'Transcript', ''].map(h => (
                    <th key={h} className="px-3 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(call => (
                  <HistoryRow
                    key={call.id}
                    call={call}
                    onDelete={handleDelete}
                    onShowTranscript={handleShowTranscript}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Transcript modal — rendered OUTSIDE the table to avoid invalid DOM nesting */}
      {transcriptCall && (
        <TranscriptModal
          callId={transcriptCall.id}
          callerNumber={transcriptCall.caller_number}
          onClose={handleCloseTranscript}
        />
      )}
    </div>
  );
}
