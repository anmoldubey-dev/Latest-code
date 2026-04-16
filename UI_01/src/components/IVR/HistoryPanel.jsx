// ======================== Call History Orchestrator ========================
// HistoryPanel -> Administrative interface for auditing historical call records, 
// providing temporal analytics, searchable log registries, and granular 
// transcript retrieval via the backend signaling hub.
// ||
// ||
// ||
// Functions -> HistoryPanel()-> Primary container managing history state:
// ||           |
// ||           |--- load()-> [async Internal Call]: GET /api/calls -> Syncs history registry.
// ||           |    └── silent mode: Logic Branch -> Background refresh without UI blocking.
// ||           |
// ||           |--- handleDelete()-> [Action Trigger]: DELETE /api/calls/:id -> Removes call record.
// ||           |
// ||           |--- TranscriptModal()-> [Sub-component]: Specialized node for deep-dive transcript fetch.
// ||           |    └── fetchTranscript()-> [async Internal Call]: GET /api/calls/:id/transcript.
// ||           |
// ||           └── (Formatting Utils):
// ||                ├── formatDuration()-> Temporal normalization.
// ||                └── formatDate()-> ISO serialization.
// ||
// ===========================================================================

import React, { useState, useEffect } from 'react';
import { Clock, MessageSquare, RefreshCw, Search, Trash2 } from 'lucide-react';
// 🟢 FIX: internal api client use karenge taaki CORS aur BaseURL handle ho jaye
import api from '../../services/api';

// ---------------------------------------------------------------
// SECTION: UTILS & FORMATTERS
// ---------------------------------------------------------------

// Internal Utility -> formatDuration()-> Normalizes temporal duration strings
function formatDuration(s) {
  if (!s && s !== 0) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}

