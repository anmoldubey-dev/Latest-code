import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';

// ======================== Staff Performance Analytics ========================
// StaffPerformance -> A specialized analytical node for visualizing workforce
// metrics. Orchestrates the aggregation of team-level call volumes and 
// agent-level CSAT (Customer Satisfaction) distributions via interactive 
// 2D charting and 3D visualization triggers.
// ||
// ||
// ||
// Functions -> StaffPerformance()-> Main functional entry point for performance telemetry:
// ||           |
// ||           |--- getTeamPerformanceOptions()-> Logic Branch: Normalizes team-specific 
// ||           |    call frequency and weighted CSAT averages for bar/line projection.
// ||           |
// ||           |--- get2DAgentOptions()-> Logic Branch: Maps agent-level performance 
// ||           |    density into a multi-variable scatter plot.
// ||           |
// ||           └── useEffect()-> Sub-process: Temporal hydration anchor to 
// ||                mitigate ECharts canvas initialization race conditions.
// ||
// =============================================================================

const StaffPerformance = ({ filteredLogs, onChartClick, setActiveModal }) => {

  // ---------------------------------------------------------------
  // SECTION: COMPONENT STATE & INITIALIZATION
  // ---------------------------------------------------------------

  const [ready, setReady] = useState(false);

  // Initialization -> useEffect()-> Manages a terminal delay for layout stability before chart injection
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 150);
    return () => clearTimeout(t);
  }, []);

  if (!ready) return <div style={{ height: '660px' }} />;

  // Logic Branch -> Data Validation: Renders fallback state if the telemetry stream is empty
  if (!filteredLogs || filteredLogs.length === 0) return (
    <div className="glass-card-hover rounded-2xl p-6 flex items-center justify-center" style={{ height: '660px' }}>
      <p className="text-gray-500 text-sm">No data available. Add call logs to see charts.</p>
    </div>
  );

  // ---------------------------------------------------------------
  // SECTION: VISUAL OPTION ENGINES (CHART CONFIG)
  // ---------------------------------------------------------------

  // Logic Branch -> getTeamPerformanceOptions()-> Aggregates team-level KPIs for a dual-axis projection
  const getTeamPerformanceOptions = () => {
    const teamStats = {};
    filteredLogs.forEach(log => {
      if (log.team) {
        if (!teamStats[log.team]) teamStats[log.team] = { calls: 0, csat: 0 };
        teamStats[log.team].calls += 1;
        teamStats[log.team].csat += parseFloat(log.csat) || 0;
      }
    });
    const teams = Object.keys(teamStats);
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '8%', right: '8%', bottom: '20%', top: '15%', containLabel: true },
      xAxis: {
        type: 'category',
        data: teams.length ? teams : ['No Data'],
        axisLabel: { color: '#aaa', interval: 0, rotate: 15 }
      },
      yAxis: [
        { type: 'value', name: 'Calls', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }, axisLabel: { color: '#aaa' }, minInterval: 1 },
        { type: 'value', name: 'CSAT', min: 0, max: 5, splitLine: { show: false }, axisLabel: { color: '#aaa' } }
      ],
      series: [
        { name: 'Calls', type: 'bar', yAxisIndex: 0, data: teams.map(t => teamStats[t].calls), itemStyle: { color: '#6366F1', borderRadius: [4, 4, 0, 0] } },
        { name: 'CSAT', type: 'line', yAxisIndex: 1, data: teams.map(t => teamStats[t].calls > 0 ? (teamStats[t].csat / teamStats[t].calls).toFixed(1) : 0), itemStyle: { color: '#10B981' }, smooth: true }
      ]
    };
  };

  // Logic Branch -> get2DAgentOptions()-> Projects agent performance metrics onto a scatter-density map
  const get2DAgentOptions = () => {
    const agentStats = {};
    filteredLogs.forEach(log => {
      if (log.agent) {
        if (!agentStats[log.agent]) agentStats[log.agent] = { calls: 0, csat: 0 };
        agentStats[log.agent].calls += 1;
        agentStats[log.agent].csat += parseFloat(log.csat) || 0;
      }
    });
    const agentData = Object.keys(agentStats).map(agent => ({
      name: agent,
      value: [agentStats[agent].calls, parseFloat((agentStats[agent].csat / agentStats[agent].calls).toFixed(1))]
    }));
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: '{b}<br/>Calls: {c[0]}<br/>CSAT: {c[1]}' },
      grid: { left: '10%', right: '8%', bottom: '20%', top: '15%', containLabel: true },
      xAxis: { name: 'Calls', type: 'value', minInterval: 1, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }, axisLabel: { color: '#aaa' } },
      yAxis: { name: 'CSAT', type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }, axisLabel: { color: '#aaa' }, min: 0, max: 5 },
      series: [{
        type: 'scatter',
        symbolSize: 25,
        cursor: 'pointer',
        itemStyle: {
          opacity: 0.9,
          shadowBlur: 10,
          shadowColor: 'rgba(0,0,0,0.5)',
          color: (params) =>
            params.data.value[1] >= 4.0 ? '#10B981' :
              params.data.value[1] >= 3.0 ? '#F59E0B' : '#ef4444'
        },
        data: agentData
      }]
    };
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <>
      <div className="glass-card-hover rounded-2xl p-5" style={{ height: '300px' }}>
        <h2 className="text-lg font-semibold mb-2">Team Performance</h2>
        <ReactECharts
          notMerge={true}
          option={getTeamPerformanceOptions()}
          onEvents={{ click: onChartClick }}
          style={{ height: '230px', width: '100%' }}
        />
      </div>

      <div className="glass-card-hover rounded-2xl p-5 relative" style={{ height: '320px' }}>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold text-gray-200">Agent Breakdown</h2>
          <button
            onClick={() => setActiveModal('agent')}
            className="bg-[#6366F1]/20 text-white border border-[#6366F1]/40 px-3 py-1 rounded-lg text-xs font-bold hover:bg-[#6366F1]/50 transition-colors"
          >
            🧊 View 3D
          </button>
        </div>
        <ReactECharts
          notMerge={true}
          option={get2DAgentOptions()}
          onEvents={{ click: onChartClick }}
          style={{ height: '250px', width: '100%' }}
        />
      </div>
    </>
  );
};

export default StaffPerformance;