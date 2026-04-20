// Scheduling — Superuser page to manage scheduled outbound call jobs.
// GET  /api/scheduling/jobs        → list all jobs
// POST /api/scheduling/jobs        → create a new job
// DELETE /api/scheduling/jobs/:id  → cancel a job
// GET  /api/scheduling/stats       → counts by status

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Plus, Trash2, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const STATUS_COLOR = {
  pending:   "#818cf8",
  running:   "#f59e0b",
  completed: "#22c55e",
  failed:    "#ef4444",
  cancelled: "#64748b",
};

function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] || "#64748b";
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
      background: `${color}20`, color,
    }}>
      {status?.toUpperCase()}
    </span>
  );
}

export default function Scheduling() {
  const token = sessionStorage.getItem("token") || "";
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [jobs,    setJobs]    = useState([]);
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [form,    setForm]    = useState({ phone_number: "", scheduled_at: "", label: "", max_retries: 3 });
  const [creating, setCreating] = useState(false);
  const [error,    setError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jobsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/api/scheduling/jobs?limit=100`, { headers }),
        fetch(`${API_BASE}/api/scheduling/stats`,          { headers }),
      ]);
      if (jobsRes.ok)  setJobs((await jobsRes.json()).jobs  || []);
      if (statsRes.ok) setStats(await statsRes.json());
    } catch { /* silently ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createJob = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.phone_number || !form.scheduled_at) {
      setError("Phone number and scheduled time are required.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/scheduling/jobs`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          phone_number: form.phone_number,
          scheduled_at: new Date(form.scheduled_at).toISOString(),
          label:        form.label,
          max_retries:  Number(form.max_retries),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.detail || "Failed to schedule job");
      } else {
        setForm({ phone_number: "", scheduled_at: "", label: "", max_retries: 3 });
        await load();
      }
    } catch { setError("Network error"); }
    finally { setCreating(false); }
  };

  const cancelJob = async (jobId) => {
    try {
      await fetch(`${API_BASE}/api/scheduling/jobs/${jobId}`, { method: "DELETE", headers });
      await load();
    } catch { /* ignore */ }
  };

  return (
    <div style={{ padding: "28px 32px", maxWidth: 960, margin: "0 auto", color: "#e2e8f0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Scheduled Calls</h1>
          <p style={{ fontSize: 12, color: "#5a7a9a", margin: "4px 0 0 0" }}>
            Schedule future outbound calls — poll every 30 s
          </p>
        </div>
        <button
          onClick={load}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: 8, padding: "8px 14px", cursor: "pointer",
            color: "#818cf8", fontSize: 12, fontWeight: 600,
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? "spin 0.8s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
          {Object.entries(stats.by_status || {}).map(([s, count]) => (
            <div key={s} style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid #141c24",
              borderRadius: 10, padding: "12px 16px", textAlign: "center",
            }}>
              <p style={{ fontSize: 20, fontWeight: 800, margin: 0, color: STATUS_COLOR[s] || "#e2e8f0" }}>{count}</p>
              <p style={{ fontSize: 10, color: "#5a7a9a", margin: "4px 0 0 0", textTransform: "uppercase", letterSpacing: "0.1em" }}>{s}</p>
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      <form onSubmit={createJob} style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid #141c24",
        borderRadius: 12, padding: "20px 24px", marginBottom: 24,
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", margin: "0 0 16px 0" }}>
          <Plus size={13} style={{ marginRight: 6 }} />
          Schedule a Call
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr 80px", gap: 12, alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#5a7a9a", fontWeight: 700, textTransform: "uppercase" }}>Phone Number</span>
            <input
              value={form.phone_number}
              onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
              placeholder="+91 9876543210"
              style={{ background: "#0d1621", border: "1px solid #141c24", borderRadius: 8, padding: "8px 12px", color: "#e2e8f0", fontSize: 13 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#5a7a9a", fontWeight: 700, textTransform: "uppercase" }}>Scheduled At</span>
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
              style={{ background: "#0d1621", border: "1px solid #141c24", borderRadius: 8, padding: "8px 12px", color: "#e2e8f0", fontSize: 13 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#5a7a9a", fontWeight: 700, textTransform: "uppercase" }}>Label (optional)</span>
            <input
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="Follow-up call"
              style={{ background: "#0d1621", border: "1px solid #141c24", borderRadius: 8, padding: "8px 12px", color: "#e2e8f0", fontSize: 13 }}
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            style={{
              background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
              borderRadius: 8, padding: "8px 0", color: "#818cf8", fontWeight: 700,
              fontSize: 12, cursor: creating ? "not-allowed" : "pointer",
            }}
          >
            {creating ? "…" : "Schedule"}
          </button>
        </div>
        {error && <p style={{ fontSize: 12, color: "#ef4444", margin: "10px 0 0 0" }}>{error}</p>}
      </form>

      {/* Jobs table */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #141c24", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr 1fr 80px", gap: 0 }}>
          {["Phone", "Status", "Scheduled At", "Label", ""].map(h => (
            <div key={h} style={{ padding: "10px 16px", fontSize: 10, fontWeight: 800, color: "#2d3748", textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: "1px solid #141c24" }}>{h}</div>
          ))}
        </div>
        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#5a7a9a", fontSize: 13 }}>Loading…</div>
        ) : jobs.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#2d3748", fontSize: 13 }}>
            <Clock size={28} style={{ marginBottom: 12, opacity: 0.3 }} />
            <p>No scheduled jobs</p>
          </div>
        ) : (
          jobs.map(job => (
            <div key={job.job_id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr 1fr 80px", borderBottom: "1px solid #0d1621" }}>
              <div style={{ padding: "12px 16px", fontSize: 13, color: "#e2e8f0" }}>{job.phone_number}</div>
              <div style={{ padding: "12px 16px" }}><StatusBadge status={job.status} /></div>
              <div style={{ padding: "12px 16px", fontSize: 11, color: "#5a7a9a" }}>
                {job.scheduled_at ? new Date(job.scheduled_at * 1000).toLocaleString() : "—"}
              </div>
              <div style={{ padding: "12px 16px", fontSize: 12, color: "#5a7a9a" }}>{job.label || "—"}</div>
              <div style={{ padding: "12px 16px" }}>
                {job.status === "pending" && (
                  <button
                    onClick={() => cancelJob(job.job_id)}
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: "#ef4444" }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
