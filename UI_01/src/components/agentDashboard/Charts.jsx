import ReactECharts from "echarts-for-react";
import { statusColor, sentimentColor } from "../../utils/agentHelpers";

const chartTitle = {
  fontSize: 11, fontWeight: 700, color: "var(--txt2)",
  textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px",
};

const chartCard = {
  background: "var(--bg2)",
  border: "1px solid var(--bdr)",
  borderRadius: 12, padding: 16,
};

const legend = { display: "flex", flexWrap: "wrap", gap: "6px 12px", marginTop: 6 };

const legendItem = { display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--txt2)" };

const legendDot = { width: 8, height: 8, borderRadius: 2, flexShrink: 0 };

export function StatusPie({ stats }) {
  const data = (stats?.statusBreakdown || []).map((r) => ({ name: r.status, value: r.cnt }));
  const option = {
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: { show: false },
    series: [{
      type: "pie", radius: ["45%", "72%"], data,
      color: data.map((d) => statusColor[d.name] || "#888780"),
      itemStyle: { borderRadius: 4, borderWidth: 2, borderColor: "transparent" },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 12, fontWeight: 500 } },
    }],
  };
  return (
    <div style={chartCard}>
      <p style={chartTitle}>Call Status Breakdown</p>
      <ReactECharts option={option} style={{ height: 180 }} />
      <div style={legend}>
        {(stats?.statusBreakdown || []).map((r) => (
          <span key={r.status} style={legendItem}>
            <span style={{ ...legendDot, background: statusColor[r.status] || "#888780" }} />
            {r.status} ({r.cnt})
          </span>
        ))}
      </div>
    </div>
  );
}

export function SentimentPie({ stats }) {
  const data = (stats?.sentimentBreakdown || []).map((r) => ({ name: r.sentiment, value: r.cnt }));
  const option = {
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: { show: false },
    series: [{
      type: "pie", radius: ["45%", "72%"], data,
      color: data.map((d) => sentimentColor[d.name] || "#888780"),
      itemStyle: { borderRadius: 4, borderWidth: 2, borderColor: "transparent" },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 12, fontWeight: 500 } },
    }],
  };
  return (
    <div style={chartCard}>
      <p style={chartTitle}>Sentiment Distribution</p>
      <ReactECharts option={option} style={{ height: 180 }} />
      <div style={legend}>
        {(stats?.sentimentBreakdown || []).map((r) => (
          <span key={r.sentiment} style={legendItem}>
            <span style={{ ...legendDot, background: sentimentColor[r.sentiment] || "#888780" }} />
            {r.sentiment} ({r.cnt})
          </span>
        ))}
      </div>
    </div>
  );
}

export function DailyLine({ stats }) {
  const d = stats?.dailyVolume || [];
  const option = {
    tooltip: { trigger: "axis" },
    grid: { left: 40, right: 16, top: 16, bottom: 32 },
    xAxis: {
      type: "category", data: d.map((r) => r.day),
      axisLabel: { fontSize: 11 }, axisTick: { show: false }, axisLine: { show: false },
    },
    yAxis: {
      type: "value", axisLabel: { fontSize: 11 },
      splitLine: { lineStyle: { type: "dashed", color: "rgba(0,0,0,0.08)" } },
    },
    series: [
      {
        name: "Calls", type: "line", data: d.map((r) => r.calls),
        smooth: true, areaStyle: { opacity: 0.12 },
        lineStyle: { width: 2.5 }, itemStyle: { color: "#185FA5" },
        symbol: "circle", symbolSize: 5,
      },
      {
        name: "Avg Duration(s)", type: "line", data: d.map((r) => Math.round(r.avgDuration)),
        smooth: true, lineStyle: { width: 2, type: "dashed" },
        itemStyle: { color: "#1D9E75" }, symbol: "none",
      },
    ],
  };
  return (
    <div style={chartCard}>
      <p style={chartTitle}>Daily Call Volume</p>
      <ReactECharts option={option} style={{ height: 200 }} />
    </div>
  );
}

