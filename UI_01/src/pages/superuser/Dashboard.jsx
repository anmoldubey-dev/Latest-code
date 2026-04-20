// ======================== Operational Dashboard Orchestrator ========================
// Dashboard -> The central intelligence node for real-time telemetry aggregation.
// Orchestrates multi-source data fetching, temporal filtering, and dynamic
// visualization dispatching for agent performance and relational traffic flows.
// ||
// ||
// ||
// Functions -> Dashboard()-> Main entry point for dashboard state orchestration:
// ||           |
// ||           |--- fetchData()-> [async Action Trigger]: Executes parallel telemetry 
// ||           |    synchronization (Agents + Sankey) with silent polling support.
// ||           |
// ||           |--- handleRefresh()-> Action Trigger: Manages manual cache invalidation.
// ||           |
// ||           |--- handleAgentClick()-> Action Trigger: Dispatches navigational routing.
// ||           |
// ||           └── handleDownload()-> Sub-process: Executes client-side serialization 
// ||                for PDF (Canvas) and Excel (XLSX) report generation.
// ||
// ====================================================================================

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";

import {
  Header,
  Sidebar,
  Infographics,
  SankeyChart,
  RiskPanel,
  KPIPanel,
  BubbleChart,
} from "../../components/dashboard/fulldashboard";
import { AIChatBox } from "../../components/dashboard/AIChatBox";

// ✅ VITE FIX: Added API Base URL for backend connection
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ---------------------------------------------------------------
// SECTION: MAIN DASHBOARD COMPONENT
// ---------------------------------------------------------------

export function Dashboard() {

  // ---------------------------------------------------------------
  // SECTION: STATE & ROUTING INITIALIZATION
  // ---------------------------------------------------------------

  const navigate = useNavigate();

  // Initialization -> Dashboard()-> Reactive hooks for filtering and telemetry buffers
  const [selectedTimeFilter, setSelectedTimeFilter] = useState("Daily");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedChannel, setSelectedChannel] = useState("All");
  const [selectedShift, setSelectedShift] = useState("All");
  const [dbAgents, setDbAgents] = useState([]);
  const [dbSankey, setDbSankey] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ---------------------------------------------------------------
  // SECTION: DATA SYNCHRONIZATION (API)
  // ---------------------------------------------------------------

  // 🌟 TARGET C: MAGIC AUTO-REFRESH LOGIC (Silent Fetch)
  // Action Trigger -> fetchData()-> Pulls relational agent and traffic flow datasets
  const fetchData = useCallback((isSilent = false) => {
    if (!isSilent) setLoading(true);

    const params = new URLSearchParams({
      period: selectedTimeFilter,
      date: selectedDate,
      channel: selectedChannel,
      shift: selectedShift,
    }).toString();

    // Sub-process -> Promise.all: Executes concurrent signaling for efficiency
    Promise.all([
      fetch(`${API_BASE}/api/agents?${params}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
      }).then((res) => {
        if (!res.ok) throw new Error(`Agents API failed: ${res.status}`);
        return res.json();
      }),
      fetch(`${API_BASE}/api/sankey?${params}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
      }).then((res) => {
        if (!res.ok) throw new Error(`Sankey API failed: ${res.status}`);
        return res.json();
      }),
    ])
      .then(([agentsData, sankeyData]) => {
        setDbAgents(agentsData || []);
        setDbSankey(sankeyData || { nodes: [], links: [] });
        if (!isSilent) setLoading(false);
      })
      .catch((err) => {
        console.error("❌ API Error:", err);
        setError(err.message);
        if (!isSilent) setLoading(false);
      });
  }, [selectedTimeFilter, selectedDate, selectedChannel, selectedShift]);

  // ---------------------------------------------------------------
  // SECTION: LIFECYCLE & INTERACTION HANDLERS
  // ---------------------------------------------------------------

  // Lifecycle -> Filter Effect: Re-triggers manual fetch on configuration delta
  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  // 🌟 5-SECOND SILENT POLLING (Background Magic)
  // Sub-process -> Polling: Establishes the temporal loop for real-time telemetry updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Action Trigger -> handleRefresh()-> Manages manual state re-hydration
  const handleRefresh = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  // Action Trigger -> handleAgentClick()-> Dispatches routing to deeper diagnostic views
  const handleAgentClick = (agent) => {
    if (agent?.id) navigate(`/superuser/agent/${agent.id}`);
  };

  // ---------------------------------------------------------------
  // SECTION: EXPORT & SERIALIZATION PIPELINE
  // ---------------------------------------------------------------

  // Action Trigger -> handleDownload()-> Orchestrates client-side report generation
  const handleDownload = async (format) => {
    const dashboard = document.getElementById("dashboard-content");
    if (!dashboard) return;

    if (format === "pdf") {
      // Sub-process: Canvas rendering for document serialization
      const canvas = await html2canvas(dashboard, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("l", "mm", "a4");
      const imgWidth = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      pdf.save(`Intelligence-Report-${selectedDate}.pdf`);
    } else if (format === "excel") {
      // Sub-process: Workbook serialization for tabular analysis
      const wb = XLSX.utils.book_new();
      const kpiData = [
        ["Metric", "Value"],
        ["Total Agents", dbAgents.length],
        ["Avg CSAT", (dbAgents.reduce((s, a) => s + (a.csat || 0), 0) / (dbAgents.length || 1)).toFixed(2)],
        ["Total Calls", dbAgents.reduce((s, a) => s + (a.callsHandled || 0), 0)],
        ["Total Escalations", dbAgents.reduce((s, a) => s + (a.escalations || 0), 0)],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiData), "KPIs");

      const agentData = [
        ["Name", "Risk Level", "CSAT", "Calls Handled", "Escalations", "Avg Latency (ms)", "Workload %"],
        ...dbAgents.map(a => [a.name, a.riskLevel, a.csat, a.callsHandled, a.escalations, a.avgLatency, a.workload]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(agentData), "Agents");
      XLSX.writeFile(wb, `Call-Center-Data-${selectedDate}.xlsx`);
    }
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4 mx-auto" />
          <p className="text-indigo-400 font-mono text-sm tracking-widest uppercase">
            Connecting to SQL Stream...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="text-rose-400 font-mono p-6 bg-rose-500/10 border border-rose-500/20 rounded-xl max-w-lg text-center">
          <p className="text-lg font-bold mb-2">⚠ Backend Connection Failed</p>
          <p className="text-sm text-rose-300">{error}</p>
          <p className="text-xs text-slate-500 mt-4">
            Make sure backend is running.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">

        <Header
          selectedTimeFilter={selectedTimeFilter} setSelectedTimeFilter={setSelectedTimeFilter}
          selectedDate={selectedDate} setSelectedDate={setSelectedDate}
          selectedChannel={selectedChannel} setSelectedChannel={setSelectedChannel}
          selectedShift={selectedShift} setSelectedShift={setSelectedShift}
          onRefresh={handleRefresh}
          onDownload={handleDownload}
        />

        <main
          id="dashboard-content"
          className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6"
        >
          <Infographics />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <BubbleChart agents={dbAgents} onAgentClick={handleAgentClick} />
              <SankeyChart stats={{ sankeyRaw: dbSankey }} />
            </div>
            <div>
              <RiskPanel agents={dbAgents} onAgentClick={handleAgentClick} />
            </div>
          </div>
          <KPIPanel agents={dbAgents} />
        </main>

        <AIChatBox />
      </div>
    </div>
  );
}

export default Dashboard;