// ============================================================
// useCallTimer.js
// ------------------------------------------------------------
// Custom React hook that works like a stopwatch.
// Starts at 0 when component mounts and returns time as "MM:SS".
// ============================================================
/*
        /*
FLOW

component mounts
 │
 ▼
useCallTimer()
 │
 ▼
sec = 0
 │
 ▼
useEffect()
 │
 ▼
start setInterval (1 sec)
 │
 ▼
loop every 1s
 │
 ├── setSec(s + 1)
 │
 └── sec updates (0 → 1 → 2 → ...)
 │
 ▼
convert sec → MM:SS
 │
 ▼
return formatted time
 │
 ▼
UI displays timer
 │
 ▼
component unmount
 │
 ▼
clearInterval()
*/
// ============================================================

import { useState, useEffect } from 'react';

/**
 * Counts up from 0 every second after mount.
 * @returns {string} formatted time "MM:SS"
 */
export function useCallTimer() {

  const [sec, setSec] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');

  return `${mm}:${ss}`;
}