// Internal Utility -> formatDate()-> Serializes ISO timestamps for localized display
function formatDate(iso) {
  if (!iso) return '—';
  const utc = iso.endsWith('Z') ? iso : iso + 'Z';
  return new Date(utc).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------
// SECTION: ATOMIC UI COMPONENTS
// ---------------------------------------------------------------

// Presentation -> StatusBadge()-> Maps call terminal states to themed visual pills
function StatusBadge({ status }) {
  const colors = {
    ended: { bg: 'rgba(100,100,100,0.15)', color: '#8899aa', border: 'rgba(255,255,255,0.06)' },
    transferred: { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: 'rgba(139,92,246,0.2)' },
    connected: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', border: 'rgba(34,197,94,0.2)' },
  };
  const c = colors[status] || colors.ended;
  return (
    <span style={{
      fontSize: '9px', padding: '2px 7px', borderRadius: '3px',
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      textTransform: 'uppercase', letterSpacing: '0.1em',
    }}>
      {status}
    </span>
  );
}

// Initialization -> TranscriptModal()-> Orchestrates the secondary media layer for transcript retrieval
function TranscriptModal({ callId, callerNumber, onClose }) {
  const [items, setItems] = useState(null);

  // 🟢 FIX: Correct API path with /api/calls
  // Sub-process -> fetchTranscript(): Executes asynchronous fetch for specific session dialogue
  useEffect(() => {
    const fetchTranscript = async () => {
      try {
        const endpoint = api.defaults?.baseURL?.endsWith('/api') ? `/calls/${callId}/transcript` : `/api/calls/${callId}/transcript`;
        const response = await api.get(endpoint);
        const data = response.data || response;
        setItems(Array.isArray(data) ? data : data.items || []);
      } catch (e) {
        setItems([]);
      }
    };
    fetchTranscript();
  }, [callId]);

  // Sub-process -> Keyboard listener: Handles escape-key terminal action for modal closure
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const speakerColor = { agent: '#818cf8', caller: '#22c55e', system: '#5a7a9a' };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '480px', maxHeight: '80vh',
          background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '14px', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={13} style={{ color: '#818cf8' }} />
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#e8f0f8' }}>Transcript</span>
            <span style={{ fontSize: '11px', color: '#5a7a9a' }}>· {callerNumber}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5a7a9a', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {!items ? (
            <div style={{ fontSize: '11px', color: '#5a7a9a' }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ fontSize: '11px', color: '#5a7a9a' }}>No transcript available.</div>
          ) : items.map((e, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '10px' }}>
              <span style={{ fontSize: '10px', minWidth: '44px', textAlign: 'right', paddingTop: '2px', color: speakerColor[e.speaker] || '#5a7a9a', fontWeight: 500 }}>
                {e.speaker}
              </span>
              <div style={{
                flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px', padding: '7px 10px', fontSize: '11px', color: '#c4cdd8', lineHeight: 1.5,
              }}>
                {e.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// SECTION: MAIN PANEL COMPONENT
// ---------------------------------------------------------------

// Initialization -> HistoryPanel()-> Main functional entry point for the call auditing interface
export default function HistoryPanel() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleted, setDeleted] = useState(new Set());
  const [transcript, setTranscript] = useState(null);

  // 🌟 TARGET C: AUTO-LIVE REFRESH LOGIC 🌟
  // silent=true flag ensures we don't show the "Loading..." text during background refreshes
  // Internal Call -> load()-> Aggregates history stream from the signaling gateway
  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const endpoint = api.defaults?.baseURL?.endsWith('/api') ? '/calls?limit=50' : '/api/calls?limit=50';
      const response = await api.get(endpoint);
      const data = response.data || response;
      setHistory(Array.isArray(data) ? data : data.items || []);
    } catch (_) {
      if (!silent) setHistory([]);
    }
    finally {
      if (!silent) setLoading(false);
    }
  };

  // Har 5 second mein chup-chaap data refresh hoga
  // Lifecycle -> Auto-refresh: Orchestrates 5s silent polling for real-time history synchronization
  useEffect(() => {
    load(); // Initial load with loader

    const interval = setInterval(() => {
      load(true); // Silent background load every 5 seconds
    }, 5000);

    return () => clearInterval(interval); // Cleanup on unmount
  }, []);

  // Action Trigger -> handleDelete()-> Dispatches deletion request for targeted session record
  const handleDelete = async (id) => {
    setDeleted(prev => new Set([...prev, id]));
    try {
      const endpoint = api.defaults?.baseURL?.endsWith('/api') ? `/calls/${id}` : `/api/calls/${id}`;
      await api.delete(endpoint);
    } catch (_) { }
  };

  // Logic Branch -> filtering: Computes visibility based on search criteria and local deletion state
  const filtered = history.filter(c =>
    !deleted.has(c.id) &&
    (!search || c.caller_number?.includes(search) || c.department?.toLowerCase().includes(search.toLowerCase()))
  );

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#e8f0f8' }}>Call History</div>
          <div style={{ fontSize: '10px', color: '#5a7a9a', marginTop: '2px' }}>{filtered.length} records</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#5a7a9a' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px', padding: '6px 10px 6px 28px', color: '#e8f0f8',
                fontSize: '11px', width: '160px', outline: 'none', fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
          <button onClick={() => load()} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', padding: '6px 10px', color: '#8899aa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: '11px', color: '#5a7a9a' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: '11px', color: '#5a7a9a', textAlign: 'center', padding: '40px 0' }}>No call history yet</div>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Caller', 'Department', 'Duration', 'Status', 'Date', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: '9px', color: '#5a7a9a', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'left', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: '11px', color: '#e8f0f8', fontWeight: 500 }}>{c.caller_number}</div>
                    <div style={{ fontSize: '10px', color: '#5a7a9a' }}>{c.agent_name || '—'}</div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '11px', color: '#8899aa' }}>{c.department || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: '11px', color: '#8899aa', fontFamily: 'monospace' }}>{formatDuration(c.duration_seconds)}</td>
                  <td style={{ padding: '10px 14px' }}><StatusBadge status={c.status} /></td>
                  <td style={{ padding: '10px 14px', fontSize: '10px', color: '#5a7a9a' }}>{formatDate(c.created_at)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setTranscript(c)} style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '6px', padding: '3px 9px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MessageSquare size={10} /> Transcript
                      </button>
                      <button onClick={() => handleDelete(c.id)} style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: 'none', borderRadius: '6px', padding: '3px 7px', cursor: 'pointer' }}>
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {transcript && (
        <TranscriptModal
          callId={transcript.id}
          callerNumber={transcript.caller_number}
          onClose={() => setTranscript(null)}
        />
      )}
    </div>
  );
}