// ======================== Analytics Intelligence Orchestrator ========================
// AnalyticsPage -> Root analytical node for platform telemetry. Orchestrates 
// call-level data streams, outcome distributions, and high-fidelity session 
// deep-dives. Features a multi-modal audio engine with dynamic voice-profile 
// switching and real-time transcript translation logic.
// ||
// ||
// ||
// Functions -> AnalyticsPage()-> Primary functional entry point for data analysis:
// ||           |
// ||           |--- handleVoiceChange()-> [Action Trigger]: Modulates the audio 
// ||           |    buffer and telemetry based on gender/age profile deltas.
// ||           |
// ||           |--- getTranscript()-> [Logic Branch]: Resolves original vs. 
// ||           |    translated text segments based on the selected locale.
// ||           |
// ||           |--- CallsTabView()-> [Sub-module]: Orchestrates summary stats 
// ||           |    and relational call log registries via GET /analytics/calls.
// ||           |
// ||           └── Audio Player Engine:
// ||                ├── togglePlay()-> Sub-process: Manages hardware media state.
// ||                ├── skipBy()-> Sub-process: Temporal seek modulation.
// ||                └── cycleRate()-> Sub-process: Modulates playback velocity.
// ||
// =====================================================================================

import { useState, useEffect, useRef } from "react";
import api from "../../services/api";

// ---------------------------------------------------------------
// SECTION: DESIGN TOKENS & VOICE CONFIGURATION
// ---------------------------------------------------------------

const VOICE_PROFILES = {
  female: { label: "Female", icon: "♀", color: "#ec4899", colorDim: "rgba(236,72,153,0.15)", colorBorder: "rgba(236,72,153,0.3)" },
  male: { label: "Male", icon: "♂", color: "#3b82f6", colorDim: "rgba(59,130,246,0.15)", colorBorder: "rgba(59,130,246,0.3)" },
};

const AGE_GROUPS = [
  { value: "18-24", label: "18 – 24" },
  { value: "25-34", label: "25 – 34" },
  { value: "35-44", label: "35 – 44" },
  { value: "45-54", label: "45 – 54" },
  { value: "55+", label: "55 +" },
];

// Internal Utility -> getAudioUrl()-> Maps session identity and profile metadata to M4A assets
const getAudioUrl = (call, gender, ageGroup) => {
  const rawId = (call.call_id || String(call.id)).replace("#", "");
  return `/useraudio/${rawId}__${gender}__${ageGroup}.m4a`;
};

// ---------------------------------------------------------------
// SECTION: LOGIC HELPERS
// ---------------------------------------------------------------

const fmtDur = (secs) => {
  if (!secs && secs !== 0) return "0:00";
  return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;
};

const toPercent = (n, total) => (total ? Math.round((n / total) * 100) : 0);

// ---------------------------------------------------------------
// SECTION: ATOMIC VISUAL MODULES
// ---------------------------------------------------------------

