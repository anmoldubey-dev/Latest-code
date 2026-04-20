// ======================== Full Dashboard Components ========================
// Full Dashboard -> Houses interactive superuser panel widgets.
// ||
// ||
// ||
// Functions/Methods -> Bubble() -> Render 3D agent sphere
// ||                 |---> RefinedGrid() -> Draw 3D coordinate floor
// ||                 |---> Scene3D() -> Map data & render 3D space
// ||                 |---> BubbleChart() -> Wrap Canvas & fullscreen modal
// ||                 |---> Header() -> Top nav, filters & exports
// ||                 |---> KPICard() -> Display single metric UI
// ||                 |---> Infographics() -> Fetch & show top KPIs
// ||                 |---> KPIPanel() -> Show sys health & latency alerts
// ||                 |---> AgentRow() -> Render RiskPanel list item
// ||                 |---> RiskPanel() -> Categorize High Risk vs Performing
// ||                 |---> SankeyChart() -> Render HTML5 Canvas flow
// ||                 |     |---> drawSankey() -> Calc nodes & draw curves
// ||                 |     |---> renderChart() -> Trigger canvas resize & draw
// ||                 |     |---> handleMouseMove() -> Canvas hover hit detection
// ||                 |     |---> handleMouseLeave() -> Clear tooltip state
// ||                 |     |---> handleCanvasClick() -> Open drill-down modal
// ||                 |---> CanvasWrapper() -> Render Sankey drill-down sub-graph
// ||                 |---> Sidebar() -> Render global navigation
// ||                 |---> AIChatBox() -> Render floating RAG chatbot
// ||                 |     |---> scrollToBottom() -> Auto-scroll chat UI
// ||                 |     |---> handleAsk() -> POST query to Neural Engine
// ||                 |
// ||                 |---> Logic Flow -> Component lifecycle & interaction:
// ||                                  |
// ||                                  |--- Header() -> Update global filters
// ||                                  |--- BubbleChart() & SankeyChart() -> Receive data
// ||                                  |    ├── Calc spatial coordinates
// ||                                  |    ├── Render WebGL/Canvas visuals
// ||                                  |    └── Listen for clicks/hovers -> Trigger modals
// ||                                  |--- Infographics() -> Fetch stats -> Render KPIs
// ||                                  |--- RiskPanel() -> Filter agents -> Render lists
// ||                                  |--- AIChatBox() -> Manage chat state
// ||                                  |    ├── Accept text input
// ||                                  |    ├── Query backend API
// ||                                  |    └── Render SQL log responses
// ||
// ======================================================================
// ---------------------------------------------------------------
// SECTION: IMPORTS
// ---------------------------------------------------------------
import React, { useState, useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Text } from "@react-three/drei";

import * as THREE from "three";
import { useNavigate, useLocation } from "react-router-dom";

// ===============================================================
// SECTION: 1. 3D BUBBLE CHART COMPONENTS
// ===============================================================

function Bubble({ position, size, color, agent, onClick, onHover, isHovered }) {
  const meshRef = useRef();
  const [localHover, setLocalHover] = useState(false);

  useFrame((state) => {
    if (meshRef.current) {
      const t = state.clock.elapsedTime;
      meshRef.current.position.y = position[1] + Math.sin(t + agent.id) * 0.1;
      const targetScale = isHovered || localHover ? 1.4 : 1;
      meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick(agent);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setLocalHover(true);
        onHover(agent);
      }}
      onPointerOut={() => {
        setLocalHover(false);
        onHover(null);
      }}
    >
      <sphereGeometry args={[size, 32, 32]} />
      <meshStandardMaterial
        color={color}
        roughness={0.2}
        metalness={0.8}
        emissive={color}
        emissiveIntensity={isHovered || localHover ? 0.6 : 0.2}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

function RefinedGrid() {
  return (
    <group position={[0, -2, 0]}>
      <gridHelper args={[20, 20, "#6366F1", "#1E293B"]} opacity={0.3} transparent />
      <gridHelper
        args={[20, 10, "#6366F1", "#0f172a"]}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 5, -10]}
        opacity={0.1}
        transparent
      />
      <Text position={[11, 0, 0]} fontSize={0.5} color="#94A3B8">Calls Handled →</Text>
      <Text position={[0, 11, -10]} fontSize={0.5} color="#94A3B8" rotation={[0, 0, Math.PI / 2]}>CSAT up</Text>
      <Text position={[0, 0, 11]} fontSize={0.5} color="#94A3B8" rotation={[0, Math.PI / 2, 0]}> Escalation Rate </Text>
    </group>
  );
}

