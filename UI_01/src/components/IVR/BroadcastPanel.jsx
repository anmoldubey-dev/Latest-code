import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DEPARTMENTS } from '../../constants/departments.js';
import { Room, RoomEvent, Track } from 'livekit-client';
import {
  Radio, Users, Play, Square, Send, Mail,
  Copy, Check, RefreshCw, Clock, Volume2, VolumeX,
  FileText, Plus, Trash2, AlertCircle, CheckCircle,
} from 'lucide-react';

// ======================== Broadcast & Email Orchestrator ========================
// BroadcastPanel -> Multi-channel communication hub managing real-time WebRTC 
// voice broadcasting via LiveKit and automated SMTP email campaign dispatching.
// ||
// ||
// ||
// Functions -> BroadcastPanel()-> Primary container managing dual-stream communication:
// ||           |
// ||           |--- BROADCAST ORCHESTRATION:
// ||           |    ├── fetchActive() / fetchHistory()-> [async Internal Call]: Syncs broadcast registry.
// ||           |    ├── handleStart()-> [Action Trigger]: Initiates LiveKit Room & Speaker token.
// ||           |    ├── handleEnd()-> [Action Trigger]: Terminates signaling and closes media tracks.
// ||           |    └── handleMute()-> [Action Trigger]: Logic Branch -> Toggles local track state.
// ||           |
// ||           |--- EMAIL AUTOMATION:
// ||           |    ├── fetchEmailCampaigns() / fetchEmailTemplates()-> [async Internal Call]: Hydrates CRM state.
// ||           |    ├── handleEmailSend()-> [Action Trigger]: Dispatches multi-recipient payload to SMTP gateway.
// ||           |    ├── handleCreateTemplate()-> [Action Trigger]: Commits HTML templates to the database.
// ||           |    └── parseRecipients()-> [Internal Utility]: Serializes CSV-style input into object arrays.
// ||           |
// ||           └── formatDuration()-> [Internal Utility]: Normalizes temporal strings for telemetry display.
// ||
// ===============================================================================

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880';

// ---------------------------------------------------------------
// SECTION: INTERNAL UTILITIES
// ---------------------------------------------------------------

