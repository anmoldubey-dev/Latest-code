// ======================== AgentPage ========================
// AgentPage -> Personal profile/settings page for the logged-in agent.
//              Fetches singular data from /api/agent/profile.
// ==========================================================

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// ---------------------------------------------------------------
// SECTION: SUB-COMPONENTS
// ---------------------------------------------------------------

// MetricCard -> Displays individual agent KPIs like CSAT or Latency
function MetricCard({ label, value, color }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, padding: "20px 24px", flex: 1
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>
        {label}
      </p>
      <p style={{ fontSize: 28, fontWeight: 800, color: color }}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------
// SECTION: MAIN COMPONENT
// ---------------------------------------------------------------
export default function AgentPage() {
  const navigate = useNavigate();
  const token = sessionStorage.getItem("token");

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ---------------------------------------------------------------
  // SECTION: DATA FETCHING
  // ---------------------------------------------------------------
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // IMPORTANT: Singular endpoint used to avoid 403 Forbidden for Agents
        const res = await fetch("/api/agent/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setProfile(data); // data includes name, modelVariant, csat, etc.
      } catch (err) {
        setError("Failed to load your profile. Please check your connection.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [token]);

  // ---------------------------------------------------------------
  // SECTION: RENDER
  // ---------------------------------------------------------------
  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#020617", color: "#6366F1" }}>
      Loading Profile...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#020617", color: "#e2e8f0", padding: "40px" }}>
      
      {/* Header */}
      <div style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>Agent Profile</h1>
          <p style={{ color: "#64748b", fontSize: 14 }}>View your personal performance and configuration.</p>
        </div>
        <button 
          onClick={() => navigate("/agent/dashboard")}
          style={{ padding: "10px 20px", borderRadius: "10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer" }}
        >
          Back to Dashboard
        </button>
      </div>

      {error && <div style={{ color: "#EF4444", marginBottom: "20px" }}>{error}</div>}

      {/* Profile Section */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px" }}>
        
        {/* Sidebar Info */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "20px", padding: "30px" }}>
          <div style={{ width: "80px", height: "80px", borderRadius: "20px", background: "linear-gradient(135deg, #6366F1, #8B5CF6)", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", fontWeight: "800" }}>
            {profile?.name?.substring(0, 1)}
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: "4px" }}>{profile?.name}</h2>
          <p style={{ color: "#6366F1", fontWeight: 600, fontSize: 14, marginBottom: "20px" }}>Role: AI Agent</p>
          
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: 13 }}><span style={{ color: "#64748b" }}>Email:</span> {profile?.email}</div>
            <div style={{ fontSize: 13 }}><span style={{ color: "#64748b" }}>Model:</span> {profile?.modelVariant}</div>
            <div style={{ fontSize: 13 }}><span style={{ color: "#64748b" }}>Skill:</span> {profile?.skillLevel}</div>
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", gap: "16px" }}>
            <MetricCard label="CSAT Score" value={`${profile?.csat || 0}/5.0`} color="#10B981" />
            <MetricCard label="Calls Handled" value={profile?.callsHandled || 0} color="#6366F1" />
          </div>
          <div style={{ display: "flex", gap: "16px" }}>
            <MetricCard label="Avg Latency" value={`${profile?.avgLatencyMs || 0}ms`} color="#F59E0B" />
            <MetricCard label="Resolved" value={profile?.resolvedCount || 0} color="#10B981" />
          </div>
        </div>

      </div>
    </div>
  );
}