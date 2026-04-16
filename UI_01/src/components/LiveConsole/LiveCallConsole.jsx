import React, { useState, useCallback, useRef } from 'react';
import { Phone, Globe, Loader2 } from 'lucide-react';

import { useCall } from '../../context/CallContext';
// 🟢 BYPASS THE MIDDLEMAN: Seedha API import karenge taaki token raste mein drop na ho
import api from '../../services/api';

// 🟢 Asli Components Import kiye gaye hain
import LiveCallPanel from './LiveCallPanel';
import CrmSidebar from './CrmSidebar';
import AiAssistPanel from './AiAssistPanel';

// ======================== Live Call Console Orchestrator ========================
// LiveCallConsole -> The primary real-time telephony interface, orchestrating the 
// signaling lifecycle for browser-based calls, NLP-driven AI suggestions, and 
// synchronized CRM data presentation.
// ||
// ||
// ||
// Functions -> LiveCallConsole()-> Main functional entry point for the browser calling node:
// ||           |
// ||           |--- handleNewTranscript()-> [Action Trigger]: Ingests caller speech streams.
// ||           |    └── Sub-process: Executes debounced POST requests to the AI suggest engine.
// ||           |
// ||           |--- handleInitiateCall()-> [Action Trigger]: Executes WebRTC signaling handshake.
// ||           |    ├── Internal Call: api.post()-> Requests authorization token from the gateway.
// ||           |    ├── Logic Branch: Extraction logic for standard vs. intercepted Axios responses.
// ||           |    └── Logic Branch: Demo mode fallback for offline resilience.
// ||           |
// ||           └── (Conditional UI State Mapping):
// ||                ├── !isActive: Renders the Target Identity / Dialer interface.
// ||                └── isActive: Renders the triple-panel production dashboard.
// ||
// =================================================================================

// ---------------------------------------------------------------
// SECTION: CONFIGURATION & CONSTANTS
// ---------------------------------------------------------------

// Normalise origin — strip any trailing /api so we can always append it ourselves.
// VITE_API_URL may or may not include /api; we handle both cases.
const _ORIGIN = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000').replace(/\/api\/?$/, '');
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || 'ws://127.0.0.1:7880';
const AI_SUGGEST_URL = `${_ORIGIN}/api/ai-suggest`;

// Debounce delay (ms) — don't hammer AI on every word
const AI_DEBOUNCE_MS = 1200;

