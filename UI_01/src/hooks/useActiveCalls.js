import { useState, useEffect, useCallback, useRef } from 'react';

// ✅ VITE FIX: process.env removed, API calls made direct
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const WS_URL   = API_BASE.replace(/^http/, 'ws') + '/ws/calls';
const FALLBACK_POLL_INTERVAL = 5000; // only used if WS fails

/**
 * useActiveCalls — real-time call data via WebSocket.
 * Falls back to polling if WebSocket is unavailable.
 */
export function useActiveCalls() {
  const [activeCalls,  setActiveCalls]  = useState([]);
  const [callHistory,  setCallHistory]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [selectedCall, setSelectedCall] = useState(null);
  const [wsConnected,  setWsConnected]  = useState(false);

  const wsRef      = useRef(null);
  const pollRef    = useRef(null);
  const retryCount = useRef(0);
  const retryTimer = useRef(null);

  // ── HTTP fallback fetch ───────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [activeRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/calls/active`).catch(() => ({ ok: false })),
        fetch(`${API_BASE}/calls/history?limit=30`).catch(() => ({ ok: false }))
      ]);
      
      const activeData = activeRes.ok ? await activeRes.json() : [];
      const historyData = historyRes.ok ? await historyRes.json() : [];

      setActiveCalls(Array.isArray(activeData) ? activeData : activeData.items || []);
      setCallHistory(Array.isArray(historyData) ? historyData : historyData.items || []);
      setError('');
    } catch (err) {
      setError(err.message ?? 'Backend unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── WebSocket connection ──────────────────────────────────────────────────
  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        setError('');
        retryCount.current = 0;
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        ws._pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 10000);
      };

      ws.onmessage = (e) => {
        try {
          const { event, data } = JSON.parse(e.data);
          switch (event) {
            case 'snapshot':
              setActiveCalls(data.active  ?? []);
              setCallHistory(data.history ?? []);
              setLoading(false);
              break;

            case 'call_started':
              setActiveCalls(prev => {
                const exists = prev.some(c => c.id === data.id);
                return exists ? prev.map(c => c.id === data.id ? data : c) : [data, ...prev];
              });
              break;

            case 'call_ended':
              setActiveCalls(prev => prev.filter(c => c.id !== data.id));
              setCallHistory(prev => {
                const exists = prev.some(c => c.id === data.id);
                return exists ? prev.map(c => c.id === data.id ? data : c) : [data, ...prev];
              });
              break;

            default:
              break;
          }
        } catch (_) {}
      };

      ws.onerror = () => setWsConnected(false);

      ws.onclose = () => {
        setWsConnected(false);
        clearInterval(ws._pingInterval);
        wsRef.current = null;
        const delay = Math.min(1000 * Math.pow(2, retryCount.current), 30000);
        retryCount.current += 1;
        retryTimer.current = setTimeout(() => {
          if (retryCount.current >= 2 && !pollRef.current) {
            fetchAll();
            pollRef.current = setInterval(fetchAll, FALLBACK_POLL_INTERVAL);
          }
          connectWS();
        }, delay);
      };
    } catch (_) {
      if (!pollRef.current) {
        fetchAll();
        pollRef.current = setInterval(fetchAll, FALLBACK_POLL_INTERVAL);
      }
    }
  }, [fetchAll]);

  useEffect(() => {
    connectWS();
    return () => {
      clearTimeout(retryTimer.current);
      clearInterval(pollRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; 
        wsRef.current.close();
      }
    };
  }, [connectWS]);

  // ── Actions ───────────────────────────────────────────────────────────────
  
  const handleTransfer = useCallback(async (callId, toDepartment, toAgentId) => {
    try {
      const res = await fetch(`${API_BASE}/calls/${callId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_department: toDepartment, to_agent_id: toAgentId })
      });
      const updated = await res.json();
      setActiveCalls(prev => prev.map(c => c.id === callId ? updated : c));
      return updated;
    } catch (error) {
      console.error("Transfer failed", error);
    }
  }, []);

  const handleEndCall = useCallback(async (callId) => {
    try {
      const res = await fetch(`${API_BASE}/calls/${callId}/end`, { method: 'POST' });
      const updated = await res.json();
      setActiveCalls(prev => prev.filter(c => c.id !== callId));
      setCallHistory(prev => [updated, ...prev]);
      if (selectedCall?.id === callId) setSelectedCall(null);
      return updated;
    } catch (error) {
      console.error("End call failed", error);
    }
  }, [selectedCall]);

  // ✅ NEW ACTION: CALL TAKEOVER (BARGE-IN)
  const handleTakeover = useCallback(async (callId) => {
    try {
      const res = await fetch(`${API_BASE}/calls/${callId}/takeover`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error("Takeover API failed");
      
      const data = await res.json();
      
      // Update UI state with the returned data (usually includes the new speaker token)
      setActiveCalls(prev => prev.map(c => c.id === callId ? { ...c, ...data } : c));
      
      console.log(`Takeover successful for Call ID: ${callId}`);
      return data;
    } catch (error) {
      console.error("Takeover failed:", error);
      alert("Could not takeover call. Check backend logs.");
    }
  }, []);

  const refresh = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    } else {
      fetchAll();
    }
  }, [fetchAll]);

  return {
    activeCalls,
    callHistory,
    loading,
    error,
    selectedCall,
    setSelectedCall,
    refresh,
    handleTransfer,
    handleEndCall,
    handleTakeover, // ✅ EXPOSED TO UI
    wsConnected, 
  };
}