// Internal Utility -> formatDuration()-> Converts raw seconds into human-readable minutes/seconds
function formatDuration(s) {
  if (!s && s !== 0) return '0s';
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}m ${sec}s`;
}

// ---------------------------------------------------------------
// SECTION: MAIN PANEL COMPONENT
// ---------------------------------------------------------------

export default function BroadcastPanel() {

  // ---------------------------------------------------------------
  // SECTION: GLOBAL STATE MANAGEMENT
  // ---------------------------------------------------------------

  // Main Navigation State
  const [mainTab, setMainTab] = useState('broadcast');

  // Broadcast Orchestration State
  const [tab, setTab] = useState('create');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [department, setDepartment] = useState('General');
  const [maxListeners, setMaxListeners] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeBroadcast, setActiveBroadcast] = useState(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [listenerCount, setListenerCount] = useState(0);
  const [duration, setDuration] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [muted, setMuted] = useState(false);
  const [activeBroadcasts, setActiveBroadcasts] = useState([]);
  const [historyBroadcasts, setHistoryBroadcasts] = useState([]);
  const roomRef = useRef(null);
  const timerRef = useRef(null);

  // Email Campaign State
  const [emailTab, setEmailTab] = useState('compose');
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [emailCampaigns, setEmailCampaigns] = useState([]);
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState('');
  const [emailTitle, setEmailTitle] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSenderName, setEmailSenderName] = useState('SR Comsoft');
  const [emailDept, setEmailDept] = useState('General');
  const [emailRecipientText, setEmailRecipientText] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [emailSchedule, setEmailSchedule] = useState('');
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplCategory, setTplCategory] = useState('General');

  // Auth context integration
  const token = sessionStorage.getItem("token");
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
  const authHeadersOnly = {
    'Authorization': `Bearer ${token}`
  };

  // ---------------------------------------------------------------
  // SECTION: VOICE BROADCAST LOGIC (WEBRTC)
  // ---------------------------------------------------------------

  // Internal Call -> fetchActive()-> Retrieves current live sessions from the signaling server
  const fetchActive = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/webrtc/broadcast/active`, { headers: authHeadersOnly });
      if (res.ok) setActiveBroadcasts(await res.json());
    } catch (_) { /* Error silenced to preserve UI stability */ }
  }, [token]);

  // Internal Call -> fetchHistory()-> Retrieves historical broadcast metadata
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/webrtc/broadcast/history?limit=20`, { headers: authHeadersOnly });
      if (res.ok) setHistoryBroadcasts(await res.json());
    } catch (_) { /* Error silenced to preserve UI stability */ }
  }, [token]);

  // Initialization -> Lifecycle hook for persistent broadcast monitoring
  useEffect(() => {
    fetchActive();
    fetchHistory();
    const interval = setInterval(fetchActive, 5000);
    return () => clearInterval(interval);
  }, [fetchActive, fetchHistory]);

  // Sub-process -> Temporal Tracker: Manages live duration stopwatch for active sessions
  useEffect(() => {
    if (broadcasting) {
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setDuration(0);
    }
    return () => clearInterval(timerRef.current);
  }, [broadcasting]);

  // Action Trigger -> handleStart()-> Orchestrates the transition to live WebRTC broadcasting
  const handleStart = useCallback(async () => {
    if (!title.trim()) { setError('Please enter a broadcast title.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/webrtc/broadcast/start`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ title: title.trim(), department, message: message.trim() || null, max_listeners: maxListeners, speaker_name: 'Agent' }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `Failed (${res.status})`); }
      const data = await res.json();
      setActiveBroadcast(data);

      const room = new Room();
      roomRef.current = room;
      room.on(RoomEvent.ParticipantConnected, () => setListenerCount(p => p + 1));
      room.on(RoomEvent.ParticipantDisconnected, () => setListenerCount(p => Math.max(0, p - 1)));
      room.on(RoomEvent.Connected, () => setBroadcasting(true));

      await room.connect(LIVEKIT_URL, data.speaker_token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setTab('active');
      fetchActive();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [title, department, message, maxListeners, fetchActive, authHeaders]);

  // Action Trigger -> handleEnd()-> Gracefully terminates the WebRTC room and cleans up signaling
  const handleEnd = useCallback(async () => {
    if (!activeBroadcast) return;
    try {
      await fetch(`${API_BASE}/api/webrtc/broadcast/${activeBroadcast.id}/end`, {
        method: 'POST',
        headers: authHeadersOnly
      });
    } catch (_) { }
    roomRef.current?.disconnect();
    setBroadcasting(false); setActiveBroadcast(null); setListenerCount(0); setTab('create');
    fetchActive(); fetchHistory();
  }, [activeBroadcast, fetchActive, fetchHistory, token]);

  // Action Trigger -> handleMute()-> Toggles the hardware state of the speaker's microphone track
  const handleMute = useCallback(() => {
    if (!roomRef.current) return;
    const next = !muted;
    roomRef.current.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [muted]);

  // Action Trigger -> copyJoinLink()-> Serializes the listener gateway URL to the clipboard
  const copyJoinLink = useCallback((broadcastId) => {
    const link = `${window.location.origin}/broadcast/${broadcastId}/listen`;
    navigator.clipboard.writeText(link).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 3000); }).catch(() => { });
  }, []);

  // ---------------------------------------------------------------
  // SECTION: EMAIL AUTOMATION LOGIC (SMTP)
  // ---------------------------------------------------------------

  // Internal Call -> fetchEmailStatus()-> Verifies SMTP relay connectivity
  const fetchEmailStatus = useCallback(async () => {
    try { const res = await fetch(`${API_BASE}/api/email/status`, { headers: authHeadersOnly }); setEmailStatus(await res.json()); } catch (_) { }
  }, [token]);

  // Internal Call -> fetchEmailTemplates()-> Synchronizes available HTML messaging templates
  const fetchEmailTemplates = useCallback(async () => {
    try { const res = await fetch(`${API_BASE}/api/email/templates`, { headers: authHeadersOnly }); const data = await res.json(); if (Array.isArray(data)) setEmailTemplates(data); } catch (_) { }
  }, [token]);

  // Internal Call -> fetchEmailCampaigns()-> Retrieves historical and pending email logs
  const fetchEmailCampaigns = useCallback(async () => {
    try { const res = await fetch(`${API_BASE}/api/email/campaigns`, { headers: authHeadersOnly }); const data = await res.json(); if (Array.isArray(data)) setEmailCampaigns(data); } catch (_) { }
  }, [token]);

  // Initialization -> Selective sync based on main communication channel
  useEffect(() => {
    if (mainTab === 'email') { fetchEmailStatus(); fetchEmailTemplates(); fetchEmailCampaigns(); }
  }, [mainTab, fetchEmailStatus, fetchEmailTemplates, fetchEmailCampaigns]);

  // Action Trigger -> seedTemplates()-> Bootstraps system-standard email templates
  const seedTemplates = async () => {
    await fetch(`${API_BASE}/api/email/templates/seed`, { method: 'POST', headers: authHeadersOnly });
    fetchEmailTemplates();
  };

  // Internal Utility -> parseRecipients()-> Sanitizes raw multi-line strings into relational recipient schemas
  const parseRecipients = (text) => {
    return text.split('\n').map(l => l.trim()).filter(l => l.includes('@')).map(line => {
      const parts = line.split(',').map(p => p.trim());
      return { email: parts[0] || '', name: parts[1] || parts[0]?.split('@')[0] || '', phone: parts[2] || '' };
    });
  };

  // Action Trigger -> handleTemplateSelect()-> Populates the composer with a specific template context
  const handleTemplateSelect = (tpl) => {
    setSelectedTemplate(tpl); setEmailSubject(tpl.subject); setEmailBody(tpl.body_html); setEmailTitle(tpl.name);
  };

  // Action Trigger -> handleEmailSend()-> Initiates background campaign processing via SMTP gateway
  const handleEmailSend = async () => {
    const recipients = parseRecipients(emailRecipientText);
    if (!recipients.length) { setError('Add at least one recipient email.'); return; }
    if (!emailSubject.trim()) { setError('Subject line is required.'); return; }
    if (!emailBody.trim()) { setError('Email body is required.'); return; }

    setError('');
    setEmailSending(true);
    setEmailSuccess('');
    try {
      const res = await fetch(`${API_BASE}/api/email/send`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({
          title: emailTitle || emailSubject, subject: emailSubject, body_html: emailBody,
          sender_name: emailSenderName, department: emailDept, recipients, variables: {},
          schedule_at: emailSchedule || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEmailSuccess(`Campaign created! Automatically sending in background...`);
        setEmailTitle(''); setEmailSubject(''); setEmailBody(''); setEmailRecipientText('');
        setSelectedTemplate(null); setEmailSchedule('');
        setTimeout(() => { fetchEmailCampaigns(); setEmailSuccess(''); }, 4000);
      } else { setError(data.detail || 'Failed to send campaign automatically.'); }
    } catch (err) { setError('Network Error: ' + err.message); } finally { setEmailSending(false); }
  };

  // Action Trigger -> handleCreateTemplate()-> Persists a custom HTML template for future campaigns
  const handleCreateTemplate = async () => {
    if (!tplName || !tplSubject || !tplBody) { alert('Fill all template fields'); return; }
    try {
      await fetch(`${API_BASE}/api/email/templates`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ name: tplName, subject: tplSubject, body_html: tplBody, category: tplCategory }),
      });
      setShowTemplateForm(false); setTplName(''); setTplSubject(''); setTplBody('');
      fetchEmailTemplates();
    } catch (err) { alert('Error: ' + err.message); }
  };

  // ---------------------------------------------------------------
  // SECTION: STYLES & DESIGN TOKENS
  // ---------------------------------------------------------------

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
    padding: '11px 14px', color: '#e8f0f8', fontSize: '13px',
    fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: '10px', color: '#5a7a9a', marginBottom: '6px' };
  const emailStatusColor = { draft: '#5a7a9a', scheduled: '#f59e0b', sending: '#818cf8', completed: '#22c55e', failed: '#ef4444', cancelled: '#94a3b8' };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#e8f0f8', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {mainTab === 'broadcast' ? <Radio size={18} color="#f97316" /> : <Mail size={18} color="#818cf8" />}
            {mainTab === 'broadcast' ? 'Broadcast & Notifications' : 'Email Automation'}
          </div>
          <div style={{ fontSize: '11px', color: '#5a7a9a', marginTop: '2px' }}>
            {mainTab === 'broadcast' ? 'One-to-many audio broadcast' : 'Send broadcast emails, reminders & notifications'}
          </div>
        </div>
        {broadcasting && mainTab === 'broadcast' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#f97316' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#f97316', animation: 'pulse 1.5s infinite' }} />
            LIVE · {formatDuration(duration)}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', padding: '4px' }}>
        <button onClick={() => setMainTab('broadcast')} style={{
          flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
          border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          background: mainTab === 'broadcast' ? 'rgba(249,115,22,0.15)' : 'transparent',
          color: mainTab === 'broadcast' ? '#f97316' : '#5a7a9a',
        }}>
          <Radio size={14} /> Voice Broadcast
        </button>
        <button onClick={() => setMainTab('email')} style={{
          flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
          border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          background: mainTab === 'email' ? 'rgba(129,140,248,0.15)' : 'transparent',
          color: mainTab === 'email' ? '#818cf8' : '#5a7a9a',
        }}>
          <Mail size={14} /> Email Campaign
        </button>
      </div>

      {mainTab === 'broadcast' && (
        <>
          <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {[
              { id: 'create', label: 'New Broadcast', icon: Radio },
              { id: 'active', label: `Active (${activeBroadcasts.length})`, icon: Volume2 },
              { id: 'history', label: 'History', icon: Clock },
            ].map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'active') fetchActive(); if (t.id === 'history') fetchHistory(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '10px 16px', fontSize: '12px', fontWeight: 500,
                  color: tab === t.id ? '#f97316' : '#5a7a9a',
                  background: tab === t.id ? 'rgba(249,115,22,0.1)' : 'transparent',
                  border: 'none', borderBottom: tab === t.id ? '2px solid #f97316' : '2px solid transparent',
                  cursor: 'pointer', marginBottom: '-1px',
                }}>
                <t.icon size={13} /> {t.label}
              </button>
            ))}
          </div>

          {tab === 'create' && !broadcasting && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div><div style={labelStyle}>Broadcast Title *</div><input value={title} onChange={e => { setTitle(e.target.value); setError(''); }} placeholder="e.g. Company Announcement" style={inputStyle} maxLength={100} /></div>
              <div><div style={labelStyle}>Department</div><select value={department} onChange={e => setDepartment(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>{DEPARTMENTS.map(d => <option key={d} value={d} style={{ background: '#0e1419' }}>{d}</option>)}</select></div>
              <div><div style={labelStyle}>AI Message (optional)</div><textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Leave empty to speak live" rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></div>
              <div><div style={labelStyle}>Max Listeners</div><input type="number" value={maxListeners} onChange={e => setMaxListeners(parseInt(e.target.value) || 100)} min={1} max={1000} style={{ ...inputStyle, width: '120px' }} /></div>
              {error && <div style={{ fontSize: '11px', color: '#f87171', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '9px 12px' }}>{error}</div>}
              <button onClick={handleStart} disabled={loading} style={{ background: loading ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #f97316, #ea580c)', border: 'none', borderRadius: '10px', padding: '14px', color: loading ? '#5a7a9a' : '#fff', fontSize: '13px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {loading ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Starting…</> : <><Radio size={16} /> Start Broadcast</>}
              </button>
            </div>
          )}

          {tab === 'create' && broadcasting && activeBroadcast && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#f97316', marginBottom: '8px' }}>📡 Broadcasting Live</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#e8f0f8', marginBottom: '4px' }}>{activeBroadcast.title}</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '12px' }}>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: '24px', fontWeight: 700, color: '#22c55e' }}>{listenerCount}</div><div style={{ fontSize: '10px', color: '#5a7a9a' }}>Listeners</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: '24px', fontWeight: 700, color: '#f97316' }}>{formatDuration(duration)}</div><div style={{ fontSize: '10px', color: '#5a7a9a' }}>Duration</div></div>
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '10px', color: '#5a7a9a', marginBottom: '6px' }}>Share link:</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input readOnly value={`${window.location.origin}/broadcast/${activeBroadcast.id}/listen`} style={{ ...inputStyle, flex: 1, fontSize: '11px' }} />
                  <button onClick={() => copyJoinLink(activeBroadcast.id)} style={{ background: linkCopied ? 'rgba(34,197,94,0.15)' : 'rgba(249,115,22,0.12)', border: `1px solid ${linkCopied ? 'rgba(34,197,94,0.3)' : 'rgba(249,115,22,0.25)'}`, borderRadius: '8px', padding: '8px 14px', color: linkCopied ? '#22c55e' : '#f97316', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {linkCopied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleMute} style={{ flex: 1, background: muted ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)', color: muted ? '#f87171' : '#8899aa', border: `1px solid ${muted ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.07)'}`, borderRadius: '8px', padding: '10px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  {muted ? <><VolumeX size={14} /> Muted</> : <><Volume2 size={14} /> Mic On</>}
                </button>
                <button onClick={handleEnd} style={{ flex: 1, background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Square size={14} /> End Broadcast
                </button>
              </div>
            </div>
          )}

          {tab === 'active' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeBroadcasts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#5a7a9a', fontSize: '12px' }}><Radio size={24} color="#3a4a5a" style={{ marginBottom: '8px' }} /><div>No active broadcasts</div></div>
              ) : activeBroadcasts.map(b => (
                <div key={b.id} style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><div style={{ fontSize: '13px', fontWeight: 600, color: '#e8f0f8' }}>{b.title}</div><div style={{ fontSize: '10px', color: '#5a7a9a', marginTop: '2px' }}>{b.speaker_name} · {b.department} · {b.listener_count} listeners</div></div>
                  <button onClick={() => copyJoinLink(b.id)} style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: '6px', padding: '6px 10px', color: '#f97316', fontSize: '10px', cursor: 'pointer' }}><Copy size={11} /> Link</button>
                </div>
              ))}
            </div>
          )}

          {tab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {historyBroadcasts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#5a7a9a', fontSize: '12px' }}>No broadcast history yet</div>
              ) : historyBroadcasts.map(b => (
                <div key={b.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'space-between' }}>
                  <div><div style={{ fontSize: '12px', fontWeight: 500, color: '#e8f0f8' }}>{b.title}</div><div style={{ fontSize: '10px', color: '#5a7a9a' }}>{b.listener_count} listeners · {formatDuration(b.duration_seconds)}</div></div>
                  <div style={{ fontSize: '10px', color: '#5a7a9a' }}>{b.started_at ? new Date(b.started_at + 'Z').toLocaleDateString() : '—'}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {mainTab === 'email' && (
        <>
          {emailStatus && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{
                fontSize: '10px', padding: '4px 10px', borderRadius: '12px',
                background: emailStatus.configured ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: emailStatus.configured ? '#22c55e' : '#ef4444',
                border: `1px solid ${emailStatus.configured ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              }}>
                {emailStatus.configured ? '✔ SMTP Connected' : '✕ SMTP Not Configured'}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {[
              { id: 'compose', label: 'Compose', icon: Send },
              { id: 'templates', label: 'Templates', icon: FileText },
              { id: 'history', label: 'History', icon: Clock },
            ].map(t => (
              <button key={t.id} onClick={() => setEmailTab(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 16px', fontSize: '12px', fontWeight: 500,
                color: emailTab === t.id ? '#818cf8' : '#5a7a9a',
                background: emailTab === t.id ? 'rgba(129,140,248,0.1)' : 'transparent',
                border: 'none', borderBottom: emailTab === t.id ? '2px solid #818cf8' : '2px solid transparent',
                cursor: 'pointer', marginBottom: '-1px',
              }}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>

          {emailTab === 'compose' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {emailSuccess && (
                <div style={{ padding: '12px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', color: '#22c55e', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle size={14} /> {emailSuccess}
                </div>
              )}

              <div>
                <div style={labelStyle}>Use Template</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {emailTemplates.map(t => (
                    <button key={t.id} onClick={() => handleTemplateSelect(t)} style={{
                      padding: '6px 12px', borderRadius: '7px', fontSize: '10px', cursor: 'pointer',
                      border: selectedTemplate?.id === t.id ? '1px solid rgba(129,140,248,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      background: selectedTemplate?.id === t.id ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.03)',
                      color: selectedTemplate?.id === t.id ? '#818cf8' : '#5a7a9a',
                    }}>{t.name}</button>
                  ))}
                  {emailTemplates.length === 0 && (
                    <button onClick={seedTemplates} style={{ padding: '6px 12px', borderRadius: '7px', fontSize: '10px', border: '1px solid rgba(129,140,248,0.2)', background: 'rgba(129,140,248,0.08)', color: '#818cf8', cursor: 'pointer' }}>+ Load Defaults</button>
                  )}
                </div>
              </div>

              <div><div style={labelStyle}>Campaign Title</div><input value={emailTitle} onChange={e => setEmailTitle(e.target.value)} placeholder="e.g. March Payment Reminder" style={inputStyle} /></div>
              <div><div style={labelStyle}>Subject Line</div><input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Email subject..." style={inputStyle} /></div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><div style={labelStyle}>Department</div><select value={emailDept} onChange={e => setEmailDept(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>{DEPARTMENTS.map(d => <option key={d} value={d} style={{ background: '#0e1419' }}>{d}</option>)}</select></div>
                <div><div style={labelStyle}>Sender Name</div><input value={emailSenderName} onChange={e => setEmailSenderName(e.target.value)} style={inputStyle} /></div>
              </div>

              <div>
                <div style={labelStyle}><Users size={12} style={{ marginRight: '4px' }} />Recipients <span style={{ fontSize: '9px', color: '#3a4a5a' }}>(one per line: email, name)</span></div>
                <textarea value={emailRecipientText} onChange={e => setEmailRecipientText(e.target.value)}
                  placeholder={"john@example.com, John Doe\njane@example.com, Jane Smith"}
                  rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                <div style={{ fontSize: '10px', color: '#3a4a5a', marginTop: '4px' }}>{parseRecipients(emailRecipientText).length} valid recipient(s)</div>
              </div>

              <div>
                <div style={labelStyle}>Email Body (HTML) <span style={{ fontSize: '9px', color: '#3a4a5a' }}>Variables: {'{{name}}'}, {'{{email}}'}, {'{{date}}'}</span></div>
                <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)}
                  placeholder="<h1>Hello {{name}}</h1><p>Your message here...</p>"
                  rows={8} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, fontFamily: 'monospace', fontSize: '11px' }} />
              </div>

              <div><div style={labelStyle}>Schedule <span style={{ fontSize: '9px', color: '#3a4a5a' }}>(leave empty for immediate)</span></div><input type="datetime-local" value={emailSchedule} onChange={e => setEmailSchedule(e.target.value)} style={inputStyle} /></div>

              {error && <div style={{ fontSize: '11px', color: '#f87171', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '9px 12px', marginTop: '10px' }}>{error}</div>}

              <button onClick={handleEmailSend} disabled={emailSending} style={{
                background: emailSending ? 'rgba(129,140,248,0.1)' : 'linear-gradient(135deg,#6366f1,#4f46e5)',
                border: 'none', borderRadius: '10px', padding: '14px', color: emailSending ? '#818cf8' : '#fff',
                fontSize: '13px', fontWeight: 700, cursor: emailSending ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: emailSending ? 'none' : '0 4px 20px rgba(99,102,241,0.3)',
              }}>
                {emailSending ? '⟳ Sending...' : <><Send size={16} /> Send Campaign</>}
              </button>
            </div>
          )}

          {emailTab === 'templates' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', color: '#5a7a9a' }}>{emailTemplates.length} template(s)</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={seedTemplates} style={{ fontSize: '11px', color: '#818cf8', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: '7px', padding: '6px 12px', cursor: 'pointer' }}>Load Defaults</button>
                  <button onClick={() => setShowTemplateForm(!showTemplateForm)} style={{ fontSize: '11px', color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '7px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}><Plus size={12} /> New</button>
                </div>
              </div>

              {showTemplateForm && (
                <div style={{ background: '#0e1419', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input value={tplName} onChange={e => setTplName(e.target.value)} placeholder="Template name" style={inputStyle} />
                  <input value={tplSubject} onChange={e => setTplSubject(e.target.value)} placeholder="Subject line" style={inputStyle} />
                  <select value={tplCategory} onChange={e => setTplCategory(e.target.value)} style={inputStyle}>{DEPARTMENTS.map(d => <option key={d} value={d} style={{ background: '#0e1419' }}>{d}</option>)}</select>
                  <textarea value={tplBody} onChange={e => setTplBody(e.target.value)} placeholder="HTML body..." rows={6} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '11px' }} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleCreateTemplate} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', cursor: 'pointer' }}>Save</button>
                    <button onClick={() => setShowTemplateForm(false)} style={{ background: 'rgba(255,255,255,0.04)', color: '#5a7a9a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gap: '10px' }}>
                {emailTemplates.map(t => (
                  <div key={t.id} style={{ background: '#0e1419', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#e8f0f8' }}>{t.name}</div>
                      <div style={{ fontSize: '11px', color: '#5a7a9a', marginTop: '2px' }}>Subject: {t.subject}</div>
                      <span style={{ fontSize: '9px', color: '#818cf8', background: 'rgba(129,140,248,0.1)', padding: '2px 8px', borderRadius: '6px', marginTop: '4px', display: 'inline-block' }}>{t.category}</span>
                    </div>
                    <button onClick={() => { handleTemplateSelect(t); setEmailTab('compose'); }} style={{ background: 'rgba(129,140,248,0.1)', color: '#818cf8', border: '1px solid rgba(129,140,248,0.2)', borderRadius: '8px', padding: '8px 14px', fontSize: '11px', cursor: 'pointer' }}>Use</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {emailTab === 'history' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', color: '#5a7a9a' }}>{emailCampaigns.length} campaign(s)</span>
                <button onClick={fetchEmailCampaigns} style={{ fontSize: '11px', color: '#5a7a9a', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '7px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}><RefreshCw size={12} /> Refresh</button>
              </div>
              <div style={{ display: 'grid', gap: '10px' }}>
                {emailCampaigns.length === 0 && (
                  <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.08)' }}>
                    <Mail size={24} color="#2a3a4a" style={{ marginBottom: '8px' }} /><div style={{ color: '#5a7a9a', fontSize: '12px' }}>No campaigns yet</div>
                  </div>
                )}
                {emailCampaigns.map(c => (
                  <div key={c.id} style={{ background: '#0e1419', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#e8f0f8' }}>{c.title}</div>
                        <div style={{ fontSize: '11px', color: '#5a7a9a', marginTop: '2px' }}>Subject: {c.subject}</div>
                      </div>
                      <span style={{ fontSize: '9px', padding: '3px 10px', borderRadius: '8px', fontWeight: 600, background: `${emailStatusColor[c.status] || '#5a7a9a'}20`, color: emailStatusColor[c.status] || '#5a7a9a', textTransform: 'uppercase' }}>{c.status}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '20px', marginTop: '12px', fontSize: '11px', color: '#5a7a9a' }}>
                      <span>📧 {c.total_recipients} recipients</span>
                      <span style={{ color: '#22c55e' }}>✔ {c.sent_count} sent</span>
                      {c.failed_count > 0 && <span style={{ color: '#ef4444' }}>✕ {c.failed_count} failed</span>}
                      <span>📅 {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}