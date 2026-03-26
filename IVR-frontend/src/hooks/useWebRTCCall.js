/**
 * useWebRTCCall.js
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook that manages the complete LiveKit AI call lifecycle.
 *
 * DROP-IN REPLACEMENT for the old aiortc-based hook.
 * Public API is IDENTICAL — all callers (Dialer.jsx, WebRTCCall.jsx) unchanged.
 *
 * What changed (transport layer only):
 *   OLD: manual RTCPeerConnection + WebSocket signaling (webrtcSignaling.js)
 *   NEW: livekit-client Room SDK — LiveKit server handles all SDP/ICE/STUN/TURN
 *
 * What stayed the same:
 *   • rtcState values: 'idle' | 'connecting' | 'negotiating' | 'connected' | 'ended' | 'error'
 *   • agentName, transcript, aiResponse, isMuted, errorMsg state
 *   • startCall({ lang, llm, voice }), hangup(), interrupt(), toggleMute()
 *   • remoteAudioRef — <audio> element that plays AI voice
 *   • Client-side VAD: AnalyserNode + requestAnimationFrame, RMS_FLOOR=0.025, MIN_CONSEC=4
 *   • Barge-in: pause audio element + send interrupt to worker
 *   • Control messages: greeting / transcript / response / barge_in / hangup / error
 *
 * Control channel: LiveKit DataChannel (room.localParticipant.publishData)
 *   replaces the old custom WebSocket message channel.
 *
 * Install dependency before running:
 *   cd IVR-frontend && npm install livekit-client
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';

// ── Constants ─────────────────────────────────────────────────────────────────
const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Client-side VAD — unchanged from old hook
const RMS_FLOOR  = 0.025;   // reject wind/breath below this RMS
const MIN_CONSEC = 4;        // ~66 ms consecutive frames before triggering

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useWebRTCCall() {
  // ── State (identical names and semantics to old hook) ──────────────────────
  const [rtcState,   setRtcState]   = useState('idle');
  const [agentName,  setAgentName]  = useState('');
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isMuted,    setIsMuted]    = useState(false);
  const [errorMsg,   setErrorMsg]   = useState('');

  // ── Refs ───────────────────────────────────────────────────────────────────
  const roomRef        = useRef(null);    // livekit-client Room instance
  const remoteAudioRef = useRef(null);    // <audio> DOM element (caller attaches this)
  const rtcStateRef    = useRef('idle');  // mirror of rtcState for closures
  const audioCtxRef    = useRef(null);    // Web Audio context for client VAD
  const rafRef         = useRef(null);    // requestAnimationFrame handle

  // Keep ref in sync
  const _setState = useCallback((s) => {
    rtcStateRef.current = s;
    setRtcState(s);
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (roomRef.current) {
      try { roomRef.current.disconnect(); } catch (_) {}
      roomRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  }, []);

  // ── DataChannel helper — replaces old sig.send() ──────────────────────────
  const _publishData = useCallback((msg) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const payload = new TextEncoder().encode(JSON.stringify(msg));
      room.localParticipant.publishData(payload, { reliable: true });
    } catch (_) {}
  }, []);

  // ── Client-side VAD setup ──────────────────────────────────────────────────
  const _setupVAD = useCallback((mediaStreamTrack) => {
    try {
      const ctx      = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(
        new MediaStream([mediaStreamTrack])
      ).connect(analyser);

      const buf         = new Float32Array(analyser.fftSize);
      let   lastSend    = 0;
      let   consecAbove = 0;

      const vadLoop = () => {
        if (!roomRef.current) return;
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms   = Math.sqrt(sum / buf.length);
        const audio = remoteAudioRef.current;
        const now   = Date.now();

        if (rms > RMS_FLOOR) {
          consecAbove++;
          if (consecAbove >= MIN_CONSEC && audio && !audio.paused) {
            audio.pause();
            if (now - lastSend > 1000) {
              _publishData({ type: 'interrupt' });
              lastSend = now;
            }
          }
        } else {
          consecAbove = 0;
        }

        rafRef.current = requestAnimationFrame(vadLoop);
      };

      rafRef.current = requestAnimationFrame(vadLoop);
    } catch (_) {
      // Web Audio API unavailable — VAD disabled
    }
  }, [_publishData]);

  // ── Start call ─────────────────────────────────────────────────────────────
  const startCall = useCallback(async ({
    lang  = 'en',
    llm   = 'gemini',
    voice = '',
  } = {}) => {
    if (
      rtcStateRef.current !== 'idle' &&
      rtcStateRef.current !== 'ended' &&
      rtcStateRef.current !== 'error'
    ) return;

    cleanup();
    _setState('connecting');
    setTranscript('');
    setAiResponse('');
    setErrorMsg('');
    setIsMuted(false);

    try {
      // ── 1. Request JWT + room info from backend ─────────────────────────────
      const params = new URLSearchParams({ lang, llm, voice });
      const res    = await fetch(`${BACKEND_URL}/livekit/token?${params}`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      if (!res.ok) throw new Error(`Token request failed (HTTP ${res.status})`);
      const { token, url, room: roomName, agent_name } = await res.json();
      setAgentName(agent_name || '');

      // ── 2. Create LiveKit Room ──────────────────────────────────────────────
      const room = new Room({
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression:  true,
          autoGainControl:   true,
          channelCount:      1,
          sampleRate:        48000,
        },
        adaptiveStream: false,
        dynacast:       false,
      });
      roomRef.current = room;

      // ── 3. Remote audio → attach to <audio> element ─────────────────────────
      room.on(RoomEvent.TrackSubscribed, (track, _pub, _participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        const audioEl = remoteAudioRef.current;
        if (!audioEl) return;
        track.attach(audioEl);
        audioEl.play().catch((err) =>
          console.warn('[LiveKit] remote audio autoplay blocked:', err.message)
        );
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
      });

      // ── 4. Data messages from AI worker ─────────────────────────────────────
      room.on(RoomEvent.DataReceived, (data, _participant) => {
        let msg;
        try {
          msg = JSON.parse(new TextDecoder().decode(data));
        } catch {
          return;
        }

        switch (msg.type) {
          case 'greeting':
            setAiResponse(msg.text || '');
            setTranscript('');
            remoteAudioRef.current?.play().catch(() => {});
            break;

          case 'barge_in':
            if (remoteAudioRef.current && !remoteAudioRef.current.paused) {
              remoteAudioRef.current.pause();
            }
            break;

          case 'transcript':
            setTranscript(msg.text || '');
            break;

          case 'response':
            setAiResponse(msg.text || '');
            setTranscript('');
            remoteAudioRef.current?.play().catch(() => {});
            break;

          case 'error':
            setErrorMsg(msg.message || 'AI worker error');
            _setState('error');
            cleanup();
            break;

          case 'hangup':
            _setState('ended');
            cleanup();
            break;

          default:
            break;
        }
      });

      // ── 5. Connection state ─────────────────────────────────────────────────
      room.on(RoomEvent.Connected, () => {
        _setState('connected');
      });

      room.on(RoomEvent.Reconnecting, () => {
        _setState('negotiating');
      });

      room.on(RoomEvent.Reconnected, () => {
        _setState('connected');
      });

      room.on(RoomEvent.Disconnected, () => {
        if (rtcStateRef.current !== 'ended' && rtcStateRef.current !== 'error') {
          _setState('ended');
          cleanup();
        }
      });

      // ── 6. Connect to LiveKit server ────────────────────────────────────────
      // LiveKit SDK handles SDP/ICE/STUN/TURN automatically.
      _setState('negotiating');
      await room.connect(url, token);

      // ── 7. Publish microphone ───────────────────────────────────────────────
      await room.localParticipant.setMicrophoneEnabled(true);

      // ── 8. Start client-side VAD ────────────────────────────────────────────
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micPub?.track?.mediaStreamTrack) {
        _setupVAD(micPub.track.mediaStreamTrack);
      } else {
        room.on(RoomEvent.LocalTrackPublished, (pub) => {
          if (
            pub.source === Track.Source.Microphone &&
            pub.track?.mediaStreamTrack &&
            audioCtxRef.current === null
          ) {
            _setupVAD(pub.track.mediaStreamTrack);
          }
        });
      }

    } catch (err) {
      setErrorMsg(`Connection failed: ${err.message}`);
      _setState('error');
      cleanup();
    }
  }, [cleanup, _setState, _setupVAD, _publishData]);

  // ── Hangup ─────────────────────────────────────────────────────────────────
  const hangup = useCallback(() => {
    _publishData({ type: 'hangup' });
    // Brief delay so the data message sends before disconnect
    setTimeout(() => {
      roomRef.current?.disconnect();
    }, 100);
    _setState('ended');
    cleanup();
  }, [cleanup, _setState, _publishData]);

  // ── Interrupt (barge-in) ───────────────────────────────────────────────────
  const interrupt = useCallback(() => {
    _publishData({ type: 'interrupt' });
    const audio = remoteAudioRef.current;
    if (audio && !audio.paused) audio.pause();
  }, [_publishData]);

  // ── Mute / unmute ──────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const newMuted = !isMuted;
    room.localParticipant.setMicrophoneEnabled(!newMuted).catch(() => {});
    setIsMuted(newMuted);
  }, [isMuted]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  // ── Public API — identical to old hook ─────────────────────────────────────
  return {
    rtcState,
    agentName,
    transcript,
    aiResponse,
    isMuted,
    errorMsg,
    startCall,
    hangup,
    interrupt,
    toggleMute,
    remoteAudioRef,
  };
}