export default function LiveCallConsole() {

  // ---------------------------------------------------------------
  // SECTION: STATE & CONTEXT INITIALIZATION
  // ---------------------------------------------------------------
  const {
    livekitSession, startCall,
    setDialNumber, setLivekitSession, setBackendCallId
  } = useCall();

  const [isBusy, setIsBusy] = useState(false);
  const [targetUser, setTargetUser] = useState("");
  const [aiInsight, setAiInsight] = useState(null);
  const aiTimerRef = useRef(null);

  // ---------------------------------------------------------------
  // SECTION: AI ASSISTANT LOGIC (DEBOUNCED)
  // ---------------------------------------------------------------

  // Action Trigger -> handleNewTranscript()-> Processes incoming caller speech for NLP analysis
  const handleNewTranscript = useCallback((text) => {
    if (!text?.trim()) return;
    // Debounce so rapid partial results don't fire many requests
    clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(AI_SUGGEST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const data = await res.json();
          setAiInsight(data);
        }
      } catch (e) {
        console.warn('[AI Assist] fetch failed:', e);
      }
    }, AI_DEBOUNCE_MS);
  }, []);

  const isActive = !!livekitSession?.room;

  // ---------------------------------------------------------------
  // SECTION: SIGNALING & CONNECTION ENGINE
  // ---------------------------------------------------------------

  // Action Trigger -> handleInitiateCall()-> Executes WebRTC negotiation and room initialization
  const handleInitiateCall = async () => {
    if (!targetUser) return alert("Please enter a name");

    setIsBusy(true);
    const generatedRoom = `room-${Date.now()}`;

    try {
      console.log("📡 Requesting token DIRECTLY from Backend...");

      // 🟢 THE ULTIMATE FIX: Direct API Call
      // Internal Call -> api.post()-> Requests signed WebRTC token via the direct API gateway
      const endpoint = api.defaults?.baseURL?.endsWith('/api') ? "/webrtc/token" : "/api/webrtc/token";
      const res = await api.post(endpoint, {
        participant_name: targetUser,
        room_name: generatedRoom,
        department: 'General'
      });

      console.log("🔥 DIRECT BACKEND RESPONSE:", res);

      // 🟢 THE MAGIC EXTRACTOR: Jo humne screenshot mein dekha, usko pakadne ka perfect tarika
      // Logic Branch -> Extraction logic: Normalizes inconsistent backend response shapes
      let finalData = {};
      if (res && res.token) {
        finalData = res; // Jab interceptor response.data return karta hai
      } else if (res && res.data && res.data.token) {
        finalData = res.data; // Standard Axios response
      } else {
        finalData = res.data || res || {};
      }

      const validToken = finalData.token || finalData.access_token || finalData.livekit_token;

      if (!validToken) {
        console.error("❌ Token missing in response data:", finalData);
        throw new Error("Missing Token in Backend Response");
      }

      console.log("✅ TOKEN FOUND:", validToken.substring(0, 15) + "...");

      setDialNumber(targetUser);
      setBackendCallId(finalData.call_id || `call-${Date.now()}`);

      // Injecting real token into the global CallContext
      setLivekitSession({
        token: validToken,
        room: finalData.room_name || generatedRoom,
        url: finalData.livekit_url || LIVEKIT_URL,
        agentName: "AI Assistant"
      });

      console.log("✅ Token injected. Triggering WebRTC UI...");
      startCall();

    } catch (err) {
      console.error("❌ Backend Connection Failed:", err);

      // 🌟 DEMO FALLBACK: Keeps UI alive even if backend fails
      // Logic Branch -> Fallback mode: Triggers demo session for offline UI verification
      setDialNumber(targetUser);
      setBackendCallId(`offline-${Date.now()}`);
      setLivekitSession({
        token: "demo-token", // This forces LiveCallPanel into demo mode
        room: generatedRoom,
        url: LIVEKIT_URL,
        agentName: "AI Assistant (Offline)"
      });
      startCall();
    } finally {
      setIsBusy(false);
    }
  };

  // ---------------------------------------------------------------
  // SECTION: PRIMARY RENDER (JSX)
  // ---------------------------------------------------------------

  if (!isActive) {
    return (
      <div className="h-full flex items-center justify-center bg-[#080c10] p-6">
        <div className="w-[450px] bg-[#0e1419] border border-[#1e2d3d] rounded-2xl p-10 shadow-2xl">
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
              <Globe size={20} className="text-[#6366f1]" /> Browser Call
            </h2>
            <p className="text-xs text-[#5a7a9a] mt-2">SR Comsoft AI Gateway</p>
          </div>

          <div className="space-y-6">
            <div className="bg-[#080c10] border border-[#1e2d3d] rounded-xl p-4">
              <label className="text-[10px] font-bold text-[#5a7a9a] uppercase mb-2 block tracking-widest">Target Identity</label>
              <input
                className="w-full bg-transparent text-lg text-[#818cf8] outline-none placeholder:text-[#1e2d3d]"
                placeholder="Enter Name (e.g. Rahul)"
                value={targetUser}
                onChange={(e) => setTargetUser(e.target.value)}
              />
            </div>

            <button
              disabled={isBusy}
              onClick={handleInitiateCall}
              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all ${isBusy ? 'bg-[#1e2d3d] text-[#5a7a9a]' : 'bg-[#6366f1] text-white hover:bg-[#4f46e5] shadow-lg shadow-[#6366f1]/20'
                }`}
            >
              {isBusy ? <Loader2 className="animate-spin" size={20} /> : <Phone size={20} />}
              {isBusy ? "NEGOTIATING..." : "START CONVERSATION"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-4 overflow-hidden p-2">

      <div className="w-[320px] flex-shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
        <CrmSidebar
          isLoading={false}
          customer={{
            name: targetUser || "Guest Caller",
            phone: "+91 9876543210",
            tier: "VIP Customer",
            business: { total_spent: "14,500", pending: 1, resolved: 4 },
            history: [
              { subject: "Service Request", status: "Resolved" },
              { subject: "Billing Issue", status: "Pending" }
            ]
          }}
        />
        <AiAssistPanel aiInsight={aiInsight} />
      </div>

      <div className="flex-1 bg-[#0e1419] border border-[#1e2d3d] rounded-xl p-4 overflow-hidden">
        <LiveCallPanel onNewCallerText={handleNewTranscript} />
      </div>

    </div>
  );
}