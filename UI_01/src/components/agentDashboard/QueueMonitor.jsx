import { useState, useEffect, useRef } from "react";
import { Users, PhoneIncoming, Circle, RefreshCw } from "lucide-react";

// ======================== Queue Monitor Orchestrator ========================
// QueueMonitor -> Dual-context monitoring engine for the Agent Dashboard, 
// providing real-time visibility into IVR wait queues and agent availability.
// ||
// ||
// ||
// Functions -> QueueMonitor()-> Main orchestrator for view-state management:
// ||           |
// ||           |--- WaitList()-> [Sub-module]: Manages inbound caller telemetry.
// ||           |    └── poll()-> [async Sub-process]: GET /api/cc/queue -> 3s Interval.
// ||           |
// ||           |--- ActiveAgents()-> [Sub-module]: Manages workforce status telemetry.
// ||           |    └── poll()-> [async Sub-process]: GET /api/cc/agents/status -> 5s Interval.
// ||           |
// ||           |--- StatusDot()-> [Helper]: Maps connectivity states to design tokens.
// ||           |
// ||           └── setView()-> Action Trigger: Transitions between WaitList and ActiveAgents views.
// ||
// ============================================================================

// ---------------------------------------------------------------
// SECTION: CONFIGURATION & DESIGN TOKENS
// ---------------------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const STATUS_STYLE = {
  online: { color: "#22c55e", label: "Online" },
  busy: { color: "#f59e0b", label: "Busy" },
  ignoring_outbounds: { color: "#f97316", label: "Snoozed" },
  offline: { color: "#64748b", label: "Offline" },
};

// ---------------------------------------------------------------
// SECTION: HELPER COMPONENTS
// ---------------------------------------------------------------

function StatusDot({ status }) {
  // Presentation -> StatusDot()-> Maps operational states to semantic visual tokens
  const s = STATUS_STYLE[status] || STATUS_STYLE.offline;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <Circle size={7} fill={s.color} color={s.color} />
      <span style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.label}</span>
    </span>
  );
}

// ---------------------------------------------------------------
// SECTION: WAIT LIST MODULE
// ---------------------------------------------------------------

function WaitList({ department, token }) {
  // Initialization -> WaitList()-> Functional component for tracking the inbound caller queue
  const [callers, setCallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastPoll, setLastPoll] = useState(null);

  const poll = async () => {
    // Internal Call -> poll()-> Synchronizes local state with the IVR waiting pool
    try {
      const params = department ? `?department=${encodeURIComponent(department)}` : "";
      const res = await fetch(`${API_BASE}/api/cc/queue${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();

      if (department && data.callers) {
        setCallers(data.callers);
      } else if (!department) {
        // Logic Branch -> Flattening logic for cross-departmental monitoring
        const all = [];
        for (const [dept, items] of Object.entries(data)) {
          if (Array.isArray(items)) {
            items.forEach(c => all.push({ ...c, department: dept }));
          }
        }
        setCallers(all);
      }
      setLastPoll(new Date());
    } catch {
      /* Exception Handling -> Fail-silent ensures UI stability during network drops */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Lifecycle -> Setup 3000ms polling interval for wait-list accuracy
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [department]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0", color: "#5a7a9a", gap: 10 }}>
        <RefreshCw size={14} style={{ animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 13 }}>Loading queue…</span>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 16px 0", borderBottom: "1px solid #141c24", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <PhoneIncoming size={15} color="#818cf8" />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>
            {department ? `${department} Queue` : "All Queues"}
          </span>
          <span style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
            {callers.length} waiting
          </span>
        </div>
        {lastPoll && (
          <span style={{ fontSize: 10, color: "#2d3748" }}>
            Updated {lastPoll.toLocaleTimeString()}
          </span>
        )}
      </div>

      {callers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#2d3748" }}>
          <PhoneIncoming size={28} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ fontSize: 13 }}>No callers in queue</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {callers.map((c, i) => (
            <div
              key={c.session_id}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                background: "rgba(255,255,255,0.02)", border: "1px solid #141c24",
                borderRadius: 10, padding: "12px 16px",
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: i === 0 ? "rgba(34,197,94,0.15)" : "rgba(99,102,241,0.1)",
                border: `1px solid ${i === 0 ? "rgba(34,197,94,0.3)" : "rgba(99,102,241,0.2)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800,
                color: i === 0 ? "#22c55e" : "#818cf8",
              }}>
                {c.position || i + 1}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.caller_name || c.user_email?.split("@")[0] || c.session_id.slice(0, 8).toUpperCase()}
                </p>
                {c.department && (
                  <p style={{ fontSize: 10, color: "#5a7a9a", margin: "2px 0 0 0" }}>{c.department}</p>
                )}
              </div>

              <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700 }}>LIVE</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// SECTION: ACTIVE AGENTS MODULE
