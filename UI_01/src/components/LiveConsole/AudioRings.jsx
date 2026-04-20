// ============================================================
// AudioRings.jsx
// ============================================================

/*
        LiveKit Audio Track
               │
               ▼
        useAudioLevel()
               │
               ▼
        level value (0–1)
               │
               ▼
         AudioRings component
               │
               ▼
      Generate 12 radial bars
               │
               ▼
      Calculate angle + length
               │
               ▼
      Draw SVG <line> elements
               │
               ▼
      Bars grow with audio level
               │
               ▼
       Speaking animation
*/
// ============================================================

import React from 'react';

const BARS = 12;
const BASE_R = 28;

/**
 * @param {{ level: number, color?: string }} props
 */
export default function AudioRings({ level = 0, color = '#00e5ff' }) {

  return (
    <svg viewBox="0 0 100 100" width="100" height="100">

      {Array.from({ length: BARS }).map((_, i) => {

        const angle = (i / BARS) * 2 * Math.PI - Math.PI / 2;

        const barH = 4 + level * 18;

        const x1 = 50 + BASE_R * Math.cos(angle);
        const y1 = 50 + BASE_R * Math.sin(angle);

        const x2 = 50 + (BASE_R + barH) * Math.cos(angle);
        const y2 = 50 + (BASE_R + barH) * Math.sin(angle);

        return (
          <line
            key={i}
            x1={x1} y1={y1}
            x2={x2} y2={y2}
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            opacity={0.3 + level * 0.7}
          />
        );
      })}

    </svg>
  );
}