import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import 'echarts-gl';

// ======================== AI Query Routing Simulator ========================
// LiveQuerySimulator -> An interactive testing node designed to validate NLP
// classification and routing logic. Orchestrates real-time telemetry via
// relational flow maps (Sankey), intent density plots (Bubble), and 
// WebGL-driven spatial distribution analysis.
// ||
// ||
// ||
// Functions -> LiveQuerySimulator()-> Primary container for routing simulation:
// ||           |
// ||           |--- handleSimulate()-> [async Action Trigger]: Executes dual-stage
// ||           |    validation (RAG analysis -> MySQL Persistence).
// ||           |
// ||           |--- handleAction()-> [async Action Trigger]: PUT /api/calls/:id ->
// ||           |    Commits manual status overrides (Resolve/Escalate).
// ||           |
// ||           |--- Visual Data Engines:
// ||           |    ├── getDynamicSankeyData()-> Mapping: Resolves node-link flows.
// ||           |    ├── get3DOptions()-> Mapping: Generates spatial scatter vectors.
// ||           |    └── getCategoryColor()-> Design Token: Maps categories to hex.
// ||           |
// ||           └── useEffect()-> [Sub-process]: GET /api/calls -> Hydrates simulation
// ||                registry with historical signaling logs.
// ||
// ==============================================================================

// ---------------------------------------------------------------
// SECTION: AUTHENTICATION & CONSTANTS
// ---------------------------------------------------------------

const TOKEN = () => sessionStorage.getItem("token");
const AUTH = () => ({ Authorization: `Bearer ${TOKEN()}` });

// ---------------------------------------------------------------
// SECTION: MAIN SIMULATOR COMPONENT
// ---------------------------------------------------------------

const LiveQuerySimulator = () => {

  // State Management -> Reactive buffers for simulation logs, processing states, and modal visibility
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [simulatedLogs, setSimulatedLogs] = useState([]);
  const [activeModal, setActiveModal] = useState(false);

  // ---------------------------------------------------------------
  // SECTION: DATA LIFECYCLE (FETCH)
  // ---------------------------------------------------------------

  // Sub-process -> useEffect()-> Orchestrates the terminal data sync for simulator hydration
  useEffect(() => {
    fetch('/api/calls', { headers: AUTH() })
      .then(res => res.json())
      .then(data => {
        const formatted = data.map(row => ({
          id: row.id,
          text: row.issue_summary || row.query_text || '',
          category: row.category || 'General',
          status: row.status || 'Active',
          time: new Date(row.created_at || Date.now()).toLocaleTimeString()
        }));
        setSimulatedLogs(formatted.reverse());
      })
      .catch(err => console.error("DB Fetch Error:", err));
  }, []);

  // ---------------------------------------------------------------
  // SECTION: VISUAL ENGINE MAPPING (CHART LOGIC)
  // ---------------------------------------------------------------

  // Logic Branch -> getDynamicSankeyData()-> Resolves temporal routing flows from New Queries to Terminal Statuses
  const getDynamicSankeyData = () => {
    if (simulatedLogs.length === 0) {
      return {
        nodes: [{ name: 'Waiting for Queries...' }, { name: '...' }],
        links: [{ source: 'Waiting for Queries...', target: '...', value: 1 }]
      };
    }
    const uniqueCategories = [...new Set(simulatedLogs.map(l => l.category))];
    let nodes = [{ name: 'New Queries', itemStyle: { color: '#8B5CF6' } }];
    let links = [];
    uniqueCategories.forEach(cat => {
      const catLogs = simulatedLogs.filter(l => l.category === cat);
      if (catLogs.length > 0) {
        nodes.push({ name: cat, itemStyle: { color: '#6366F1' } });
        links.push({ source: 'New Queries', target: cat, value: catLogs.length });
        const activeCount = catLogs.filter(l => l.status === 'Active').length;
        const resolvedCount = catLogs.filter(l => l.status === 'Resolved').length;
        const escalatedCount = catLogs.filter(l => l.status === 'Escalated').length;
        if (activeCount > 0) {
          if (!nodes.find(n => n.name === 'Active'))
            nodes.push({ name: 'Active', itemStyle: { color: '#ef4444' } });
          links.push({ source: cat, target: 'Active', value: activeCount, lineStyle: { color: '#ef4444', opacity: 0.4 } });
        }
        if (resolvedCount > 0) {
          if (!nodes.find(n => n.name === 'Resolved'))
            nodes.push({ name: 'Resolved', itemStyle: { color: '#10B981' } });
          links.push({ source: cat, target: 'Resolved', value: resolvedCount, lineStyle: { color: '#10B981', opacity: 0.4 } });
        }
        if (escalatedCount > 0) {
          if (!nodes.find(n => n.name === 'Escalated'))
            nodes.push({ name: 'Escalated', itemStyle: { color: '#F59E0B' } });
          links.push({ source: cat, target: 'Escalated', value: escalatedCount, lineStyle: { color: '#F59E0B', opacity: 0.4 } });
        }
      }
    });
    return { nodes, links };
  };

  const sankeyData = getDynamicSankeyData();

  // Internal Utility -> getCategoryColor()-> Design Token: Maps logical categories to visual color space
  const getCategoryColor = (cat) => {
    const colors = {
      'HR': '#8B5CF6', 'Finance': '#F59E0B', 'Technical': '#10B981',
      'Sales': '#06b6d4', 'Complaints': '#ef4444', 'General': '#6b7280'
    };
    return colors[cat] || '#6b7280';
  };

  const uniqueCatsForBubble = [...new Set(simulatedLogs.map(l => l.category))];
  const bubbleData = uniqueCatsForBubble.map(c => {
    const count = simulatedLogs.filter(l => l.category === c).length;
    return {
      name: c,
      value: [c, count, count],
      itemStyle: { color: getCategoryColor(c), shadowBlur: 15, shadowColor: 'rgba(0,0,0,0.5)' }
    };
  });

  const bubbleOptions = {
    tooltip: { trigger: 'item', formatter: (p) => `${p.data.name}: ${p.data.value[1]} Queries` },
    grid: { left: '10%', right: '5%', bottom: '15%', top: '10%' },
    xAxis: {
      type: 'category',
      data: uniqueCatsForBubble.length > 0 ? uniqueCatsForBubble : ['No Data'],
      axisLabel: { color: '#aaa' }, splitLine: { show: false }
    },
    yAxis: {
      type: 'value', name: 'Volume',
      axisLabel: { color: '#aaa' },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      minInterval: 1
    },
    series: [{
      type: 'scatter',
      symbolSize: (val) => val[2] === 0 ? 0 : (val[2] * 5) + 20,
      data: bubbleData, label: { show: false }
    }]
  };

  const sankeyOptions = {
    tooltip: { trigger: 'item' },
    series: {
      type: 'sankey', layout: 'none', focusNodeAdjacency: true, nodeAlign: 'left',
      data: sankeyData.nodes, links: sankeyData.links,
      label: { color: '#fff', fontSize: 11, fontWeight: 'bold' }
    }
  };

  // Mapping -> get3DOptions()-> Projects query distribution vectors into 3D Cartesian coordinates (WebGL)
  const get3DOptions = () => ({
    tooltip: { trigger: 'item', formatter: '{b}: {c[1]} Queries' },
    grid3D: {
      viewControl: { projection: 'perspective', autoRotate: true, distance: 200 },
      environment: 'transparent'
    },
    xAxis3D: { type: 'category', data: uniqueCatsForBubble, name: 'Category' },
    yAxis3D: { type: 'value', name: 'Volume' },
    zAxis3D: { type: 'value', name: 'Risk' },
    series: [{
      type: 'scatter3D', symbolSize: 20,
      data: bubbleData.map(d => ({
        name: d.name,
        value: [d.name, d.value[1], Math.random() * 10],
        itemStyle: d.itemStyle
      }))
    }]
  });

  // ---------------------------------------------------------------
  // SECTION: INTERACTION HANDLERS (ACTION LOGIC)
  // ---------------------------------------------------------------

  // Action Trigger -> handleSimulate()-> Dispatches dual-channel request (Classification -> DB Save)
  const handleSimulate = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const currentQuery = inputText;
    let detectedCategory = 'General';
    setInputText('');
    setIsProcessing(true);

    try {
      // Step 1: AI Categorization Request
      const response = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH() },
        body: JSON.stringify({ query: currentQuery })
      });
      if (response.ok) {
        const data = await response.json();
        detectedCategory = data.category || 'General';
      } else throw new Error("API failed");
    } catch {
      // Logic Branch -> Fallback: Regex-based pattern matching for offline resiliency
      const lower = currentQuery.toLowerCase();
      if (lower.includes('hr') || lower.includes('leave')) detectedCategory = 'HR';
      else if (lower.includes('finance') || lower.includes('tax')) detectedCategory = 'Finance';
      else if (lower.includes('tech') || lower.includes('login')) detectedCategory = 'Technical';
      else if (lower.includes('sales') || lower.includes('price')) detectedCategory = 'Sales';
      else if (lower.includes('complain') || lower.includes('angry')) detectedCategory = 'Complaints';
    }

    try {
      // Step 2: Commit Transaction to Signaling DB
      const dbRes = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH() },
        body: JSON.stringify({
          caller_name: 'Simulator',
          issue_summary: currentQuery,
          category: detectedCategory,
          status: 'Active'
        })
      });
      const newLog = await dbRes.json();
      setSimulatedLogs(prev => [{
        id: newLog.id || Date.now(),
        text: currentQuery,
        category: detectedCategory,
        status: 'Active',
        time: new Date().toLocaleTimeString()
      }, ...prev]);
    } catch (err) {
      console.error("DB Save Error:", err);
    }

    setIsProcessing(false);
  };

  // Action Trigger -> handleAction()-> Executes status modulation for a target session record
  const handleAction = async (id, newStatus) => {
    setSimulatedLogs(prev =>
      prev.map(log => log.id === id ? { ...log, status: newStatus } : log)
    );
    try {
      await fetch(`/api/calls/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...AUTH() },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (err) {
      console.error("Update failed", err);
    }
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    <div className="glass-card-hover rounded-2xl p-6 flex flex-col min-h-[450px] border border-[#6366F1]/30 animate-in fade-in duration-500 relative">
      <div className="mb-6 border-b border-white/10 pb-4 flex justify-between items-center">
        <h2 className="text-xl font-bold text-gradient flex items-center gap-3">
          🤖 Live AI Query Routing Simulator
          <span className="text-xs bg-[#10B981]/20 text-[#10B981] px-2 py-1 rounded-full font-mono flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#10B981] animate-pulse"></span> DB SYNCED
          </span>
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="flex flex-col gap-4 bg-white/5 p-5 rounded-xl border border-white/10">
          <form onSubmit={handleSimulate} className="flex flex-col gap-3">
            <label className="text-xs font-bold text-[#8B5CF6] uppercase">Inject Test Query</label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="e.g., 'Total profit this year'..."
              className="w-full bg-[#020617]/80 text-white p-3 rounded-lg border border-white/10 outline-none h-24 custom-scrollbar"
              disabled={isProcessing}
            />
            <button
              type="submit" disabled={isProcessing}
              className="bg-[#10B981] hover:bg-[#059669] disabled:bg-gray-500 text-white font-bold py-2.5 px-4 rounded-lg transition-all"
            >
              {isProcessing ? 'Processing with AI...' : 'Simulate Routing'}
            </button>
          </form>

          <div className="flex-1 overflow-y-auto max-h-[220px] custom-scrollbar mt-3 pr-2 flex flex-col gap-3">
            {simulatedLogs.map((log) => (
              <div key={log.id} className={`p-3 rounded-lg border border-white/5 text-xs flex flex-col gap-2 transition-colors
                ${log.status === 'Active' ? 'bg-[#ef4444]/10 border-[#ef4444]/30' :
                  log.status === 'Resolved' ? 'bg-[#10B981]/10 border-[#10B981]/30' :
                    'bg-[#F59E0B]/10 border-[#F59E0B]/30'}`}>
                <span className="text-gray-200 italic">"{log.text}"</span>
                <div className="flex justify-between items-center border-t border-white/5 pt-2">
                  <span className="px-2 py-1 rounded text-[9px] font-bold uppercase border border-[#8B5CF6] text-[#8B5CF6]">
                    {log.category}
                  </span>
                  {log.status === 'Active' ? (
                    <div className="flex gap-2">
                      <button onClick={() => handleAction(log.id, 'Resolved')}
                        className="bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/40 px-2 py-1 rounded transition-colors font-bold">
                        Resolve
                      </button>
                      <button onClick={() => handleAction(log.id, 'Escalated')}
                        className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/40 px-2 py-1 rounded transition-colors font-bold">
                        Escalate
                      </button>
                    </div>
                  ) : (
                    <span className={`font-bold ${log.status === 'Resolved' ? 'text-[#10B981]' : 'text-[#F59E0B]'}`}>
                      {log.status}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#020617]/40 rounded-xl p-5 border border-white/5 relative">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xs text-[#8B5CF6] font-bold uppercase">Live Intent Clusters</h3>
              <button onClick={() => setActiveModal(true)}
                className="bg-[#6366F1]/20 text-white border border-[#6366F1]/40 px-2 py-1 rounded text-[10px] font-bold z-10 hover:bg-[#6366F1]/50 transition-colors">
                🧊 3D View
              </button>
            </div>
            <ReactECharts option={bubbleOptions} notMerge={true} style={{ height: '220px', width: '100%' }} />
          </div>
          <div className="bg-[#020617]/40 rounded-xl p-5 border border-white/5">
            <h3 className="text-xs text-[#8B5CF6] font-bold mb-4 uppercase">Real-time Resolution Flow</h3>
            <ReactECharts option={sankeyOptions} notMerge={true} style={{ height: '220px', width: '100%' }} />
          </div>
        </div>
      </div>

      {activeModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/90 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300">
          <div className="w-full h-full max-w-5xl max-h-[600px] glass-card rounded-3xl p-6 flex flex-col relative border border-[#10B981]/30 shadow-[0_0_80px_rgba(16,185,129,0.2)]">
            <button onClick={() => setActiveModal(false)}
              className="absolute top-6 right-6 text-white bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 px-5 py-2.5 rounded-xl transition-all z-20 font-bold">
              ✕ Close 3D View
            </button>
            <h2 className="text-2xl font-bold text-[#10B981] mb-2">3D Live Query Distribution Engine</h2>
            <div className="flex-1 w-full bg-[#020617]/80 rounded-2xl overflow-hidden border border-white/10 relative shadow-inner cursor-grab active:cursor-grabbing">
              <ReactECharts option={get3DOptions()} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveQuerySimulator;