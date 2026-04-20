// ======================== Queue Wait Times Orchestrator ========================
// QueueWaitTimesPanel -> Administrative control plane for modulating temporal 
// queue telemetry. Manages the 'avg_resolution_seconds' constant to derive 
// linear waiting projections for IVR-queued callers.
// ||
// ||
// ||
// Functions -> QueueWaitTimesPanel()-> Main container for wait-time configuration:
// ||           |
// ||           |--- useEffect()-> [async Sub-process]: GET /cc/admin/config -> Hydrates 
// ||           |    current system-wide resolution settings from the database.
// ||           |
// ||           |--- handleSave()-> [Action Trigger]: Internal Call -> Normalizes 
// ||           |    minutes to seconds and commits the delta via POST.
// ||           |
// ||           └── projection logic: Logic Branch -> Computes position-based 
// ||                TTS (Text-to-Speech) strings for real-time UI preview.
// ||
// ===============================================================================

import { useState, useEffect } from "react";
import api from "../../services/api";

const PREVIEW_ROWS = 6;

export default function QueueWaitTimesPanel() {

  // ---------------------------------------------------------------
  // SECTION: STATE MANAGEMENT
  // ---------------------------------------------------------------

  // Initialization -> Reactive hooks for UI state and operational buffers
  const [minutes, setMinutes] = useState("");
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // ---------------------------------------------------------------
  // SECTION: DATA LIFECYCLE (SYNC)
  // ---------------------------------------------------------------

  // Sub-process -> useEffect()-> Hydrates the panel with existing backend configuration
  useEffect(() => {
    api.get("/cc/admin/config")
      .then((res) => {
        const secs = parseInt(res?.config?.avg_resolution_seconds, 10);
        if (!isNaN(secs) && secs > 0) {
          const mins = Math.round(secs / 60);
          setMinutes(String(mins));
          setSaved(mins);
        }
      })
      .catch(() => {
        setMsg({ type: "err", text: "Could not load current setting." });
      });
  }, []);

  // ---------------------------------------------------------------
  // SECTION: ACTION HANDLERS (PERSISTENCE)
  // ---------------------------------------------------------------

  // Action Trigger -> handleSave()-> Normalizes user input and commits temporal settings
  const handleSave = async () => {
    const mins = parseInt(minutes, 10);
    if (isNaN(mins) || mins < 1) {
      setMsg({ type: "err", text: "Please enter a valid number of minutes (≥ 1)." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await api.post("/cc/admin/config", {
        key: "avg_resolution_seconds",
        value: String(mins * 60),
      });
      setSaved(mins);
      setMsg({ type: "ok", text: `Saved: ${mins} minute${mins !== 1 ? "s" : ""} per caller slot.` });
    } catch (e) {
      setMsg({ type: "err", text: e?.detail || "Failed to save. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------
  // SECTION: DESIGN TOKENS (STYLES)
  // ---------------------------------------------------------------

  const mins = parseInt(minutes, 10);
  const validInput = !isNaN(mins) && mins >= 1;

  const card = {
    background: "var(--card)",
    border: "1px solid var(--bdr)",
    borderRadius: 14,
    padding: "22px 24px",
    marginBottom: 16,
  };

  const inputStyle = {
    background: "var(--bg)",
    border: "1px solid var(--bdr2)",
    borderRadius: 9,
    color: "var(--txt)",
    fontSize: 28,
    fontWeight: 800,
    padding: "12px 18px",
    outline: "none",
    fontFamily: "'Syne', sans-serif",
    width: 120,
    textAlign: "center",
    MozAppearance: "textfield",
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--txt)", marginBottom: 6 }}>
          ⏱ Queue Waiting Time
        </h2>
        <p style={{ fontSize: 13, color: "var(--txt2)", lineHeight: 1.7 }}>
          Set the base wait time per caller slot. Each caller is told their estimated wait
          automatically:<br />
          <span style={{ color: "var(--pur2)", fontWeight: 600 }}>
            Position 1 → 1×, &nbsp;Position 2 → 2×, &nbsp;Position 3 → 3×, &nbsp;…
          </span>
        </p>
      </div>

      <div style={card}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: "var(--txt2)",
          textTransform: "uppercase", letterSpacing: "1px", marginBottom: 18,
        }}>
          Wait Time Per Caller Slot
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <input
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => { setMinutes(e.target.value); setMsg(null); }}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            style={inputStyle}
            placeholder="2"
          />
          <div>
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--txt)" }}>
              minute{mins === 1 ? "" : "s"}
            </span>
            <p style={{ fontSize: 12, color: "var(--txt2)", marginTop: 4 }}>
              per queue position slot
            </p>
          </div>

          {saved !== null && (
            <div style={{
              marginLeft: "auto",
              padding: "6px 14px", borderRadius: 20,
              background: "rgba(124,92,255,0.12)", border: "1px solid var(--bdr2)",
              fontSize: 12, color: "var(--pur2)", fontWeight: 600,
            }}>
              Current: {saved} min
            </div>
          )}
        </div>
      </div>

      <div style={card}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: "var(--txt2)",
          textTransform: "uppercase", letterSpacing: "1px", marginBottom: 14,
        }}>
          Live Preview — How callers will be informed
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: PREVIEW_ROWS }, (_, i) => {
            const pos = i + 1;
            const waitMins = validInput ? pos * mins : null;
            return (
              <div key={pos} style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "var(--bg2)", border: "1px solid var(--bdr)",
                borderRadius: 10, padding: "10px 16px",
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 12px",
                  borderRadius: 20, flexShrink: 0, minWidth: 80, textAlign: "center",
                  background: "rgba(124,92,255,0.12)",
                  border: "1px solid var(--bdr2)",
                  color: "var(--pur2)",
                }}>
                  Position {pos}
                </span>

                <span style={{ color: "var(--txt2)", fontSize: 14 }}>→</span>

                <span style={{
                  fontSize: 15, fontWeight: 700,
                  color: validInput ? "var(--txt)" : "var(--txt2)",
                  minWidth: 80,
                }}>
                  {validInput ? `${waitMins} min` : "— min"}
                </span>

                <span style={{
                  fontSize: 12, color: "var(--txt2)", fontStyle: "italic", flex: 1,
                }}>
                  {validInput
                    ? `"Your waiting position is ${pos}. Estimated wait time is ${waitMins} minute${waitMins !== 1 ? "s" : ""}."`
                    : "Enter a value above to preview"}
                </span>
              </div>
            );
          })}
        </div>

        {validInput && (
          <p style={{ fontSize: 12, color: "var(--txt2)", marginTop: 12 }}>
            Formula: <strong>wait = position × {mins} min</strong>.
            Positions beyond {PREVIEW_ROWS} follow the same pattern.
          </p>
        )}
      </div>

      {msg && (
        <div style={{
          padding: "10px 16px", borderRadius: 9, marginBottom: 14, fontSize: 13,
          background: msg.type === "ok" ? "rgba(34,197,94,0.1)" : "rgba(255,71,87,0.1)",
          color: msg.type === "ok" ? "#22c55e" : "var(--red)",
          border: `1px solid ${msg.type === "ok" ? "rgba(34,197,94,0.25)" : "rgba(255,71,87,0.25)"}`,
        }}>
          {msg.type === "ok" ? "✓ " : "⚠ "}{msg.text}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !validInput}
        style={{
          padding: "11px 32px", borderRadius: 9,
          background: "linear-gradient(135deg, var(--pur), var(--acc))",
          border: "none", color: "#fff",
          fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700,
          cursor: saving || !validInput ? "not-allowed" : "pointer",
          opacity: saving || !validInput ? 0.6 : 1,
          transition: "opacity 0.15s",
        }}
      >
        {saving ? "Saving…" : "Save Wait Times"}
      </button>
    </div>
  );
}