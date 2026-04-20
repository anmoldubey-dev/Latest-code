import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ======================== Settings Governance Orchestrator ========================
// Settings -> Root administrative control plane for platform configuration. 
// Orchestrates the lifecycle of AI Agent nodes, SMTP telemetry, temporal 
// operational bounds (Business Hours), and the routing engine's policy 
// registry (Departments).
// ||
// ||
// ||
// Functions -> Settings()-> Primary functional entry point for global config:
// ||           |
// ||           |--- fetchAgents()-> [async Action Trigger]: GET /api/agents -> 
// ||           |    Synchronizes the local agent registry with background polling.
// ||           |
// ||           |--- handleSave()-> [async Action Trigger]: PUT/POST /api/agents -> 
// ||           |    Persists agent schema modifications to the relational database.
// ||           |
// ||           |--- saveCcConfig()-> [async Action Trigger]: PUT /api/admin/config -> 
// ||           |    Commits SMTP and temporal window updates to the signaling hub.
// ||           |
// ||           └── AgentModal()-> [Sub-module]: Transactional buffer for agent 
// ||                metadata entry and schema validation.
// ||
// =================================================================================

// ✅ VITE FIX: Added API Base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ---------------------------------------------------------------
// SECTION: DESIGN TOKENS (STYLES & COLORS)
// ---------------------------------------------------------------

const RISK_COLORS = {
  high: { bg: "rgba(239,68,68,0.1)", color: "#EF4444", border: "rgba(239,68,68,0.3)" },
  medium: { bg: "rgba(245,158,11,0.1)", color: "#F59E0B", border: "rgba(245,158,11,0.3)" },
  low: { bg: "rgba(16,185,129,0.1)", color: "#10B981", border: "rgba(16,185,129,0.3)" },
};

const STATUS_COLORS = {
  active: { bg: "rgba(16,185,129,0.1)", color: "#10B981", border: "rgba(16,185,129,0.3)" },
  stopped: { bg: "rgba(239,68,68,0.1)", color: "#EF4444", border: "rgba(239,68,68,0.3)" },
};

const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", fontSize: 13, padding: "10px 14px", outline: "none", width: "100%", fontFamily: "inherit", transition: "border-color 0.2s", boxSizing: "border-box" };

// ---------------------------------------------------------------
// SECTION: PRESENTATION NODES (BADGES & FIELDS)
// ---------------------------------------------------------------

function RiskBadge({ level }) {
  // Initialization -> RiskBadge()-> Maps risk-level hierarchy to visual design tokens
  const l = (level || "low").toLowerCase();
  const s = RISK_COLORS[l] || RISK_COLORS.low;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {level || "Low"}
    </span>
  );
}

function StatusBadge({ status }) {
  // Initialization -> StatusBadge()-> Maps agent availability status to UI colors
  const s = STATUS_COLORS[status] || STATUS_COLORS.active;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status === "stopped" ? "Stopped" : "Active"}
    </span>
  );
}

