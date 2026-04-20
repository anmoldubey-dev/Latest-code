import GlobalStyles from "../../components/dashboard/GlobalStyles";
import useAgentDashboard from "../../hooks/useAgentDashboard";
import { fmtDur } from "../../utils/agentHelpers";
import Sidebar from "../../components/agentDashboard/Sidebar";
import Header  from "../../components/agentDashboard/Header";
// 🟢 FIX: Removed unused 'CallsTab' to prevent Vite crash
import { OverviewTab, AnalyticsTab, SettingsTab } from "../../components/agentDashboard/Tabs";
import { useState, useEffect, useRef } from "react";
import { PhoneIncoming } from "lucide-react";

import { useCall } from "../../context/CallContext"; 
import LiveCallConsole from "../../components/LiveConsole/LiveCallConsole"; 

import ActiveCallsPanel from "../../components/IVR/ActiveCallsPanel";
import BroadcastPanel from "../../components/IVR/BroadcastPanel";
import IVRBuilderPanel from "../../components/IVR/IVRBuilderPanel";
import HistoryPanel from "../../components/IVR/HistoryPanel";

import IncomingCallNotification from "../../components/agentDashboard/IncomingCallNotification";
import OutboundCallNotification from "../../components/agentDashboard/OutboundCallNotification";
import QueueMonitor from "../../components/agentDashboard/QueueMonitor";
import { DEPARTMENTS } from '../../constants/departments.js';

function Loader() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ width: 28, height: 28, border: "2.5px solid var(--bdr2)", borderTopColor: "var(--pur)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <span style={{ fontSize: 13, color: "var(--txt2)" }}>Loading dashboard...</span>
    </div>
  );
}

function IncomingCallModal({ onAccept, onReject, callerName }) {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, backdropFilter: "blur(5px)" }}>
      <div style={{ background: "#0e1419", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "20px", padding: "30px", width: "350px", textAlign: "center", boxShadow: "0 0 40px rgba(99,102,241,0.2)" }}>
        <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "rgba(34, 197, 94, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px auto", position: "relative" }}>
          <div style={{ position: "absolute", width: "100%", height: "100%", borderRadius: "50%", border: "2px solid #22c55e", animation: "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite" }} />
          <PhoneIncoming size={32} color="#22c55e" />
        </div>
        <h2 style={{ color: "#fff", fontSize: "20px", margin: "0 0 8px 0" }}>Incoming Call</h2>
        <p style={{ color: "#818cf8", fontSize: "14px", margin: "0 0 24px 0" }}>{callerName || "User"} is requesting an AI Agent...</p>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
          <button onClick={onReject} style={{ flex: 1, padding: "12px", borderRadius: "10px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#ef4444", cursor: "pointer" }}>Reject</button>
          <button onClick={onAccept} style={{ flex: 1, padding: "12px", borderRadius: "10px", background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", cursor: "pointer" }}>Accept</button>
        </div>
      </div>
    </div>
  );
}

const API_BASE    = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/** One-time department picker shown before the dashboard fully loads. */
function DepartmentPicker({ onSelect }) {
  const [dept, setDept] = useState("General");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, backdropFilter: "blur(6px)" }}>
      <div style={{ background: "#0e1419", border: "1px solid rgba(99,102,241,0.35)", borderRadius: 20, padding: "36px 40px", width: 360, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎧</div>
        <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, margin: "0 0 6px 0" }}>Select Your Department</h2>
        <p style={{ color: "#5a7a9a", fontSize: 13, margin: "0 0 24px 0" }}>
          You'll only receive calls routed to this queue.
        </p>
        <select
          value={dept}
          onChange={e => setDept(e.target.value)}
          style={{ width: "100%", background: "#0d1621", border: "1px solid #1e2d3d", borderRadius: 10, padding: "11px 14px", color: "#e2e8f0", fontSize: 14, marginBottom: 20, cursor: "pointer", outline: "none" }}
        >
          {DEPARTMENTS.map(d => <option key={d} value={d} style={{ background: "#0d1621" }}>{d}</option>)}
        </select>
        <button
          onClick={() => onSelect(dept)}
          style={{ width: "100%", padding: "13px 0", borderRadius: 10, background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "#fff", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer" }}
        >
          Start Session →
        </button>
      </div>
    </div>
  );
}

