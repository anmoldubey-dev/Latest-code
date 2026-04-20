import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';

// ======================== AI Query Intelligence Hub ========================
// AIQueryCategories -> Presentational and analytical node for aggregating AI
// intent telemetry. Visualizes dataset clusters via relational bubble plots
// and volume-weighted bar projections. Includes a smart NL2SQL search gateway.
// ||
// ||
// ||
// Functions -> AIQueryCategories()-> Root container for query visualization:
// ||           |
// ||           |--- getQueryBubbleOptions()-> Logic Branch: Aggregates intent 
// ||           |    clusters into volume-scaled scatter coordinates.
// ||           |
// ||           |--- getQueryBarChartOptions()-> Logic Branch: Projects sorted 
// ||           |    categorical distributions onto a linear axis.
// ||           |
// ||           └── (Lifecycle Hooks):
// ||                └── useEffect()-> Sub-process: Temporal delay for 
// ||                     hydration safety and layout stability.
// ||
// ===========================================================================

const AIQueryCategories = ({ filteredLogs, onChartClick, setActiveModal, getHexColor, smartQuery, setSmartQuery, handleSmartSearch, isSearching }) => {

  // ---------------------------------------------------------------
  // SECTION: COMPONENT STATE & INITIALIZATION
  // ---------------------------------------------------------------
  const [ready, setReady] = useState(false);

  // Initialization -> useEffect()-> Orchestrates a minor temporal delay to ensure ECharts container hydration
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 150);
    return () => clearTimeout(t);
  }, []);

  if (!ready) return <div style={{ height: '700px' }} />;

  // ---------------------------------------------------------------
  // SECTION: VISUAL ENGINE MAPPING (CHART OPTIONS)
  // ---------------------------------------------------------------

  // Logic Branch -> getQueryBubbleOptions()-> Maps intent density to geometric bubble volumes
  const getQueryBubbleOptions = () => {
    const categoryCounts = {};
    filteredLogs.forEach(log => {
      log.queries.forEach(q => {
        categoryCounts[q.type] = (categoryCounts[q.type] || 0) + 1;
      });
    });
    const uniqueCats = Object.keys(categoryCounts);
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: '{b}<br/>Volume: {c[1]}' },
      grid: { left: '8%', right: '8%', bottom: '15%', top: '15%', containLabel: true },
      xAxis: { type: 'category', data: uniqueCats.length ? uniqueCats : ['No Data'], axisLabel: { color: '#aaa' } },
      yAxis: { type: 'value', name: 'Volume', minInterval: 1, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }, axisLabel: { color: '#aaa' } },
      series: [{
        type: 'scatter',
        symbolSize: (val) => (val[2] * 8) + 15,
        cursor: 'pointer',
        itemStyle: {
          opacity: 0.9,
          shadowBlur: 10,
          shadowColor: 'rgba(0,0,0,0.5)',
          color: (params) => getHexColor(params.name)
        },
        data: uniqueCats.map(c => ({ name: c, value: [c, categoryCounts[c], categoryCounts[c]] }))
      }]
    };
  };

  // Logic Branch -> getQueryBarChartOptions()-> Projects sorted categorical distributions for volume analysis
  const getQueryBarChartOptions = () => {
    const categoryCounts = {};
    filteredLogs.forEach(log => {
      log.queries.forEach(q => {
        categoryCounts[q.type] = (categoryCounts[q.type] || 0) + 1;
      });
    });
    const sortedCategories = Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a]);
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '5%', right: '5%', bottom: '20%', top: '15%', containLabel: true },
      xAxis: { type: 'category', data: sortedCategories.length ? sortedCategories : ['No Data'], axisLabel: { color: '#aaa', interval: 0, rotate: 15 } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }, axisLabel: { color: '#aaa' }, minInterval: 1 },
      series: [{
        name: 'Queries',
        type: 'bar',
        data: sortedCategories.map(c => categoryCounts[c]),
        cursor: 'pointer',
        itemStyle: {
          color: (params) => getHexColor(params.name),
          borderRadius: [4, 4, 0, 0]
        }
      }]
    };
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6 w-full">

      <div className="bg-[#020617]/80 p-1.5 rounded-xl border border-[#10B981]/50 shadow-[0_0_15px_rgba(16,185,129,0.1)] focus-within:shadow-[0_0_25px_rgba(16,185,129,0.3)] transition-all">
        <form onSubmit={handleSmartSearch} className="flex items-center gap-2">
          <span className="pl-3 text-[#10B981] animate-pulse">🤖</span>
          <input
            type="text"
            value={smartQuery}
            onChange={(e) => setSmartQuery(e.target.value)}
            placeholder="Ask the Dashboard: e.g., 'Show HR queries from last 10 minutes'"
            className="w-full bg-transparent text-sm text-white px-2 py-2 outline-none placeholder-gray-500"
            disabled={isSearching}
          />
          <button
            type="submit"
            disabled={isSearching || !smartQuery.trim()}
            className="bg-gradient-to-r from-[#10B981] to-[#059669] hover:opacity-80 disabled:opacity-50 text-white text-xs font-bold py-2 px-5 rounded-lg transition-all"
          >
            {isSearching ? 'Analyzing...' : 'Search'}
          </button>
        </form>
      </div>

      <div className="glass-card-hover rounded-2xl p-5" style={{ height: '300px' }}>
        <h2 className="text-lg font-semibold mb-2">Query Volumes (Bar)</h2>
        <ReactECharts
          notMerge={true}
          option={getQueryBarChartOptions()}
          onEvents={{ click: onChartClick }}
          style={{ height: '230px', width: '100%' }}
        />
      </div>

      <div className="glass-card-hover rounded-2xl p-5 relative" style={{ height: '320px' }}>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold text-gray-200">Intent Clusters (Bubble)</h2>
          <button
            onClick={() => setActiveModal('queryCat')}
            className="bg-[#6366F1]/20 text-white border border-[#6366F1]/40 px-3 py-1 rounded-lg text-xs font-bold hover:bg-[#6366F1]/50 transition-colors"
          >
            🧊 View 3D
          </button>
        </div>
        <ReactECharts
          notMerge={true}
          option={getQueryBubbleOptions()}
          onEvents={{ click: onChartClick }}
          style={{ height: '250px', width: '100%' }}
        />
      </div>

    </div>
  );
};

export default AIQueryCategories;