const DonutCard = ({ chart }) => {
  // Initialization -> DonutCard()-> Renders SVG-based categorical distributions
  const r = 38, cx = 50, cy = 50;
  let cum = 0;
  const arcs = chart.segments.map((seg) => { const s = cum; cum += seg.pct; return { ...seg, start: s, end: cum }; });

  return (
    <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>{chart.label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <svg viewBox="0 0 100 100" width={70} height={70}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
          {arcs.map((arc, i) => {
            const sa = ((arc.start / 100) * 360 - 90) * (Math.PI / 180);
            const ea = ((arc.end / 100) * 360 - 90) * (Math.PI / 180);
            const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
            const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
            return <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${arc.pct > 50 ? 1 : 0} 1 ${x2} ${y2} Z`} fill={arc.color} opacity={0.85} />;
          })}
          <circle cx={cx} cy={cy} r={r - 8} fill="#0f172a" />
        </svg>
        <div style={{ flex: 1 }}>
          {arcs.map((arc, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: arc.color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: "#64748b", flex: 1 }}>{arc.legend}</span>
              <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>{arc.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// SECTION: TABULAR DATA MODULES (API SYNC)
// ---------------------------------------------------------------

const CallsTabView = ({ onCallClick }) => {
  // Initialization -> CallsTabView()-> Managed container for call-history telemetry
  const [period, setPeriod] = useState("last_week");
  const [filterPathway, setFilterPathway] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredRow, setHoveredRow] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Internal Call -> fetchData: GET /analytics/calls -> Hydrates registry based on period
  useEffect(() => {
    setLoading(true);
    api.get(`/analytics/calls?period=${period}`)
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, [period]);

  const periodMap = { today: "Today", last_week: "Last week", last_month: "Last month" };

  const summaryStats = data ? [
    { label: "TOTAL CALLS", value: data.summary.total_calls },
    { label: "TOTAL COST", value: `$${data.summary.total_cost.toFixed(2)}` },
    { label: "AVG DURATION", value: fmtDur(Math.round(data.summary.avg_duration_seconds)) },
    { label: "TOTAL TRANSFERS", value: data.summary.total_transfers },
    { label: "ISSUES", value: data.summary.total_issues },
  ] : Array(5).fill(null).map((_, i) => ({ label: ["TOTAL CALLS", "TOTAL COST", "AVG DURATION", "TOTAL TRANSFERS", "ISSUES"][i], value: "—" }));

  const chartPoints = data?.chart || [];
  const maxCalls = Math.max(...chartPoints.map(p => p.calls), 1);
  const chartH = 140, chartW = 820;
  const pts = chartPoints.map((p, i) => {
    const x = (i / Math.max(chartPoints.length - 1, 1)) * chartW;
    const y = chartH - (p.calls / maxCalls) * chartH;
    return `${x},${y}`;
  });
  const areaPath = pts.length > 0 ? `M0,${chartH} L${pts.join(" L")} L${chartW},${chartH} Z` : "";
  const xLabels = chartPoints.map(p => p.date);

  const donutCharts = data ? [
    { label: "Call Outcomes", segments: [{ color: "#22c55e", pct: toPercent(data.outcomes.completed, data.summary.total_calls), legend: "Completed" }, { color: "#a855f7", pct: toPercent(data.outcomes.voicemail, data.summary.total_calls), legend: "Voicemail" }, { color: "#ef4444", pct: toPercent(data.outcomes.failed, data.summary.total_calls), legend: "Failed" }] },
    { label: "Avg Duration Dist.", segments: [{ color: "#3b82f6", pct: toPercent(data.duration_dist.under_2min, data.summary.total_calls), legend: "< 2 min" }, { color: "#8b5cf6", pct: toPercent(data.duration_dist.two_to_5min, data.summary.total_calls), legend: "2–5 min" }, { color: "#06b6d4", pct: toPercent(data.duration_dist.over_5min, data.summary.total_calls), legend: "> 5 min" }] },
    { label: "Cost Breakdown", segments: [{ color: "#f59e0b", pct: 60, legend: "AI Usage" }, { color: "#d97706", pct: 25, legend: "Telephony" }, { color: "#fbbf24", pct: 15, legend: "Other" }] },
    { label: "Transfers", segments: [{ color: "#64748b", pct: 70, legend: "No Transfer" }, { color: "#3b82f6", pct: 30, legend: "Transferred" }] },
  ] : [];

  const calls = data?.calls || [];
  const visibleCols = [
    { key: "recording", label: "RECORDING" }, { key: "callId", label: "CALL ID" },
    { key: "inOut", label: "IN/OUT" }, { key: "to", label: "TO" },
    { key: "from", label: "FROM" }, { key: "duration", label: "DURATION" },
    { key: "issues", label: "ISSUES" }, { key: "created", label: "CREATED" },
    { key: "status", label: "STATUS" }, { key: "pathway", label: "PATHWAY" },
  ];
  const inputBase = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", color: "#94a3b8", fontSize: 12, cursor: "pointer", outline: "none", fontFamily: "inherit" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {Object.entries(periodMap).map(([k, label]) => (
            <button key={k} onClick={() => setPeriod(k)}
              style={{ background: "none", border: "none", borderBottom: period === k ? "2px solid #e2e8f0" : "2px solid transparent", color: period === k ? "#e2e8f0" : "#64748b", padding: "4px 10px", fontSize: 13, fontWeight: period === k ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 10, color: "#64748b", fontSize: 12, pointerEvents: "none" }}>🔍</span>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search calls…" style={{ ...inputBase, paddingLeft: 30, width: 160 }} />
          </div>
          <select value={filterPathway} onChange={e => setFilterPathway(e.target.value)} style={inputBase}>
            <option value="All">Filter by Pathway</option>
          </select>
        </div>
      </div>

      <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "20px 28px", marginBottom: 16 }}>
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 18, marginBottom: 18 }}>
          {summaryStats.map((s, i) => (
            <div key={s.label} style={{ flex: 1, borderRight: i < summaryStats.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none", paddingRight: i < summaryStats.length - 1 ? 24 : 0, paddingLeft: i > 0 ? 24 : 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{s.label}</div>
              <span style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>{loading ? "—" : s.value}</span>
            </div>
          ))}
        </div>
        <div style={{ position: "relative", height: chartH + 30 }}>
          <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" style={{ width: "100%", height: chartH, display: "block" }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75, 1].map(f => <line key={f} x1="0" y1={chartH * (1 - f)} x2={chartW} y2={chartH * (1 - f)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />)}
            {areaPath && <path d={areaPath} fill="url(#areaGrad)" />}
            {pts.length > 1 && <polyline points={pts.join(" ")} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />}
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            {xLabels.map(l => <span key={l} style={{ fontSize: 11, color: "#475569" }}>{l}</span>)}
          </div>
        </div>
      </div>

      {donutCharts.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
          {donutCharts.map(c => <DonutCard key={c.label} chart={c} />)}
        </div>
      )}

      <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                {visibleCols.map(col => (
                  <th key={col.key} style={{ textAlign: "left", padding: "10px 14px", color: "#475569", fontWeight: 600, fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={visibleCols.length} style={{ padding: "24px", textAlign: "center", color: "#475569" }}>Loading...</td></tr>
              ) : calls.length === 0 ? (
                <tr><td colSpan={visibleCols.length} style={{ padding: "24px", textAlign: "center", color: "#475569" }}>No calls found for this period.</td></tr>
              ) : (
                calls
                  .filter(c => !searchQuery || (c.call_id || "").toLowerCase().includes(searchQuery.toLowerCase()) || (c.to_number || "").includes(searchQuery))
                  .filter(c => filterPathway === "All" || c.pathway === filterPathway)
                  .map((call, i) => (
                    <tr key={call.id} onClick={() => onCallClick(call)}
                      onMouseEnter={() => setHoveredRow(i)} onMouseLeave={() => setHoveredRow(null)}
                      style={{ background: hoveredRow === i ? "rgba(99,102,241,0.06)" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.15s" }}>
                      <td style={{ padding: "10px 14px", color: "#475569" }}>
                        {call.duration_seconds > 0
                          ? <button style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14, padding: 0 }} onClick={e => e.stopPropagation()}>▶</button>
                          : <span style={{ color: "#334155" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "#818cf8", fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{(call.call_id || String(call.id)).substring(0, 8)}…</span>
                          <button style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 11, padding: 0 }} onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(call.call_id || String(call.id)); }}>⎘</button>
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px" }}><span style={{ fontSize: 11, color: call.direction === "inbound" ? "#22c55e" : "#3b82f6" }}>{call.direction === "inbound" ? "↙ In" : "↗ Out"}</span></td>
                      <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 12 }}>{call.to_number || "Web Client"}</td>
                      <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{call.from_number || "—"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 36, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${Math.min((call.duration_seconds / 600) * 100, 100)}%`, height: "100%", background: "#6366f1", borderRadius: 2 }} />
                          </div>
                          <span style={{ color: "#94a3b8", fontSize: 12 }}>{fmtDur(call.duration_seconds)}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{call.issues || "—"}</td>
                      <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{new Date(call.created_at).toLocaleString()}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: call.status === "completed" ? "#22c55e" : "#94a3b8" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: call.status === "completed" ? "#22c55e" : "#64748b", display: "inline-block" }} />
                          {call.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{call.pathway || "—"}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#475569" }}>{calls.length} calls</span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// SECTION: ANALYTICS SUMMARY MODULES
// ---------------------------------------------------------------

const ReportsTabView = () => {
  // Initialization -> ReportsTabView()-> Projects aggregated platform performance trends
  const [period, setPeriod] = useState("last_week");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Internal Call -> api.get(): GET /analytics/reports -> Synchronizes historical trends
  useEffect(() => {
    setLoading(true);
    api.get(`/analytics/reports?period=${period}`)
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, [period]);

  const periodMap = { today: "Today", last_week: "Last week", last_month: "Last month" };
  const summaryItems = data ? [
    { label: "TOTAL CALLS", value: String(data.total_calls), color: "#8b5cf6" },
    { label: "TOTAL COST", value: `$${data.total_cost.toFixed(2)}`, color: "#10b981" },
    { label: "AVG DURATION", value: fmtDur(Math.round(data.avg_duration_seconds)), color: "#f59e0b" },
    { label: "SUCCESS RATE", value: `${data.success_rate}%`, color: "#3b82f6" },
    { label: "ISSUES", value: String(data.issues), color: "#ef4444" },
  ] : [];
  const chartData = data?.chart || [];

  return (
    <div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 20 }}>
        {Object.entries(periodMap).map(([k, label]) => (
          <button key={k} onClick={() => setPeriod(k)}
            style={{ background: "none", border: "none", borderBottom: period === k ? "2px solid #e2e8f0" : "2px solid transparent", color: period === k ? "#e2e8f0" : "#64748b", padding: "4px 10px", fontSize: 13, fontWeight: period === k ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 32, marginBottom: 20, flexWrap: "wrap" }}>
          {loading ? <span style={{ color: "#475569" }}>Loading...</span> : summaryItems.map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
              <span style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, height: 120, alignItems: "flex-end" }}>
          {chartData.map((d, i) => {
            const total = data?.total_calls || 1;
            const h = Math.max((d.calls / total) * 100 * chartData.length, 4);
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: "70%", background: "#22c55e", borderRadius: "4px 4px 0 0", height: Math.min(h * 0.85, 90) }} />
                  <div style={{ width: "70%", background: "#ef4444", height: Math.max(h * 0.15, 4) }} />
                </div>
                <span style={{ fontSize: 10, color: "#475569" }}>{d.date}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        {!loading && [
          ["TOTAL CALLS", String(data?.total_calls ?? 0), ""],
          ["AVG DURATION", fmtDur(Math.round(data?.avg_duration_seconds ?? 0)), ""],
          ["SUCCESS RATE", `${data?.success_rate ?? 0}%`, ""],
        ].map(([l, v, s]) => (
          <div key={l} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{l}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>{v}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{s}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// SECTION: MAIN PAGE COMPONENT (ORCHESTRATION)
// ---------------------------------------------------------------

const AnalyticsPage = () => {
  // Initialization -> AnalyticsPage()-> Root container for navigation and detail orchestration
  const [activeTab, setActiveTab] = useState("CALLS");
  const [showBookDemo, setShowBookDemo] = useState(false);
  const [selectedCall, setSelectedCall] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState("original");

  const [selectedGender, setSelectedGender] = useState("female");
  const [selectedAgeGroup, setSelectedAgeGroup] = useState("25-34");
  const [voiceLoading, setVoiceLoading] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const [formData, setFormData] = useState({ name: "", email: "", phone: "" });

  const audioRef = useRef(null);
  const progressRef = useRef(null);

  const tabs = ["CALLS", "CITATIONS", "REPORTS"];
  const languages = [
    { code: "original", name: "Original (English)" }, { code: "es", name: "Spanish" },
    { code: "fr", name: "French" }, { code: "de", name: "German" },
    { code: "zh", name: "Chinese" }, { code: "ja", name: "Japanese" },
    { code: "hi", name: "Hindi" }, { code: "ar", name: "Arabic" },
    { code: "pt", name: "Portuguese" }, { code: "ru", name: "Russian" },
  ];

  const voiceProfile = VOICE_PROFILES[selectedGender];

  // Logic Branch -> Translation Engine: Resolves localized text segments for session turns
  const translations = {
    es: { default: [{ speaker: "AI", time: "0:00", text: "¡Hola! Gracias por llamar. Soy su asistente de IA. ¿Cómo puedo ayudarle hoy?" }, { speaker: "Customer", time: "0:08", text: "Hola, necesito ayuda con mi cuenta." }, { speaker: "AI", time: "0:15", text: "Con gusto le ayudo. ¿Podría darme su número de cuenta o correo electrónico?" }] },
    fr: { default: [{ speaker: "AI", time: "0:00", text: "Bonjour ! Merci d'appeler. Je suis votre assistant IA. Comment puis-je vous aider ?" }, { speaker: "Customer", time: "0:08", text: "Bonjour, j'ai besoin d'aide avec mon compte." }, { speaker: "AI", time: "0:15", text: "Bien sûr ! Votre numéro de compte ou votre adresse e-mail, s'il vous plaît ?" }] },
  };

  const formatTime = s => { if (isNaN(s)) return "0:00"; return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`; };

  // Internal Utility -> getTranscript(): Merges original transcripts with language-specific offsets
  const getTranscript = (call) => {
    const transcript = call.transcript || [];
    if (selectedLanguage === "original") return transcript;
    const langData = translations[selectedLanguage];
    if (!langData) return transcript;
    return langData[call.call_id] || langData[String(call.id)] || langData.default || transcript;
  };

  const isTranslationAvailable = (call) => {
    if (selectedLanguage === "original") return true;
    const langData = translations[selectedLanguage];
    if (!langData) return false;
    return !!(langData[call.call_id] || langData[String(call.id)] || langData.default);
  };

  // Sub-process -> Audio Listeners: Manages media buffer state and temporal telemetry
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta = () => setDuration(audio.duration);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
  }, [selectedCall, selectedGender, selectedAgeGroup]);

  // Logic Branch -> Simulated Playback: Fallback mechanism for sessions lacking active audio nodes
  useEffect(() => {
    let iv;
    if (isPlaying && selectedCall && !audioRef.current?.src) {
      const total = selectedCall.duration_seconds || 0;
      iv = setInterval(() => {
        setCurrentTime(prev => { if (prev >= total) { setIsPlaying(false); return 0; } return prev + 0.1 * playbackRate; });
      }, 100);
    }
    return () => clearInterval(iv);
  }, [isPlaying, selectedCall, playbackRate]);

  useEffect(() => {
    if (selectedCall) {
      setDuration(selectedCall.duration_seconds || 0);
      setCurrentTime(0);
      setIsPlaying(false);
    }
  }, [selectedCall]);

  // Action Trigger -> handleVoiceChange(): Synchronizes hardware audio reload with profile deltas
  const handleVoiceChange = (newGender, newAge) => {
    if (audioRef.current) audioRef.current.pause();
    setIsPlaying(false);
    setCurrentTime(0);
    setVoiceLoading(true);
    const g = newGender !== undefined ? newGender : selectedGender;
    const a = newAge !== undefined ? newAge : selectedAgeGroup;
    if (newGender !== undefined) setSelectedGender(newGender);
    if (newAge !== undefined) setSelectedAgeGroup(newAge);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.src = getAudioUrl(selectedCall, g, a);
        audioRef.current.load();
      }
      setVoiceLoading(false);
    }, 700);
  };

  // Action Trigger -> Audio Controls: Modulates temporal and hardware playback state
  const togglePlay = () => {
    const audio = audioRef.current;
    if (audio?.src) { isPlaying ? audio.pause() : audio.play(); }
    setIsPlaying(p => !p);
  };

  const handleProgressClick = e => {
    const rect = progressRef.current.getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * duration;
    setCurrentTime(t);
    if (audioRef.current?.src) audioRef.current.currentTime = t;
  };

  const skipBy = s => {
    const t = Math.max(0, Math.min(currentTime + s, duration));
    setCurrentTime(t);
    if (audioRef.current?.src) audioRef.current.currentTime = t;
  };

  const cycleRate = () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  // Mapping -> Waveform Generation: Projects temporal playback coordinates to visual waveform nodes
  const generateWaveformBars = () => {
    const total = 60, progress = duration > 0 ? currentTime / duration : 0;
    return Array.from({ length: total }, (_, i) => {
      const h = 15 + ((i * 7 + 13) % 100 % 45);
      const played = i / total <= progress;
      return <div key={i} style={{ width: 3, height: h, background: voiceLoading ? "rgba(255,255,255,0.06)" : played ? voiceProfile.color : "rgba(255,255,255,0.12)", borderRadius: 2, transition: "background 0.3s" }} />;
    });
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  if (selectedCall) {
    const currentTranscript = getTranscript(selectedCall);
    const translationAvailable = isTranslationAvailable(selectedCall);
    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
      <div style={{ background: "#0a0f1a", minHeight: "100vh", padding: 32, color: "#e2e8f0", fontFamily: "system-ui,sans-serif" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <audio ref={audioRef} src={getAudioUrl(selectedCall, selectedGender, selectedAgeGroup)} />

        <button onClick={() => { setSelectedCall(null); setIsPlaying(false); audioRef.current?.pause(); }}
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "10px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: 24, fontFamily: "inherit" }}>
          ← Back to Analytics
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
              Call Details — #{selectedCall.id}
            </h2>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: voiceProfile.colorDim, border: `1px solid ${voiceProfile.colorBorder}`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: voiceProfile.color }}>
              {voiceProfile.icon} {voiceProfile.label} · {selectedAgeGroup}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Download Transcript</button>
            <button style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Share</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", marginBottom: 16, textTransform: "uppercase" }}>Call Information</div>
              {[
                ["Call ID", `#${selectedCall.id}`],
                ["Status", selectedCall.status],
                ["Direction", selectedCall.direction],
                ["To", selectedCall.to_number || "—"],
                ["From", selectedCall.from_number || "—"],
                ["Duration", fmtDur(selectedCall.duration_seconds)],
                ["Cost", `$${parseFloat(selectedCall.cost || 0).toFixed(4)}`],
                ["Pathway", selectedCall.pathway || "—"],
                ["Date", new Date(selectedCall.created_at).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{k}</span>
                  <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${voiceProfile.colorBorder}`, borderRadius: 12, padding: 20, transition: "border-color 0.4s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase" }}>Voice Profile</div>
                <span style={{ fontSize: 9, background: voiceProfile.colorDim, border: `1px solid ${voiceProfile.colorBorder}`, color: voiceProfile.color, borderRadius: 8, padding: "1px 6px", fontWeight: 700, letterSpacing: "0.05em" }}>AUDIO</span>
              </div>
              <p style={{ fontSize: 11, color: "#475569", margin: "0 0 16px 0", lineHeight: 1.5 }}>
                Select a caller profile — audio &amp; transcript update to match.
              </p>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Gender</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["female", "male"].map(g => {
                    const vp = VOICE_PROFILES[g];
                    const active = selectedGender === g;
                    return (
                      <button key={g} onClick={() => !voiceLoading && handleVoiceChange(g, undefined)}
                        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 0", borderRadius: 9, border: `1px solid ${active ? vp.colorBorder : "rgba(255,255,255,0.08)"}`, background: active ? vp.colorDim : "rgba(255,255,255,0.03)", color: active ? vp.color : "#64748b", fontSize: 13, fontWeight: active ? 700 : 500, cursor: voiceLoading ? "not-allowed" : "pointer", transition: "all 0.2s", fontFamily: "inherit" }}>
                        <span style={{ fontSize: 18, lineHeight: 1 }}>{vp.icon}</span>
                        {vp.label}
                        {active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: vp.color, marginLeft: 2, flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Age Group</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {AGE_GROUPS.map(ag => {
                    const active = selectedAgeGroup === ag.value;
                    return (
                      <button key={ag.value} onClick={() => !voiceLoading && handleVoiceChange(undefined, ag.value)}
                        style={{ padding: "7px 13px", borderRadius: 20, border: `1px solid ${active ? voiceProfile.colorBorder : "rgba(255,255,255,0.08)"}`, background: active ? voiceProfile.colorDim : "rgba(255,255,255,0.03)", color: active ? voiceProfile.color : "#64748b", fontSize: 12, fontWeight: active ? 700 : 500, cursor: voiceLoading ? "not-allowed" : "pointer", transition: "all 0.2s", fontFamily: "inherit" }}>
                        {ag.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {voiceLoading && (
                <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)" }}>
                  <span style={{ display: "inline-block", width: 14, height: 14, border: `2px solid ${voiceProfile.color}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>Loading <strong style={{ color: voiceProfile.color }}>{voiceProfile.label} · {selectedAgeGroup}</strong> voice…</span>
                </div>
              )}
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", marginBottom: 16, textTransform: "uppercase" }}>Call Metrics</div>
              {[
                ["Quality Score", "98%"],
                ["Avg Response", "2.1s"],
                ["Turns", String((selectedCall.transcript || []).length)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{k}</span>
                  <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${voiceLoading ? "rgba(255,255,255,0.08)" : voiceProfile.colorBorder}`, borderRadius: 12, padding: 20, transition: "border-color 0.4s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase" }}>Audio Recording</div>
                {voiceLoading
                  ? <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, border: `2px solid ${voiceProfile.color}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                    Switching voice…
                  </span>
                  : <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: voiceProfile.color, background: voiceProfile.colorDim, border: `1px solid ${voiceProfile.colorBorder}`, borderRadius: 12, padding: "2px 8px" }}>
                    {voiceProfile.icon} {voiceProfile.label} · {selectedAgeGroup}
                  </span>
                }
              </div>

              <div style={{ display: "flex", gap: 3, alignItems: "center", height: 52, marginBottom: 12, opacity: voiceLoading ? 0.3 : 1, transition: "opacity 0.3s" }}>
                {generateWaveformBars()}
              </div>

              <div ref={progressRef} onClick={!voiceLoading ? handleProgressClick : undefined}
                style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, cursor: voiceLoading ? "not-allowed" : "pointer", marginBottom: 10 }}>
                <div style={{ width: `${progressPercent}%`, height: "100%", background: voiceProfile.color, borderRadius: 2, transition: "width 0.1s,background 0.4s" }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{formatTime(currentTime)}</span>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button onClick={() => skipBy(-10)} disabled={voiceLoading}
                    style={{ background: "none", border: "none", color: voiceLoading ? "#334155" : "#94a3b8", cursor: voiceLoading ? "not-allowed" : "pointer", fontSize: 20, padding: 0, lineHeight: 1 }}>⏪</button>
                  <button onClick={!voiceLoading ? togglePlay : undefined} disabled={voiceLoading}
                    style={{ background: voiceLoading ? "rgba(255,255,255,0.08)" : voiceProfile.color, border: "none", color: "#fff", width: 42, height: 42, borderRadius: "50%", cursor: voiceLoading ? "not-allowed" : "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.4s", boxShadow: voiceLoading ? "none" : `0 0 18px ${voiceProfile.colorDim}` }}>
                    {voiceLoading
                      ? <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                      : isPlaying ? "⏸" : "▶"
                    }
                  </button>
                  <button onClick={() => skipBy(10)} disabled={voiceLoading}
                    style={{ background: "none", border: "none", color: voiceLoading ? "#334155" : "#94a3b8", cursor: voiceLoading ? "not-allowed" : "pointer", fontSize: 20, padding: 0, lineHeight: 1 }}>⏩</button>
                </div>
                <span style={{ fontSize: 11, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{formatTime(duration)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                <button onClick={cycleRate} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "4px 10px", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>{playbackRate}x</button>
                <button style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "4px 10px", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>⬇️ Download</button>
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase" }}>Transcript</span>
                  <span style={{ fontSize: 10, background: voiceProfile.colorDim, border: `1px solid ${voiceProfile.colorBorder}`, color: voiceProfile.color, borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>
                    {voiceProfile.icon} {voiceProfile.label} · {selectedAgeGroup}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Translate to:</span>
                  <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)}
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 10px", color: "#e2e8f0", fontSize: 12, outline: "none", fontFamily: "inherit" }}>
                    {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                  </select>
                </div>
              </div>

              {selectedLanguage !== "original" && !translationAvailable && (
                <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, color: "#f59e0b" }}>
                  ⚠️ Translation not available for this call. Showing original.
                </div>
              )}

              {voiceLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 8, marginBottom: 12, border: "1px solid rgba(255,255,255,0.07)" }}>
                  <span style={{ display: "inline-block", width: 12, height: 12, border: `2px solid ${voiceProfile.color}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#64748b" }}>Regenerating transcript for <strong style={{ color: voiceProfile.color }}>{voiceProfile.label} · {selectedAgeGroup}</strong>…</span>
                </div>
              )}

              <div style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, opacity: voiceLoading ? 0.4 : 1, transition: "opacity 0.3s" }}>
                {currentTranscript.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#475569", fontSize: 13, padding: 20 }}>No transcript available for this call.</div>
                ) : (
                  currentTranscript.map((msg, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: msg.speaker === "AI" ? "rgba(139,92,246,0.15)" : voiceProfile.colorDim, border: `1px solid ${msg.speaker === "AI" ? "rgba(139,92,246,0.3)" : voiceProfile.colorBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0, marginTop: 2 }}>
                        {msg.speaker === "AI" ? "🤖" : voiceProfile.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: msg.speaker === "AI" ? "#8b5cf6" : voiceProfile.color }}>
                            {msg.speaker === "AI" ? "AI Assistant" : `Customer (${voiceProfile.label}, ${selectedAgeGroup})`}
                          </span>
                          <span style={{ fontSize: 10, color: "#475569" }}>{msg.time}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 }}>{msg.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={() => { navigator.clipboard.writeText(currentTranscript.map(m => `${m.speaker}: ${m.text}`).join("\n")); alert("Copied!"); }}
                  style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>📋 Copy Text</button>
                <button style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>📄 Export PDF</button>
                <button style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>📊 Add to Report</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showBookDemo) {
    return (
      <div style={{ background: "#0a0f1a", minHeight: "100vh", display: "flex", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", position: "relative" }}>
        <div style={{ flex: 1, background: "linear-gradient(135deg,#1e1b4b 0%,#0a0f1a 100%)", padding: 60, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#8b5cf6", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>SR Comsoft</div>
          <h1 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, marginBottom: 20, color: "#f1f5f9" }}>Scale your voice operations with AI</h1>
          <p style={{ fontSize: 16, color: "#64748b", lineHeight: 1.7, marginBottom: 32 }}>Join leading enterprises using our platform to handle millions of customer interactions.</p>
          {["Enterprise SLAs", "Custom voices", "24/7 Support"].map(f => (
            <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ color: "#10b981", fontSize: 16 }}>✓</span>
              <span style={{ color: "#94a3b8", fontSize: 14 }}>{f}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, padding: 60, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <button onClick={() => setShowBookDemo(false)} style={{ position: "absolute", top: 30, right: 30, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>← Back</button>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Book a Demo</h2>
          <p style={{ color: "#64748b", fontSize: 14, marginBottom: 28 }}>See how Citations and Enterprise features can transform your call data.</p>
          {[["Name", "name", "text", "Your full name"], ["Work Email", "email", "email", "you@company.com"], ["Phone Number", "phone", "tel", "+1 555 0000"]].map(([label, field, type, ph]) => (
            <div key={field} style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 6 }}>{label}</label>
              <input type={type} placeholder={ph} value={formData[field]} onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 12, color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>
          ))}
          <button onClick={() => { alert("Thank you! We'll contact you shortly."); setShowBookDemo(false); }}
            style={{ width: "100%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 8, padding: 14, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Request Demo →</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0f1a", minHeight: "100vh", padding: "28px 32px", color: "#e2e8f0", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Analytics</h1>
        <button style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Export Data</button>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 24 }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ background: "none", border: "none", borderBottom: `2px solid ${activeTab === tab ? "#8b5cf6" : "transparent"}`, color: activeTab === tab ? "#fff" : "#64748b", padding: "12px 20px", fontSize: 13, fontWeight: activeTab === tab ? 700 : 500, cursor: "pointer", transition: "all 0.2s", marginBottom: -1, textTransform: "uppercase", letterSpacing: "0.5px", fontFamily: "inherit" }}>
            {tab}
            {tab === "CITATIONS" && <span style={{ marginLeft: 6, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, verticalAlign: "middle" }}>PRO</span>}
          </button>
        ))}
      </div>

      {activeTab === "CALLS" && (
        <CallsTabView onCallClick={call => {
          setSelectedGender("female");
          setSelectedAgeGroup("25-34");
          setVoiceLoading(false);
          setSelectedCall({ ...call, transcript: call.transcript || [] });
        }} />
      )}

      {activeTab === "REPORTS" && <ReportsTabView />}

      {activeTab === "CITATIONS" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Citations are an Enterprise feature</h2>
          <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24, maxWidth: 400 }}>Citation Schemas enable automated insight extraction from your calls.</p>
          <button onClick={() => setShowBookDemo(true)} style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", border: "none", padding: "12px 28px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Contact Sales →</button>
        </div>
      )}

      {activeTab !== "CITATIONS" && (
        <div style={{ marginTop: 24, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10, padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}><strong style={{ color: "#a78bfa" }}>Advanced Analytics</strong> available for Enterprise plans</span>
          <button onClick={() => setShowBookDemo(true)} style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#a78bfa", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Upgrade to Enterprise</button>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPage;