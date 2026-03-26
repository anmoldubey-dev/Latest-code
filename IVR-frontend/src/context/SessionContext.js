/**
 * SessionContext.js
 * Provides a hardcoded default session agent.
 * Drop-in replacement for AuthContext — no login required.
 * Swap the DEFAULT_AGENT value when real auth is added.
 */
import { createContext, useContext } from 'react';

const DEFAULT_AGENT = {
  id:   1,
  name: 'Angela',
  role: 'admin',
};

export const SessionContext = createContext(DEFAULT_AGENT);

export function useSession() {
  return useContext(SessionContext);
}
