import { useState, useEffect, useCallback, useRef } from 'react';
import { getActiveCalls, getCallHistory, transferCall, endCall as apiEndCall } from '../services/callApiService';

const POLL_INTERVAL = 3000; // ms

/**
 * useActiveCalls — polls ivr_backend for live + historical call data.
 * Exposes actions: transfer, endCall that update backend + local state.
 */
export function useActiveCalls() {
  const [activeCalls,  setActiveCalls]  = useState([]);
  const [callHistory,  setCallHistory]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [selectedCall, setSelectedCall] = useState(null);

  const pollRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [active, history] = await Promise.all([
        getActiveCalls(),
        getCallHistory(1, 30),
      ]);
      setActiveCalls(active);
      setCallHistory(history);
      setError('');
    } catch (err) {
      setError(err.message ?? 'Backend unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchAll, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [fetchAll]);

  const handleTransfer = useCallback(async (callId, toDepartment, toAgentId) => {
    try {
      const updated = await transferCall(callId, toDepartment, toAgentId);
      setActiveCalls(prev => prev.map(c => c.id === callId ? updated : c));
      return updated;
    } catch (err) {
      throw err;
    }
  }, []);

  const handleEndCall = useCallback(async (callId) => {
    try {
      const updated = await apiEndCall(callId);
      setActiveCalls(prev => prev.filter(c => c.id !== callId));
      setCallHistory(prev => [updated, ...prev]);
      if (selectedCall?.id === callId) setSelectedCall(null);
      return updated;
    } catch (err) {
      throw err;
    }
  }, [selectedCall]);

  return {
    activeCalls,
    callHistory,
    loading,
    error,
    selectedCall,
    setSelectedCall,
    refresh: fetchAll,
    handleTransfer,
    handleEndCall,
  };
}
