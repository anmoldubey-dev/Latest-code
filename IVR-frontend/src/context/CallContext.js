import { createContext, useContext } from 'react';

/**
 * CallContext — central call state accessible to any component.
 * Populated by the CallProvider in App.jsx using useCallState().
 */
export const CallContext = createContext(null);

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside <CallProvider>');
  return ctx;
}