export function HourlyHeat({ stats }) {
  const raw = stats?.hourlyHeatmap || [];
  const arr = Array(24).fill(0);
  raw.forEach((r) => { arr[r.hour] = r.calls; });
  const option = {
    tooltip: { trigger: "item", formatter: (p) => `${p.name}:00 — ${p.value} calls` },
    grid: { left: 40, right: 16, top: 12, bottom: 32 },
    xAxis: {
      type: "category", data: Array.from({ length: 24 }, (_, i) => `${i}h`),
      axisLabel: { fontSize: 10 }, axisTick: { show: false }, axisLine: { show: false },
    },
    yAxis: { show: false },
    series: [{
      type: "bar", data: arr,
      itemStyle: {
        color: (p) => {
          const max = Math.max(...arr, 1);
          const alpha = 0.18 + (p.value / max) * 0.82;
          return `rgba(24,95,165,${alpha.toFixed(2)})`;
        },
        borderRadius: [3, 3, 0, 0],
      },
      barMaxWidth: 28,
    }],
  };
  return (
    <div style={chartCard}>
      <p style={chartTitle}>Hourly Heatmap</p>
      <ReactECharts option={option} style={{ height: 200 }} />
    </div>
  );
}

export function CategoryBubble({ stats }) {
  const data = (stats?.categoryBreakdown || []).map((r, i) => ({ name: r.category, value: [i, r.cnt, r.cnt] }));
  const option = {
    tooltip: { formatter: (p) => `${(stats?.categoryBreakdown || [])[p.dataIndex]?.category}: ${p.value[1]} calls` },
    xAxis: { show: false, min: -1, max: data.length },
    yAxis: { show: false, min: 0 },
    series: [{
      type: "scatter", data: data.map((d) => d.value),
      symbolSize: (v) => Math.max(20, Math.min(80, v[2] * 4)),
      itemStyle: {
        color: (p) => ["#185FA5", "#1D9E75", "#BA7517", "#E24B4A", "#534AB7"][p.dataIndex % 5],
        opacity: 0.85,
      },
      label: {
        show: true, position: "inside",
        formatter: (p) => {
          const name = (stats?.categoryBreakdown || [])[p.dataIndex]?.category || "";
          return name.length > 8 ? name.slice(0, 6) + "…" : name;
        },
        fontSize: 10, color: "#fff", fontWeight: 500,
      },
    }],
  };
  return (
    <div style={chartCard}>
      <p style={chartTitle}>Category Bubble</p>
      <ReactECharts option={option} style={{ height: 200 }} />
    </div>
  );
}

export function SankeyChart({ stats }) {
  const raw = stats?.sankeyRaw || [];
  if (!raw.length) return (
    <div style={chartCard}>
      <p style={chartTitle}>Pathway → Outcome Flow</p>
      <p style={{ fontSize: 12, color: "var(--txt2)", textAlign: "center", padding: "40px 0" }}>No pathway data for this range.</p>
    </div>
  );

  const nodeSet = new Set();
  raw.forEach((r) => { nodeSet.add(r.pathway); nodeSet.add(r.status); });
  const nodes = Array.from(nodeSet).map((n) => ({ name: n }));
  const links = raw.map((r) => ({ source: r.pathway, target: r.status, value: r.cnt }));

  const option = {
    tooltip: { trigger: "item", triggerOn: "mousemove" },
    series: [{
      type: "sankey", layout: "none",
      emphasis: { focus: "adjacency" },
      data: nodes, links,
      lineStyle: { color: "gradient", opacity: 0.5 },
      itemStyle: { borderRadius: 4 },
      label: { fontSize: 12 },
      nodeWidth: 20, nodeGap: 12,
      color: ["#185FA5", "#1D9E75", "#BA7517", "#E24B4A", "#888780", "#534AB7", "#0F6E56"],
    }],
  };

  return (
    <div style={chartCard}>
      <p style={chartTitle}>Pathway → Outcome Flow</p>
      <ReactECharts option={option} style={{ height: 260 }} />
    </div>
  );
}