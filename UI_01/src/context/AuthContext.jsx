// ======================== AuthContext ========================
// AuthContext -> Global auth state provider. Persists token + user to sessionStorage and exposes
//               role flags and login/logout actions to the entire app.
// ||
// ||
// ||
// Functions/Methods -> AuthProvider() -> Main context provider component
// ||                 |
// ||                 |---> login()   -> Persist token + user -> Update state
// ||                 |---> logout()  -> Clear sessionStorage -> Nullify state
// ||                 |---> useEffect() -> Rehydrate auth state from sessionStorage on mount
// ||                 |
// ||                 |---> Logic Flow -> Component lifecycle:
// ||                                  |
// ||                                  |--- useEffect() -> Read token + user from sessionStorage
// ||                                  |    ├── IF both exist -> Parse + set state
// ||                                  |    ├── IF JSON.parse fails -> Clear sessionStorage
// ||                                  |    └── setLoading(false) -> Unblock ProtectedRoute render
// ||                                  |
// ||                                  |--- login() -> Called after successful API auth
// ||                                  |    ├── Persist token + user to sessionStorage
// ||                                  |    └── Set token + user in state
// ||                                  |
// ||                                  |--- logout() -> Called on sign out
// ||                                  |    ├── Remove token + user from sessionStorage
// ||                                  |    └── Nullify token + user in state
// ||                                  |
// ||                                  |--- Role flags -> Derived from user.role
// ||                                  |    ├── isUser      -> role === "user" or no role
// ||                                  |    ├── isAdmin     -> role === "admin"
// ||                                  |    ├── isSuperuser -> role === "superuser"
// ||                                  |    └── isAgent     -> role === "agent"
// ||                                  |
// ||                                  |--- useAuth() -> Consumer hook -> Throws if used outside provider
// ||
// ======================================================================

// ---------------------------------------------------------------
// SECTION: IMPORTS
// ---------------------------------------------------------------
import { createContext, useContext, useState, useEffect } from 'react'

// ---------------------------------------------------------------
// SECTION: CONTEXT INIT
// ---------------------------------------------------------------
const AuthContext = createContext(null)  // Default null -> caught by useAuth guard

// ---------------------------------------------------------------
// SECTION: PROVIDER
// ---------------------------------------------------------------
export const AuthProvider = ({ children }) => {

  // ---------------------------------------------------------------
  // SECTION: STATE
  // ---------------------------------------------------------------
  const [user,    setUser]    = useState(null)
  const [token,   setToken]   = useState(null)
  const [loading, setLoading] = useState(true)  // Blocks render until rehydration done

  // ---------------------------------------------------------------
  // SECTION: EFFECTS
  // ---------------------------------------------------------------

  // Rehydrate -> Restore auth state from sessionStorage on app mount
  useEffect(() => {
    const storedToken = sessionStorage.getItem('token')
    const storedUser  = sessionStorage.getItem('user')

    if (storedToken && storedUser) {
      try {
        setToken(storedToken)
        setUser(JSON.parse(storedUser))  // Parse -> Restore user object
      } catch {
        sessionStorage.removeItem('token')  // Clear -> Corrupted data
        sessionStorage.removeItem('user')
      }
    }
    setLoading(false)  // Unblock -> Allow ProtectedRoute to render
  }, [])

  // ---------------------------------------------------------------
  // SECTION: ACTIONS
  // ---------------------------------------------------------------

  // login -> Persist + set token and user after successful auth
  const login = (tokenValue, userData) => {
    sessionStorage.setItem('token', tokenValue)
    sessionStorage.setItem('user', JSON.stringify(userData))
    setToken(tokenValue)
    setUser(userData)
  }

  // logout -> Clear all auth state and storage
  const logout = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    setToken(null)
    setUser(null)
  }

  // ---------------------------------------------------------------
  // SECTION: ROLE FLAGS
  // ---------------------------------------------------------------
  const isUser      = !!user && (user.role === 'user' || !user.role)  // Default role fallback
  const isAdmin     = !!user &&  user.role === 'admin'
  const isSuperuser = !!user &&  user.role === 'superuser'
  const isAgent     = !!user &&  user.role === 'agent'

  // ---------------------------------------------------------------
  // SECTION: RENDER
  // ---------------------------------------------------------------
  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isUser, isAdmin, isSuperuser, isAgent }}>
      {children}
    </AuthContext.Provider>
  )
}

// ---------------------------------------------------------------
// SECTION: CONSUMER HOOK
// ---------------------------------------------------------------

// useAuth -> Access auth context -> Throws if called outside <AuthProvider>
export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}