export default function AgentDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [isRinging, setIsRinging] = useState(false);
  const [incomingCaller, setIncomingCaller] = useState("");
  const [agentDept, setAgentDept] = useState(() => {
    // Read persisted department; null means picker hasn't been shown yet this session
    try { return JSON.parse(sessionStorage.getItem("user") || "{}").department || null; } catch { return null; }
  });
  const { isActive, startCall, endCall, setLivekitSession, livekitSession } = useCall();

  // Guard: prevent the same call_id from being accepted more than once
  const acceptedCallsRef   = useRef(new Set());
  const isOutboundCallRef  = useRef(false);

  // Conference invite state
  const [confInvite, setConfInvite] = useState(null); // { room_name, inviter_name }

  // 🟢 LOGIC: Decide when to pause dashboard auto-refresh
  const isPaused = ["live-console", "broadcast", "active-calls", "phone-call"].includes(activeTab);

  const {
    token, profile, stats, calls, csatData,
    loading, chartsReady,
    dateRange, setDateRange,
    channel, setChannel,
  } = useAgentDashboard(isPaused); 

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        setIsRinging(true);
        setIncomingCaller("Rahul Sharma (WebRTC)");
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isActive) {
      setActiveTab("live-console");
      setIsRinging(false);
    }
  }, [isActive]);

  /** Called by DepartmentPicker once the agent selects their department. */
  const handleDepartmentSelect = async (dept) => {
    // Persist into sessionStorage so IncomingCallNotification picks it up
    try {
      const stored = JSON.parse(sessionStorage.getItem("user") || "{}");
      stored.department = dept;
      sessionStorage.setItem("user", JSON.stringify(stored));
    } catch { /* ignore */ }
    setAgentDept(dept);

    // Tell the CC backend this agent is online for this department
    const token = sessionStorage.getItem("token") || "";
    const stored = (() => { try { return JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { return {}; } })();
    const agentIdentity = stored.email || "";
    if (agentIdentity && token) {
      try {
        await fetch(`${API_BASE}/api/cc/agent/online`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ agent_identity: agentIdentity, agent_name: stored.name || agentIdentity, department: dept, status: "online" }),
        });
      } catch { /* non-fatal */ }
    }
  };

  // Agent heartbeat — keep last_heartbeat fresh every 30 s while dashboard is open
  useEffect(() => {
    const stored = (() => { try { return JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { return {}; } })();
    const agentIdentity = stored.email || "";
    const token = sessionStorage.getItem("token") || "";
    if (!agentIdentity || !token) return;

    const ping = () =>
      fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/cc/agent/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agent_identity: agentIdentity }),
      }).catch(() => {});

    ping();
    const id = setInterval(ping, 30_000);
    return () => clearInterval(id);
  }, []);

  // Listen for outbound_agent_hangup — fires when user doesn't answer the callback.
  // Disconnects the agent's LiveKit room so they aren't left waiting indefinitely.
  useEffect(() => {
    const stored      = (() => { try { return JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { return {}; } })();
    const agentEmail  = stored.email || "";
    if (!agentEmail) return;

    const WS_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/^http/, "ws");
    let ws;
    let isMounted      = true;
    let reconnectTimer = null;

    const connect = () => {
      if (!isMounted) return;
      ws = new WebSocket(`${WS_BASE}/api/ws/events`);

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (
            msg.type === "outbound_agent_hangup" &&
            msg.assigned_agent === agentEmail &&
            isOutboundCallRef.current
          ) {
            isOutboundCallRef.current = false;
            endCall();
            setActiveTab("overview");
          }
          if (msg.type === "conference_invite" && msg.data?.room_name) {
            setConfInvite(msg.data);
          }
        } catch { /* ignore malformed frames */ }
      };

      ws.onclose = () => {
        if (isMounted) reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      isMounted = false;
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [endCall]);

  const handleAcceptCall = () => {
    setIsRinging(false);
    startCall();
    setActiveTab("live-console");
  };

  const handleRejectCall = () => setIsRinging(false);

  const renderTab = () => {
    if (loading && !isPaused) return <Loader />; 
    
    switch (activeTab) {
      case "overview":     return <OverviewTab   stats={stats}   calls={calls}   chartsReady={chartsReady} />;
      case "analytics":    return <AnalyticsTab  stats={stats}   chartsReady={chartsReady} />;
      case "settings":     return <SettingsTab   profile={profile} />;
      case "live-console": return <LiveCallConsole />;
      
      case "broadcast":    return <BroadcastPanel />;
      case "active-calls": return <ActiveCallsPanel />;
      case "ivr-builder":  return <IVRBuilderPanel />;
      case "calls":        return <HistoryPanel />;
      case "queue-monitor": return <QueueMonitor />;
      // 🟢 SAFE PLACEHOLDER FOR DIALER
      case "phone-call":   return <div style={{padding: 40, color: '#94a3b8', textAlign: 'center', fontSize: '18px', fontWeight: 'bold'}}>📞 Phone Dialer UI Coming Soon...</div>;

      default:             return <OverviewTab   stats={stats}   calls={calls}   chartsReady={chartsReady} />;
    }
  };

  return (
    <>
      <GlobalStyles />

      {/* Department picker — shown once per session until agent selects */}
      {!agentDept && <DepartmentPicker onSelect={handleDepartmentSelect} />}

      {/* Conference invite popup */}
      {confInvite && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(5px)" }}>
          <div style={{ background: "#0e1419", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 20, padding: "30px", width: 340, textAlign: "center", boxShadow: "0 0 40px rgba(34,197,94,0.15)" }}>
            <div style={{ width: 70, height: 70, borderRadius: "50%", background: "rgba(34,197,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto", fontSize: 28, position: "relative" }}>
              <div style={{ position: "absolute", width: "100%", height: "100%", borderRadius: "50%", border: "2px solid #22c55e", animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite" }} />
              🎙
            </div>
            <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 800, margin: "0 0 6px 0" }}>Conference Invite</h2>
            <p style={{ color: "#4ade80", fontSize: 13, margin: "0 0 6px 0", fontWeight: 600 }}>{confInvite.inviter_name || "An agent"}</p>
            <p style={{ color: "#5a7a9a", fontSize: 12, margin: "0 0 22px 0" }}>is inviting you to join an active call</p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
              <button onClick={() => setConfInvite(null)} style={{ flex: 1, padding: 11, borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", cursor: "pointer", fontSize: 13 }}>Decline</button>
              <button
                onClick={async () => {
                  const stored   = (() => { try { return JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { return {}; } })();
                  const agentId  = stored.email || stored.id || "agent-unknown";
                  const roomName = confInvite.room_name;
                  setConfInvite(null);
                  if (livekitSession?.room) { setActiveTab("live-console"); return; }
                  try {
                    const res       = await fetch(`${API_BASE}/api/webrtc/livekit/token?room=${roomName}&identity=${encodeURIComponent(agentId)}&name=${encodeURIComponent(stored.name || "Agent")}`);
                    const tokenData = await res.json();
                    if (!tokenData.token) throw new Error("No token");
                    setLivekitSession({ url: import.meta.env.VITE_LIVEKIT_URL || "ws://127.0.0.1:7880", token: tokenData.token, room: roomName });
                    setActiveTab("live-console");
                    startCall();
                  } catch (e) {
                    console.error("Conference join failed:", e);
                  }
                }}
                style={{ flex: 1, padding: 11, borderRadius: 10, background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
              >
                Join Call
              </button>
            </div>
          </div>
        </div>
      )}

      <IncomingCallNotification
         department={agentDept || ""}
         onAccept={async (data) => {
             // Guard: ignore duplicate events for the same call_id
             if (!data?.call_id || acceptedCallsRef.current.has(data.call_id)) return;
             acceptedCallsRef.current.add(data.call_id);

             // Guard: don't start a new session if one is already active
             if (livekitSession?.room) {
               console.warn("[Accept] Skipping — LiveKit session already active:", livekitSession.room);
               return;
             }

             console.log("Call Accepted! Room:", data.room_name);

             // Resolve identity: prefer sessionStorage (always up-to-date) over profile prop
             const stored = (() => { try { return JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { return {}; } })();
             const agentId = stored.email || stored.id || profile?.email || "agent-unknown";

             // 1. Fetch a secure LiveKit token for the agent
             try {
                 const res = await fetch(
                   `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/webrtc/livekit/token?room=${data.room_name}&identity=${encodeURIComponent(agentId)}&name=Agent`
                 );
                 const tokenData = await res.json();

                 if (!tokenData.token) throw new Error("Empty token from backend");

                 // 2. Push the token to CallContext (LiveCallConsole will detect this instantly)
                 setLivekitSession({
                     url: import.meta.env.VITE_LIVEKIT_URL || 'ws://127.0.0.1:7880',
                     token: tokenData.token,
                     room: data.room_name
                 });

                 // 3. Switch to the console tab
                 setActiveTab("live-console");
                 startCall();
             } catch (e) {
                 console.error("Failed to fetch agent token:", e);
                 // Remove from guard so agent can retry if needed
                 acceptedCallsRef.current.delete(data.call_id);
             }
         }}
      />
      
      {/* Outbound callback notifications — fully self-contained component */}
      <OutboundCallNotification
        onAccept={(tokenData) => {
          // Guard: skip if a LiveKit session is already running
          if (livekitSession?.room) {
            console.warn("[OutboundAccept] Skipping — LiveKit session already active");
            return;
          }
          isOutboundCallRef.current = true;   // mark as outbound so hangup handler fires
          setLivekitSession({
            url:   tokenData.url || import.meta.env.VITE_LIVEKIT_URL || "ws://127.0.0.1:7880",
            token: tokenData.token,
            room:  tokenData.room,
          });
          setActiveTab("live-console");
          startCall();
        }}
      />

      <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg)" }}>
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} profile={profile} token={token} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          <Header activeTab={activeTab} profile={profile} csatData={csatData} dateRange={dateRange} setDateRange={setDateRange} channel={channel} setChannel={setChannel} stats={stats} fmtDur={fmtDur} />
          <main style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
             {renderTab()}
          </main>
        </div>
      </div>
    </>
  );
}