function FormField({ label, children }) {
  // Presentation -> FormField()-> Wraps input nodes with semantic labeling
  return (<div style={{ display: "flex", flexDirection: "column", gap: 6 }}> <label style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px" }}>{label}</label>{children}</div>);
}

// ---------------------------------------------------------------
// SECTION: BUFFER MODULES (MODALS & DIALOGS)
// ---------------------------------------------------------------

const EMPTY_FORM = { name: "", model_variant: "", skill_level: "", risk_level: "Low", csat_score: "", avg_latency_ms: "", workload_percent: "" };
const SKILL_OPTIONS = ["Junior", "Mid", "Senior", "Expert"];
const RISK_OPTIONS = ["Low", "Medium", "High"];
const MODEL_OPTIONS = ["GPT-4o", "GPT-4", "Claude-3", "Gemini-Pro", "Custom"];

function AgentModal({ agent, onClose, onSave }) {
  // Initialization -> AgentModal()-> Manages transient state for agent registration/editing
  const [form, setForm] = useState(() => agent ? { id: agent.id, name: agent.name || "", model_variant: agent.model_variant || "", skill_level: agent.skill_level || "", risk_level: agent.risk_level || "Low", csat_score: agent.csat_score ?? "", avg_latency_ms: agent.avg_latency_ms ?? "", workload_percent: agent.workload_percent ?? "" } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!agent?.id;
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Action Trigger -> handleSave()-> Executes input validation and dispatches save signal
  const handleSave = async () => {
    if (!form.name.trim()) { setError("Agent name is required."); return; }
    setError("");
    setSaving(true);
    const success = await onSave(form, isEdit);
    setSaving(false);
    if (!success) setError("Failed to save. Please try again.");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#0f172a", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 20, padding: 32, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}><h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{isEdit ? "Edit Agent" : "Add New Agent"}</h2><button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 20 }}>✕</button></div>
        {error && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#EF4444" }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <FormField label="Agent Name"><input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Support Bot Alpha" /></FormField>
          <FormField label="Model Variant"><select style={inputStyle} value={form.model_variant} onChange={e => set("model_variant", e.target.value)}><option value="">Select model</option>{MODEL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></FormField>
          <FormField label="Skill Level"><select style={inputStyle} value={form.skill_level} onChange={e => set("skill_level", e.target.value)}><option value="">Select level</option>{SKILL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></FormField>
          <FormField label="Risk Level"><select style={inputStyle} value={form.risk_level} onChange={e => set("risk_level", e.target.value)}>{RISK_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></FormField>
          <FormField label="CSAT Score (0–5)"><input style={inputStyle} type="number" min="0" max="5" step="0.1" value={form.csat_score} onChange={e => set("csat_score", e.target.value)} placeholder="4.2" /></FormField>
          <FormField label="Avg Latency (ms)"><input style={inputStyle} type="number" value={form.avg_latency_ms} onChange={e => set("avg_latency_ms", e.target.value)} placeholder="320" /></FormField>
          <FormField label="Workload (%)"><input style={inputStyle} type="number" min="0" max="100" value={form.workload_percent} onChange={e => set("workload_percent", e.target.value)} placeholder="75" /></FormField>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}><button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button><button onClick={handleSave} disabled={saving} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #6366F1, #8B5CF6)", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : isEdit ? "Update Agent" : "Add Agent"}</button></div>
      </div>
    </div>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel, danger = true }) {
  // Presentation -> ConfirmDialog()-> Specialized logic gate for terminal system actions
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#0f172a", border: `1px solid ${danger ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`, borderRadius: 16, padding: 28, maxWidth: 380, width: "92%", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>{danger ? "⚠️" : "✅"}</div><p style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600, marginBottom: 20 }}>{message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}><button onClick={onCancel} style={{ padding: "9px 20px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}>Cancel</button><button onClick={onConfirm} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: danger ? "rgba(239,68,68,0.8)" : "rgba(16,185,129,0.8)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Confirm</button></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// SECTION: MAIN CONFIGURATION COMPONENT
// ---------------------------------------------------------------

export default function Settings() {
  const navigate = useNavigate();
  const token = sessionStorage.getItem("token");

  // Initialization -> Dashboard()-> Reactive hooks for telemetry and visibility buffers
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  // 🌟 MAGIC AUTO-REFRESH LOGIC (Silent Hydration)
  // Internal Call -> fetchAgents()-> Pulls active agent registry with polling support
  const fetchAgents = async (isSilent = false) => {
    if (!isSilent) { setLoading(true); setError(""); }
    try {
      const res = await fetch(`${API_BASE}/api/agents`, { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : []);
    } catch {
      if (!isSilent) setError("Failed to load agents. Is the backend running on Port 5000?");
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  // Sub-process -> Polling Hook: Establishes the 5s temporal loop for telemetry parity
  useEffect(() => {
    fetchAgents(false);
    const interval = setInterval(() => fetchAgents(true), 5000);
    return () => clearInterval(interval);
  }, []);

  // ---------------------------------------------------------------
  // SECTION: AGENT ACTION HANDLERS
  // ---------------------------------------------------------------

  // Action Trigger -> handleSave()-> Commits new or modified agent nodes to the signaling DB
  const handleSave = async (form, isEdit) => {
    try {
      const method = isEdit ? "PUT" : "POST";
      const url = isEdit ? `${API_BASE}/api/agents/${form.id}` : `${API_BASE}/api/agents`;
      const payload = { name: form.name.trim(), model_variant: form.model_variant || null, skill_level: form.skill_level || null, risk_level: form.risk_level || "Low", csat_score: form.csat_score !== "" ? parseFloat(form.csat_score) : null, avg_latency_ms: form.avg_latency_ms !== "" ? parseInt(form.avg_latency_ms) : null, workload_percent: form.workload_percent !== "" ? parseFloat(form.workload_percent) : null };
      const res = await fetch(url, { method, headers: authHeaders, body: JSON.stringify(payload) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`); }
      const data = await res.json();
      if (isEdit) { setAgents(prev => prev.map(a => a.id === form.id ? { ...a, ...payload } : a)); showToast("Agent updated successfully."); }
      else { setAgents(prev => [...prev, data]); showToast("Agent created successfully."); }
      setModal(null); return true;
    } catch (err) { console.error("Save agent error:", err); return false; }
  };

  // Action Trigger -> removeAgent()-> Dispatches deletion signal with destructive confirmation
  const removeAgent = (agent) => {
    setConfirm({
      danger: true, message: `Remove agent "${agent.name}"? This cannot be undone.`, onConfirm: async () => {
        try {
          const res = await fetch(`${API_BASE}/api/agents/${agent.id}`, { method: "DELETE", headers: authHeaders });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          setAgents(prev => prev.filter(a => a.id !== agent.id)); showToast(`Agent "${agent.name}" removed.`);
        } catch { setError("Failed to delete agent."); } finally { setConfirm(null); }
      },
    });
  };

  // Action Trigger -> toggleAgent()-> Dispatches operational state modulation (Start/Stop)
  const toggleAgent = async (agent) => {
    const newActive = agent.is_active === false ? true : false;
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agent.id}`, { method: "PUT", headers: authHeaders, body: JSON.stringify({ ...agent, is_active: newActive }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, is_active: newActive } : a)); showToast(`Agent "${agent.name}" ${newActive ? "resumed" : "stopped"}.`);
    } catch { setError("Failed to update agent status."); }
  };

  // Action Trigger -> stopAll()-> Executes bulk deactivation of the fleet
  const stopAll = () => {
    setConfirm({
      danger: true, message: "Stop all agents? They will no longer process calls.", onConfirm: async () => {
        try {
          await Promise.all(agents.filter(a => a.is_active !== false).map(a => fetch(`${API_BASE}/api/agents/${a.id}`, { method: "PUT", headers: authHeaders, body: JSON.stringify({ ...a, is_active: false }) })));
          setAgents(prev => prev.map(a => ({ ...a, is_active: false }))); showToast("All agents stopped.");
        } catch { setError("Failed to stop all agents."); } finally { setConfirm(null); }
      },
    });
  };

  // Action Trigger -> resumeAll()-> Executes bulk activation of the fleet
  const resumeAll = () => {
    setConfirm({
      danger: false, message: "Resume all agents? They will start processing calls.", onConfirm: async () => {
        try {
          await Promise.all(agents.filter(a => a.is_active === false).map(a => fetch(`${API_BASE}/api/agents/${a.id}`, { method: "PUT", headers: authHeaders, body: JSON.stringify({ ...a, is_active: true }) })));
          setAgents(prev => prev.map(a => ({ ...a, is_active: true }))); showToast("All agents resumed.");
        } catch { setError("Failed to resume all agents."); } finally { setConfirm(null); }
      },
    });
  };

  // ---------------------------------------------------------------
  // SECTION: CALL CENTER TELEMETRY SYNC
  // ---------------------------------------------------------------

  const [ccConfig, setCcConfig] = useState({ smtp_sender: "", smtp_password: "", smtp_port: "587", max_wait_seconds: "300", work_start: "09:00", work_end: "18:00", timezone: "UTC", holidays: "" });
  const [ccLoading, setCcLoading] = useState(true);
  const [ccSaving, setCcSaving] = useState(false);

  // Sub-process -> load(): Hydrates operational configuration from signaling hub
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/config`, { headers: authHeaders });
        if (!res.ok) return;
        const data = await res.json();
        const cfg = data.config || {};
        setCcConfig(prev => ({ smtp_sender: cfg.smtp_sender ?? prev.smtp_sender, smtp_password: cfg.smtp_password ?? prev.smtp_password, smtp_port: cfg.smtp_port ?? prev.smtp_port, max_wait_seconds: cfg.max_wait_seconds ?? prev.max_wait_seconds, work_start: cfg.work_start ?? prev.work_start, work_end: cfg.work_end ?? prev.work_end, timezone: cfg.timezone ?? prev.timezone, holidays: cfg.holidays ?? prev.holidays }));
      } catch { /* Fail-safe default usage */ } finally { setCcLoading(false); }
    };
    load();
  }, []);

  // Action Trigger -> saveCcConfig()-> Commits operational metadata to the admin gateway
  const saveCcConfig = async () => {
    setCcSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/config`, { method: "PUT", headers: authHeaders, body: JSON.stringify({ updates: ccConfig }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast("Call center config saved.");
    } catch { setError("Failed to save call center config."); } finally { setCcSaving(false); }
  };

  const setCc = (k, v) => setCcConfig(prev => ({ ...prev, [k]: v }));
  const filtered = agents.filter(a => {
    const q = search.toLowerCase();
    return ((a.name || "").toLowerCase().includes(q) || (a.model_variant || "").toLowerCase().includes(q) || (a.skill_level || "").toLowerCase().includes(q));
  });

  const activeCount = agents.filter(a => a.is_active !== false).length;
  const stoppedCount = agents.filter(a => a.is_active === false).length;

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div style={{ minHeight: "100vh", background: "#020617", color: "#e2e8f0", fontFamily: "'Inter', sans-serif", padding: "32px 40px" }}>
      {toast && <div style={{ position: "fixed", top: 24, right: 24, zIndex: 2000, background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 10, padding: "12px 20px", fontSize: 13, fontWeight: 600, color: "#10B981", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>✓ {toast}</div>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div><div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}><button onClick={() => navigate("/superuser/dashboard")} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 10px", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}>← Back</button><h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff" }}>Agent Settings</h1></div><p style={{ fontSize: 13, color: "#64748b" }}>Manage, configure and control all AI agents. Changes sync to database instantly.</p></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><button onClick={() => fetchAgents(false)} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>↻ Refresh</button><button onClick={() => setModal({ type: "add" })} style={{ padding: "11px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #6366F1, #8B5CF6)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 20px rgba(99,102,241,0.35)" }}>+ Add New Agent</button></div>
      </div>
      {error && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "12px 18px", marginBottom: 20, fontSize: 13, color: "#EF4444", display: "flex", justifyContent: "space-between" }}>{error}<button onClick={() => setError("")} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer" }}>✕</button></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>{[{ label: "Total Agents", value: agents.length, color: "#6366F1" }, { label: "Active", value: activeCount, color: "#10B981" }, { label: "Stopped", value: stoppedCount, color: "#EF4444" },].map(s => (<div key={s.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 24px" }}><p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>{s.label}</p><p style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.value}</p></div>))}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12 }}><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, model, skill..." style={{ ...inputStyle, maxWidth: 300 }} /><div style={{ display: "flex", gap: 10 }}><button onClick={stopAll} style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#EF4444", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>⏹ Stop All</button><button onClick={resumeAll} style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.08)", color: "#10B981", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>▶ Resume All</button></div></div>
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 1fr 1fr 1.5fr", gap: 12, padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>{["Name", "Model", "Skill", "CSAT", "Latency", "Workload", "Status", "Actions"].map(h => (<span key={h} style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "1px" }}>{h}</span>))}</div>
        {loading ? <div style={{ padding: 40, textAlign: "center", color: "#6366F1" }}>Loading agents from database...</div> : filtered.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "#475569" }}>{search ? "No agents match your search." : "No agents yet. Click '+ Add New Agent' to create one."}</div> : filtered.map(agent => {
          const isActive = agent.is_active !== false;
          return (
            <div key={agent.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 1fr 1fr 1.5fr", gap: 12, padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center", opacity: isActive ? 1 : 0.6, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#818CF8" }}>{(agent.name || "?").substring(0, 2).toUpperCase()}</div><div><p style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 2 }}>{agent.name}</p><RiskBadge level={agent.risk_level} /></div></div>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>{agent.model_variant || "—"}</span><span style={{ fontSize: 12, color: "#94a3b8" }}>{agent.skill_level || "—"}</span><span style={{ fontSize: 13, fontWeight: 700, color: "#10B981" }}>{agent.csat_score != null ? Number(agent.csat_score).toFixed(1) : "—"}</span><span style={{ fontSize: 12, color: "#94a3b8" }}>{agent.avg_latency_ms != null ? `${agent.avg_latency_ms}ms` : "—"}</span><span style={{ fontSize: 12, color: "#94a3b8" }}>{agent.workload_percent != null ? `${agent.workload_percent}%` : "—"}</span><StatusBadge status={isActive ? "active" : "stopped"} />
              <div style={{ display: "flex", gap: 6 }}><button onClick={() => setModal({ type: "edit", agent })} style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.08)", color: "#818CF8", cursor: "pointer" }}>Edit</button><button onClick={() => toggleAgent(agent)} style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, border: `1px solid ${isActive ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`, background: isActive ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)", color: isActive ? "#EF4444" : "#10B981", cursor: "pointer" }}>{isActive ? "Stop" : "Resume"}</button><button onClick={() => removeAgent(agent)} style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)", color: "#EF4444", cursor: "pointer" }}>Remove</button></div>
            </div>
          );
        })}
      </div>
      {modal && (<AgentModal agent={modal.type === "edit" ? modal.agent : null} onClose={() => setModal(null)} onSave={handleSave} />)}
      {confirm && (<ConfirmDialog message={confirm.message} danger={confirm.danger} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />)}

      <div style={{ marginTop: 40, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 16, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: 0 }}>Call Center Configuration</h2>
            <p style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>SMTP alerts, queue limits, and business hours</p>
          </div>
          {ccLoading && <span style={{ fontSize: 12, color: "#5a7a9a" }}>Loading…</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
          <FormField label="SMTP Sender Email">
            <input style={inputStyle} type="email" value={ccConfig.smtp_sender} onChange={e => setCc("smtp_sender", e.target.value)} placeholder="alerts@yourcompany.com" />
          </FormField>
          <FormField label="SMTP App Password">
            <input style={inputStyle} type="password" value={ccConfig.smtp_password} onChange={e => setCc("smtp_password", e.target.value)} placeholder="••••••••••••" />
          </FormField>
          <FormField label="SMTP Port">
            <input style={inputStyle} type="number" value={ccConfig.smtp_port} onChange={e => setCc("smtp_port", e.target.value)} placeholder="587" />
          </FormField>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
          <FormField label="Work Start Time">
            <input style={inputStyle} type="time" value={ccConfig.work_start} onChange={e => setCc("work_start", e.target.value)} />
          </FormField>
          <FormField label="Work End Time">
            <input style={inputStyle} type="time" value={ccConfig.work_end} onChange={e => setCc("work_end", e.target.value)} />
          </FormField>
          <FormField label="Timezone">
            <input style={inputStyle} value={ccConfig.timezone} onChange={e => setCc("timezone", e.target.value)} placeholder="UTC, Asia/Kolkata…" />
          </FormField>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginBottom: 24 }}>
          <FormField label="Max Queue Wait (seconds)">
            <input style={inputStyle} type="number" value={ccConfig.max_wait_seconds} onChange={e => setCc("max_wait_seconds", e.target.value)} placeholder="300" />
          </FormField>
          <FormField label="Holidays (comma-separated YYYY-MM-DD)">
            <input style={inputStyle} value={ccConfig.holidays} onChange={e => setCc("holidays", e.target.value)} placeholder="2025-12-25,2026-01-01" />
          </FormField>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={saveCcConfig}
            disabled={ccSaving}
            style={{ padding: "11px 28px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #6366F1, #8B5CF6)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: ccSaving ? "not-allowed" : "pointer", opacity: ccSaving ? 0.7 : 1 }}
          >
            {ccSaving ? "Saving…" : "Save Config"}
          </button>
        </div>
      </div>

      <DepartmentManager token={token} apiBase={API_BASE} authHeaders={authHeaders} />

    </div>
  );
}

// ---------------------------------------------------------------
// SECTION: LOGIC EXTENSIONS (ROUTING RULES)
// ---------------------------------------------------------------

function DepartmentManager({ token, apiBase, authHeaders }) {
  // Initialization -> DepartmentManager()-> Independent registry for routing policy management
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newQueue, setNewQueue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Sub-process -> load(): Syncs the engine's JSON rules with the UI table
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/routing/rules`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      }
    } catch { /* Fail-silent ensures terminal stability */ }
    finally { setLoading(false); }
  }, [apiBase]);

  useEffect(() => { load(); }, [load]);

  // Action Trigger -> reloadRules()-> Dispatches re-hydration signal to the engine on disk
  const reloadRules = async () => {
    setSaving(true);
    try {
      await fetch(`${apiBase}/api/routing/rules/reload`, { method: "POST", headers: authHeaders });
      await load();
    } finally { setSaving(false); }
  };

  // Action Trigger -> addDepartment()-> Optimistically projects new departments into the registry
  const addDepartment = async () => {
    const q = newQueue.trim();
    if (!q) { setError("Enter a department / queue name."); return; }
    setError("");
    setSaving(true);
    try {
      setRules(prev => [...prev, {
        name: q.toLowerCase().replace(/\s+/g, "_"),
        enabled: true,
        conditions: {},
        target: { queue_name: q.toLowerCase().replace(/\s+/g, "_"), required_skills: [], fallback_action: "queue", ai_config: {} },
      }]);
      setNewQueue("");
    } finally { setSaving(false); }
  };

  const panelStyle = { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "24px 28px", marginTop: 24 };
  const thStyle = { padding: "9px 14px", fontSize: 10, fontWeight: 800, color: "#2d3748", textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: "1px solid #141c24" };
  const tdStyle = { padding: "11px 14px", fontSize: 12, color: "#e2e8f0", borderBottom: "1px solid #0d1621" };

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0", margin: 0 }}>Routing Departments</h2>
          <p style={{ fontSize: 11, color: "#5a7a9a", margin: "4px 0 0 0" }}>Active routing rules — agents receive calls matching their department.</p>
        </div>
        <button onClick={reloadRules} disabled={saving} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.1)", color: "#818cf8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {saving ? "…" : "↺ Reload Rules"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input value={newQueue} onChange={e => { setNewQueue(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && addDepartment()} placeholder="New department name (e.g. Billing)" style={{ flex: 1, background: "#0d1621", border: "1px solid #141c24", borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, outline: "none" }} />
        <button onClick={addDepartment} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Add</button>
      </div>
      {error && <p style={{ fontSize: 11, color: "#ef4444", margin: "0 0 12px 0" }}>{error}</p>}

      <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #141c24" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Rule Name", "Queue / Dept", "Status", "Fallback", "Required Skills"].map(h => (<th key={h} style={thStyle}>{h}</th>))}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "#2d3748" }}>Loading…</td></tr>
            ) : rules.length === 0 ? (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "#2d3748" }}>No routing rules found</td></tr>
            ) : rules.map(r => (
              <tr key={r.name}>
                <td style={tdStyle}>{r.name}</td>
                <td style={{ ...tdStyle, color: "#818cf8", fontWeight: 700 }}>{r.target?.queue_name || "—"}</td>
                <td style={tdStyle}><span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: r.enabled ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)", color: r.enabled ? "#22c55e" : "#64748b", border: `1px solid ${r.enabled ? "rgba(34,197,94,0.3)" : "rgba(100,116,139,0.2)"}` }}>{r.enabled ? "ENABLED" : "DISABLED"}</span></td>
                <td style={{ ...tdStyle, color: "#94a3b8" }}>{r.target?.fallback_action || "queue"}</td>
                <td style={{ ...tdStyle, color: "#5a7a9a" }}>{(r.target?.required_skills || []).join(", ") || "any"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 10, color: "#2d3748", margin: "10px 0 0 0" }}>To persist new departments, add them to <code style={{ color: "#818cf8" }}>backend/routing_engine/routing_rules.json</code> and click ↺ Reload Rules.</p>
    </div>
  );
}