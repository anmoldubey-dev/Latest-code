// ======================== User Home Orchestrator ========================
// HomePage -> Central aggregation node for user-specific telemetry. 
// Facilitates real-time infrastructure overview, activity auditing, 
// and provides high-level interaction gateways for IVR building 
// and real-time WebRTC signaling.
// ||
// ||
// ||
// Functions -> HomePage()-> Main functional entry point for dashboard view:
// ||           |
// ||           |--- fetchAll()-> [async Sub-process]: GET /home/stats & /activity -> 
// ||           |    Hydrates platform telemetry with 30s temporal polling.
// ||           |
// ||           |--- go()-> [Action Trigger]: Logic Branch -> Orchestrates 
// ||           |    navigational pathing and modal visibility transitions.
// ||           |
// ||           |--- fmtDuration()-> [Internal Utility]: Normalizes temporal 
// ||           |    telemetry into human-readable strings.
// ||           |
// ||           └── CallbackNotification()-> [Signal Listener]: Real-time 
// ||                monitoring of inbound session events for the user node.
// ||
// =========================================================================

import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { Btn, FCard, SecTitle, EmptyState } from "../../components/dashboard/UI";
import api from "../../services/api";
import IVRBuilder from "../../components/IVR/IVRBuilder.jsx";
import UserBrowserCall from "../../components/UserDashboard/UserBrowserCall.jsx";
import CallbackNotification from "../../components/UserDashboard/CallbackNotification.jsx";

// ---------------------------------------------------------------
// SECTION: CONSTANTS & DESIGN TOKENS
// ---------------------------------------------------------------

const QA = [
  { icon: "⧖", t: "Conversational Pathways", d: "Design infinitely complex, branching flows...", page: "pathways" },
  { icon: "↗", t: "Live Browser Call", d: "Connect instantly with an AI Agent...", page: "sendCall" },
  { icon: "⬡", t: "Send Bulk Calls", d: "Upload a CSV or JSON file to send out mass calls...", page: "batches" },
  { icon: "#", t: "Buy Phone Number", d: "Instantly purchase and configure a phone number...", page: null },
  { icon: "◑", t: "Voices & Voice Cloning", d: "View the voices you have access to...", page: "voices" },
  { icon: "◎", t: "Billing & Credits", d: "Purchase more credits to send out more calls...", page: "billing" },
];

