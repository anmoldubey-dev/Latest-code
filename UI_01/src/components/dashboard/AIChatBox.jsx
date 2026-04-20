import React, { useState, useEffect, useRef } from "react";

// ================================================= AIChatBox =================================================
// AIChatBox -> Floating AI chat interface for translating natural language into SQL metrics via a neural engine.
// ||
// ||
// ||
// Functions -> scrollToBottom()-> Native scroll API trigger for chat feed synchronization
// ||           |
// ||           |---> useEffect()-> Lifecycle synchronization for scroll position and UI visibility
// ||           |
// ||           |---> handleAsk()-> Orchestrates the NLP-to-SQL pipeline via backend API:
// ||           |     |
// ||           |     |--- IF query.trim() is valid
// ||           |     |    └── fetch()-> POST to Flask -> (setAnswer)-> Updates synthesized result
// ||           |     |--- IF fetch fails (Network/Server)
// ||           |          └── (setAnswer)-> Triggers error boundary fallback text
// ||           |
// ||           |---> UI Interactions -> State triggers and event listeners:
// ||                 |
// ||                 |--- (setIsOpen)-> Toggles component between FAB and Chat Window
// ||                 |--- (setQuery)-> Synchronizes <input> state with user keystrokes
// ||                 └── onKeyDown()-> Listens for 'Enter' key to fire (handleAsk)
// ||
// =============================================================================================================

export function AIChatBox() {

  // ---------------------------------------------------------------
  // SECTION: STATE & REFERENCE MANAGEMENT
  // ---------------------------------------------------------------
  const [query, setQuery] = useState(""); // State -> Captures raw natural language input
  const [answer, setAnswer] = useState(""); // State -> Stores processed AI synthesis or error strings
  const [loading, setLoading] = useState(false); // State -> Semantic flag for conditional rendering of pulse animations
  const [isOpen, setIsOpen] = useState(false); // State -> Controls visibility of the floating action interface

  const messagesEndRef = useRef(null); // Reference -> messagesEndRef: Pointer for manual DOM manipulation (scrolling)

  // ---------------------------------------------------------------
  // SECTION: UTILITY FUNCTIONS
  // ---------------------------------------------------------------

  const scrollToBottom = () => { // Logic -> scrollToBottom()-> Triggers native browser scrollIntoView
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // ---------------------------------------------------------------
  // SECTION: LIFECYCLE EFFECTS
  // ---------------------------------------------------------------

  useEffect(() => { // Lifecycle -> Fires on state updates to ensure the latest response is visible
    if (isOpen) scrollToBottom();
  }, [answer, loading, isOpen]);

  // ---------------------------------------------------------------
  // SECTION: ACTION HANDLERS
  // ---------------------------------------------------------------

  const handleAsk = async () => { // Action Handler -> handleAsk()-> Manages async I/O with the Flask neural engine
    if (!query.trim()) return; 
    
    setLoading(true);
    setAnswer(""); // Logic -> Resets state to prevent visual confusion during new requests
    
    try {
      // Internal Call -> Hits local neural-bridge API for query translation
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      
      const data = await res.json();
      
      // Data Assignment -> Prioritizes synthesized answer with fallback to error payload
      setAnswer(data.answer || data.error);
    } catch (e) {
      // Exception Handling -> Triggers when the Flask backend is unreachable
      setAnswer("Failed to connect to Neural Engine. Is the Flask backend running?");
    }
    setLoading(false); // Lifecycle -> Terminates loading state regardless of outcome
  };

  // ---------------------------------------------------------------
  // SECTION: RENDER (JSX)
  // ---------------------------------------------------------------

  if (!isOpen) { // Logic Branch -> Renders Floating Action Button (FAB) when chat is closed
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl shadow-[0_0_50px_rgba(99,102,241,0.4)] z-[99999] transition-all hover:scale-105 border border-indigo-400/30"
      >
        <span className="font-black text-sm tracking-[0.2em] uppercase">Open Neural Engine</span>
      </button>
    );
  }

  return ( // Logic Branch -> Renders full Chat Interface when isOpen is true
    <div className="fixed bottom-6 right-6 w-[25vw] min-w-[400px] h-[75vh] bg-slate-950/95 backdrop-blur-3xl border border-indigo-500/40 rounded-3xl shadow-[0_0_80px_-20px_rgba(99,102,241,0.6)] z-[99999] overflow-hidden">
      
      {/* Module: Header -> Includes 'Online' status indicator and component dismisser */}
      <div className="absolute top-0 left-0 right-0 h-[70px] px-5 bg-gradient-to-br from-indigo-900/40 to-slate-900/60 flex items-center justify-between border-b border-indigo-500/20 z-10">
        <div>
          <h4 className="text-sm font-black text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Neural SQL
          </h4>
        </div>
        <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-full transition-all text-2xl font-light leading-none">×</button>
      </div>

      {/* Module: Chat Feed -> Container for system status, AI messages, and skeleton loaders */}
      <div className="absolute top-[70px] bottom-[90px] left-0 right-0 overflow-y-auto scrollbar-visible bg-slate-900/20 p-5">
        <div className="flex flex-col gap-5 pb-4">
          
          {/* Sub-module: System Status -> Visual confirmation of DB connection readiness */}
          <div className="bg-slate-800/40 p-4 rounded-2xl border border-indigo-500/10 self-start max-w-[90%]">
            <p className="text-[10px] text-indigo-500 font-bold mb-2 tracking-widest uppercase">System Ready</p>
            <p className="text-sm text-slate-300 font-medium">Authentication successful. I can query agent stats and call logs directly.</p>
          </div>
          
          {/* Sub-module: Synthesized Result -> Displays formatted text with preserved line breaks */}
          {answer && (
            <div className="bg-indigo-600/10 p-5 rounded-2xl border border-indigo-500/30 self-start w-full shadow-lg">
              <p className="text-[10px] text-indigo-400 font-bold mb-3 tracking-widest uppercase italic">Synthesized Result</p>
              <p className="text-sm text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">{answer}</p>
            </div>
          )}

          {/* Sub-module: Skeleton Loader -> Renders pulsing placeholders during active API fetch */}
          {loading && (
            <div className="flex flex-col gap-3 p-2">
              <div className="h-3 w-48 bg-indigo-500/20 rounded-full animate-pulse"></div>
              <div className="h-3 w-64 bg-indigo-500/10 rounded-full animate-pulse delay-75"></div>
            </div>
          )}

          {/* Viz Target -> messagesEndRef: Anchor for (scrollToBottom) calculation */}
          <div ref={messagesEndRef} className="h-2" />
        </div>
      </div>

      {/* Module: Input Console -> Fixed footer for text injection and submission triggers */}
      <div className="absolute bottom-0 left-0 right-0 h-[90px] p-5 border-t border-slate-800 bg-slate-950/90 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-10">
        <div className="relative group h-full flex items-center">
          <input 
            type="text" 
            value={query}
            
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything..."
            className="w-full h-full bg-[#030712] border border-indigo-500/20 group-hover:border-indigo-500/50 rounded-2xl py-3 pl-5 pr-14 text-sm text-white focus:border-indigo-400 outline-none transition-all shadow-inner placeholder:text-slate-600"
            disabled={loading} 
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