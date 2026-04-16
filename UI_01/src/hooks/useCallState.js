import { useState, useRef, useCallback, useEffect } from 'react';

export const CALL_STATES = {
  IDLE:         'idle',
  DIALING:      'dialing',
  RINGING:      'ringing',
  CONNECTED:    'connected',
  ON_HOLD:      'on_hold',
  TRANSFERRING: 'transferring',
  CONFERENCE:   'conference',
  ENDED:        'ended',
};

const ACTIVE_STATES = new Set([
  CALL_STATES.CONNECTED,
  CALL_STATES.ON_HOLD,
  CALL_STATES.TRANSFERRING,
  CALL_STATES.CONFERENCE,
]);

export function useCallState() {
  const [callState,      setCallState]      = useState(CALL_STATES.IDLE);
  const [dialNumber,     setDialNumber]     = useState('');
  const [isMuted,        setIsMuted]        = useState(false);
  const [isHeld,         setIsHeld]         = useState(false);
  const [callDuration,   setCallDuration]   = useState(0);
  const [transferTarget, setTransferTarget] = useState('');
  const [backendCallId,  setBackendCallId]  = useState(null);
  const [livekitSession, setLivekitSession] = useState(null);

  const dial = useCallback((digit) => {
    if (callState === CALL_STATES.IDLE) setDialNumber(prev => prev + digit);
  }, [callState]);

  const clearDigit = useCallback(() => {
    if (callState === CALL_STATES.IDLE) setDialNumber(prev => prev.slice(0, -1));
  }, [callState]);

  const clearNumber = useCallback(() => {
    if (callState === CALL_STATES.IDLE) setDialNumber('');
  }, [callState]);

  const startCall = useCallback(() => {
    if (callState === CALL_STATES.IDLE) setCallState(CALL_STATES.DIALING);
  }, [callState]);

  const endCall = useCallback(() => {
    setCallState(CALL_STATES.ENDED);
    setTimeout(() => {
      setCallState(CALL_STATES.IDLE);
      setDialNumber('');
      setLivekitSession(null);
    }, 2000);
  }, []);

  const toggleMute = useCallback(() => setIsMuted(m => !m), []);
  
  const toggleHold = useCallback(() => {
    setCallState(s => s === CALL_STATES.CONNECTED ? CALL_STATES.ON_HOLD : CALL_STATES.CONNECTED);
    setIsHeld(h => !h);
  }, []);

  const startTransfer = useCallback(() => {
    if (callState === CALL_STATES.CONNECTED || callState === CALL_STATES.ON_HOLD) {
      setCallState(CALL_STATES.TRANSFERRING);
    }
  }, [callState]);

  const completeTransfer = useCallback(() => setCallState(CALL_STATES.ENDED), []);
  const cancelTransfer = useCallback(() => setCallState(CALL_STATES.CONNECTED), []);
  
  const startConference = useCallback(() => {
    if (callState === CALL_STATES.CONNECTED) setCallState(CALL_STATES.CONFERENCE);
  }, [callState]);

  const endConference = useCallback(() => setCallState(CALL_STATES.CONNECTED), []);

  return {
    callState, CALL_STATES, dialNumber, isMuted, isHeld, callDuration,
    transferTarget, livekitSession,
    isActive: ACTIVE_STATES.has(callState),
    canEndCall: callState !== CALL_STATES.IDLE && callState !== CALL_STATES.ENDED,
    canMute: callState === CALL_STATES.CONNECTED,
    canHold: callState === CALL_STATES.CONNECTED || callState === CALL_STATES.ON_HOLD,
    canTransfer: callState === CALL_STATES.CONNECTED || callState === CALL_STATES.ON_HOLD,
    canConference: callState === CALL_STATES.CONNECTED,
    dial, clearDigit, clearNumber, startCall, endCall, toggleMute, toggleHold,
    startTransfer, completeTransfer, cancelTransfer, startConference, endConference,
    setTransferTarget, setDialNumber, setCallState, setBackendCallId, setLivekitSession
  };
}