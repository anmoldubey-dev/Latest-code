import { createContext, useContext } from 'react';

export const CallContext = createContext(null);

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside <CallContext.Provider>');
  return ctx;
}