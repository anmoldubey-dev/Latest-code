import { useState, useEffect, useCallback } from "react";
import { Btn } from "../../components/dashboard/UI";
import api from "../../services/api";

// ======================== Call Logs Orchestrator ========================
// CallLogsPage -> Administrative telemetry node for auditing historical 
// telephony records. Manages dataset hydration through status-based 
// filtering and real-time reactive refresh triggers.
// ||
// ||
// ||
// Functions -> CallLogsPage()-> Main functional entry point for log management:
// ||           |
// ||           |--- loadCalls()-> [async Sub-process]: GET /call-logs -> 
// ||           |    Synchronizes relational telemetry from the signaling hub.
// ||           |
// ||           |--- getStatusColor()-> Mapping: Resolves terminal states to hex tokens.
// ||           |
// ||           └── Formatters:
// ||                ├── formatDate()-> Utility: Serializes temporal strings.
// ||                └── formatDuration()-> Utility: Normalizes raw telemetry seconds.
// ||
// =========================================================================

const CallLogsPage = () => {

  // ---------------------------------------------------------------
  // SECTION: STATE MANAGEMENT
  // ---------------------------------------------------------------

  // Initialization -> Reactive buffers for logs, operational states, and filtering
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");

  // ---------------------------------------------------------------
  // SECTION: DATA SYNCHRONIZATION (API)
  // ---------------------------------------------------------------

  // Sub-process -> loadCalls()-> Orchestrates the terminal data sync based on filter state
  const loadCalls = async () => {
    try {
      setLoading(true);
      setError(null);
      // Logic Branch -> URL resolution: Modulates endpoint based on active filter
      const url = filter !== "all" ? `/call-logs?status=${filter}` : `/call-logs`;
      const response = await api.get(url);
      setCalls(response.calls || []);
    } catch (err) {
      setError(err.message || "Failed to load calls");
    } finally {
      setLoading(false);
    }
  };

  // Lifecycle -> Registry Sync: Triggers hydration whenever the filter node transitions
  useEffect(() => {
    loadCalls();
  }, [filter]);

  // ---------------------------------------------------------------
  // SECTION: UI MAPPING & FORMATTERS
  // ---------------------------------------------------------------

  // Mapping -> getStatusColor()-> Resolves backend status strings to design tokens
  const getStatusColor = (status) => {
    switch (status) {
      case "completed": return "var(--grn)";
      case "failed": return "var(--org)";
      case "queued":
      case "in-progress": return "var(--pur)";
      default: return "var(--txt2)";
    }
  };

  // Utility -> formatDate()-> Serializes ISO strings for localized administrative view
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  // Utility -> formatDuration()-> Converts raw seconds into standardized MM:SS telemetry
  const formatDuration = (seconds) => {
    if (!seconds) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div style={{ padding: "36px 42px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>Call Logs</h2>
        <Btn variant="secondary" onClick={loadCalls}>↻ Refresh</Btn>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        {["all", "completed", "failed", "queued"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid",
              borderColor: filter === f ? "var(--pur)" : "var(--bdr)",
              background: filter === f ? "var(--purl)" : "transparent",
              color: filter === f ? "var(--pur2)" : "var(--txt2)",
              cursor: "pointer", textTransform: "capitalize",
              fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 500,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: 16, background: "rgba(255,107,53,0.1)", border: "1px solid var(--org)", borderRadius: 10, color: "var(--org)", marginBottom: 20 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--txt2)" }}>Loading calls...</div>
      ) : calls.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--txt2)" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📞</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No calls yet</div>
          <div style={{ color: "var(--muted)" }}>Start by sending a call from the Send Call page</div>
        </div>
      ) : (
        <div style={{ background: "var(--card)", border: "1px solid var(--bdr)", borderRadius: 14, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--bdr)", background: "var(--bg2)" }}>
                {["Phone", "Status", "Duration", "Cost", "Date"].map(h => (
                  <th key={h} style={{ padding: "14px 20px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--lbl)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr
                  key={call.id}
                  style={{ borderBottom: "1px solid var(--bdr)", cursor: "pointer" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--purl)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "16px 20px", fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}>
                    {call.phone_number || "—"}
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                      background: `${getStatusColor(call.status)}15`,
                      color: getStatusColor(call.status), textTransform: "capitalize",
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: getStatusColor(call.status) }} />
                      {call.status}
                    </span>
                  </td>
                  <td style={{ padding: "16px 20px", fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}>
                    {formatDuration(call.duration)}
                  </td>
                  <td style={{ padding: "16px 20px", fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}>
                    ${call.cost?.toFixed(2) || "0.00"}
                  </td>
                  <td style={{ padding: "16px 20px", fontSize: 13, color: "var(--txt2)" }}>
                    {formatDate(call.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CallLogsPage;