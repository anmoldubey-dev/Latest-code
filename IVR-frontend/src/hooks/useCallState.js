import { useState, useRef, useCallback, useEffect } from 'react';

// backendCallId tracks the ivr_backend DB row for the current call


export const CALL_STATES = {
  IDLE:        'idle',
  DIALING:     'dialing',
  RINGING:     'ringing',
  CONNECTED:   'connected',
  ON_HOLD:     'on_hold',
  TRANSFERRING:'transferring',
  CONFERENCE:  'conference',
  ENDED:       'ended',
};

const ACTIVE_STATES = new Set([
  CALL_STATES.CONNECTED,
  CALL_STATES.ON_HOLD,
  CALL_STATES.TRANSFERRING,
  CALL_STATES.CONFERENCE,
]);

export function useCallState() {
  const [callState, setCallState]       = useState(CALL_STATES.IDLE);
  const [dialNumber, setDialNumber]     = useState('');
  const [isMuted,    setIsMuted]        = useState(false);
  const [isHeld,     setIsHeld]         = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [transferTarget, setTransferTarget]   = useState('');
  const [backendCallId,  setBackendCallId]    = useState(null);

  const timerRef      = useRef(null);
  const dialingRef    = useRef(null);

  // ── Timer management ──────────────────────────────────────────────────────
  useEffect(() => {
    if (callState === CALL_STATES.CONNECTED) {
      timerRef.current = setInterval(() => {
        setCallDuration(d => d + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      if (callState === CALL_STATES.ENDED || callState === CALL_STATES.IDLE) {
        setCallDuration(0);
      }
    }
    return () => clearInterval(timerRef.current);
  }, [callState]);

  // ── Dial a digit (only when idle/dialing) ─────────────────────────────────
  const dial = useCallback((digit) => {
    if (callState === CALL_STATES.IDLE || callState === CALL_STATES.DIALING) {
      setDialNumber(prev => (prev.length < 20 ? prev + digit : prev));
    }
  }, [callState]);

  const clearDigit = useCallback(() => {
    setDialNumber(prev => prev.slice(0, -1));
  }, []);

  const clearNumber = useCallback(() => {
    setDialNumber('');
  }, []);

  // ── Start a call ──────────────────────────────────────────────────────────
  // Dial number is no longer required — WebRTC AI calls have no PSTN number.
  const startCall = useCallback(() => {
    setCallState(CALL_STATES.DIALING);
    clearTimeout(dialingRef.current);
    dialingRef.current = setTimeout(() => {
      setCallState(CALL_STATES.RINGING);
      dialingRef.current = setTimeout(() => {
        setCallState(CALL_STATES.CONNECTED);
        setIsMuted(false);
        setIsHeld(false);
      }, 2200);
    }, 1500);
  }, []);

  // ── End call ──────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    clearTimeout(dialingRef.current);
    setCallState(CALL_STATES.ENDED);
    setIsMuted(false);
    setIsHeld(false);
    setTransferTarget('');
    setTimeout(() => {
      setCallState(CALL_STATES.IDLE);
      setDialNumber('');
    }, 1500);
  }, []);

  // ── Mute / Unmute ─────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (callState !== CALL_STATES.CONNECTED) return;
    setIsMuted(prev => !prev);
  }, [callState]);

  // ── Hold / Resume ─────────────────────────────────────────────────────────
  const toggleHold = useCallback(() => {
    if (callState === CALL_STATES.CONNECTED) {
      setCallState(CALL_STATES.ON_HOLD);
      setIsHeld(true);
    } else if (callState === CALL_STATES.ON_HOLD) {
      setCallState(CALL_STATES.CONNECTED);
      setIsHeld(false);
    }
  }, [callState]);

  // ── Transfer ──────────────────────────────────────────────────────────────
  const startTransfer = useCallback(() => {
    if (callState === CALL_STATES.CONNECTED || callState === CALL_STATES.ON_HOLD) {
      setCallState(CALL_STATES.TRANSFERRING);
    }
  }, [callState]);

  const completeTransfer = useCallback(() => {
    // Simulate successful transfer → call ends for this agent
    setCallState(CALL_STATES.ENDED);
    setTransferTarget('');
    setTimeout(() => {
      setCallState(CALL_STATES.IDLE);
      setDialNumber('');
    }, 1500);
  }, []);

  const cancelTransfer = useCallback(() => {
    setCallState(CALL_STATES.CONNECTED);
    setTransferTarget('');
  }, []);

  // ── Conference ────────────────────────────────────────────────────────────
  const startConference = useCallback(() => {
    if (callState === CALL_STATES.CONNECTED) {
      setCallState(CALL_STATES.CONFERENCE);
    }
  }, [callState]);

  const endConference = useCallback(() => {
    setCallState(CALL_STATES.CONNECTED);
  }, []);

  return {
    // state
    callState,
    CALL_STATES,
    dialNumber,
    isMuted,
    isHeld,
    callDuration,
    transferTarget,
    // derived flags
    isActive:   ACTIVE_STATES.has(callState),
    canEndCall: callState !== CALL_STATES.IDLE && callState !== CALL_STATES.ENDED,
    canMute:    callState === CALL_STATES.CONNECTED,
    canHold:    callState === CALL_STATES.CONNECTED || callState === CALL_STATES.ON_HOLD,
    canTransfer:callState === CALL_STATES.CONNECTED || callState === CALL_STATES.ON_HOLD,
    canConference:callState === CALL_STATES.CONNECTED,
    // actions
    dial,
    clearDigit,
    clearNumber,
    startCall,
    endCall,
    toggleMute,
    toggleHold,
    startTransfer,
    completeTransfer,
    cancelTransfer,
    startConference,
    endConference,
    setTransferTarget,
    setDialNumber,
    setCallState,   // exposed so WebRTC layer can sync real connection state
    // backend sync
    backendCallId,
    setBackendCallId,
  };
}
