import React from 'react'; // Imports core React library for component architecture

// ======================== AiAssistPanel ========================
// AiAssistPanel -> Dynamic UI module for visualizing AI-driven sentiment and suggestions.
// ||
// ||
// ||
// Logic Flow -> AiAssistPanel()-> Component rendering based on incoming data state:
// ||           |
// ||           |--- IF aiInsight is null/undefined
// ||           |    └── Renders placeholder-> Displays "Listening" empty state
// ||           |
// ||           |--- IF aiInsight contains data payload
// ||                |
// ||                |--- sentiment mapping-> Dynamic styling for mood badges (ANGRY/HAPPY/NEUTRAL)
// ||                └── suggestion rendering-> Injects AI recommended action text
// ||
// ===============================================================

export default function AiAssistPanel({ aiInsight }) {
  
  // ---------------------------------------------------------------
  // SECTION: RENDER (JSX)
  // ---------------------------------------------------------------

  return (
    
    <div className="col-span-3 bg-[#0e1419] border border-[#1e2d3d] rounded-xl p-4 flex flex-col">
      <h2 className="text-[10px] font-bold text-[#5a7a9a] uppercase tracking-widest mb-4">AI Assist Panel</h2>
      
      {/* Module: Dynamic Content Engine -> Switches between listener state and insight display */}
      <div className="flex-1 overflow-y-auto pr-2 font-sans">
        
        {!aiInsight ? (
          /* Logic Branch -> Renders when no active AI analysis is available */
          <div className="flex flex-col items-center justify-center h-full gap-3 border-2 border-dashed border-[#1e2d3d] rounded-lg p-4 text-center transition-all">
            <div className="flex gap-1 items-end">
              <span className="w-1 h-3 bg-[#3a4a5a] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-5 bg-[#3a4a5a] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-3 bg-[#3a4a5a] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-[#5a7a9a] text-xs leading-relaxed">
              Listening to conversation…<br/>
              <span className="text-[#3a4a5a]">AI suggestions appear here as the agent speaks.</span>
            </p>
          </div>
        ) : (
          /* Logic Branch -> Renders analysis payload when data is received from the backend API */
          <div className="space-y-4">
            
            {/* Sub-module: Sentiment Badge -> Visual indicator of the caller's current emotional state */}
            <div className="bg-[#141c24] border border-[#1e2d3d] p-4 rounded-lg flex flex-col items-center shadow-lg transition-all">
              <span className="text-[10px] font-bold text-[#5a7a9a] uppercase tracking-widest mb-2">Live Sentiment</span>
              
              {/* Theme Logic -> Dynamically maps sentiment strings to specific color themes and emojis */}
              <div className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
                aiInsight.sentiment === 'ANGRY' ? 'bg-[#ff3d57]/10 text-[#ff3d57] border-[#ff3d57]/30 shadow-[0_0_10px_rgba(255,61,87,0.2)]' :
                aiInsight.sentiment === 'HAPPY' ? 'bg-[#00e5ff]/10 text-[#00e5ff] border-[#00e5ff]/30 shadow-[0_0_10px_rgba(0,229,255,0.2)]' :
                'bg-[#e5a000]/10 text-[#e5a000] border-[#e5a000]/30 shadow-[0_0_10px_rgba(229,160,0,0.2)]'
              }`}>
                {aiInsight.sentiment === 'ANGRY' ? '😡 ANGRY' : aiInsight.sentiment === 'HAPPY' ? '😌 HAPPY' : '😐 NEUTRAL'}
              </div>
            </div>

            {/* Sub-module: Suggestion Card -> Displays high-confidence AI recommended response for the agent */}
            <div className="bg-[#141c24] border border-[#1e2d3d] p-4 rounded-lg border-l-4 border-l-[#7b61ff] shadow-lg transition-all">
              <h3 className="text-[10px] font-bold text-[#7b61ff] uppercase tracking-widest mb-2 flex items-center gap-2">
                {/* Visual Feedback -> Pulsing dot indicates active/fresh AI insight */}
                <span className="w-2 h-2 rounded-full bg-[#7b61ff] animate-pulse"></span>
                Suggested Action
              </h3>
              <p className="text-sm text-[#e8f0f8] leading-relaxed">
                {aiInsight.suggestion}
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}