function Scene3D({ agents, onBubbleClick, hoveredAgent, setHoveredAgent, interactive = false }) {
  const bubbles = useMemo(() => {
    if (!agents || agents.length === 0) return [];

    const maxCalls       = Math.max(...agents.map(a => a.callsHandled || 0), 1);
    const maxEscalations = Math.max(...agents.map(a => a.escalations  || 0), 1);

    return agents.map((agent, i) => {
  const calls       = agent.callsHandled || 0;
  const csat        = agent.csat         || 3;
  const escalations = agent.escalations  || 0;
  const workload    = agent.workload      || 20;

  const x    = maxCalls > 0       ? ((calls / maxCalls) * 20) - 10       : (i % 5) * 4 - 8;
  const y    = (csat - 3) * 2;
  const z    = maxEscalations > 0 ? ((escalations / maxEscalations) * 20) - 10 : Math.floor(i / 5) * 4 - 4;
  const size = Math.max(0.4, Math.min(2.5, workload / 40));

  const riskLevel = (agent.riskLevel || agent.risklevel || "low").toLowerCase();
  const color     = riskLevel.includes("high") ? "#EF4444" : riskLevel.includes("medium") ? "#F59E0B" : "#10B981";

  return { position: [x, y, z], size, color, agent, isHovered: hoveredAgent?.id === agent.id };
});
  }, [agents, hoveredAgent]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[15, 15, 15]} intensity={1.5} castShadow />
      <spotLight position={[-10, 20, 10]} angle={0.15} penumbra={1} intensity={1} color="#8B5CF6" />
      <RefinedGrid />
      {bubbles.map((bubble) => (
        <Bubble
          key={bubble.agent.id}
          {...bubble}
          onClick={onBubbleClick}
          onHover={setHoveredAgent}
        />
      ))}
      {interactive && <OrbitControls enableDamping dampingFactor={0.05} maxDistance={40} minDistance={5} />}
    </>
  );
}

