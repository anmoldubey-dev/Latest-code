import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import AppRoutes from './routes/AppRoutes.jsx'
import AdminPage from "./pages/AdminPage";


import { CallContext } from './context/CallContext.js';
import { SessionContext } from './context/SessionContext.js';
import { useCallState } from './hooks/useCallState.js';

function App() {
  // 2. Naam change karke 'callManager' kar diya taaki clash na ho
  const callManager = useCallState(); 
  
  const currentSession = { id: 1, name: 'Agent', role: 'agent' };

  return (
    <BrowserRouter>
      <AuthProvider>
        <SessionContext.Provider value={currentSession}>
          {/* 3. Yahan 'callManager' pass kiya */}
          <CallContext.Provider value={callManager}>
            <AppRoutes />
          </CallContext.Provider>
        </SessionContext.Provider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App