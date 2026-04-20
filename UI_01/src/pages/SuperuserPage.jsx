// ======================== Superuser Overview Page ========================
import GlobalStyles from "../components/dashboard/GlobalStyles";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

// ✅ CORRECTED IMPORTS
import ActiveCallsPanel from "../components/IVR/ActiveCallsPanel";
import HistoryPanel from "../components/IVR/HistoryPanel";
import BroadcastPanel from "../components/IVR/BroadcastPanel";
import QueueWaitTimesPanel from "../components/superuser/QueueWaitTimesPanel";

export default function SuperuserPage() {
  const navigate = useNavigate();
  
  const [activeView, setActiveView] = useState("overview");

  const handleLogout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <>
      <GlobalStyles />
      <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>

        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside style={{
          position: "fixed", left: 0, top: 0,
          height: "100vh", width: 240,
          background: "var(--bg2)",
          borderRight: "1px solid var(--bdr)",
          display: "flex", flexDirection: "column",
          zIndex: 100,
        }}>
          {/* Logo */}
          <div style={{ padding: "22px 18px 17px", borderBottom: "1px solid var(--bdr)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: "linear-gradient(135deg, var(--pur), var(--acc))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 900, color: "#fff", flexShrink: 0,
              }}>
                SR
              </div>
              <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2, color: "var(--txt)" }}>
                SR<br />
                <span style={{ color: "var(--txt2)", fontWeight: 500 }}>Comsoft Ai</span>
              </span>
            </div>
          </div>

          {/* Superuser badge */}
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--bdr)" }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "1px",
              textTransform: "uppercase", padding: "4px 12px", borderRadius: 20,
              background: "rgba(124,92,255,0.12)", color: "var(--pur2)",
              border: "1px solid var(--bdr2)",
            }}>
              Superuser
            </span>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: 'auto' }}>
            
            <div style={{ fontSize: '10px', color: 'var(--txt2)', padding: '10px 12px 4px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Main Menu</div>
            
            {[
              { label: "Overview",  icon: "◈", id: "overview", action: () => setActiveView("overview") },
              { label: "Dashboard", icon: "⬡", id: "dashboard", action: () => navigate("/superuser/dashboard") },
              { label: "Agents",    icon: "◉", id: "agents", action: () => navigate("/superuser/agents") },
              { label: "Analytics", icon: "↗", id: "analytics", action: () => navigate("/superuser/analytics") },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 9, width: "100%",
                  border: `1px solid ${activeView === item.id ? "var(--bdr2)" : "transparent"}`,
                  background: activeView === item.id ? "var(--purl)" : "transparent",
                  color: activeView === item.id ? "var(--pur2)" : "var(--txt2)",
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 13.5, fontWeight: 500,
                  cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (activeView !== item.id) {
                    e.currentTarget.style.background = "var(--purl)";
                    e.currentTarget.style.color = "var(--txt)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeView !== item.id) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--txt2)";
                  }
                }}
              >
                <span style={{ width: 18, textAlign: "center", fontSize: 15 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}

            <div style={{ fontSize: '10px', color: 'var(--txt2)', padding: '16px 12px 4px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Live Monitoring</div>
            
            {/* ✅ NAYA: Live Console added to Sidebar */}
            {[
              { label: "Live Console", icon: "🖥️", id: "live_console" },
              { label: "Live Calls",   icon: "📞", id: "live_calls" },
              { label: "Call History", icon: "📜", id: "history" },
              { label: "Broadcast",    icon: "📻", id: "broadcast" },
              { label: "Scheduling",     icon: "🗓️", id: "scheduling",     action: () => navigate("/superuser/scheduling") },
              { label: "Business Hours", icon: "🕐", id: "business-hours", action: () => navigate("/superuser/business-hours") },
              { label: "Queue Wait Times", icon: "⏱", id: "queue_wait_times" },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => item.action ? item.action() : setActiveView(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 9, width: "100%",
                  border: `1px solid ${activeView === item.id ? "var(--bdr2)" : "transparent"}`,
                  background: activeView === item.id ? "rgba(14,165,233,0.1)" : "transparent",
                  color: activeView === item.id ? "#0ea5e9" : "var(--txt2)",
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 13.5, fontWeight: 500,
                  cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (activeView !== item.id) {
                    e.currentTarget.style.background = "var(--purl)";
                    e.currentTarget.style.color = "var(--txt)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeView !== item.id) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--txt2)";
                  }
                }}
              >
                <span style={{ width: 18, textAlign: "center", fontSize: 15 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* Sign out */}
          <div style={{ padding: "14px 10px", borderTop: "1px solid var(--bdr)" }}>
            <button
              onClick={handleLogout}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 9, width: "100%",
                border: "1px solid transparent",
                background: "transparent", color: "var(--red)",
                fontFamily: "'Syne', sans-serif",
                fontSize: 13.5, fontWeight: 500,
                cursor: "pointer", textAlign: "left",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,71,87,0.08)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ width: 18, textAlign: "center", fontSize: 15 }}>⎋</span>
              Sign Out
            </button>
          </div>
        </aside>

        {/* ── Main Content ─────────────────────────────────────────── */}
        <main style={{ marginLeft: 240, flex: 1, padding: "38px 44px" }}>
          <div style={{ marginBottom: 36 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <h1 style={{ fontSize: 30, fontWeight: 800 }}>Superuser Panel</h1>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "1px",
                textTransform: "uppercase", padding: "3px 10px", borderRadius: 20,
                background: "rgba(124,92,255,0.12)", color: "var(--pur2)",
                border: "1px solid var(--bdr2)",
              }}>
                Superuser
              </span>
            </div>
            <p style={{ fontSize: 14, color: "var(--txt2)" }}>
              Team overview — monitor agents, calls, and performance.
            </p>
          </div>

          {/* DYNAMIC RENDERING: activeView ke hisaab se component dikhayenge */}
          
          {activeView === "overview" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {[
                { icon: "⬡", title: "Go to Dashboard", desc: "Full 3D analytics dashboard", action: () => navigate("/superuser/dashboard") },
                { icon: "◉", title: "View Agents",      desc: "All agents allocated to your team", action: () => navigate("/superuser/agents") },
                { icon: "↗", title: "Call Analytics",   desc: "Deep dive into call data", action: () => navigate("/superuser/analytics") },
                // ✅ NAYA: Shortcuts for new tools including Live Console
                { icon: "🖥️", title: "Live Console", desc: "Takeover & assist agents", action: () => setActiveView("live_console") },
                { icon: "📞", title: "Live Calls",   desc: "Monitor active agent calls", action: () => setActiveView("live_calls") },
                { icon: "📜", title: "Call History", desc: "Review past conversations", action: () => setActiveView("history") },
                { icon: "📻", title: "Broadcast",      desc: "Send audio messages to team", action: () => setActiveView("broadcast") },
                { icon: "🕐", title: "Business Hours", desc: "Set working hours & holidays", action: () => navigate("/superuser/business-hours") },
                { icon: "⏱", title: "Queue Wait Times", desc: "Configure wait time per queue position", action: () => setActiveView("queue_wait_times") },
              ].map((card) => (
                <div
                  key={card.title}
                  onClick={card.action}
                  style={{
                    background: "var(--card)", border: "1px solid var(--bdr)",
                    borderRadius: 16, padding: 24, cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--card-h)";
                    e.currentTarget.style.borderColor = "var(--bdr2)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--card)";
                    e.currentTarget.style.borderColor = "var(--bdr)";
                  }}
                >
                  <div style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: "var(--purl)", border: "1px solid var(--bdr2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, color: "var(--pur2)", marginBottom: 14,
                  }}>
                    {card.icon}
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "var(--txt)", marginBottom: 6 }}>{card.title}</p>
                  <p style={{ fontSize: 13, color: "var(--txt2)" }}>{card.desc}</p>
                </div>
              ))}
            </div>
          )}

          {/* ✅ NAYA: Live Console Rendering Block */}
          {activeView === "live_console" && (
            <div style={{ background: "var(--bg2)", borderRadius: '16px', padding: '30px', border: '1px solid var(--bdr)' }}>
               <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#e8f0f8', marginBottom: '8px' }}>🖥️ Agent Live Console</h2>
               <p style={{ color: '#5a7a9a', fontSize: '13px', marginBottom: '24px' }}>
                 When you takeover a call, the live WebRTC audio and real-time transcripts will load here.
               </p>
               <div style={{ border: '1px dashed var(--bdr2)', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#5a7a9a' }}>
                 Ready for incoming takeover sessions...
               </div>
               {/* Note: Hum yahan par tumhara actual AgentConsole component mount karenge jab tumhe uski UI set karni hogi */}
            </div>
          )}

          {activeView === "live_calls" && (
            <div style={{ background: "var(--bg2)", borderRadius: '16px', padding: '24px', border: '1px solid var(--bdr)' }}>
              <ActiveCallsPanel />
            </div>
          )}

          {activeView === "history" && (
            <div style={{ background: "var(--bg2)", borderRadius: '16px', padding: '24px', border: '1px solid var(--bdr)' }}>
              <HistoryPanel />
            </div>
          )}

          {activeView === "broadcast" && (
            <div style={{ background: "var(--bg2)", borderRadius: '16px', padding: '24px', border: '1px solid var(--bdr)' }}>
              <BroadcastPanel />
            </div>
          )}

          {activeView === "queue_wait_times" && (
            <div style={{ background: "var(--bg2)", borderRadius: '16px', padding: '30px', border: '1px solid var(--bdr)' }}>
              <QueueWaitTimesPanel />
            </div>
          )}

        </main>
      </div>
    </>
  );
}