import { CallContext } from './context/CallContext';
import { SessionContext } from './context/SessionContext';
import { useCallState } from './hooks/useCallState';
import IVRDashboard from './pages/IVRDashboard';

const DEFAULT_AGENT = { id: 1, name: 'Angela', role: 'admin' };

/**
 * App — root component.
 * Provides SessionContext and CallContext to all children.
 * No authentication — dashboard renders immediately.
 */
export default function App() {
  const callState = useCallState();

  return (
    <SessionContext.Provider value={DEFAULT_AGENT}>
      <CallContext.Provider value={callState}>
        <IVRDashboard />
      </CallContext.Provider>
    </SessionContext.Provider>
  );
}