const listRow = { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, transition: "background 0.18s" };
const iconBox = { width: 36, height: 36, borderRadius: 10, background: "var(--bg2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 };
const hoverItem = {
  onMouseEnter: (e) => (e.currentTarget.style.background = "var(--purl)"),
  onMouseLeave: (e) => (e.currentTarget.style.background = "transparent"),
};

// ---------------------------------------------------------------
// SECTION: MAIN HOME PAGE COMPONENT
// ---------------------------------------------------------------

export default function HomePage() {
  const navigate = useNavigate();

  // Initialization -> Dashboard state buffers and modal visibility flags
  const [stats, setStats] = useState({ total_calls_7d: null, avg_per_day: null, active_regions: null });
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showCallWidget, setShowCallWidget] = useState(false);
  const [showIVRBuilder, setShowIVRBuilder] = useState(false);

  const { user: currentUser = {} } = useAuth();

  // ---------------------------------------------------------------
  // SECTION: DATA LIFECYCLE (SYNC)
  // ---------------------------------------------------------------

  // Sub-process -> fetchAll()-> Orchestrates parallel telemetry hydration from the master API
  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, activityRes] = await Promise.all([
        api.get("/home/stats"),
        api.get("/home/recent-activity?limit=5"),
      ]);
      setStats(statsRes);
      setActivity(activityRes);
    } catch (err) {
      console.error("Home fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialization -> Lifecycle Hook: Triggers baseline sync on component ingress
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Sub-process -> polling: Executes 30s temporal refresh cycles for infrastructure monitoring
  useEffect(() => {
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ---------------------------------------------------------------
  // SECTION: ACTION HANDLERS (NAVIGATION & MODALS)
  // ---------------------------------------------------------------

  // Action Trigger -> go()-> Dispatches routing requests or modulates modal visibility
  const go = (page) => {
    // Logic Branch -> Modal Interception: Checks if the target path requires an overlay node
    if (page === "sendCall") {
      setShowCallWidget(true);
      return;
    }
    if (page === "pathways") {
      setShowIVRBuilder(true);
      return;
    }
    const routes = { batches: "/user/batches", voices: "/user/voices", billing: "/user/billing" };
    navigate(routes[page] || "/user");
  };

  // Internal Utility -> fmtDuration()-> Serializes raw telemetry seconds into human-readable strings
  const fmtDuration = (secs) => {
    if (!secs) return "0m 0s";
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  const statCards = [
    ["Total Calls (7D)", stats.total_calls_7d],
    ["AVG / Day", stats.avg_per_day],
    ["Active Regions", stats.active_regions],
  ];

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div style={{ padding: "38px 44px" }}>
      <CallbackNotification userEmail={currentUser.email || ""} />

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 5 }}>
            Welcome back, <span className="glow">{currentUser.name || "User"}</span>
          </h1>
          <p style={{ fontSize: 14.5, color: "var(--txt2)" }}>Real-time overview of your call infrastructure.</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Btn variant="secondary" onClick={() => go("pathways")}>⧖ Build Pathway</Btn>
          <Btn onClick={() => go("sendCall")}>↗ Live Call</Btn>
          <Btn variant="secondary" onClick={() => navigate("/user/ai-agents")} style={{ background: "rgba(34,197,94,0.1)", color: "var(--grn)", border: "1px solid rgba(34,197,94,0.25)" }}>🤖 AI Agents</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 24 }}>
        {statCards.map(([lbl, val]) => (
          <FCard key={lbl} style={{ padding: "22px 28px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--lbl)", marginBottom: 10 }}>{lbl}</div>
            <div className="mono glow" style={{ fontSize: 36, fontWeight: 800 }}>
              {loading ? "—" : (val ?? "0")}
            </div>
          </FCard>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 350px", gap: 22 }}>

        <div>
          <FCard style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
              <SecTitle>📍 Call Distribution</SecTitle>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--grn)" }}>
                <span className="live-dot" /> LIVE
              </div>
            </div>
            <EmptyState
              icon="⚠"
              text="Your area code data will show up here once you send your first call."
              action="Connect to an Agent →"
              onAction={() => go("sendCall")}
            />
          </FCard>

          <FCard>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
              <SecTitle>≡ Recent Activity</SecTitle>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                <span className="spin-anim">⟳</span> Updating...
              </div>
            </div>

            {activity.length === 0 ? (
              <EmptyState
                icon="⚠"
                text="No call activity yet. Connect to an agent to see real-time metrics."
                action="Connect to an Agent →"
                onAction={() => go("sendCall")}
              />
            ) : (
              <div>
                {activity.map((call) => (
                  <div key={call.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, color: call.direction === "inbound" ? "var(--grn)" : "#3b82f6", fontWeight: 700 }}>
                        {call.direction === "inbound" ? "↙ In" : "↗ Out"}
                      </span>
                      <span style={{ fontSize: 13, color: "var(--txt)" }}>{call.to_number || "Web Client"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{fmtDuration(call.duration_seconds)}</span>
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 20,
                        background: call.status === "completed" ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)",
                        color: call.status === "completed" ? "var(--grn)" : "var(--muted)",
                      }}>
                        {call.status}
                      </span>
                    </div>
                  </div>
                ))}
                <div style={{ textAlign: "right", marginTop: 12 }}>
                  <button onClick={() => navigate("/user/analytics")} style={{ background: "none", border: "none", color: "var(--pur2)", fontSize: 12, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>
                    View all →
                  </button>
                </div>
              </div>
            )}
          </FCard>
        </div>

        <div>
          <FCard style={{ padding: 20, marginBottom: 18 }}>
            <SecTitle style={{ marginBottom: 16 }}>Quick Actions</SecTitle>
            {QA.map((q) => (
              <div key={q.t} onClick={() => q.page && go(q.page)} style={{ ...listRow, cursor: q.page ? "pointer" : "default", marginBottom: 3 }} {...(q.page ? hoverItem : {})}>
                <div style={iconBox}>{q.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{q.t}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.d}</div>
                </div>
                <span style={{ color: "var(--muted)", fontSize: 18 }}>›</span>
              </div>
            ))}
          </FCard>

          <FCard style={{ padding: 20 }}>
            <SecTitle style={{ marginBottom: 14 }}>Resources</SecTitle>
            <div style={{ ...listRow, cursor: "pointer" }} {...hoverItem}>
              <div style={iconBox}>🎓</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>SR Comsoft</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Comprehensive guides & tutorials</div>
              </div>
              <span style={{ color: "var(--pur2)", fontSize: 14 }}>↗</span>
            </div>
          </FCard>
        </div>
      </div>

      {showCallWidget && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{ position: 'relative', width: '350px', zIndex: 10000 }}>
            <button
              onClick={() => setShowCallWidget(false)}
              style={{ position: 'absolute', top: '-12px', right: '-12px', background: '#ef4444', border: 'none', color: 'white', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
            >
              ✖
            </button>
            <UserBrowserCall userName={currentUser.name || "User"} userEmail={currentUser.email || "guest"} />
          </div>
        </div>
      )}

      {showIVRBuilder && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{ position: 'relative', width: '500px', background: '#0f172a', borderRadius: '16px', padding: '2px', border: '1px solid #1e293b' }}>
            <button
              onClick={() => setShowIVRBuilder(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#64748b', fontSize: '20px', cursor: 'pointer', zIndex: 10 }}
            >
              ✖
            </button>
            <IVRBuilder />
          </div>
        </div>
      )}

    </div>
  );
}