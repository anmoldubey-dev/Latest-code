import { useState } from "react";
import { statusColor, sentimentColor, fmtDur, fmtDate } from "../../utils/agentHelpers";

// ======================== Call Table Orchestrator ========================
// CallTable -> High-density tabular interface for call log telemetry, supporting 
// toggleable view modes (Compact/Full) and deep-dive modal orchestration.
// ||
// ||
// ||
// Functions -> CallTable()-> Primary orchestrator for the log registry:
// ||           |
// ||           |--- setSelectedCall()-> Action Trigger: Injects specific call context into the modal pipeline.
// ||           |
// ||           └── CallModal()-> [Sub-component Tree]: Detailed node for granular session metadata.
// ||                |--- onClose()-> Action Trigger: Terminates modal lifecycle via parent state reset.
// ||                |--- fmtDur()-> Internal Call: Normalizes temporal duration strings.
// ||                └── fmtDate()-> Internal Call: Serializes ISO timestamps for human-readable display.
// ||
// =========================================================================

// ---------------------------------------------------------------
// SECTION: DESIGN TOKENS & STYLES
// ---------------------------------------------------------------

const th = {
  padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700,
  color: "var(--txt2)", borderBottom: "1px solid var(--bdr)",
  textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
};

const td = { padding: "9px 10px", color: "var(--txt)", whiteSpace: "nowrap" };

// ---------------------------------------------------------------
// SECTION: ATOMIC SUB-COMPONENTS
// ---------------------------------------------------------------

function CallModal({ call, onClose }) {
  // Initialization -> CallModal()-> Reactive sub-component for deep-dive session exploration
  if (!call) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg2)", borderRadius: 14,
          border: "1px solid var(--bdr2)", width: "100%", maxWidth: 560,
          maxHeight: "90vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 20px", borderBottom: "1px solid var(--bdr)",
        }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--txt)" }}>Call Detail</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--txt2)", padding: 4 }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "16px 20px", overflowY: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              ["Call ID", call.callId],
              ["Direction", call.direction],
              ["From", call.fromNumber || call.callerNumber],
              ["To", call.toNumber],
              ["Duration", fmtDur(call.duration)],
              ["Cost", call.cost != null ? `$${Number(call.cost).toFixed(4)}` : "—"],
              ["Status", call.status],
              ["Category", call.category],
              ["Sentiment", call.sentiment],
              ["Area Code", call.areaCode],
              ["Pathway", call.pathway],
              ["Created", fmtDate(call.createdAt)],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: "flex", justifyContent: "space-between",
                padding: "7px 0", borderBottom: "1px solid var(--bdr)",
              }}>
                <span style={{ fontSize: 12, color: "var(--txt2)", fontWeight: 600 }}>{k}</span>
                <span style={{
                  fontSize: 12, color: k === "Status" ? (statusColor[call.status] || "var(--txt)") : "var(--txt)",
                  fontWeight: k === "Status" ? 600 : 400, textAlign: "right", maxWidth: "60%",
                }}>
                  {v || "—"}
                </span>
              </div>
            ))}
          </div>

          {call.issueSummary && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 11, color: "var(--txt2)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Issue Summary</p>
              <p style={{ fontSize: 13, color: "var(--txt)", lineHeight: 1.6, background: "var(--bg)", borderRadius: 8, padding: "10px 12px", margin: 0 }}>
                {call.issueSummary}
              </p>
            </div>
          )}

          <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--bdr)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--txt2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              🎙 Recording
            </p>
            {call.recordingUrl
              ? <audio controls src={call.recordingUrl} style={{ width: "100%" }} />
              : <p style={{ fontSize: 12, color: "var(--txt2)", margin: 0 }}>No recording available.</p>
            }
          </div>

          <div style={{ marginTop: 10, padding: "12px 14px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--bdr)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--txt2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              📄 Transcript
            </p>
            {call.transcript
              ? <pre style={{ fontSize: 12, color: "var(--txt)", whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0 }}>{call.transcript}</pre>
              : <p style={{ fontSize: 12, color: "var(--txt2)", margin: 0 }}>No transcript available.</p>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// SECTION: MAIN TABLE COMPONENT
// ---------------------------------------------------------------

export default function CallTable({ calls, full = false }) {
  // Initialization -> CallTable()-> Primary functional container for the log registry
  const [selectedCall, setSelectedCall] = useState(null);

  // Logic Branch -> cols calculation: Determines operational data depth based on 'full' flag
  const cols = full
    ? ["Time", "Direction", "From", "To", "Duration", "Status", "Category", "Sentiment", "Cost", ""]
    : ["Time", "From", "Duration", "Status", "Category", ""];

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {cols.map((c) => <th key={c} style={th}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {calls.length === 0 ? (
              <tr>
                <td colSpan={cols.length} style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--txt2)" }}>
                  No calls found for this period.
                </td>
              </tr>
            ) : calls.map((c, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--bdr)" }}>
                <td style={td}>{fmtDate(c.createdAt)}</td>
                {full && (
                  <td style={td}>
                    <span style={{
                      fontSize: 11, padding: "2px 6px", borderRadius: 4,
                      background: c.direction === "inbound" ? "rgba(0,212,160,0.1)" : "rgba(24,95,165,0.1)",
                      color: c.direction === "inbound" ? "#0F6E56" : "#185FA5",
                    }}>
                      {c.direction}
                    </span>
                  </td>
                )}
                <td style={td}>{c.fromNumber || c.callerNumber || "—"}</td>
                {full && <td style={td}>{c.toNumber || "—"}</td>}
                <td style={td}>{fmtDur(c.duration)}</td>
                <td style={td}>
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 10,
                    background: `${statusColor[c.status] || "#888780"}18`,
                    color: statusColor[c.status] || "#888780", fontWeight: 600,
                  }}>
                    {c.status || "—"}
                  </span>
                </td>
                <td style={td}>{c.category || "—"}</td>
                {full && (
                  <td style={td}>
                    <span style={{ fontSize: 11, color: sentimentColor[c.sentiment] || "var(--txt2)" }}>
                      {c.sentiment || "—"}
                    </span>
                  </td>
                )}
                {full && <td style={td}>{c.cost != null ? `$${Number(c.cost).toFixed(4)}` : "—"}</td>}
                <td style={td}>
                  <button
                    onClick={() => setSelectedCall(c)}
                    style={{
                      padding: "3px 8px", borderRadius: 5,
                      border: "1px solid var(--bdr2)",
                      background: "transparent", cursor: "pointer",
                      fontSize: 11, color: "var(--pur2)",
                    }}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CallModal call={selectedCall} onClose={() => setSelectedCall(null)} />
    </>
  );
}