// ---------------------------------------------------------------

function ActiveAgents({ token }) {
  // Initialization -> ActiveAgents()-> Functional component for tracking agent fleet statuses
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  const poll = async () => {
    // Internal Call -> poll()-> Synchronizes local state with the global workforce status registry
    try {
      const res = await fetch(`${API_BASE}/api/cc/agents/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setAgents(data.agents || []);
    } catch {
      /* Exception Handling -> Preservation of stale state during connectivity interruption */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Lifecycle -> Setup 5000ms polling interval for workforce status telemetry
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0", color: "#5a7a9a", gap: 10 }}>
        <RefreshCw size={14} style={{ animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 13 }}>Loading agents…</span>
      </div>
    );
  }

  // Logic Branch -> byDept: Aggregates agent nodes into departmental groups for structured rendering
  const byDept = agents.reduce((acc, a) => {
    const d = a.department || "General";
    if (!acc[d]) acc[d] = [];
    acc[d].push(a);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 0 16px 0", borderBottom: "1px solid #141c24", marginBottom: 16 }}>
        <Users size={15} color="#818cf8" />
        <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>Active Agents</span>
        <span style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
          {agents.filter(a => a.status === "online").length} free
        </span>
      </div>

      {agents.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#2d3748" }}>
          <Users size={28} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ fontSize: 13 }}>No agents online</p>
        </div>
      ) : (
        Object.entries(byDept).map(([dept, deptAgents]) => (
          <div key={dept} style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: "#2d3748", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
              {dept}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {deptAgents.map(a => (
                <div
                  key={a.agent_identity}
                  style={{
                    background: "rgba(255,255,255,0.02)", border: "1px solid #141c24",
                    borderRadius: 10, padding: "10px 12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800, color: "#818cf8",
                    }}>
                      {(a.agent_name || a.agent_identity || "?").substring(0, 2).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.agent_name || a.agent_identity}
                      </p>
                    </div>
                  </div>
                  <StatusDot status={a.status} />
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// SECTION: MAIN CONTAINER (QUEUEMONITOR)
// ---------------------------------------------------------------

export default function QueueMonitor() {
  // Initialization -> QueueMonitor()-> Primary container for toggling between queue and agent perspectives
  const [view, setView] = useState("waitlist");

  // Initialization -> Data retrieval from session storage for authorization and routing context
  const stored = (() => { try { return JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { return {}; } })();
  const department = stored.department || "";
  const token = sessionStorage.getItem("token") || "";

  const tabStyle = (active) => ({
    flex: 1, padding: "8px 0", border: "none", cursor: "pointer",
    borderRadius: 8, fontSize: 12, fontWeight: 700, transition: "all 0.15s",
    background: active ? "rgba(99,102,241,0.15)" : "transparent",
    color: active ? "#818cf8" : "#5a7a9a",
  });

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.02)", border: "1px solid #141c24", borderRadius: 10, padding: 4, marginBottom: 20 }}>
        <button style={tabStyle(view === "waitlist")} onClick={() => setView("waitlist")}>
          Wait List
        </button>
        <button style={tabStyle(view === "agents")} onClick={() => setView("agents")}>
          Active Agents
        </button>
      </div>

      {view === "waitlist"
        ? <WaitList department={department} token={token} />
        : <ActiveAgents token={token} />
      }
    </div>
  );
}