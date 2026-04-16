import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

// ======================== Agent Profile Orchestrator ========================
// AgentDetail -> Deep-dive analytical node for agent-specific performance profiling.
// Aggregates real-time telemetry from MySQL (via Port 5000), projecting 
// traffic distribution, sentiment matrices, and media-rich call logs into 
// a synchronized diagnostic dashboard.
// ||
// ||
// ||
// Functions -> AgentDetail()-> Primary functional entry point for agent telemetry:
// ||           |
// ||           |--- fetchAgentData()-> [async Action Trigger]: GET /api/agents/:id -> 
// ||           |    Synchronizes profile metadata and session logs with silent polling.
// ||           |
// ||           |--- MiniBubbleChart()-> [Visual Sub-node]: Canvas-based engine 
// ||           |    mapping Quality vs. Volume into a 2D performance plane.
// ||           |
// ||           └── (Atomic UI Mapping):
// ||                ├── SentimentBar()-> Visualizes relative customer emotion.
// ||                ├── SentimentDistribution()-> Normalizes emotional density logs.
// ||                └── getStatusColor()-> Design Token: Maps resolution terminal states.
// ||
// ============================================================================

// ✅ VITE FIX: Added API Base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ---------------------------------------------------------------
// SECTION: ATOMIC PRESENTATION MODULES
// ---------------------------------------------------------------

function SentimentBar({ sentiment }) {
  // Initialization -> SentimentBar()-> Renders normalized emotional polarity bars
  const colors = { Positive: "bg-emerald-500", Neutral: "bg-amber-500", Negative: "bg-rose-500" };
  const values = { Positive: 85, Neutral: 50, Negative: 20 };
  return (
    <div className="flex items-center gap-2 w-24">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${colors[sentiment] || "bg-slate-500"}`} style={{ width: `${values[sentiment] || 50}%` }} />
      </div>
      <span className="text-[10px] text-slate-400 w-12">{sentiment}</span>
    </div>
  );
}

function MiniBubbleChart({ agent }) {
  // Initialization -> MiniBubbleChart()-> Direct Canvas manipulation for performance matrix projection
  const canvasRef = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 300; canvas.height = 200;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "transparent"; ctx.fillRect(0, 0, 300, 200);
    const padding = 40, chartWidth = 220, chartHeight = 120;
    ctx.strokeStyle = "rgba(99, 102, 241, 0.1)"; ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const x = padding + (chartWidth / 5) * i;
      ctx.beginPath(); ctx.moveTo(x, padding); ctx.lineTo(x, padding + chartHeight); ctx.stroke();
      const y = padding + (chartHeight / 5) * i;
      ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(padding + chartWidth, y); ctx.stroke();
    }
    const maxCalls = 5000;
    const x = padding + ((agent.callsHandled || 0) / maxCalls) * chartWidth;
    const y = padding + chartHeight - (((agent.csat || 0) - 2) / 3) * chartHeight;
    const radius = 15;
    const color = agent.riskLevel === "High" ? "#EF4444" : agent.riskLevel === "Medium" ? "#F59E0B" : "#10B981";
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color + "99"; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#94A3B8"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Call Volume", 150, 190);
    ctx.save(); ctx.translate(15, 100); ctx.rotate(-Math.PI / 2);
    ctx.fillText("Quality (CSAT)", 0, 0); ctx.restore();
    return canvas;
  }, [agent]);

  return (
    <div className="chart-container p-4">
      <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <span className="w-2 h-2 bg-indigo-500 rounded-full"></span> Performance Matrix Position
      </h4>
      <img src={canvasRef.toDataURL()} alt="Agent Position" className="w-full h-40 object-contain" />
    </div>
  );
}

function SentimentDistribution({ calls }) {
  // Initialization -> SentimentDistribution()-> Aggregates session-level sentiment metadata
  const sentimentCounts = calls.reduce((acc, call) => {
    acc[call.sentiment] = (acc[call.sentiment] || 0) + 1;
    return acc;
  }, {});
  const total = calls.length;
  return (
    <div className="chart-container p-4">
      <h4 className="text-sm font-semibold text-white mb-4">Sentiment Distribution</h4>
      <div className="space-y-4">
        {["Positive", "Neutral", "Negative"].map((sentiment) => {
          const count = sentimentCounts[sentiment] || 0;
          const percentage = total > 0 ? (count / total) * 100 : 0;
          const color = sentiment === "Positive" ? "bg-emerald-500" : sentiment === "Neutral" ? "bg-amber-500" : "bg-rose-500";
          return (
            <div key={sentiment}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">{sentiment}</span>
                <span className="text-slate-400 font-mono">{count} calls ({percentage.toFixed(0)}%)</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full ${color} transition-all duration-1000`} style={{ width: `${percentage}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// SECTION: MAIN PROFILE DETAIL COMPONENT
// ---------------------------------------------------------------

export function AgentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 🌟 MAGIC AUTO-REFRESH LOGIC (Silent Fetch)
  // Internal Call -> fetchAgentData()-> Hydrates the specific agent node from the signaling server
  const fetchAgentData = useCallback((isSilent = false) => {
    if (!isSilent) setLoading(true);

    fetch(`${API_BASE}/api/agents/${id}`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` }
    })
      .then(res => {
        if (!res.ok) throw new Error("Failed to load agent profile");
        return res.json();
      })
      .then(fetchedData => { setData(fetchedData); if (!isSilent) setLoading(false); })
      .catch(err => { setError(err.message); if (!isSilent) setLoading(false); });
  }, [id]);

  // Initialization -> Lifecycle: Triggers terminal load and sets up silent 5s polling
  useEffect(() => {
    fetchAgentData(false);

    const interval = setInterval(() => {
      fetchAgentData(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchAgentData]);

  // Loading Terminal -> Renders pulsed diagnostic state
  if (loading) return (
    <div className="h-screen bg-[#020617] text-indigo-400 flex justify-center items-center font-mono tracking-widest uppercase animate-pulse">
      Loading Neural Profile...
    </div>
  );

  // Error Branch -> Renders critical connection failure state
  if (error || !data || data.error) return (
    <div className="h-screen bg-[#020617] text-rose-500 flex justify-center items-center font-mono">
      CRITICAL ERROR: Agent profile offline. Make sure Backend is on Port 5000.
    </div>
  );

  const { agent, callLogs, graphData } = data;
  const maxCategory = graphData.length > 0 ? Math.max(...graphData.map(g => g.count)) : 1;

  // Design Token -> getStatusColor()-> Maps relational database statuses to semantic visual tokens
  const getStatusColor = (status) => {
    switch (status) {
      case "Resolved": return "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
      case "Escalated": return "text-rose-400 border-rose-500/20 bg-rose-500/10";
      case "Pending": return "text-amber-400 border-amber-500/20 bg-amber-500/10";
      default: return "text-slate-400 border-slate-500/20 bg-slate-500/10";
    }
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans p-4 lg:p-8">
      <button onClick={() => navigate("/superuser/dashboard")} className="mb-6 px-4 py-2 bg-slate-800/50 hover:bg-indigo-600 rounded-xl text-xs font-bold uppercase tracking-widest border border-slate-700 transition-all flex items-center gap-2">
        <span>←</span> Back to Dashboard
      </button>
      <div className="glass-panel p-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border border-indigo-500/20">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className={`w-3 h-3 rounded-full animate-pulse ${agent.riskLevel === "High" ? "bg-rose-500" : "bg-emerald-500"}`}></span>
            <h1 className="text-3xl font-black text-white">{agent.name}</h1>
          </div>
          <p className="text-slate-400 font-mono text-sm">
            Engine: <span className="text-indigo-300">{agent.model}</span> | Deployment ID: #{agent.id}
          </p>
        </div>
        <div className="text-right bg-slate-900/50 px-6 py-3 rounded-xl border border-slate-800">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Aggregate CSAT</p>
          <p className="text-4xl font-black text-emerald-400">{agent.csat} <span className="text-xl text-slate-500">/ 5</span></p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="chart-container p-6">
            <h3 className="text-sm font-bold mb-6 text-slate-400 uppercase tracking-widest">Traffic Categorization</h3>
            <div className="space-y-5">
              {graphData.length > 0 ? graphData.map((bar, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-xs mb-1 font-mono">
                    <span className="text-indigo-200">{bar.category}</span>
                    <span className="text-slate-400">{bar.count} calls</span>
                  </div>
                  <div className="w-full bg-slate-800/50 rounded-full h-2">
                    <div className="bg-indigo-500 h-2 rounded-full transition-all duration-1000" style={{ width: `${(bar.count / maxCategory) * 100}%` }} />
                  </div>
                </div>
              )) : <p className="text-xs text-slate-500 italic">No traffic data available.</p>}
            </div>
          </div>
          <MiniBubbleChart agent={agent} />
          <SentimentDistribution calls={callLogs} />
        </div>
        <div className="lg:col-span-2">
          <div className="chart-container p-0 overflow-hidden h-full flex flex-col">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-widest">
                <span className="text-rose-500">●</span> Live QA Logs & Recordings
              </h3>
              <span className="text-xs text-slate-500 font-mono">Total Records: {callLogs.length}</span>
            </div>
            <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 max-h-[800px]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-900/80 sticky top-0 z-10 backdrop-blur-md">
                  <tr className="border-b border-slate-700 text-[10px] uppercase text-slate-500 tracking-wider">
                    <th className="py-4 pl-6 pr-4 font-bold">Caller Entity</th>
                    <th className="py-4 pr-4 font-bold">Context</th>
                    <th className="py-4 pr-4 font-bold">Resolution Status</th>
                    <th className="py-4 pr-6 font-bold w-1/3">Media Payload</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-800/50">
                  {callLogs.length > 0 ? callLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="py-4 pl-6 pr-4 align-top">
                        <p className="font-bold text-slate-200">{log.caller_name || "Unknown Entity"}</p>
                        <p className="text-xs font-mono text-slate-500 mt-1">{log.caller_number || "N/A"}</p>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <p className="text-indigo-300 text-xs font-bold uppercase tracking-wider mb-2">{log.category}</p>
                        <SentimentBar sentiment={log.sentiment} />
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <span className={`inline-block px-2.5 py-1 rounded border text-[10px] font-bold uppercase tracking-widest ${getStatusColor(log.status)}`}>
                          {log.status}
                        </span>
                        <p className="text-xs text-slate-500 font-mono mt-2 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {Math.floor((log.duration_seconds || 0) / 60)}m {(log.duration_seconds || 0) % 60}s
                        </p>
                      </td>
                      <td className="py-4 pr-6 align-top">
                        {log.recording_url ? (
                          <audio controls className="h-8 w-full max-w-[220px] rounded-lg border border-slate-700 bg-slate-900 mb-2 opacity-70 group-hover:opacity-100 transition-opacity">
                            <source src={log.recording_url} type="audio/mpeg" />
                          </audio>
                        ) : (
                          <div className="h-8 w-full max-w-[220px] rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-[10px] text-slate-600 italic mb-2">
                            No Audio Available
                          </div>
                        )}
                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed" title={log.issue_summary}>
                          <span className="text-slate-500 font-bold">Summary:</span> {log.issue_summary}
                        </p>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="4" className="py-12 text-center text-slate-500 text-sm italic">
                        No telemetry logs detected for this node.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentDetail;