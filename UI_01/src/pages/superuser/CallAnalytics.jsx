// ======================== Call Analytics Orchestrator ========================
// CallAnalytics -> High-fidelity diagnostic interface for categorical traffic 
// analysis. Integrates a 3D WebGL bubble matrix for volumetric telemetry and 
// a relational drill-down engine for media-rich session logs.
// ||
// ||
// ||
// Functions -> CallAnalytics()-> Primary entry point for analytics governance:
// ||           |
// ||           |--- fetchStats()-> [async Internal Call]: GET /api/call-stats -> 
// ||           |    Synchronizes the global category distribution matrix.
// ||           |
// ||           |--- fetchCategoryCalls()-> [async Internal Call]: GET /api/calls/category/ -> 
// ||           |    Hydrates the drill-down registry for the selected node.
// ||           |
// ||           |--- handleBubbleClick()-> [Interaction Handler]: Projects 3D node 
// ||           |    selection to the relational log registry.
// ||           |
// ||           └── (Atomic Component Sub-tree):
// ||                ├── CategorySphere()-> Managed 3D mesh for individual categories.
// ||                ├── AudioPlayer()-> Real-time media playback engine.
// ||                └── CallCard()-> Serialized presentation of session metadata.
// ||
// ==============================================================================

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Text } from "@react-three/drei";
import * as THREE from "three";
import { useNavigate } from "react-router-dom";

// ✅ VITE FIX: Added API Base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ---------------------------------------------------------------
// SECTION: 3D MESH COMPONENTS
// ---------------------------------------------------------------

function CategorySphere({ position, size, color, item, onClick, onHover, isHovered, isSelected }) {
  // Initialization -> CategorySphere()-> Orchestrates individual 3D mesh nodes
  const groupRef = useRef();
  const scaleRef = useRef(new THREE.Vector3(1, 1, 1));
  const targetScale = useRef(1);

  // Sub-process -> frame loop: Manages temporal oscillation and interactive scaling (lerp)
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.position.y = position[1] + Math.sin(t + item.category.length) * 0.15;

    targetScale.current = isHovered || isSelected ? 1.3 : 1;
    scaleRef.current.lerp(
      new THREE.Vector3(targetScale.current, targetScale.current, targetScale.current),
      0.15
    );
    groupRef.current.scale.copy(scaleRef.current);
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh
        onClick={(e) => { e.stopPropagation(); onClick(item); }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(item);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[size, 64, 64]} />
        <meshStandardMaterial
          color={color}
          roughness={0.2}
          metalness={0.8}
          emissive={color}
          emissiveIntensity={isHovered || isSelected ? 0.8 : 0.2}
          transparent
          opacity={0.85}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[size * 1.02, 16, 16]} />
        <meshBasicMaterial
          color="#ffffff"
          wireframe
          transparent
          opacity={isHovered || isSelected ? 0.4 : 0.1}
        />
      </mesh>

      <Text position={[0, size + 0.8, 0]} fontSize={0.5} color="white" fontWeight="bold">
        {item.category}
      </Text>
      <Text position={[0, -size - 0.6, 0]} fontSize={0.35} color="#94A3B8">
        {item.count} Calls
      </Text>
    </group>
  );
}

function SceneContents({ data, onBubbleClick, hoveredItem, setHoveredItem, selectedCategory, interactive }) {
  // Initialization -> SceneContents()-> Composes lighting and bubble matrix layout
  const colorPalette = ["#6366F1", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6"];

  // Logic Branch -> projection mapping: Calculates spatial coordinates for bubble nodes
  const bubbles = useMemo(() => {
    if (!data || data.length === 0) return [];
    const spacing = 5;
    const startX = -((data.length - 1) * spacing) / 2;
    return data.map((item, i) => ({
      position: [startX + i * spacing, 0, 0],
      size: Math.sqrt(item.count || 1) * 0.4 + 0.5,
      color: colorPalette[i % colorPalette.length],
      item,
      isHovered: hoveredItem?.category === item.category,
      isSelected: selectedCategory?.category === item.category,
    }));
  }, [data, hoveredItem, selectedCategory]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 15, 10]} intensity={1.5} />
      <spotLight position={[-10, 20, 10]} angle={0.2} penumbra={1} intensity={1.2} color="#8B5CF6" />
      {bubbles.map((bubble) => (
        <CategorySphere
          key={bubble.item.category}
          {...bubble}
          onClick={onBubbleClick}
          onHover={setHoveredItem}
        />
      ))}
      {interactive && (
        <OrbitControls enableDamping dampingFactor={0.05} maxDistance={30} minDistance={5} />
      )}
    </>
  );
}

// ---------------------------------------------------------------
// SECTION: UI PRESENTATION MODULES
// ---------------------------------------------------------------

function SentimentBadge({ sentiment }) {
  // Presentation -> SentimentBadge()-> Maps customer emotion to semantic design tokens
  const map = {
    Positive: "bg-emerald-500/20 text-emerald-400 border-emerald-500/20",
    Negative: "bg-rose-500/20 text-rose-400 border-rose-500/20",
    Neutral: "bg-slate-700/50 text-slate-400 border-slate-600",
  };
  return (
    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${map[sentiment] || map.Neutral}`}>
      {sentiment || "Neutral"}
    </span>
  );
}

function AudioPlayer({ url }) {
  // Initialization -> AudioPlayer()-> Manages individual session media playback
  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Sub-process -> Event Tunnel: Synchronizes mutual exclusivity across multiple audio nodes
  useEffect(() => {
    const stop = (e) => {
      if (e.detail !== url && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setPlaying(false);
      }
    };
    window.addEventListener("audio-play", stop);
    return () => window.removeEventListener("audio-play", stop);
  }, [url]);

  // Action Trigger -> togglePlay()-> Dispatches custom playback event and modulates hardware state
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      window.dispatchEvent(new CustomEvent("audio-play", { detail: url }));
      audioRef.current.play().catch(() => setError(true));
      setPlaying(true);
    }
  };

  const fmt = (s) => {
    if (!isFinite(s) || s < 0) return "0:00";
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Interaction Handler -> handleProgressClick()-> Maps click coordinates to temporal media seek
  const handleProgressClick = (e) => {
    if (!audioRef.current || !progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };

  if (error) return (
    <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
      <span className="text-rose-400 text-xs">⚠</span>
      <span className="text-[10px] text-rose-400 font-mono">Audio file unavailable or format unsupported</span>
    </div>
  );

  return (
    <div className="bg-slate-900/80 border border-indigo-500/20 rounded-2xl p-3.5 space-y-3">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => { audioRef.current && setDuration(audioRef.current.duration); setLoading(false); }}
        onEnded={() => setPlaying(false)}
        onError={() => { setError(true); setLoading(false); }}
        preload="metadata"
      />
      <div ref={progressRef} onClick={handleProgressClick}
        className="relative w-full h-1.5 bg-slate-700/60 rounded-full cursor-pointer group">
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all"
          style={{ width: `${progress}%` }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ left: `calc(${progress}% - 7px)` }} />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={togglePlay} disabled={loading}
          className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center transition-all
            ${loading
              ? "bg-slate-700 cursor-wait"
              : "bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-[0_0_16px_rgba(99,102,241,0.4)]"
            }`}>
          {loading ? (
            <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          ) : playing ? (
            <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1.5" />
              <rect x="14" y="4" width="4" height="16" rx="1.5" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <span className="text-[10px] font-mono text-slate-400 flex-shrink-0 w-20">
          {fmt(currentTime)} / {fmt(duration)}
        </span>

        <div className="flex items-end gap-[2px] flex-1 h-5 overflow-hidden">
          {[4, 7, 5, 9, 6, 8, 4, 7, 5, 9, 6, 8, 4, 6, 5, 8, 7, 4, 9, 6].map((h, i) => (
            <div key={i}
              className={`flex-1 rounded-full transition-colors ${playing ? "bg-indigo-400" : "bg-slate-600/50"}`}
              style={{
                height: `${h * 2.2}px`,
                opacity: playing ? 0.6 + (i % 3) * 0.2 : 0.25,
              }}
            />
          ))}
        </div>

        <button onClick={() => {
          const next = !muted;
          setMuted(next);
          if (audioRef.current) audioRef.current.muted = next;
        }} className="flex-shrink-0 text-slate-500 hover:text-white transition-colors">
          {muted || volume === 0 ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.536 8.464a5 5 0 010 7.072M12 6v12M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )}
        </button>

        <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setVolume(v); setMuted(v === 0);
            if (audioRef.current) audioRef.current.volume = v;
          }}
          className="w-16 h-1 accent-indigo-500 cursor-pointer flex-shrink-0" />
      </div>
    </div>
  );
}

function CallCard({ call }) {
  // Initialization -> CallCard()-> Renders specific session metadata in an expandable node
  const [expanded, setExpanded] = useState(false);

  const createdAt = call.created_at
    ? new Date(call.created_at).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
    : "—";

  const durationFmt = () => {
    const s = call.duration_seconds || 0;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  const statusColor = {
    Resolved: "text-emerald-400",
    Escalated: "text-rose-400",
    Pending: "text-amber-400",
  }[call.status] || "text-slate-300";

  return (
    <div className={`rounded-2xl border transition-all duration-300 overflow-hidden
      ${expanded
        ? "border-indigo-500/40 bg-slate-800/60 shadow-[0_0_20px_rgba(99,102,241,0.08)]"
        : "border-white/5 bg-slate-800/40 hover:border-slate-700"
      }`}>

      <div className="p-4 cursor-pointer select-none" onClick={() => setExpanded(p => !p)}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600/30 to-violet-600/30 border border-indigo-500/20 flex items-center justify-center font-black text-indigo-300 text-sm flex-shrink-0">
              {(call.caller_name || "?")[0].toUpperCase()}
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">{call.caller_name || "Anonymous Caller"}</p>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">{call.caller_number || "No Number"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SentimentBadge sentiment={call.sentiment} />
            <svg className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2.5 text-[10px] font-mono flex-wrap">
          <span className={`font-bold uppercase ${statusColor}`}>{call.status || "Unknown"}</span>
          <span className="text-slate-700">•</span>
          <span className="text-slate-500">{durationFmt()}</span>
          <span className="text-slate-700">•</span>
          <span className="text-slate-500 truncate max-w-[120px]">{call.agent_name || "Unassigned"}</span>
          <span className="ml-auto text-slate-600 hidden sm:block">{createdAt}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700/40 pt-3">
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/5">
              <p className="text-slate-600 uppercase mb-1 font-bold tracking-wider">Agent Node</p>
              <p className="text-indigo-300 truncate font-medium">{call.agent_name || "Unassigned"}</p>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/5">
              <p className="text-slate-600 uppercase mb-1 font-bold tracking-wider">Category</p>
              <p className="text-violet-300 font-medium">{call.category || "—"}</p>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/5">
              <p className="text-slate-600 uppercase mb-1 font-bold tracking-wider">Duration</p>
              <p className="text-slate-300 font-mono font-medium">{durationFmt()}</p>
            </div>
          </div>

          {call.issue_summary && (
            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-700/30">
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mb-1.5">Issue Summary</p>
              <p className="text-xs text-slate-300 leading-relaxed">{call.issue_summary}</p>
            </div>
          )}

          <div>
            <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mb-2 flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${call.recording_url ? "bg-emerald-500 animate-pulse" : "bg-slate-600"}`} />
              Call Recording
              {call.recording_url && (
                <span className="ml-auto text-indigo-500 normal-case font-normal tracking-normal">
                  {call.recording_url.split("/").pop()}
                </span>
              )}
            </p>

            {call.recording_url ? (
              <AudioPlayer url={call.recording_url} />
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/60 border border-dashed border-slate-700/60 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-slate-800/80 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-mono">No recording available</p>
                  <p className="text-[9px] text-slate-700 mt-0.5">recording_url is NULL in the database</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// SECTION: MAIN ANALYTICS HUB
// ---------------------------------------------------------------

export function CallAnalytics() {
  const navigate = useNavigate();

  // ---------------------------------------------------------------
  // SECTION: GLOBAL STATE MANAGEMENT
  // ---------------------------------------------------------------
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show3DDetail, setShow3DDetail] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryCalls, setCategoryCalls] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // 🌟 MAGIC REFRESH: 3D Spheres Data Fetch (Silent Sync)
  // Internal Call -> fetchStats()-> Projects global volumetric categories onto the 3D plane
  const fetchStats = useCallback((isSilent = false) => {
    const token = sessionStorage.getItem("token");
    if (!isSilent) setLoading(true);
    fetch(`${API_BASE}/api/call-stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(s => { setData(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // 🌟 MAGIC REFRESH: Category Call Logs Fetch (Silent Sync)
  // Internal Call -> fetchCategoryCalls()-> Decrypts relational logs for the targeted mesh sphere
  const fetchCategoryCalls = useCallback((categoryName, isSilent = false) => {
    if (!categoryName) return;
    const token = sessionStorage.getItem("token");
    setFetchError(null);
    if (!isSilent) setLoadingCalls(true);

    fetch(`${API_BASE}/api/calls/category/${encodeURIComponent(categoryName)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(calls => {
        if (calls.error) { setFetchError(calls.error); setCategoryCalls([]); }
        else setCategoryCalls(Array.isArray(calls) ? calls : []);
        setLoadingCalls(false);
      })
      .catch(err => { setFetchError(err.message); setLoadingCalls(false); });
  }, []);

  // Initialization -> polling loop: Orchestrates silent 5s background synchronization
  useEffect(() => {
    fetchStats(false);

    const interval = setInterval(() => {
      fetchStats(true);
      if (selectedCategory) {
        fetchCategoryCalls(selectedCategory.category, true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchStats, fetchCategoryCalls, selectedCategory]);

  // Action Trigger -> handleBubbleClick()-> Executes node-focused drill-down request
  const handleBubbleClick = (item) => {
    setSelectedCategory(item);
    fetchCategoryCalls(item.category, false);
  };

  // Logic Branch -> renderPanel()-> Selects presentation state based on async connection health
  const renderPanel = () => {
    if (loadingCalls) return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="space-y-2.5 w-full max-w-xs">
          {[75, 100, 55].map((w, i) => (
            <div key={i} className="h-2.5 bg-indigo-500/15 rounded-full animate-pulse" style={{ width: `${w}%` }} />
          ))}
        </div>
        <p className="text-indigo-400 font-mono text-xs animate-pulse">Decrypting SQL Logs...</p>
      </div>
    );

    if (fetchError) return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">⚠</div>
        <p className="text-rose-400 text-xs font-mono">{fetchError}</p>
        <button
          onClick={() => selectedCategory && handleBubbleClick(selectedCategory)}
          className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-lg text-xs font-bold transition-all">
          Retry
        </button>
      </div>
    );

    if (!selectedCategory) return (
      <div className="h-full flex flex-col items-center justify-center opacity-40">
        <div className="w-16 h-16 rounded-full border border-dashed border-slate-500 flex items-center justify-center mb-4 animate-[spin_10s_linear_infinite]">
          <span className="text-2xl animate-none">🌐</span>
        </div>
        <p className="text-xs uppercase tracking-[0.2em] font-bold text-slate-400">Click a mesh sphere to analyze</p>
      </div>
    );

    if (categoryCalls.length === 0) return (
      <div className="h-full flex flex-col items-center justify-center opacity-60 gap-3">
        <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl">📭</div>
        <p className="text-sm font-bold text-slate-400">No call logs found</p>
        <p className="text-xs text-slate-600 font-mono">Category: {selectedCategory.category}</p>
      </div>
    );

    return (
      <div className="space-y-3">
        {categoryCalls.map((call, idx) => <CallCard key={call.id ?? idx} call={call} />)}
      </div>
    );
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div className="h-screen bg-[#020617] text-white flex flex-col overflow-hidden">
      <div className="p-6 flex justify-between items-center border-b border-white/5 bg-slate-900/50 backdrop-blur-md z-10 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black italic tracking-tighter text-indigo-400">CALL LOG CATEGORIZATION</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-mono">Real-time Traffic Volume Analysis</p>
        </div>
        <button
          onClick={() => navigate("/superuser/dashboard")}
          className="px-6 py-2 bg-slate-800 hover:bg-indigo-600 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">
          ← Back to Dashboard
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row p-6 gap-6 overflow-hidden">
        <div className={
          show3DDetail
            ? "fixed inset-0 z-[100] flex flex-col p-4 md:p-8 bg-slate-950/95 backdrop-blur-2xl"
            : "w-full lg:w-1/2 flex flex-col bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden shadow-xl"
        }>
          <div className={`p-5 flex justify-between items-center border-b ${show3DDetail ? "border-slate-700 bg-transparent" : "border-slate-800 bg-slate-900/60"}`}>
            <div>
              <h3 className="font-bold text-white tracking-tight">
                {show3DDetail ? "FULLSPACE EXPLORATION" : "Category Volume Matrix"}
              </h3>
              <p className="text-slate-400 text-[10px] uppercase tracking-widest mt-0.5">
                {show3DDetail ? "Free Orbit Navigation Enabled" : "Click a mesh node to view logs"}
              </p>
            </div>
            <button
              onClick={() => setShow3DDetail(p => !p)}
              className={`px-4 py-2 rounded-lg transition-all text-xs font-bold flex items-center gap-2 ${show3DDetail
                  ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                  : "bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/30"
                }`}>
              {show3DDetail ? (
                "✕ Close Viewer"
              ) : (
                <><span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" /> Open 3D Viewer</>
              )}
            </button>
          </div>

          <div className={`relative cursor-crosshair ${show3DDetail ? "flex-1 border border-indigo-500/20 rounded-3xl overflow-hidden bg-slate-900/50 cursor-move mt-4" : "flex-1"}`}>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center font-mono text-indigo-500 animate-pulse text-sm z-10">
                Initializing Mesh...
              </div>
            )}
            <Canvas
              camera={{ position: [0, 0, 16], fov: 45 }}
              gl={{ antialias: true, powerPreference: "high-performance" }}
              onCreated={({ gl }) => {
                gl.domElement.addEventListener("webglcontextlost", (e) => {
                  e.preventDefault();
                  console.warn("WebGL context lost — will restore automatically");
                }, false);
              }}
            >
              <SceneContents
                data={data}
                onBubbleClick={(item) => {
                  handleBubbleClick(item);
                  if (show3DDetail) setShow3DDetail(false);
                }}
                hoveredItem={hoveredItem}
                setHoveredItem={setHoveredItem}
                selectedCategory={selectedCategory}
                interactive={show3DDetail}
              />
            </Canvas>
          </div>
        </div>

        {!show3DDetail && (
          <div className="w-full lg:w-1/2 bg-slate-900/40 border border-slate-800 rounded-3xl flex flex-col overflow-hidden shadow-xl">
            <div className="p-5 border-b border-slate-800 bg-slate-900/60 flex justify-between items-center flex-shrink-0">
              <h3 className="font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                {selectedCategory
                  ? <><span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />Logs: {selectedCategory.category}</>
                  : "Awaiting Selection"}
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">
                {selectedCategory
                  ? loadingCalls
                    ? "Loading..."
                    : `${categoryCalls.length} record${categoryCalls.length !== 1 ? "s" : ""} found`
                  : "Select a node"}
              </span>
            </div>

            {categoryCalls.length > 0 && !loadingCalls && (
              <div className="px-5 py-2 bg-indigo-500/5 border-b border-indigo-500/10 flex-shrink-0">
                <p className="text-[9px] text-indigo-400/50 font-mono uppercase tracking-widest">
                  ↓ Click any card to expand details and play the call recording
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5">
              {renderPanel()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CallAnalytics;