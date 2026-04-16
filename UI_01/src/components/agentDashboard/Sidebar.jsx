import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, BarChart3, Settings,
  Phone, Globe, Radio, Activity, GitBranch, History,
  LogOut, Terminal, ListChecks
} from "lucide-react";

import { useCall } from "../../context/CallContext";

// ======================== Sidebar Orchestrator ========================
// Sidebar -> Primary navigational authority for the Agent Dashboard, 
// managing modular routing, session termination, and live IVR node telemetry.
// ||
// ||
// ||
// Functions -> Sidebar()-> Main functional entry point for dashboard navigation:
// ||           |
// ||           |--- handleLogout()-> [Action Trigger]: Purges session context and dispatches redirect.
// ||           |
// ||           └── IVRCard()-> [Sub-component]: Specialized analytic node for IVR traversal metrics.
// ||                └── useEffect()-> [async Sub-process]: GET /api/agent/ivr-status -> Syncs hit counts.
// ||
// ======================================================================

// ---------------------------------------------------------------
// SECTION: NAVIGATION CONFIGURATION
// ---------------------------------------------------------------

const SECTIONS = [
  {
    title: "SYSTEM",
    items: [
      { id: "overview", icon: <LayoutDashboard size={16} />, label: "Overview" },
      { id: "analytics", icon: <BarChart3 size={16} />, label: "Analytics" },
      { id: "settings", icon: <Settings size={16} />, label: "Settings" },
    ]
  },
  {
    title: "CALLS",
    items: [
      { id: "phone-call", icon: <Phone size={16} />, label: "Phone Call" },
      { id: "live-console", icon: <Globe size={16} />, label: "Browser Call" },
      { id: "broadcast", icon: <Radio size={16} />, label: "Broadcast" },
    ]
  },
  {
    title: "MONITOR",
    items: [
      { id: "active-calls", icon: <Activity size={16} />, label: "Active Calls" },
      { id: "ivr-builder", icon: <GitBranch size={16} />, label: "IVR Builder" },
      { id: "calls", icon: <History size={16} />, label: "History" },
      { id: "queue-monitor", icon: <ListChecks size={16} />, label: "Queue Monitor" },
    ]
  }
];

// ---------------------------------------------------------------
// SECTION: IVR ANALYTICS SUB-COMPONENT
// ---------------------------------------------------------------

function IVRCard({ token }) {
  // Initialization -> IVRCard()-> Renders live traversal metrics for active IVR nodes
  const [nodes, setNodes] = useState([]);

  useEffect(() => {
    // Sub-process -> useEffect()-> Executes asynchronous telemetry sync for IVR activity levels
    if (!token) return;
    fetch("/api/agent/ivr-status", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setNodes(d.nodes || []))
      .catch(() => { });
  }, [token]);

  const max = Math.max(...nodes.map((n) => n.hits), 1);

  return (
    <div style={{ background: "#0e1419", border: "1px solid #1e2d3d", borderRadius: 12, padding: "12px", margin: "10px 12px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <GitBranch size={14} color="#818cf8" />
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5a7a9a" }}>IVR Activity</span>
      </div>
      {nodes.length === 0 ? (
        <p style={{ fontSize: 11, color: "#5a7a9a", textAlign: "center" }}>No data</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {nodes.map((n, i) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 4 }}>
                <span style={{ color: "#e8f0f8" }}>{n.node}</span>
                <span style={{ color: "#5a7a9a" }}>{n.hits}</span>
              </div>
              <div style={{ height: 3, background: "#141c24", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${(n.hits / max) * 100}%`, background: "#6366f1", borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// SECTION: MAIN SIDEBAR COMPONENT
// ---------------------------------------------------------------

export default function Sidebar({ activeTab, setActiveTab, profile, token }) {
  // Initialization -> Sidebar()-> Orchestrates the global dashboard layout and session state
  const navigate = useNavigate();
  const { isActive: isSystemLive } = useCall();

  const handleLogout = () => {
    // Action Trigger -> handleLogout()-> Terminates the agent session and flushes auth buffers
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    navigate("/login");
  };

  let initials = "AG";
  if (profile && profile.name && typeof profile.name === 'string') {
    initials = profile.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  }

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <aside style={{ width: 250, minWidth: 250, background: "#080c10", borderRight: "1px solid #141c24", display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0, overflowY: "auto" }}>

      <div style={{ padding: "24px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 34, height: 34, background: "#6366f1", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
          <Terminal size={18} />
        </div>
        <div>
          <h1 style={{ fontSize: 14, fontWeight: "bold", color: "#fff", margin: 0 }}>SR Comsoft</h1>
          <p style={{ fontSize: 10, color: "#5a7a9a", margin: 0 }}>AI CALL CENTER</p>
        </div>
      </div>

      <div style={{ padding: "0 20px 24px", borderBottom: "1px solid #141c24" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#1a202c", color: "#818cf8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, border: "1px solid #1e2d3d" }}>
            {initials}
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: 0 }}>{profile?.name || "Agent"}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }}></span>
              <span style={{ fontSize: 10, color: "#5a7a9a", fontWeight: 600 }}>Active & Ready</span>
            </div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: "20px 12px" }}>
        {SECTIONS.map((section) => (
          <div key={section.title} style={{ marginBottom: "24px" }}>
            <p style={{ padding: "0 12px", fontSize: "10px", fontWeight: 800, color: "#2d3748", letterSpacing: "0.15em", marginBottom: "12px" }}>
              {section.title}
            </p>
            {section.items.map((item) => {
              const isActive = activeTab === item.id;
              const isLive = item.id === "live-console";

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px",
                    borderRadius: "10px", border: "none", cursor: "pointer", fontSize: "13px",
                    background: isActive ? "rgba(99, 102, 241, 0.1)" : "transparent",
                    color: isActive ? "#818cf8" : "#5a7a9a",
                    marginBottom: "4px"
                  }}
                >
                  <span style={{ color: isActive ? "#818cf8" : "#5a7a9a" }}>{item.icon}</span>
                  {item.label}

                  {isLive && isSystemLive && (
                    <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 8px #ef4444" }} />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <IVRCard token={token} />

      <div style={{ padding: "16px 12px", borderTop: "1px solid #141c24" }}>
        <button
          onClick={handleLogout}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "none", background: "transparent", color: "#f87171", fontSize: "12px", cursor: "pointer" }}
        >
          <LogOut size={16} /> Logout System
        </button>
      </div>
    </aside>
  );
}