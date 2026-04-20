// ============================================================
// useAudioLevel.js
// ------------------------------------------------------------
// Custom hook to measure real-time audio loudness from a
// LiveKit audio track using the Web Audio API.
// ============================================================
/*
        LiveKit Audio Track
               │
               ▼
      useAudioLevel(track)
               │
               ▼
     Extract MediaStreamTrack
               │
               ▼
        AudioContext
               │
               ▼
    MediaStreamSource → AnalyserNode
               │
               ▼
   getByteFrequencyData() each frame
               │
               ▼
       Average frequency bins
               │
               ▼
       Normalize value (0–1)
               │
               ▼
           setLevel()
               │
               ▼
         return level
               │
               ▼
   UI components use level
 (audio rings / speaker animation)
*/
// ============================================================


import { useState, useEffect, useRef } from 'react';

/**
 * Reads real-time audio amplitude from a LiveKit audio track.
 * @param {LocalAudioTrack | RemoteAudioTrack | null} track
 * @returns {number} 0–1 audio level (~60fps updates)
 */
export function useAudioLevel(track) {

  const [level, setLevel] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!track) {
      setLevel(0);
      return;
    }

    const mediaStreamTrack = track.mediaStreamTrack;
    if (!mediaStreamTrack) return;

    let ctx;
    try {
      ctx = new AudioContext();

      const source   = ctx.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(avg / 80, 1));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

    } catch (e) {
      console.warn('AudioContext error:', e);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      ctx?.close();
    };

  }, [track]);

  return level;
}