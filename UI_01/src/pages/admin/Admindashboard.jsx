import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import 'echarts-gl';

// ❌ HATA DIYA: LiveQuerySimulator import removed
import StaffPerformance from './StaffPerformance';
import AIQueryCategories from './AIQueryCategories';

import ActiveCallsPanel from '../../components/IVR/ActiveCallsPanel';
import HistoryPanel from '../../components/IVR/HistoryPanel';
import BroadcastPanel from '../../components/IVR/BroadcastPanel';

// ======================== Admin Dashboard Orchestrator ========================
// AdminDashboard -> The central intelligence hub for administrative operations.
// Orchestrates multi-dimensional data streams including Staff Performance, 
// AI Query Analytics (NL2SQL), and Real-time Telephony signaling panels.
// ||
// ||
// ||
// Functions -> AdminDashboard()-> Primary entry point for administrative telemetry:
// ||           |
// ||           |--- fetchDashboardData()-> [async Internal Call]: GET /api/calls -> 
// ||           |    Synchronizes relational call logs with silent background polling.
// ||           |
// ||           |--- handleSmartSearch()-> [async Action Trigger]: POST /api/nl2sql -> 
// ||           |    Executes natural language analysis for dynamic dataset filtering.
// ||           |
// ||           |--- onChartClick()-> [Interaction Handler]: Logic Branch -> 
// ||           |    Manages relational drill-down navigation and state filters.
// ||           |
// ||           └── Visual Engine Tree:
// ||                ├── getDynamicPerformanceSankey()-> Mapping: Resolves routing flows.
// ||                ├── getDynamicQuerySankey()-> Mapping: Resolves resolution paths.
// ||                └── get3DOptions()-> Mapping: Generates WebGL-based scatter plots.
// ||
// ===============================================================================

