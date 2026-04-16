// ======================== ProtectedRoute ========================
// ProtectedRoute -> Route guard component. Blocks unauthenticated or
//                  wrong-role access and redirects accordingly.
// ||
// ||
// ||
// Functions/Methods -> ProtectedRoute() -> Main component
// ||                 |
// ||                 |---> Logic Flow -> Guard evaluation order:
// ||                                  |
// ||                                  |--- IF loading -> Render loading spinner
// ||                                  |--- IF no user -> Navigate /login (preserve intended path)
// ||                                  |--- IF role="admin"     + !isAdmin     -> Navigate /login
// ||                                  |--- IF role="superuser" + !isSuperuser -> Navigate /login
// ||                                  |--- IF role="agent"     + !isAgent     -> Navigate /login
// ||                                  |--- IF role="user"      + !isUser      -> Navigate /login
// ||                                  |--- ELSE -> Render children
// ||
// ======================================================================

// ---------------------------------------------------------------
// SECTION: IMPORTS
// ---------------------------------------------------------------
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// ---------------------------------------------------------------
// SECTION: MAIN COMPONENT / EXPORT
// ---------------------------------------------------------------
const ProtectedRoute = ({ children, role }) => {
  const { user, loading, isUser, isAdmin, isSuperuser, isAgent } = useAuth()
  const location = useLocation()

  // ---------------------------------------------------------------
  // SECTION: RENDER GUARDS
  // ---------------------------------------------------------------

  // Guard -> Show spinner while auth state is being rehydrated
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#080a1a',
        color: '#9d7dff', fontFamily: "'Syne',sans-serif", fontSize: 16,
      }}>
        Loading…
      </div>
    )
  }

  // Guard -> No user -> Redirect to login, preserve intended path in state
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Role guards -> Redirect to login if user's role doesn't match required role
  if (role === 'admin'     && !isAdmin)     return <Navigate to="/login" replace />
  if (role === 'superuser' && !isSuperuser) return <Navigate to="/login" replace />
  if (role === 'agent'     && !isAgent)     return <Navigate to="/login" replace />
  if (role === 'user'      && !isUser)      return <Navigate to="/login" replace />

  // Pass -> All guards cleared, render protected content
  return children
}

export default ProtectedRoute