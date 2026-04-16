// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | genLatencyTrend()         |
// | * generates latency data  |
// +---------------------------+
//     |
//     v
// +---------------------------+
// | genCallVolume()           |
// | * generates volume data   |
// +---------------------------+
//     |
//     v
// +---------------------------+
// | MetricCard()              |
// | * KPI metric display      |
// +---------------------------+
//     |
//     v
// +---------------------------+
// | SectionTitle()            |
// | * section heading helper  |
// +---------------------------+
//     |
//     v
// +---------------------------+
// | ChartCard()               |
// | * chart wrapper card      |
// +---------------------------+
//     |
//     v
// +---------------------------+
// | Analytics()               |
// | * analytics dashboard     |
// +---------------------------+
//     |
//     |----> useCallback() -> refresh()
//     |        * regenerates latency data
//     |
//     |----> useEffect()
//     |        * auto-refreshes every 30s
//     |
//     |----> MetricCard()
//     |        * renders KPI strip
//     |
//     |----> ChartCard()
//     |        * renders latency/volume charts
//     |
//     v
// [ END ]
//
// ================================================================

/**
 * Analytics.jsx — Real-time Analytics & Reporting Dashboard
 *
 * Displays call metrics, language distribution, latency trends,
 * intent analysis, STT correction stats, and session timeline.
 *
 * Apache 2.0
 */

import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ─── Mock data generators ─────────────────────────────────────────────────────

const LANG_COLORS = {
  en: "#4f46e5", hi: "#f59e0b", mr: "#22c55e", ta: "#ef4444",
  te: "#a855f7", ml: "#14b8a6", ar: "#f97316", es: "#0ea5e9",
};

function genLatencyTrend(n = 20) {
  return Array.from({ length: n }, (_, i) => ({
    time: `${String(i).padStart(2, "0")}:00`,
    stt: Math.round(300 + Math.random() * 200),
    llm: Math.round(500 + Math.random() * 400),
    tts: Math.round(250 + Math.random() * 150),
    total: Math.round(1100 + Math.random() * 600),
  }));
}

function genCallVolume(n = 7) {
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  return Array.from({ length: n }, (_, i) => ({
    day: days[i % 7],
    calls: Math.round(40 + Math.random() * 120),
    resolved: Math.round(30 + Math.random() * 100),
  }));
}

const LANG_DIST = [
  { name: "Hindi",     value: 38, code: "hi" },
  { name: "English",   value: 25, code: "en" },
  { name: "Marathi",   value: 14, code: "mr" },
  { name: "Tamil",     value: 10, code: "ta" },
  { name: "Telugu",    value: 8,  code: "te" },
  { name: "Others",    value: 5,  code: "ml" },
];

const INTENT_DATA = [
  { intent: "Technical",  count: 145, color: "#ef4444" },
  { intent: "Billing",    count: 98,  color: "#f59e0b" },
  { intent: "Account",    count: 76,  color: "#4f46e5" },
  { intent: "Delivery",   count: 54,  color: "#22c55e" },
  { intent: "Cancel",     count: 32,  color: "#a855f7" },
  { intent: "Escalation", count: 19,  color: "#ef4444" },
];

