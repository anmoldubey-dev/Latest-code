import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ======================== Agents Registry Orchestrator ========================
// Agents -> Administrative control plane for monitoring and auditing the 
// decentralized fleet of AI agent nodes. Facilitates real-time performance 
// tracking (CSAT), risk assessment, and identity-based discovery through 
// synchronized telemetry polling.
// ||
// ||
// ||
// Functions -> Agents()-> Primary functional entry point for agent governance:
// ||           |
// ||           |--- fetchAgents()-> [async Action Trigger]: GET /api/agents -> 
// ||           |    Synchronizes the local agent registry with the signaling hub.
// ||           |    └── Logic Branch: Supports silent background hydration.
// ||           |
// ||           |--- filteredAgents -> [Logic Branch]: Executes relational filtering 
// ||           |    and sorting based on search telemetry and performance metrics.
// ||           |
// ||           └── UI Mapping Engines:
// ||                ├── getRiskColor()-> Internal Utility: Maps risk levels to visual tokens.
// ||                └── getStatusColor()-> Internal Utility: Maps lifecycle states to UI colors.
// ||
// ==============================================================================

// ✅ VITE FIX: API Base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ---------------------------------------------------------------
// SECTION: MAIN COMPONENT DEFINITION
// ---------------------------------------------------------------

export function Agents() {
  // Initialization -> Standard routing and state management hooks
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [dbAgents, setDbAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ---------------------------------------------------------------
  // SECTION: DATA SYNCHRONIZATION (API)
  // ---------------------------------------------------------------

  // 🌟 MAGIC AUTO-REFRESH LOGIC
  // Internal Call -> fetchAgents()-> Retrieves the active agent registry from the master node
  const fetchAgents = useCallback((isSilent = false) => {
    if (!isSilent) setLoading(true);

    fetch(`${API_BASE}/api/agents`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` }
    })
      .then(res => {
        if (!res.ok) throw new Error("Failed to connect to backend");
        return res.json();
      })
      .then(data => {
        setDbAgents(data);
        if (!isSilent) setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        if (!isSilent) setLoading(false);
      });
  }, []);

  // Initialization -> Lifecycle Hook: Triggers terminal load and establishes polling loop
  useEffect(() => {
    fetchAgents(false); // Initial Load

    // 🌟 5-SECOND SILENT POLLING
    // Sub-process -> Polling: Executes periodic silent refreshes to maintain dashboard accuracy
    const interval = setInterval(() => {
      fetchAgents(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchAgents]);

  // ---------------------------------------------------------------
  // SECTION: COMPUTED DATA (FILTERING & SORTING)
  // ---------------------------------------------------------------

  // Logic Branch -> filteredAgents: Projects processed dataset based on UI filter state
  const filteredAgents = dbAgents
    .filter(agent =>
      (agent.name && agent.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      "Active".toLowerCase().includes(searchTerm.toLowerCase()) ||
      (agent.riskLevel && agent.riskLevel.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => {
      // Internal Utility -> Sorting Logic: Orders nodes by Name, CSAT, or Volume
      if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
      if (sortBy === "csat") return (b.csat || 0) - (a.csat || 0);
      if (sortBy === "calls") return (b.callsHandled || 0) - (a.callsHandled || 0);
      return 0;
    });

  // ---------------------------------------------------------------
  // SECTION: UI MAPPING UTILITIES
  // ---------------------------------------------------------------

  // Internal Utility -> getRiskColor()-> Maps risk strings to tailwind design tokens
  const getRiskColor = (risk) => {
    const r = (risk || "Low").toLowerCase();
    if (r === "high") return "text-rose-400 bg-rose-500/10 border-rose-500/20";
    if (r === "medium") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  };

  // Internal Utility -> getStatusColor()-> Maps node operational status to themed colors
  const getStatusColor = (status) => {
    switch (status) {
      case "Active": return "text-emerald-400";
      case "On Break": return "text-amber-400";
      case "Offline": return "text-slate-400";
      default: return "text-emerald-400";
    }
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#020617]">
      <header className="glass-panel px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/superuser/dashboard")}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <h1 className="text-xl font-semibold brand-text-gradient">All Allotted Agents</h1>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search agents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-64"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="name">Sort by Name</option>
              <option value="csat">Sort by CSAT</option>
              <option value="calls">Sort by Calls</option>
            </select>
          </div>
        </div>
      </header>
      <main className="p-6">
        <div className="glass-panel rounded-xl overflow-hidden">
          {loading && (
            <div className="p-10 text-center text-indigo-400 animate-pulse font-mono uppercase tracking-widest text-sm">
              Fetching Agent Nodes...
            </div>
          )}
          {error && (
            <div className="p-10 text-center text-rose-400 font-mono text-sm">
              ⚠️ Error: {error}. Check if backend is running on port 5000.
            </div>
          )}
          {!loading && !error && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  {["Agent Name", "Status", "Skill Level", "Risk Level", "Model", "CSAT", "Calls", "Actions"].map(h => (
                    <th key={h} className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAgents.length > 0 ? filteredAgents.map((agent) => (
                  <tr
                    key={agent.id}
                    className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/superuser/agent/${agent.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                          <span className="text-sm font-medium text-indigo-400">
                            {agent.name ? agent.name.substring(0, 2).toUpperCase() : "AI"}
                          </span>
                        </div>
                        <span className="font-medium text-white">{agent.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-sm ${getStatusColor("Active")}`}>Active</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-300">{agent.skillLevel || "N/A"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full border ${getRiskColor(agent.riskLevel)}`}>
                        {agent.riskLevel || "Low"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-300">{agent.model || "Unknown"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-white">{agent.csat}/5</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-300">{agent.callsHandled}</span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/superuser/agent/${agent.id}`); }}
                        className="px-3 py-1.5 text-sm rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="8" className="px-6 py-10 text-center text-slate-500 text-sm">
                      No agents found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

export default Agents;