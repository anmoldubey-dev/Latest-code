// BusinessHours — Superuser page to configure call-center operating hours.
// GET  /api/cc/business-hours           → read current status + config
// POST /api/cc/admin/business-hours     → save work_start, work_end, work_days, timezone
// POST /api/cc/holiday                  → activate holiday mode
// DELETE /api/cc/holiday                → clear holiday mode

import { useState, useEffect, useCallback } from "react";
import { Clock, Calendar, AlertTriangle, CheckCircle, RefreshCw, Save, XCircle } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const card = {
  background: "#0f172a",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 16,
  padding: "24px 28px",
  marginBottom: 20,
};

const sectionTitle = {
  fontSize: 13,
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 18,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const inputStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 9,
  color: "#e2e8f0",
  fontSize: 13,
  padding: "9px 13px",
  outline: "none",
  fontFamily: "inherit",
};

const labelStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  marginBottom: 6,
  display: "block",
};

export default function BusinessHours() {
  const token   = sessionStorage.getItem("token") || "";
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // ── Status ────────────────────────────────────────────────────────────────
  const [status,   setStatus]   = useState(null);
  const [loading,  setLoading]  = useState(true);

  // ── Work hours form ───────────────────────────────────────────────────────
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd,   setWorkEnd]   = useState("18:00");
  const [timezone,  setTimezone]  = useState("Asia/Kolkata");
  const [workDays,  setWorkDays]  = useState([0, 1, 2, 3, 4, 5]);   // Mon–Sat
  const [saving,    setSaving]    = useState(false);

  // ── Holiday form ──────────────────────────────────────────────────────────
  const [holidayMsg,   setHolidayMsg]   = useState("");
  const [holidayUntil, setHolidayUntil] = useState("");
  const [holidaySaving, setHolidaySaving] = useState(false);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState("");
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  // ── Load current config ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/cc/business-hours`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
      setWorkStart(data.work_start  || "09:00");
      setWorkEnd(data.work_end      || "18:00");
      setTimezone(data.timezone     || "Asia/Kolkata");
      setWorkDays(data.work_days    || [0, 1, 2, 3, 4, 5]);
      if (data.is_holiday) {
        setHolidayMsg(data.holiday_message || "");
      }
    } catch (e) {
      console.error("[BusinessHours] load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Toggle a work day ─────────────────────────────────────────────────────
  const toggleDay = (idx) => {
    setWorkDays(prev =>
      prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx].sort((a, b) => a - b)
    );
  };

  // ── Save business hours ───────────────────────────────────────────────────
  const saveHours = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/cc/admin/business-hours`, {
        method:  "POST",
        headers,
        body:    JSON.stringify({
          work_start: workStart,
          work_end:   workEnd,
          work_days:  workDays.join(","),
          timezone,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast("Business hours saved.");
      await load();
    } catch (e) {
      showToast("Failed to save. Check backend.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // ── Set holiday mode ──────────────────────────────────────────────────────
  const setHoliday = async () => {
    if (!holidayUntil) { showToast("Please set an end date/time for the holiday."); return; }
    setHolidaySaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/cc/holiday`, {
        method:  "POST",
        headers,
        body:    JSON.stringify({ message: holidayMsg, until: holidayUntil }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast("Holiday mode activated.");
      await load();
    } catch (e) {
      showToast("Failed to set holiday.");
      console.error(e);
    } finally {
      setHolidaySaving(false);
    }
  };

  // ── Clear holiday mode ────────────────────────────────────────────────────
  const clearHoliday = async () => {
    setHolidaySaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/cc/holiday`, { method: "DELETE", headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHolidayMsg("");
      setHolidayUntil("");
      showToast("Holiday mode cleared.");
      await load();
    } catch (e) {
      showToast("Failed to clear holiday.");
      console.error(e);
    } finally {
      setHolidaySaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const isOpen = status?.is_open;

  return (
    <div style={{ minHeight: "100vh", background: "#060d19", padding: "38px 44px", fontFamily: "'Syne', sans-serif", color: "#e2e8f0" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: "#1e293b", border: "1px solid rgba(99,102,241,0.4)",
          borderRadius: 10, padding: "12px 18px", fontSize: 13, fontWeight: 600,
          color: "#c7d2fe", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        }}>
          {toast}
        </div>
      )}

      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Business Hours</h1>
          {status && (
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", padding: "3px 12px", borderRadius: 20,
              background: isOpen ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
              color:      isOpen ? "#22c55e"               : "#ef4444",
              border:     `1px solid ${isOpen ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            }}>
              {isOpen ? "Open" : "Closed"}
            </span>
          )}
          <button
            onClick={load}
            style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", padding: 4 }}
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
          Control when the call center accepts incoming calls and manage holiday closures.
        </p>
        {status && (
          <p style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>
            Current time: <span style={{ color: "#94a3b8" }}>{new Date(status.current_time).toLocaleString()}</span>
            &nbsp;·&nbsp;Timezone: <span style={{ color: "#94a3b8" }}>{status.timezone}</span>
            &nbsp;·&nbsp;Working days: <span style={{ color: "#94a3b8" }}>{(status.work_days_names || []).join(", ")}</span>
          </p>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#475569", fontSize: 14 }}>Loading configuration…</div>
      ) : (
        <>
          {/* ── Working Hours ─────────────────────────────────────────────── */}
          <div style={card}>
            <div style={sectionTitle}>
              <Clock size={15} />
              Working Hours
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Open From</label>
                <input
                  type="time"
                  value={workStart}
                  onChange={e => setWorkStart(e.target.value)}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={labelStyle}>Close At</label>
                <input
                  type="time"
                  value={workEnd}
                  onChange={e => setWorkEnd(e.target.value)}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={labelStyle}>Timezone</label>
                <select
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box", cursor: "pointer" }}
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz} style={{ background: "#0f172a" }}>{tz}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Working days */}
            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>Working Days</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {DAY_LABELS.map((label, idx) => {
                  const active = workDays.includes(idx);
                  return (
                    <button
                      key={idx}
                      onClick={() => toggleDay(idx)}
                      style={{
                        padding: "7px 16px", borderRadius: 8, cursor: "pointer",
                        fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700,
                        background: active ? "rgba(99,102,241,0.2)"  : "rgba(255,255,255,0.03)",
                        border:     active ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.08)",
                        color:      active ? "#a5b4fc" : "#64748b",
                        transition: "all 0.15s",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={saveHours}
              disabled={saving}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 22px", borderRadius: 10, border: "none", cursor: saving ? "not-allowed" : "pointer",
                background: saving ? "#1e293b" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                color: saving ? "#64748b" : "#fff",
                fontSize: 13, fontWeight: 700, fontFamily: "'Syne', sans-serif",
              }}
            >
              <Save size={14} />
              {saving ? "Saving…" : "Save Hours"}
            </button>
          </div>

          {/* ── Holiday Mode ─────────────────────────────────────────────── */}
          <div style={{
            ...card,
            borderColor: status?.is_holiday ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.07)",
          }}>
            <div style={{ ...sectionTitle, color: status?.is_holiday ? "#f59e0b" : "#94a3b8" }}>
              <AlertTriangle size={15} />
              Holiday Mode
              {status?.is_holiday && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                  background: "rgba(245,158,11,0.15)", color: "#f59e0b",
                  border: "1px solid rgba(245,158,11,0.3)",
                }}>
                  ACTIVE
                </span>
              )}
            </div>

            {status?.is_holiday && status?.holiday_until && (
              <div style={{
                background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
                borderRadius: 9, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: "#fcd34d",
              }}>
                Holiday active until: {new Date(status.holiday_until).toLocaleString()}
                {status.holiday_message && <>&nbsp;·&nbsp;<em style={{ color: "#f59e0b" }}>{status.holiday_message}</em></>}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Holiday Message (TTS)</label>
                <textarea
                  value={holidayMsg}
                  onChange={e => setHolidayMsg(e.target.value)}
                  placeholder="We are closed for a holiday. Please call back on the next working day."
                  rows={3}
                  style={{
                    ...inputStyle,
                    width: "100%", boxSizing: "border-box",
                    resize: "vertical", lineHeight: 1.5,
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Holiday Ends At</label>
                <input
                  type="datetime-local"
                  value={holidayUntil}
                  onChange={e => setHolidayUntil(e.target.value)}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
                <p style={{ fontSize: 11, color: "#475569", marginTop: 8 }}>
                  Holiday mode auto-expires when this time passes.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={setHoliday}
                disabled={holidaySaving}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 22px", borderRadius: 10, border: "none",
                  cursor: holidaySaving ? "not-allowed" : "pointer",
                  background: holidaySaving ? "#1e293b" : "linear-gradient(135deg,#f59e0b,#d97706)",
                  color: holidaySaving ? "#64748b" : "#fff",
                  fontSize: 13, fontWeight: 700, fontFamily: "'Syne', sans-serif",
                }}
              >
                <AlertTriangle size={14} />
                {holidaySaving ? "Saving…" : "Activate Holiday"}
              </button>

              {status?.is_holiday && (
                <button
                  onClick={clearHoliday}
                  disabled={holidaySaving}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 22px", borderRadius: 10,
                    border: "1px solid rgba(239,68,68,0.35)",
                    cursor: holidaySaving ? "not-allowed" : "pointer",
                    background: "rgba(239,68,68,0.08)",
                    color: "#ef4444",
                    fontSize: 13, fontWeight: 700, fontFamily: "'Syne', sans-serif",
                  }}
                >
                  <XCircle size={14} />
                  Clear Holiday
                </button>
              )}
            </div>
          </div>

          {/* ── Status Summary ────────────────────────────────────────────── */}
          {status && (
            <div style={card}>
              <div style={sectionTitle}>
                <Calendar size={15} />
                Current Status Summary
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
                {[
                  { label: "Status",       value: isOpen ? "Open" : "Closed",             color: isOpen ? "#22c55e" : "#ef4444" },
                  { label: "Opens",        value: status.work_start,                       color: "#a5b4fc" },
                  { label: "Closes",       value: status.work_end,                         color: "#a5b4fc" },
                  { label: "Timezone",     value: status.timezone,                         color: "#94a3b8" },
                  { label: "Working Days", value: (status.work_days_names || []).join(", "), color: "#94a3b8" },
                  { label: "Holiday Mode", value: status.is_holiday ? "Active" : "Off",   color: status.is_holiday ? "#f59e0b" : "#22c55e" },
                ].map(item => (
                  <div key={item.label} style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 10, padding: "14px 16px",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: item.color }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