// ✅ VITE FIX: API Base URL for Port 5000
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const AdminDashboard = () => {
  // Initialization -> useNavigate()-> Sets up routing for administrative settings and auth
  const navigate = useNavigate();

  // ---------------------------------------------------------------
  // SECTION: GLOBAL STATE MANAGEMENT
  // ---------------------------------------------------------------
  const [showUI, setShowUI] = useState(false);
  const [viewMode, setViewMode] = useState('performance');
  const [activeFilter, setActiveFilter] = useState(null);
  const [drillDownCategory, setDrillDownCategory] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState('All Teams');
  const [selectedAgent, setSelectedAgent] = useState('All Agents');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [allCallLogs, setAllCallLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [smartQuery, setSmartQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [aiIntent, setAiIntent] = useState(null);

  // ---------------------------------------------------------------
  // SECTION: AI SEARCH LOGIC (NL2SQL)
  // ---------------------------------------------------------------

  // Action Trigger -> handleSmartSearch()-> Executes AI-driven querying via the signaling gateway
  const handleSmartSearch = async (e) => {
    e.preventDefault();
    if (!smartQuery.trim()) {
      setAiIntent(null);
      fetchDashboardData(false);
      return;
    }
    setIsSearching(true);
    try {
      // Internal Call -> api.post()-> Requests SQL projection for natural language input
      const response = await fetch(`${API_BASE}/api/nl2sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem("token")}` },
        body: JSON.stringify({ query: smartQuery })
      });
      const result = await response.json();
      if (result.success) {
        // UI Update -> Normalizes relational data for log injection
        const formattedAILogs = result.data.map(row => ({
          id: row.id,
          caller: row.caller_name || "Unknown Caller",
          agent: row.agent_name || "Unknown Agent",
          team: row.category || "General",
          csat: row.csat || (Math.random() * 2 + 3).toFixed(1),
          escalation_risk: Math.floor(Math.random() * 10) + 1,
          startTime: row.created_at || new Date().toLocaleString(),
          duration: row.duration_seconds || 0,
          status: row.status || "Active",
          statusColor:
            row.status === 'completed' ? 'text-green-400 bg-green-500/20' :
              row.status === 'failed' ? 'text-red-400 bg-red-500/20' :
                row.status === 'voicemail' ? 'text-blue-400 bg-blue-500/20' :
                  'text-gray-400 bg-gray-500/20',
          queries: [{ time: "00:00", type: row.category || "General", text: row.issue_summary || "No summary" }]
        }));
        setAllCallLogs(formattedAILogs.reverse());
        setAiIntent(`AI Query: ${smartQuery.substring(0, 15)}...`);
      } else {
        alert("AI Could not process this query.");
      }
    } catch (error) {
      console.error('Smart Search Error:', error);
      alert('AI Server not available');
    } finally {
      setIsSearching(false);
    }
  };

  // ---------------------------------------------------------------
  // SECTION: DATA SYNCHRONIZATION ENGINE
  // ---------------------------------------------------------------

  // 🌟 TARGET C: MAGIC AUTO-REFRESH LOGIC (Silent Fetch)
  // Internal Call -> fetchDashboardData()-> Hydrates the registry from the master database
  const fetchDashboardData = useCallback((isSilent = false) => {
    if (!isSilent) setIsSyncing(true);

    fetch(`${API_BASE}/api/calls`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` }
    })
      .then(response => response.json())
      .then(data => {
        // Logic Branch -> Normalization: Serializes raw database rows into UI model objects
        const formattedLogs = data.map(row => ({
          id: row.id,
          caller: row.caller_name || "Unknown Caller",
          agent: row.agent_name || "Unknown Agent",
          team: row.category || "General",
          csat: parseFloat(row.csat || (Math.random() * 2 + 3).toFixed(1)),
          escalation_risk: Math.floor(Math.random() * 10) + 1,
          startTime: row.created_at || new Date().toLocaleString(),
          duration: row.duration_seconds || 0,
          status: row.status || "Active",
          statusColor:
            row.status === 'completed' ? 'text-green-400 bg-green-500/20' :
              row.status === 'failed' ? 'text-red-400 bg-red-500/20' :
                row.status === 'voicemail' ? 'text-blue-400 bg-blue-500/20' :
                  'text-gray-400 bg-gray-500/20',
          queries: [{ time: "00:00", type: row.category || "General", text: row.issue_summary || "No summary" }]
        }));
        setAllCallLogs(formattedLogs.reverse());
        setIsLoading(false);
        if (!isSilent) setTimeout(() => setIsSyncing(false), 800);
      })
      .catch(err => {
        console.error(err);
        setIsLoading(false);
        if (!isSilent) setTimeout(() => setIsSyncing(false), 800);
      });
  }, []);

  // Initialization -> Lifecycle: Triggers initial data load and UI transition
  useEffect(() => {
    setTimeout(() => setShowUI(true), 100);
    fetchDashboardData(false);
  }, [fetchDashboardData]);

  // 🌟 5-SECOND SILENT POLLING
  // Sub-process -> Polling Hook: Executes silent temporal refreshes to maintain telemetry accuracy
  useEffect(() => {
    if (aiIntent) return;

    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchDashboardData, aiIntent]);

  // ---------------------------------------------------------------
  // SECTION: FILTERING & CHART INTERACTION
  // ---------------------------------------------------------------

  const uniqueTeams = ['All Teams', ...new Set(allCallLogs.map(log => log.team).filter(Boolean))];
  const uniqueAgents = ['All Agents', ...new Set(allCallLogs.map(log => log.agent).filter(Boolean))];
  const uniqueCategories = ['All Categories', ...new Set(allCallLogs.flatMap(log => log.queries.map(q => q.type)).filter(Boolean))];

  // Logic Branch -> filtering: Computes visibility across multi-stage criteria
  const filteredLogs = allCallLogs.filter(log => {
    if (selectedTeam !== 'All Teams' && log.team !== selectedTeam) return false;
    if (selectedAgent !== 'All Agents' && log.agent !== selectedAgent) return false;
    if (selectedCategory !== 'All Categories' && !log.queries.some(q => q.type === selectedCategory)) return false;
    if (activeFilter) {
      if (activeFilter.type === 'Agent' && log.agent !== activeFilter.value) return false;
      if (activeFilter.type === 'Team' && log.team !== activeFilter.value) return false;
      if (activeFilter.type === 'Category' && !log.queries.some(q => q.type === activeFilter.value)) return false;
      if (activeFilter.type === 'Status' && log.status !== activeFilter.value) return false;
    }
    return true;
  });

  const drillDownLogs = drillDownCategory
    ? filteredLogs.filter(log => log.queries.some(q => q.type === drillDownCategory))
    : [];

  // Interaction Handler -> onChartClick()-> Maps visual interaction coordinates to state filters
  const onChartClick = (params) => {
    const name = params.name;
    const isCategory = uniqueCategories.includes(name);
    const isTeam = uniqueTeams.includes(name);
    const isAgent = uniqueAgents.includes(name);
    if (params.seriesType === 'bar' && viewMode === 'queries' && isCategory) {
      setDrillDownCategory(name);
    } else if (isCategory) {
      setActiveFilter({ type: 'Category', value: name });
    } else if (isTeam) {
      setActiveFilter({ type: 'Team', value: name });
    } else if (isAgent) {
      setActiveFilter({ type: 'Agent', value: name });
    } else if (['Resolved', 'Escalated', 'Active', 'completed', 'failed'].includes(name)) {
      setActiveFilter({ type: 'Status', value: name });
    }
  };

  // ---------------------------------------------------------------
  // SECTION: VISUAL ASSET MAPPING
  // ---------------------------------------------------------------

  // Design Token -> getHexColor()-> Resolves categorical types to design system tokens
  const getHexColor = (type) => {
    switch (type) {
      case 'Complaints': return '#ef4444';
      case 'Finance': return '#F59E0B';
      case 'Billing': return '#eab308';
      case 'HR': return '#8B5CF6';
      case 'Technical': return '#10B981';
      case 'Sales': return '#06b6d4';
      default: return '#6b7280';
    }
  };

  const getBadgeColor = (type) => {
    switch (type) {
      case 'Complaints': return 'border-red-500 text-red-400 bg-red-500/10';
      case 'Finance': return 'border-amber-500 text-amber-400 bg-amber-500/10';
      case 'HR': return 'border-purple-500 text-purple-400 bg-purple-500/10';
      case 'Technical': return 'border-emerald-500 text-emerald-400 bg-emerald-500/10';
      case 'Sales': return 'border-cyan-500 text-cyan-400 bg-cyan-500/10';
      default: return 'border-gray-500 text-gray-400 bg-gray-500/10';
    }
  };

  // Mapping -> getDynamicPerformanceSankey()-> Resolves temporal flows between entities
  const getDynamicPerformanceSankey = () => {
    if (filteredLogs.length === 0) return { series: { type: 'sankey', data: [], links: [] } };
    const nodesMap = new Map();
    const linksMap = new Map();
    const addNode = (name) => { if (name && !nodesMap.has(name)) nodesMap.set(name, { name }); };
    const addLink = (src, tgt, val) => {
      if (!src || !tgt) return;
      const key = `${src}_||_${tgt}`;
      linksMap.set(key, (linksMap.get(key) || 0) + val);
    };
    addNode('Total Calls');
    filteredLogs.forEach(log => {
      const team = log.team || 'Unassigned';
      const agent = log.agent || 'Unknown';
      const status = log.status || 'Unknown';
      addNode(team); addNode(agent); addNode(status);
      addLink('Total Calls', team, 1);
      addLink(team, agent, 1);
      addLink(agent, status, 1);
    });
    return {
      tooltip: { trigger: 'item' },
      series: {
        type: 'sankey', layout: 'none',
        emphasis: { focus: 'adjacency' },
        data: Array.from(nodesMap.values()),
        links: Array.from(linksMap.entries()).map(([k, v]) => ({
          source: k.split('_||_')[0],
          target: k.split('_||_')[1],
          value: v
        })),
        lineStyle: { color: 'source', opacity: 0.4 },
        label: { color: '#fff', fontSize: 11 }
      }
    };
  };

  const getDynamicQuerySankey = () => {
    if (filteredLogs.length === 0) return { series: { type: 'sankey', data: [], links: [] } };
    const nodesMap = new Map();
    const linksMap = new Map();
    const addNode = (name) => { if (name && !nodesMap.has(name)) nodesMap.set(name, { name }); };
    const addLink = (src, tgt, val) => {
      if (!src || !tgt) return;
      const key = `${src}_||_${tgt}`;
      linksMap.set(key, (linksMap.get(key) || 0) + val);
    };
    addNode('All Queries');
    filteredLogs.forEach(log => {
      const status = log.status || 'Unknown';
      addNode(status);
      log.queries.forEach(q => {
        const cat = q.type || 'General';
        addNode(cat);
        addLink('All Queries', cat, 1);
        addLink(cat, status, 1);
      });
    });
    return {
      tooltip: { trigger: 'item' },
      series: {
        type: 'sankey', layout: 'none',
        emphasis: { focus: 'adjacency' },
        nodeAlign: 'left',
        data: Array.from(nodesMap.values()),
        links: Array.from(linksMap.entries()).map(([k, v]) => ({
          source: k.split('_||_')[0],
          target: k.split('_||_')[1],
          value: v
        })),
        lineStyle: { color: 'source', opacity: 0.4 },
        label: { color: '#fff', fontSize: 11 }
      }
    };
  };

  // Mapping -> get3DOptions()-> Projects 3-dimensional telemetry vectors via WebGL
  const get3DOptions = (type) => {
    let chartData, categoryCounts;
    if (type === 'agent') {
      chartData = filteredLogs.map((l, i) => ({
        name: l.agent,
        value: [i, parseFloat(l.csat) || 3.5, l.escalation_risk],
        itemStyle: { color: parseFloat(l.csat) >= 4.0 ? '#10B981' : '#ef4444' }
      }));
      return {
        tooltip: { trigger: 'item', formatter: '{b}' },
        grid3D: { viewControl: { projection: 'perspective', autoRotate: false, distance: 250 }, environment: 'transparent' },
        xAxis3D: { type: 'value', name: 'Call Index' },
        yAxis3D: { type: 'value', name: 'CSAT' },
        zAxis3D: { type: 'value', name: 'Escalations' },
        series: [{ type: 'scatter3D', symbolSize: 15, itemStyle: { opacity: 0.8 }, data: chartData }]
      };
    } else {
      categoryCounts = {};
      filteredLogs.forEach(log => {
        log.queries.forEach(q => {
          categoryCounts[q.type] = (categoryCounts[q.type] || 0) + 1;
        });
      });
      const uniqueCats = Object.keys(categoryCounts);
      chartData = uniqueCats.map(c => ({
        name: c,
        value: [c, categoryCounts[c], Math.random() * 20],
        itemStyle: { color: getHexColor(c) }
      }));
      return {
        tooltip: { trigger: 'item', formatter: '{b}' },
        grid3D: { viewControl: { projection: 'perspective', autoRotate: false, distance: 250 }, environment: 'transparent' },
        xAxis3D: { type: 'category', name: 'Category', data: uniqueCats },
        yAxis3D: { type: 'value', name: 'Volume' },
        zAxis3D: { type: 'value', name: 'Risk Level' },
        series: [{ type: 'scatter3D', symbolSize: 15, itemStyle: { opacity: 0.8 }, data: chartData }]
      };
    }
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div className="w-full h-screen flex text-white overflow-hidden bg-noise font-sans relative">

      <aside className={`w-64 p-6 glass-card border-r border-white/10 flex flex-col z-10 transform transition-all duration-700 delay-100 ${showUI ? 'translate-x-0 opacity-100' : '-translate-x-10 opacity-0'}`}>

        <div className="flex items-center gap-3 mb-6 pb-5 border-b border-white/10">
          <div style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 900, color: "#fff",
          }}>
            SR
          </div>
          <div>
            <p className="text-sm font-black text-white leading-tight">SR</p>
            <p className="text-sm text-gray-400 leading-tight">Comsoft Ai</p>
          </div>
        </div>

        <h2 className="text-xl font-bold text-gradient mb-4">Filters</h2>
        <div className="flex flex-col gap-5 flex-1">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-[#8B5CF6] uppercase font-bold tracking-wider">Team</label>
            <select className="input-field bg-[#020617]/50 text-sm py-2" value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
              {uniqueTeams.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-[#8B5CF6] uppercase font-bold tracking-wider">Agent</label>
            <select className="input-field bg-[#020617]/50 text-sm py-2" value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}>
              {uniqueAgents.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-[#8B5CF6] uppercase font-bold tracking-wider">Category</label>
            <select className="input-field bg-[#020617]/50 text-sm py-2" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              {uniqueCategories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          {activeFilter && (
            <button onClick={() => setActiveFilter(null)} className="mt-2 text-xs bg-red-500/20 text-red-400 py-2 rounded-lg font-bold hover:bg-red-500/30 transition-all">
              ✕ Clear Selection
            </button>
          )}
          {aiIntent && (
            <button onClick={() => { setAiIntent(null); setSmartQuery(''); fetchDashboardData(false); }} className="mt-2 text-xs bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 py-2 rounded-lg font-bold hover:bg-[#10B981]/30 transition-all flex items-center justify-center gap-2">
              <span>🤖</span> Clear AI Filter
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-white/10 pt-4 mt-4">

          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/5 mb-1">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}>
              {(JSON.parse(sessionStorage.getItem("user") || "{}").name || "A")[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate leading-tight">
                {JSON.parse(sessionStorage.getItem("user") || "{}").name || "Admin"}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">Admin</p>
            </div>
          </div>

          <button
            onClick={() => navigate("/admin/settings")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-400 hover:text-white hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 transition-all"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            User Roles
          </button>

          <button
            onClick={() => navigate("/admin/settings")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-purple-400 hover:text-white hover:bg-purple-500/10 border border-transparent hover:border-purple-500/20 transition-all"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>

          <button
            onClick={() => {
              sessionStorage.removeItem("token");
              sessionStorage.removeItem("user");
              navigate("/login");
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 border border-transparent transition-all"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar relative z-0">

        <header className="glass-card flex justify-between items-center px-6 py-4 rounded-2xl">
          <h1 className="text-2xl font-bold text-gradient">Admin Insights Dashboard</h1>
          <button onClick={() => fetchDashboardData(false)} disabled={isSyncing} className={`px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all border ${isSyncing ? 'bg-gray-500/20 text-gray-400 border-gray-500/40 cursor-not-allowed' : 'bg-[#10B981]/20 text-[#10B981] border-[#10B981]/40 hover:bg-[#10B981]/30'}`}>
            {isSyncing ? '↻ Syncing...' : '↻ Sync DB'}
          </button>
        </header>

        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={() => { setViewMode('performance'); setActiveFilter(null); }} className={`px-5 py-2 text-sm rounded-full font-semibold transition-all ${viewMode === 'performance' ? 'bg-[#6366F1] text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            👨‍💻 Staff Performance
          </button>
          <button onClick={() => { setViewMode('queries'); setActiveFilter(null); }} className={`px-5 py-2 text-sm rounded-full font-semibold transition-all ${viewMode === 'queries' ? 'bg-[#8B5CF6] text-white shadow-[0_0_15px_rgba(139,92,246,0.5)]' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            🤖 AI Query Categories
          </button>

          <button onClick={() => { setViewMode('active_calls'); setActiveFilter(null); }} className={`px-5 py-2 text-sm rounded-full font-semibold transition-all ${viewMode === 'active_calls' ? 'bg-[#0ea5e9] text-white shadow-[0_0_15px_rgba(14,165,233,0.5)]' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            📞 Live Calls
          </button>
          <button onClick={() => { setViewMode('history'); setActiveFilter(null); }} className={`px-5 py-2 text-sm rounded-full font-semibold transition-all ${viewMode === 'history' ? 'bg-[#f59e0b] text-white shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            📜 Call History
          </button>
          <button onClick={() => { setViewMode('broadcast'); setActiveFilter(null); }} className={`px-5 py-2 text-sm rounded-full font-semibold transition-all ${viewMode === 'broadcast' ? 'bg-[#f97316] text-white shadow-[0_0_15px_rgba(249,115,22,0.5)]' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            📻 Broadcast
          </button>
        </div>

        {viewMode === 'active_calls' && (
          <div className="glass-card rounded-2xl p-6 border border-[#0ea5e9]/30 min-h-[500px]">
            <ActiveCallsPanel />
          </div>
        )}

        {viewMode === 'history' && (
          <div className="glass-card rounded-2xl p-6 border border-[#f59e0b]/30 min-h-[500px]">
            <HistoryPanel />
          </div>
        )}

        {viewMode === 'broadcast' && (
          <div className="glass-card rounded-2xl p-6 border border-[#f97316]/30 min-h-[500px]">
            <BroadcastPanel />
          </div>
        )}

        {(viewMode === 'performance' || viewMode === 'queries') && (
          <div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="flex flex-col gap-6">
                {viewMode === 'performance' ? (
                  <StaffPerformance filteredLogs={filteredLogs} onChartClick={onChartClick} setActiveModal={setActiveModal} />
                ) : (
                  <AIQueryCategories
                    filteredLogs={filteredLogs}
                    onChartClick={onChartClick}
                    setActiveModal={setActiveModal}
                    getHexColor={getHexColor}
                    smartQuery={smartQuery}
                    setSmartQuery={setSmartQuery}
                    handleSmartSearch={handleSmartSearch}
                    isSearching={isSearching}
                  />
                )}
              </div>

              <div className="glass-card rounded-2xl p-6 h-[585px] flex flex-col">
                <h2 className="text-lg font-semibold mb-4 text-gray-200">Call Transcripts & Logs</h2>
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                  {isLoading ? (
                    <div className="text-[#32CD32] font-semibold animate-pulse">Fetching from MySQL...</div>
                  ) : filteredLogs.length === 0 ? (
                    <div className="text-gray-500 italic text-center mt-10">No logs match the selected filters.</div>
                  ) : (
                    filteredLogs.map((log, index) => (
                      <div key={index} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all">
                        <div className="flex justify-between items-start border-b border-white/10 pb-2 mb-2">
                          <div>
                            <p className="font-semibold text-white text-sm">{log.caller}</p>
                            <p className="text-xs text-gray-400">{log.startTime} | Agent: {log.agent} | {log.team}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${log.statusColor}`}>{log.status}</span>
                        </div>
                        {log.queries.map((q, i) => (
                          <div key={i} className="text-sm mt-1">
                            <span className="text-[#8B5CF6] font-bold mr-2">{q.type}:</span>
                            {q.text}
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="glass-card-hover rounded-2xl p-6 mt-6" style={{ height: '300px' }}>
              <h2 className="text-lg font-semibold mb-2">
                {viewMode === 'performance' ? 'Call Routing Flow Map (Reactive)' : 'Query Resolution Flow Map (Reactive)'}
              </h2>
              <ReactECharts
                notMerge={false}
                option={viewMode === 'performance' ? getDynamicPerformanceSankey() : getDynamicQuerySankey()}
                onEvents={{ click: onChartClick }}
                style={{ height: '230px', width: '100%' }}
              />
            </div>
          </div>
        )}
      </main>

      {drillDownCategory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/95 backdrop-blur-xl">
          <div className="w-full max-w-6xl glass-card rounded-3xl p-8 border border-white/20 shadow-[0_0_100px_rgba(139,92,246,0.3)] relative">
            <button onClick={() => setDrillDownCategory(null)} className="absolute top-6 right-6 text-white bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 px-5 py-2.5 rounded-xl transition-all z-20 font-bold">
              ✕ Close
            </button>
            <div className="mb-6 border-b border-white/10 pb-6">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3 border ${getBadgeColor(drillDownCategory)}`}>
                {drillDownCategory} CATEGORY
              </span>
              <h2 className="text-4xl font-bold text-white mb-2">Deep Dive Analysis</h2>
            </div>
            <div className="overflow-auto bg-[#020617]/50 rounded-2xl border border-white/5 p-2 max-h-[500px]">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="text-xs text-gray-400 uppercase bg-white/5 sticky top-0 backdrop-blur-md">
                  <tr>
                    <th className="px-6 py-4">Call ID</th>
                    <th className="px-6 py-4">Agent</th>
                    <th className="px-6 py-4">Team</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Query</th>
                  </tr>
                </thead>
                <tbody>
                  {drillDownLogs.length === 0 ? (
                    <tr><td colSpan="5" className="text-center py-10 text-gray-500">No calls found.</td></tr>
                  ) : drillDownLogs.map((log, i) => {
                    const specificQuery = log.queries.find(q => q.type === drillDownCategory);
                    return (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-[#6366F1]">{log.id}</td>
                        <td className="px-6 py-4 font-semibold text-white">{log.agent}</td>
                        <td className="px-6 py-4 text-gray-400">{log.team}</td>
                        <td className="px-6 py-4"><span className={`text-[10px] font-bold px-2 py-1 rounded-md ${log.statusColor}`}>{log.status}</span></td>
                        <td className="px-6 py-4 italic text-gray-300">"{specificQuery?.text}"</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/90 backdrop-blur-md">
          <div className="w-full h-full max-w-7xl max-h-[800px] glass-card rounded-3xl p-6 flex flex-col relative border border-[#6366F1]/30 shadow-[0_0_80px_rgba(99,102,241,0.2)]">
            <button onClick={() => setActiveModal(null)} className="absolute top-6 right-6 text-white bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 px-5 py-2.5 rounded-xl transition-all z-20 font-bold">
              ✕ Close 3D View
            </button>
            <h2 className="text-3xl font-bold text-gradient mb-2">
              {activeModal === 'agent' ? '3D Agent Performance Engine' : '3D AI Query Categorization Engine'}
            </h2>
            <div className="flex-1 w-full bg-[#020617]/80 rounded-2xl overflow-hidden border border-white/10 relative shadow-inner cursor-grab active:cursor-grabbing">
              <ReactECharts
                option={get3DOptions(activeModal)}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'canvas' }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;