const SENTIMENT_DATA = [
  { name: "Positive", value: 42, color: "#22c55e" },
  { name: "Neutral",  value: 38, color: "#6b7280" },
  { name: "Negative", value: 20, color: "#ef4444" },
];

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({ title, value, unit = "", delta, color = "#4f46e5", icon }) {
  const positive = delta >= 0;
  return (
    <div style={{
      background: "#111827", border: "1px solid #1f2937", borderRadius: 12,
      padding: "18px 20px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>
          {title}
        </span>
        <span style={{ fontSize: 18 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color }}>
        {value}<span style={{ fontSize: 16, color: "#6b7280", marginLeft: 4 }}>{unit}</span>
      </div>
      {delta !== undefined && (
        <div style={{ fontSize: 12, color: positive ? "#22c55e" : "#ef4444", marginTop: 6 }}>
          {positive ? "▲" : "▼"} {Math.abs(delta)}% vs last week
        </div>
      )}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionTitle({ children }) {
  return (
    <h2 style={{ fontSize: 15, fontWeight: 700, color: "#9ca3af",
                 textTransform: "uppercase", letterSpacing: 1,
                 margin: "28px 0 14px" }}>
      {children}
    </h2>
  );
}

// ─── Chart wrapper ────────────────────────────────────────────────────────────

function ChartCard({ title, children, height = 220 }) {
  return (
    <div style={{
      background: "#111827", border: "1px solid #1f2937", borderRadius: 12,
      padding: "18px 20px",
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#9ca3af", marginBottom: 14 }}>
        {title}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

const TOOLTIP_STYLE = {
  contentStyle: { background: "#1f2937", border: "1px solid #374151", borderRadius: 8 },
  labelStyle:   { color: "#9ca3af" },
  itemStyle:    { color: "#d1d5db" },
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Analytics() {
  const [latencyData,  setLatencyData]  = useState(() => genLatencyTrend());
  const [volumeData,   setVolumeData]   = useState(() => genCallVolume());
  const [range,        setRange]        = useState("7d");   // 1d | 7d | 30d
  const [refreshing,   setRefreshing]   = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setLatencyData(genLatencyTrend());
      setRefreshing(false);
    }, 600);
  }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const s = {
    page: { padding: 24, color: "#f9fafb", fontFamily: "system-ui, sans-serif" },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 0 },
    grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 14 },
    grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 },
  };

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Analytics</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
            Real-time call performance and language intelligence metrics
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {["1d", "7d", "30d"].map(r => (
            <button key={r} onClick={() => setRange(r)}
              style={{ background: range === r ? "#4f46e5" : "#1f2937",
                       color: range === r ? "#fff" : "#9ca3af",
                       border: `1px solid ${range === r ? "#4f46e5" : "#374151"}`,
                       borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>
              {r}
            </button>
          ))}
          <button onClick={refresh}
            style={{ background: "#1f2937", color: refreshing ? "#4f46e5" : "#9ca3af",
                     border: "1px solid #374151", borderRadius: 8, padding: "6px 14px",
                     cursor: "pointer", fontSize: 13 }}>
            {refreshing ? "↻ …" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <SectionTitle>Key Metrics</SectionTitle>
      <div style={s.grid4}>
        <MetricCard title="Total Calls"    value="1,284"  delta={12}  color="#4f46e5"  icon="📞" />
        <MetricCard title="Resolved"       value="89"     unit="%"    delta={3}   color="#22c55e" icon="✓" />
        <MetricCard title="Avg Duration"   value="3.2"    unit="min"  delta={-5}  color="#f59e0b" icon="⏱" />
        <MetricCard title="Escalations"    value="47"     delta={-18} color="#ef4444" icon="⚠" />
        <MetricCard title="Avg STT"        value="340"    unit="ms"   delta={-8}  color="#0ea5e9" icon="🎙" />
        <MetricCard title="Avg LLM"        value="620"    unit="ms"   delta={-12} color="#a855f7" icon="🧠" />
        <MetricCard title="Avg TTS"        value="285"    unit="ms"   delta={-4}  color="#14b8a6" icon="🔊" />
        <MetricCard title="Active Now"     value="7"      color="#22c55e" icon="🟢" />
      </div>

      {/* Latency trend */}
      <SectionTitle>Latency Trends</SectionTitle>
      <ChartCard title="Pipeline Latency (ms) — last 20 calls" height={240}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={latencyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" stroke="#4b5563" tick={{ fill: "#6b7280", fontSize: 11 }} />
            <YAxis stroke="#4b5563" tick={{ fill: "#6b7280", fontSize: 11 }} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
            <Line type="monotone" dataKey="stt"   stroke="#0ea5e9" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="llm"   stroke="#a855f7" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="tts"   stroke="#14b8a6" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="total" stroke="#f59e0b" dot={false} strokeWidth={2} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Volume + Intents */}
      <SectionTitle>Call Volume & Intents</SectionTitle>
      <div style={{ ...s.grid2, marginBottom: 0 }}>
        <ChartCard title="Daily Call Volume" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={volumeData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="day" stroke="#4b5563" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis stroke="#4b5563" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Bar dataKey="calls"    fill="#4f46e5" radius={[4,4,0,0]} />
              <Bar dataKey="resolved" fill="#22c55e" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top Intents" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={INTENT_DATA} layout="vertical"
              margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
              <XAxis type="number" stroke="#4b5563" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis type="category" dataKey="intent" width={80}
                stroke="#4b5563" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Bar dataKey="count" radius={[0,4,4,0]}>
                {INTENT_DATA.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Language + Sentiment */}
      <SectionTitle>Language & Sentiment</SectionTitle>
      <div style={{ ...s.grid2, marginBottom: 0 }}>
        <ChartCard title="Language Distribution (%)" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={LANG_DIST} cx="50%" cy="50%" outerRadius={80}
                dataKey="value" nameKey="name" label={({ name, value }) => `${name} ${value}%`}
                labelLine={false} fontSize={11}>
                {LANG_DIST.map((entry, i) => (
                  <Cell key={i} fill={LANG_COLORS[entry.code] || "#6b7280"} />
                ))}
              </Pie>
              <Tooltip {...TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Caller Sentiment" height={220}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center",
                        height: "100%", gap: 16 }}>
            {SENTIMENT_DATA.map(s => (
              <div key={s.name}>
                <div style={{ display: "flex", justifyContent: "space-between",
                              fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: "#d1d5db" }}>{s.name}</span>
                  <span style={{ color: s.color, fontWeight: 700 }}>{s.value}%</span>
                </div>
                <div style={{ height: 8, background: "#1f2937", borderRadius: 4 }}>
                  <div style={{
                    height: "100%", width: `${s.value}%`,
                    background: s.color, borderRadius: 4,
                    transition: "width 0.6s ease",
                  }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* STT Corrections */}
      <SectionTitle>STT Feedback Loop</SectionTitle>
      <div style={{
        background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 20,
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 14, marginBottom: 20 }}>
          {[
            { label: "Total Corrections", value: 142,  color: "#4f46e5" },
            { label: "Applied This Week", value: 891,  color: "#22c55e" },
            { label: "Languages",         value: 8,    color: "#f59e0b" },
            { label: "Accuracy Gain",     value: "4.2%", color: "#14b8a6" },
          ].map(m => (
            <div key={m.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: m.color }}>{m.value}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{m.label}</div>
            </div>
          ))}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Original (STT)", "Corrected", "Language", "Applied", "Last Used"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left",
                                     color: "#6b7280", fontSize: 11, fontWeight: 600,
                                     textTransform: "uppercase", borderBottom: "1px solid #1f2937" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { bad: "kaam nahi kar raha", good: "काम नहीं कर रहा", lang: "hi", hits: 47, date: "2026-03-25" },
              { bad: "website nahin khul rahi", good: "website नहीं खुल रही", lang: "hi", hits: 31, date: "2026-03-24" },
              { bad: "paasword", good: "password", lang: "en", hits: 22, date: "2026-03-23" },
              { bad: "server doun", good: "server down", lang: "en", hits: 18, date: "2026-03-22" },
            ].map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #1f2937" }}>
                <td style={{ padding: "10px 12px", color: "#ef4444", fontFamily: "monospace" }}>"{row.bad}"</td>
                <td style={{ padding: "10px 12px", color: "#22c55e", fontFamily: "monospace" }}>"{row.good}"</td>
                <td style={{ padding: "10px 12px", color: "#9ca3af" }}>{row.lang.toUpperCase()}</td>
                <td style={{ padding: "10px 12px", color: "#4f46e5", fontWeight: 700 }}>{row.hits}×</td>
                <td style={{ padding: "10px 12px", color: "#6b7280" }}>{row.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
