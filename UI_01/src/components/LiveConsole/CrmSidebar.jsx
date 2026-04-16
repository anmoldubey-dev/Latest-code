import React, { useState } from 'react';
// 🟢 FIX: Hardcoded 'axios' hata kar tumhara internal 'api' service import kiya, 
// jisse CORS aur Base URL automatically handle ho jayega.
import api from '../../services/api';

// ======================== CRM Sidebar Orchestrator ========================
// CrmSidebar -> Contextual intelligence hub for rendering real-time CRM 
// telemetry, customer business valuation, and an NLP-driven history query interface.
// ||
// ||
// ||
// Functions -> CrmSidebar()-> Root component for customer lifecycle visibility:
// ||           |
// ||           |--- handleAiQuery()-> [async Action Trigger]: Internal Call -> NLP analysis bridge.
// ||           |    └── Logic Gate: Validates Enter key and query persistence.
// ||           |
// ||           └── (Conditional Logic Branches):
// ||                ├── isLoading: Renders pulsing data fetch state.
// ||                └── !customer: Renders fallback error state for missing records.
// ||
// =========================================================================

export default function CrmSidebar({ isLoading, customer }) {

  // ---------------------------------------------------------------
  // SECTION: STATE MANAGEMENT
  // ---------------------------------------------------------------

  // Initialization -> State hooks for UI persistence and async flow tracking
  const [query, setQuery] = useState(""); // State -> Controlled input for manual AI history questions
  const [aiResponse, setAiResponse] = useState(""); // State -> Stores processed answer from the CRM Assistant
  const [isSearching, setIsSearching] = useState(false); // State -> UI blocker and loading indicator for AI fetch

  // ---------------------------------------------------------------
  // SECTION: INTERACTION HANDLERS
  // ---------------------------------------------------------------

  // Action Trigger -> handleAiQuery()-> Executes manual NLP inquiry via the API signaling bridge
  const handleAiQuery = async (e) => { // Interaction Handler -> handleAiQuery()-> Triggers NLP analysis on Enter key
    if (e.key === 'Enter' && query.trim() !== "") {

      console.log(`[EXECUTION] handleAiQuery() started (Query: "${query}")`);

      setIsSearching(true);
      try {
        // 🟢 FIX: Safely route building taaki localhost:8000 hardcode na karna pade
        const endpoint = api.defaults?.baseURL?.endsWith('/api') ? "/ai-chat" : "/api/ai-chat";

        const response = await api.post(endpoint, { // Internal Call -> POST request safely bypassing CORS
          phone: customer.phone,
          question: query
        });

        // 🟢 THE BULLETPROOF EXTRACTOR: api.js chahe jaise data bheje, ye 'answer' nikal lega
        const finalAnswer = response.answer || response?.data?.answer || (typeof response === 'string' ? response : JSON.stringify(response));

        setAiResponse(finalAnswer); // UI Update -> Injects AI generated answer into the display box
        setQuery("");

        console.log(`[EXECUTION] handleAiQuery() ends (Success)`);

      } catch (error) {
        console.error("[EXECUTION] handleAiQuery() failed:", error);
        setAiResponse("Error: Could not retrieve data. Check backend connection.");
      } finally {
        setIsSearching(false);
      }
    }
  };

  // ---------------------------------------------------------------
  // SECTION: CONDITIONAL UI STATES
  // ---------------------------------------------------------------

  // Logic Branch -> Renders pulsing placeholder during data synchronization
  if (isLoading) { // Logic Branch -> Renders pulsing placeholder while CRM data is being fetched
    return (
      <div className="col-span-3 bg-[#0e1419] border border-[#1e2d3d] rounded-xl p-4 flex items-center justify-center h-[700px]">
        <div className="text-[#00e5ff] animate-pulse text-sm">Loading CRM Data...</div>
      </div>
    );
  }

  // Logic Branch -> Renders error state for invalid or missing customer nodes
  if (!customer || customer.error) { // Logic Branch -> Renders error state if phone number lookup fails
    return (
      <div className="col-span-3 bg-[#0e1419] border border-[#1e2d3d] rounded-xl p-4 flex flex-col items-center justify-center h-[700px] text-center">
        <span className="text-3xl mb-2">⚠️</span>
        <div className="text-[#ff3d57] text-sm">Customer Not Found</div>
        <div className="text-[#5a7a9a] text-xs mt-1">{customer?.searched_for}</div>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  return (

    <div className="col-span-3 bg-[#0e1419] border border-[#1e2d3d] rounded-xl flex flex-col h-[700px] overflow-hidden shadow-lg">

      <div className="p-4 border-b border-[#1e2d3d] bg-gradient-to-b from-[#141c24] to-[#0e1419]">
        <div className="flex justify-between items-start mb-2">
          <h2 className="text-lg font-bold text-[#e8f0f8]">{customer.name}</h2>
          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#7b61ff]/20 text-[#7b61ff] border border-[#7b61ff]/30">
            {customer.tier}
          </span>
        </div>
        <div className="text-xs text-[#5a7a9a] space-y-1">
          <p className="flex items-center gap-2">📞 {customer.phone}</p>
          {customer.email && <p className="flex items-center gap-2">✉️ {customer.email}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">

        {customer.business && (
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-[#5a7a9a] uppercase tracking-widest">Business Value</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#141c24] p-2 rounded-lg border border-[#1e2d3d]">
                <div className="text-[9px] text-[#5a7a9a] uppercase">Total Spent</div>
                <div className="text-sm font-bold text-[#00e5ff]">₹{customer.business.total_spent}</div>
              </div>
              <div className="bg-[#141c24] p-2 rounded-lg border border-[#1e2d3d]">
                <div className="text-[9px] text-[#5a7a9a] uppercase">Tickets (P/R)</div>
                <div className="text-sm font-bold text-[#e8f0f8]">
                  <span className="text-[#ff3d57]">{customer.business.pending}</span>
                  <span className="text-[#5a7a9a] mx-1">/</span>
                  <span className="text-[#00ff9d]">{customer.business.resolved}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3 pt-2">
          <h3 className="text-[10px] font-bold text-[#5a7a9a] uppercase tracking-widest">Recent History</h3>
          <div className="space-y-2">
            {customer.history && customer.history.length > 0 ? (
              customer.history.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center bg-[#141c24] p-2 rounded-lg border border-[#1e2d3d] px-3 py-2">
                  <span className="text-[10px] truncate pr-2 text-[#e8f0f8]">{item.subject}</span>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${item.status === 'Resolved' ? 'bg-[#00ff9d]/10 text-[#00ff9d]' : 'bg-[#ff3d57]/10 text-[#ff3d57]'
                    }`}>
                    {item.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-[10px] text-[#5a7a9a]">No history available.</div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 bg-[#141c24] border-t border-[#1e2d3d]">
        <h3 className="text-[10px] font-bold text-[#7b61ff] uppercase tracking-widest mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#7b61ff] animate-pulse"></span>
          Smart CRM Assistant
        </h3>

        {aiResponse && (
          <div className="mb-3 p-2.5 bg-[#050a0f] border-l-2 border-[#7b61ff] text-[11px] text-[#e8f0f8] italic leading-relaxed rounded-r-lg max-h-[80px] overflow-y-auto custom-scrollbar">
            "{aiResponse}"
          </div>
        )}

        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleAiQuery}
            placeholder={isSearching ? "Searching data..." : "Ask AI about customer logs..."}
            className="w-full bg-[#050a0f] border border-[#1e2d3d] rounded-lg px-3 py-2 text-xs text-[#e8f0f8] focus:outline-none focus:border-[#7b61ff] transition-all placeholder:text-[#5a7a9a]"
            disabled={isSearching}
          />
          <div className="absolute right-3 top-2.5 text-[8px] text-[#5a7a9a] font-bold">⏎ ENTER</div>
        </div>
      </div>

    </div>
  );
}