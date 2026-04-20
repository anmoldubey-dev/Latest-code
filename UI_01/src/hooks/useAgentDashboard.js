import { useState, useEffect, useCallback } from "react";

const apiFetch = (url, token) =>
  fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());

// 🟢 MODIFIED: Ab ye 'isPaused' accept karta hai
export default function useAgentDashboard(isPaused = false) {
  const token   = sessionStorage.getItem("token");
  const userObj = JSON.parse(sessionStorage.getItem("user") || "{}");

  const [profile,     setProfile]     = useState(null);
  const [stats,       setStats]       = useState(null);
  const [calls,       setCalls]       = useState([]);
  const [csatData,    setCsatData]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [dateRange,   setDateRange]   = useState({ from: null, to: null });
  const [channel,     setChannel]     = useState("all");
  const [chartsReady, setChartsReady] = useState(false);

  const buildQS = useCallback(() => {
    const p = new URLSearchParams();
    if (dateRange.from)    p.set("date_from", dateRange.from);
    if (dateRange.to)      p.set("date_to",   dateRange.to);
    if (channel !== "all") p.set("channel",   channel);
    return p.toString();
  }, [dateRange, channel]);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setChartsReady(false);
    const qs = buildQS();
    try {
      const [prof, st, cl, cs] = await Promise.all([
        apiFetch("/api/agent/profile",               token),
        apiFetch(`/api/agent/call-stats?${qs}`,      token),
        apiFetch(`/api/agent/calls?${qs}&limit=100`, token),
        apiFetch(`/api/agent/csat?${qs}`,            token),
      ]);
      setProfile(prof);
      setStats(st);
      setCalls(Array.isArray(cl) ? cl : []);
      setCsatData(cs);
    } catch (e) {
      console.error("Agent dashboard load error:", e);
    } finally {
      setLoading(false);
      setTimeout(() => setChartsReady(true), 150);
    }
  }, [token, buildQS]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // 🟢 FIX: Agar isPaused true hai toh interval set nahi hoga
  useEffect(() => {
    if (isPaused) {
      console.log("Polling Paused (Live Session Active)");
      return;
    }
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, [loadAll, isPaused]);

  return {
    token, userObj, profile, stats, calls, csatData,
    loading, chartsReady,
    dateRange, setDateRange,
    channel, setChannel,
    refresh: loadAll,
  };
}