export function BubbleChart({ agents, onAgentClick }) {
  const [show3DDetail, setShow3DDetail] = useState(false);
  const [hoveredAgent, setHoveredAgent] = useState(null);

  return (
    <div className="relative w-full">
      <div className="p-4 h-[450px] bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight">Agents Performance Matrix</h3>
            <p className="text-slate-400 text-xs mt-1">Click a bubble to view agent profile</p>
          </div>
          <button
            onClick={() => setShow3DDetail(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/30 rounded-lg transition-all text-sm font-medium"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            Enter 3D Analysis
          </button>
        </div>

        <div className="h-[320px] cursor-grab active:cursor-grabbing">
          <Canvas camera={{ position: [14, 14, 14], fov: 45 }}>
            <Scene3D agents={agents} onBubbleClick={onAgentClick} hoveredAgent={hoveredAgent} setHoveredAgent={setHoveredAgent} />
          </Canvas>
        </div>
      </div>

      {show3DDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-12 bg-slate-950/90 backdrop-blur-xl">
          <div className="relative w-full max-w-6xl h-full max-h-[800px] bg-slate-900 border border-indigo-500/20 rounded-3xl overflow-hidden shadow-[0_0_50px_-12px_rgba(99,102,241,0.5)]">
            <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-start z-10 bg-gradient-to-b from-slate-900 via-slate-900/80 to-transparent">
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter">DEEP ANALYSIS MODE</h2>
                <div className="flex gap-4 mt-2">
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest border border-slate-700 px-2 py-0.5 rounded">Orbit Enabled</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest border border-slate-700 px-2 py-0.5 rounded">Selectable Entities</span>
                </div>
              </div>
              <button
                onClick={() => setShow3DDetail(false)}
                className="group flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-rose-900/30 text-slate-400 hover:text-rose-400 border border-slate-700 rounded-xl transition-all"
              >
                <span className="text-sm font-bold">EXIT</span>
                <span className="text-lg">X</span>
              </button>
            </div>

            <Canvas shadows dpr={[1, 2]}>
              <PerspectiveCamera makeDefault position={[18, 18, 18]} fov={50} />
              <Scene3D agents={agents} onBubbleClick={onAgentClick} hoveredAgent={hoveredAgent} setHoveredAgent={setHoveredAgent} interactive={true} />
            </Canvas>

            {hoveredAgent && (
              <div className="absolute bottom-10 left-10 p-6 bg-slate-800/80 backdrop-blur-md border-l-4 border-indigo-500 rounded-r-2xl shadow-2xl animate-in slide-in-from-left duration-300">
                <p className="text-slate-500 text-[10px] uppercase font-bold">Selected Personnel</p>
                <h4 className="text-2xl font-black text-white mb-2">{hoveredAgent.name}</h4>
                <div className="flex gap-6">
                  <div>
                    <p className="text-slate-400 text-xs">Satisfaction</p>
                    <p className="text-indigo-400 font-mono text-lg">{hoveredAgent.csat}/5.0</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Load Factor</p>
                    <p className="text-indigo-400 font-mono text-lg">{hoveredAgent.workload}%</p>
                  </div>
                  <button
                    onClick={() => onAgentClick(hoveredAgent)}
                    className="mt-auto px-4 py-1 bg-white text-black text-xs font-bold rounded hover:bg-indigo-400 transition-colors"
                  >
                    OPEN PROFILE
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===============================================================
// SECTION: 2. HEADER COMPONENT
// ===============================================================

export function Header({
  selectedTimeFilter = "Daily",
  setSelectedTimeFilter = () => {},
  selectedDate = new Date().toISOString().split("T")[0],
  setSelectedDate = () => {},
  selectedChannel = "All",
  setSelectedChannel = () => {},
  selectedShift = "All",
  setSelectedShift = () => {},
  onRefresh = () => {},
  onDownload = () => {},
}) { 
  const navigate = useNavigate();

  const timeFilters = ["Daily", "Weekly", "Monthly"]; 
  const channels   = ["Voice", "Chat", "Email", "All"]; 
  const shifts     = ["Morning", "Afternoon", "Night", "All"]; 

  return (
    <header className="glass-panel px-6 py-3 sticky top-0 z-50 border-b border-indigo-500/10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-4">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500" />
          </span>
          <h1 className="text-lg font-bold brand-text-gradient tracking-tight">
            SuperUser Dashboard
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            title="Refresh Data"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <button
            onClick={() => onDownload("pdf")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            PDF
          </button>

          <button
            onClick={() => onDownload("excel")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Excel
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-slate-900/60 rounded-lg p-1 border border-slate-800">
          {timeFilters.map((f) => (
            <button
              key={f}
              onClick={() => setSelectedTimeFilter(f)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                selectedTimeFilter === f
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-slate-700" />

        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-2 py-1 text-xs bg-slate-900/60 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500 [color-scheme:dark] cursor-pointer"
          />
        </div>

        <div className="h-5 w-px bg-slate-700" />

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Channel</span>
          <div className="flex items-center gap-1 bg-slate-900/60 rounded-lg p-1 border border-slate-800">
            {channels.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedChannel(c)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                  selectedChannel === c
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto text-[10px] text-slate-600 font-mono hidden lg:block">
          {new Date().toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          })} IST
        </div>
      </div>
    </header>
  );
}

// ===============================================================
// SECTION: 3. INFOGRAPHICS COMPONENTS
// ===============================================================

function KPICard({ title, value, unit, color }) {
  const colorClasses = {
    green:  "text-emerald-400",
    amber:  "text-amber-400",
    red:    "text-rose-400",
    indigo: "text-indigo-400",
  };
  return (
    <div className="chart-container p-4 flex flex-col">
      <span className="text-xs text-slate-400 uppercase tracking-wider">{title}</span>
      <div className="flex items-baseline gap-2 mt-1">
        <span className={`text-2xl font-bold ${colorClasses[color] || "text-white"}`}>{value}</span>
        {unit && <span className="text-sm text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

export function Infographics() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
   fetch("/api/stats", {
  headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` }
})
  .then(res => res.json())
  .then(data => setStats(data))
  .catch(err => console.error("Stats fetch error:", err));
  }, []);

  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-20 bg-slate-800/40 animate-pulse rounded-xl border border-slate-700/50"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      <KPICard title="Total Traffic"   value={stats.totalTraffic}  color="indigo" /> 
      <KPICard title="Active Streams"  value={stats.activeStreams} color="amber"  /> 
      <KPICard title="Global CSAT"     value={stats.globalCsat}    unit="/5"  color="green"  /> 
      <KPICard title="Avg Latency"     value={stats.avgLatency}    unit="ms"  color="green"  /> 
      <KPICard title="Escalation Rate" value={stats.escalationRate} color="red"    /> 
      <KPICard title="Hardware Load"   value={stats.hardwareLoad}   color="indigo" /> 
      <KPICard title="Avg Sentiment"   value={stats.avgSentiment}   unit="/5"  color="green"  /> 
    </div>
  );
}

// ===============================================================
// SECTION: 4. SYSTEM HEALTH PANEL
// ===============================================================

export function KPIPanel({ agents = [] }) {
  const criticalAgents = agents
    .filter(a => {
      const riskLevel = (a.riskLevel || a.risklevel || "low").toLowerCase();
      return a.avgLatency > 300 || riskLevel === "high";
    })
    .slice(0, 3);

  const avgLatency  = agents.length ? Math.round(agents.reduce((s, a) => s + (a.avgLatency || 0), 0) / agents.length) : 0;
  const avgCsat     = agents.length ? (agents.reduce((s, a) => s + (a.csat || 0), 0) / agents.length).toFixed(2) : 0;
  const totalCalls  = agents.reduce((s, a) => s + (a.callsHandled || 0), 0);
  const avgWorkload = agents.length ? Math.round(agents.reduce((s, a) => s + (a.workload || 0), 0) / agents.length) : 0;

  return (
    <div className="chart-container p-4 border-t border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          Team Performance Summary
        </h3>
        <span className="text-[10px] text-slate-500 uppercase font-mono">Live from DB</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="text-center p-3 bg-slate-800/50 rounded-lg border border-emerald-500/20">
          <p className="text-xl font-bold text-emerald-400">Operational</p>
          <p className="text-xs text-slate-400 mt-1">API Status</p>
        </div>
        <div className="text-center p-3 bg-slate-800/50 rounded-lg">
          <p className="text-2xl font-bold text-indigo-400">{avgLatency}<span className="text-sm">ms</span></p>
          <p className="text-xs text-slate-400 mt-1">Avg Latency</p>
        </div>
        <div className="text-center p-3 bg-slate-800/50 rounded-lg">
          <p className="text-2xl font-bold text-amber-400">{avgCsat}<span className="text-sm">/5</span></p>
          <p className="text-xs text-slate-400 mt-1">Avg CSAT</p>
        </div>
        <div className="text-center p-3 bg-slate-800/50 rounded-lg">
          <p className="text-2xl font-bold text-violet-400">{totalCalls}</p>
          <p className="text-xs text-slate-400 mt-1">Total Calls</p>
        </div>
        <div className="text-center p-3 bg-slate-800/50 rounded-lg">
          <p className="text-2xl font-bold text-cyan-400">{avgWorkload}%</p>
          <p className="text-xs text-slate-400 mt-1">Avg Workload</p>
        </div>
        <div className="p-3 bg-rose-500/10 rounded-lg border border-rose-500/20">
          <p className="text-[10px] text-rose-400 uppercase tracking-widest mb-2 font-bold">Alerts</p>
          <div className="space-y-1">
            {criticalAgents.length > 0
              ? criticalAgents.map(agent => (
                  <p key={agent.id} className="text-xs text-rose-300 truncate font-mono">
                    {agent.name} ({agent.avgLatency}ms)
                  </p>
                ))
              : <p className="text-xs text-slate-500">No alerts</p>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ===============================================================
// SECTION: 5. RISK PANEL
// ===============================================================

function AgentRow({ agent, onClick, type }) {
  const bgColor = type === "risk"
    ? "hover:bg-rose-500/10 border-l-2 border-l-rose-500"
    : "hover:bg-emerald-500/10 border-l-2 border-l-emerald-500";

  return (
    <div onClick={() => onClick(agent)} className={`p-3 rounded-lg cursor-pointer transition-all ${bgColor} bg-slate-800/50`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-white text-sm">{agent.name}</p>
          <p className="text-xs text-slate-400">{agent.skillLevel} • {agent.model}</p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-semibold ${type === "risk" ? "text-rose-400" : "text-emerald-400"}`}>
            {agent.csat}/5
          </p>
          <p className="text-xs text-slate-500">
            {type === "risk"
              ? `${agent.escalations} escalations`
              : `${agent.callsHandled} calls`
            }
          </p>
        </div>
      </div>
    </div>
  );
}

export function RiskPanel({ agents = [], onAgentClick }) {
  const highRiskAgents = [...agents].filter(a => {
    const level = (a.riskLevel || a.risk_level || "").toLowerCase();
    const csat  = a.csat || a.csat_score || 0;
    return level === "high" || (csat < 3.5 && a.escalations > 10);
  }).sort((a, b) => (a.csat || 0) - (b.csat || 0));

  const highPerformingAgents = [...agents].filter(a => {
    const level = (a.riskLevel || a.risk_level || "").toLowerCase();
    const csat  = a.csat || a.csat_score || 0;
    return level === "low" && csat >= 4.5;
  }).sort((a, b) => (b.csat || 0) - (a.csat || 0));

  return (
    <div className="space-y-4">
      <div className="chart-container p-4">
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500" />High-Risk Nodes
        </h3>
        <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
          {highRiskAgents.length > 0
            ? highRiskAgents.map(agent => (
                <AgentRow key={agent.id} agent={agent} onClick={onAgentClick} type="risk" />
              ))
            : <p className="text-sm text-slate-500 text-center py-4">All nodes operating normally</p>
          }
        </div>
      </div>

      <div className="chart-container p-4">
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />High-Performing Nodes
        </h3>
        <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
          {highPerformingAgents.length > 0
            ? highPerformingAgents.map(agent => (
                <AgentRow key={agent.id} agent={agent} onClick={onAgentClick} type="performing" />
              ))
            : <p className="text-sm text-slate-500 text-center py-4">No high performers yet</p>
          }
        </div>
      </div>
    </div>
  );
}

// ===============================================================
// SECTION: 6. SANKEY CHART (Traffic Flow)
// ===============================================================

export function SankeyChart({ data }) {
  const canvasRef      = useRef(null);
  const containerRef   = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  
  const nodePositionsRef = useRef({});   
  const [hoverState, setHoverState] = useState({ node: null, x: 0, y: 0 });

  const drawSankey = (ctx, width, height, chartData, isDetail = false) => {
    if (!width || !height || !chartData || !chartData.nodes || chartData.nodes.length === 0) return;

    ctx.clearRect(0, 0, width, height);
    const { nodes, links } = chartData;

    const nodeWidth  = isDetail ? Math.min(120, width * 0.15) : Math.min(80, width * 0.1);
    const nodeHeight = isDetail ? 50 : 36;
    const levelGap   = width / 3.2;

    const colors = ["#6366F1", "#10B981", "#EF4444", "#F59E0B", "#8B5CF6", "#06B6D4", "#EC4899"];

    const maxLinkValue = links && links.length > 0
      ? Math.max(...links.map(l => l.value))
      : 1;

    const positions = {};

    const incoming = {};
    const outgoing = {};
    if (links && links.length > 0) {
      links.forEach(l => {
        outgoing[l.source] = (outgoing[l.source] || 0) + l.value;
        incoming[l.target] = (incoming[l.target] || 0) + l.value;
      });
    }

    nodes.forEach((node, i) => {
      const safeLevel = node.level !== undefined
        ? node.level
        : (i === 0 ? 0 : (i < Math.ceil(nodes.length / 2) ? 1 : 2));

      const nodesAtLevel = nodes.filter((n, idx) => {
        const nLevel = n.level !== undefined ? n.level : (idx === 0 ? 0 : (idx < Math.ceil(nodes.length / 2) ? 1 : 2));
        return nLevel === safeLevel;
      });
      const indexAtLevel = nodesAtLevel.indexOf(node);

      const x = (safeLevel * levelGap) + 40;
      const y = (height / (nodesAtLevel.length + 1)) * (indexAtLevel + 1) - nodeHeight / 2 + (isDetail ? 0 : 20);

      const nodeValue = Math.max(incoming[node.id] || 0, outgoing[node.id] || 0);

      positions[node.id] = { x, y, width: nodeWidth, height: nodeHeight, name: node.name, value: nodeValue };
    });

    if (!isDetail) nodePositionsRef.current = positions;

    if (links && links.length > 0) {
      links.forEach((link) => {
        const src = positions[link.source];
        const tgt = positions[link.target];
        if (src && tgt) {
          ctx.beginPath();
          const startX = src.x + src.width;
          const startY = src.y + src.height / 2;
          const endX   = tgt.x;
          const endY   = tgt.y + tgt.height / 2;

          const grad = ctx.createLinearGradient(startX, startY, endX, endY);
          grad.addColorStop(0, colors[link.source % colors.length] + "40");
          grad.addColorStop(1, colors[link.target % colors.length] + "40");

          ctx.moveTo(startX, startY);
          ctx.bezierCurveTo(
            startX + levelGap / 2.5, startY,
            endX   - levelGap / 2.5, endY,
            endX, endY
          );
          ctx.strokeStyle = grad;
          const maxThickness = isDetail ? 40 : 25;
          ctx.lineWidth = Math.max(2, (link.value / maxLinkValue) * maxThickness);
          ctx.stroke();
        }
      });
    }

    nodes.forEach((node, i) => {
      const p = positions[node.id];
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.width, p.height, 6);
      ctx.fill();

      ctx.fillStyle = "#FFF";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";

      if (isDetail && p.name.length > 15) {
        const words     = p.name.split(' ');
        const halfIndex = Math.ceil(words.length / 2);
        ctx.fillText(words.slice(0, halfIndex).join(' '), p.x + p.width / 2, p.y + p.height / 2 - 2);
        ctx.fillText(words.slice(halfIndex).join(' '),    p.x + p.width / 2, p.y + p.height / 2 + 10);
      } else {
        ctx.fillText(p.name, p.x + p.width / 2, p.y + p.height / 2 + 4);
      }
    });
  };

  useEffect(() => {
    const renderChart = () => {
      const canvas    = canvasRef.current;
      const container = containerRef.current;

      if (!canvas || !container || !data || !data.nodes || data.nodes.length === 0 || !data.links || data.links.length === 0) {
        const ctx = canvas?.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle  = "#64748b";
          ctx.font       = "14px sans-serif";
          ctx.textAlign  = "center";
          ctx.fillText("No traffic flow data available", canvas.width / 2, canvas.height / 2);
        }
        return;
      }

      const { width, height } = container.getBoundingClientRect();
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      drawSankey(ctx, width, height, data);
    };

    const timeoutId = setTimeout(renderChart, 150);
    window.addEventListener('resize', renderChart);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', renderChart);
    };
  }, [data]);

  const handleMouseMove = (e) => {
    const rect   = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let foundNode = null;
    Object.entries(nodePositionsRef.current).forEach(([id, pos]) => {
      if (mouseX >= pos.x && mouseX <= pos.x + pos.width && mouseY >= pos.y && mouseY <= pos.y + pos.height) {
        foundNode = { id: parseInt(id), name: pos.name, value: pos.value };
      }
    });

    if (foundNode) {
      setHoverState({ node: foundNode, x: mouseX, y: mouseY });
      canvasRef.current.style.cursor = 'pointer';
    } else {
      setHoverState({ node: null, x: 0, y: 0 });
      canvasRef.current.style.cursor = 'default';
    }
  };

  const handleMouseLeave = () => {
    setHoverState({ node: null, x: 0, y: 0 });
    if (canvasRef.current) canvasRef.current.style.cursor = 'default';
  };

  const handleCanvasClick = (e) => {
    if (hoverState.node) {
      setSelectedNode(hoverState.node);
      setHoverState({ node: null, x: 0, y: 0 });
    }
  };

  return (
    <div ref={containerRef} className="chart-container p-4 h-[350px] relative overflow-hidden">
      <div className="flex justify-between items-center mb-4 relative z-10 pointer-events-none">
        <h3 className="text-lg font-semibold text-white">Call Traffic Flow Analysis</h3>
        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Interactive Drill-Down</span>
      </div>

      <canvas 
        ref={canvasRef} 
        onClick={handleCanvasClick} 
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="absolute inset-0" 
      />

      {hoverState.node && (
        <div
          className="absolute z-50 pointer-events-none bg-slate-800/90 backdrop-blur-md text-white px-4 py-2 rounded-xl border border-indigo-500/50 shadow-2xl transition-opacity duration-150"
          style={{ left: hoverState.x + 15, top: hoverState.y + 15 }}
        >
          <span className="font-bold uppercase tracking-wider text-[9px] text-slate-400 block mb-1">Volume Analytics</span>
          <span className="font-bold text-sm">{hoverState.node.name}:</span> 
          <span className="text-indigo-400 font-mono text-sm ml-2 font-bold">{hoverState.node.value} Calls</span>
        </div>
      )}

      {selectedNode && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-md">
          <div className="relative w-full max-w-5xl h-[600px] bg-slate-900 border border-indigo-500/30 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-6 flex justify-between items-center border-b border-slate-800">
              <div>
                <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest">Isolated Flow Analysis</p>
                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">
                  Category: {selectedNode.name}
                </h2>
              </div>
              <button onClick={() => setSelectedNode(null)} className="p-2 bg-slate-800 hover:bg-rose-500/20 text-slate-400 rounded-full transition-all">X</button>
            </div>
            <div className="flex-1 p-6 relative">
              <CanvasWrapper clickedNode={selectedNode} fullData={data} drawSankey={drawSankey} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CanvasWrapper({ clickedNode, fullData, drawSankey }) {
  const detailRef = useRef(null);
  const contRef   = useRef(null);

  const subGraphData = useMemo(() => {
    if (!clickedNode || !fullData || !fullData.links) return { nodes: [], links: [] };

    const targetId = clickedNode.id;
    const relevantLinks = fullData.links.filter(link =>
      link.source === targetId || link.target === targetId
    );

    const relevantNodeIds = new Set();
    relevantNodeIds.add(targetId);
    relevantLinks.forEach(link => {
      relevantNodeIds.add(link.source);
      relevantNodeIds.add(link.target);
    });

    const relevantNodes = fullData.nodes.filter(node => relevantNodeIds.has(node.id));
    return { nodes: relevantNodes, links: relevantLinks };
  }, [clickedNode, fullData]);

  useEffect(() => {
    const container = contRef.current;
    const canvas    = detailRef.current;
    if (!canvas || !container || !subGraphData.nodes || subGraphData.nodes.length === 0) return;

    const renderTimer = setTimeout(() => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      drawSankey(ctx, width, height, subGraphData, true);
    }, 100);

    return () => clearTimeout(renderTimer);
  }, [subGraphData, drawSankey]);

  return (
    <div ref={contRef} className="w-full h-full absolute inset-6">
      <canvas ref={detailRef} className="w-full h-full" />
    </div>
  );
}

// ===============================================================
// SECTION: 7. GLOBAL NAVIGATION SIDEBAR
// ===============================================================

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { name: "Dashboard",         path: "/superuser/dashboard" },
    { name: "AI Nodes",          path: "/superuser/agents" },
    { name: "Call Analytics",    path: "/superuser/analytics" },
    { name: "IVR Studio",        path: "/superuser/ivr-studio" },
    { name: "Human Escalations", path: "/superuser/escalations" },
    { name: "Settings",          path: "/superuser/settings" },
  ];

  return (
    <aside className="w-64 bg-slate-950/80 backdrop-blur-2xl h-screen border-r border-white/5 flex flex-col flex-shrink-0 z-50">
      
      <div className="p-5 border-b border-white/5 mb-4">
        <div className="flex items-center gap-10">
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: "linear-gradient(135deg, #7c5cff, #c084fc)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 900, color: "#fff", flexShrink: 0,
          }}>
            SR
          </div>
          <div>
            <p className="text-sm font-black text-white leading-tight">SR</p>
            <p className="text-sm text-slate-400 font-medium leading-tight">Comsoft Ai</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto custom-scrollbar">
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3 px-3">Main Menu</p>
        
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          
          return (
            <button
              key={item.name}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 shadow-[inset_0_0_20px_rgba(99,102,241,0.05)]"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200 border border-transparent"
              }`}
            >
              <svg className={`w-5 h-5 ${isActive ? "text-indigo-400" : "text-slate-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {item.icon}
              </svg>
              {item.name}
              
              {item.name === "Human Escalations" && (
                <span className="ml-auto w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/5 bg-slate-900/30 space-y-2">
        <button
          onClick={() => navigate("/superuser")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Superuser Home
        </button>

        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800/40 border border-white/5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20 flex-shrink-0">
            {(JSON.parse(sessionStorage.getItem("user") || "{}").name || "?")[0].toUpperCase()}
          </div>
          <div className="text-left flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-none truncate">
              {JSON.parse(sessionStorage.getItem("user") || "{}").name || "Superuser"}
            </p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">Superuser</p>
          </div>
        </div>

        <button
          onClick={() => {
            sessionStorage.removeItem("token");
            sessionStorage.removeItem("user");
            navigate("/login");
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-400 hover:bg-rose-500/10 border border-transparent transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>
    </aside>
  );
}

// ===============================================================
// SECTION: 8. AI RAG CHATBOT (Neural Assistant)
// ===============================================================
export function AIChatBox() {
  const [query, setQuery] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  
  const messagesEndRef = useRef(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [answer, loading, isOpen]);

  const handleAsk = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setAnswer(""); 
    try {
      const res = await fetch("/api/ask", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionStorage.getItem("token")}`
  },
  body: JSON.stringify({ query })
});
      const data = await res.json();
      setAnswer(data.answer || data.error);
    } catch (e) {
      setAnswer("Failed to connect to Neural Engine. Is the Flask backend running?");
    }
    setLoading(false);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl shadow-[0_0_50px_rgba(99,102,241,0.4)] z-[99999] transition-all hover:scale-105 border border-indigo-400/30"
      >
        <span className="font-black text-sm tracking-[0.2em] uppercase">Open Neural Engine</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[30vw] min-w-[450px] h-[80vh] bg-slate-950/95 backdrop-blur-3xl border border-indigo-500/40 rounded-3xl shadow-[0_0_80px_-20px_rgba(99,102,241,0.6)] z-[99999] overflow-hidden flex flex-col">
      
      <div className="p-6 bg-gradient-to-br from-indigo-900/40 to-slate-900/60 flex items-center justify-between border-b border-indigo-500/20 flex-shrink-0">
        <div>
          <h4 className="text-sm font-black text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Neural SQL
          </h4>
          <p className="text-[10px] text-slate-500 mt-1">Direct MySQL Read/Write Access</p>
        </div>
        <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-full transition-all text-2xl font-light leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-visible bg-slate-900/20 p-6 flex flex-col">
        <div className="flex flex-col gap-6">
          
          <div className="bg-slate-800/40 p-5 rounded-2xl border border-indigo-500/10 self-start max-w-[90%]">
            <p className="text-[10px] text-indigo-500 font-bold mb-2 tracking-widest uppercase">System Ready</p>
            <p className="text-sm text-slate-300 font-medium">Authentication successful. I can query agent stats and call logs directly. Try asking: "Who handled the most calls today?"</p>
          </div>
          
          {answer && (
            <div className="bg-indigo-600/10 p-6 rounded-2xl border border-indigo-500/30 self-start w-full shadow-lg">
              <p className="text-[10px] text-indigo-400 font-bold mb-3 tracking-widest uppercase italic">Synthesized Result</p>
              <p className="text-sm text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">{answer}</p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col gap-3 p-3">
              <div className="h-3 w-48 bg-indigo-500/20 rounded-full animate-pulse"></div>
              <div className="h-3 w-64 bg-indigo-500/10 rounded-full animate-pulse delay-75"></div>
              <div className="h-3 w-32 bg-indigo-500/5 rounded-full animate-pulse delay-150"></div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      <div className="p-6 border-t border-slate-800 bg-slate-950/90 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex-shrink-0">
        <div className="relative group">
          <input 
            type="text" 
            value={query}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything..."
            className="w-full bg-[#030712] border border-indigo-500/20 group-hover:border-indigo-500/50 rounded-2xl py-4 pl-5 pr-14 text-sm text-white focus:border-indigo-400 outline-none transition-all shadow-inner placeholder:text-slate-600"
          />
          <button 
            onClick={handleAsk}
            disabled={loading}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-indigo-600/20 text-indigo-400 hover:text-white hover:bg-indigo-600 rounded-xl transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}