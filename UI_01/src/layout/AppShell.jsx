// ======================== AppShell ========================
// AppShell -> Root layout wrapper for authenticated users. Renders persistent Sidebar
//             and <Outlet /> for nested route content.
// ||
// ||
// ||
// Functions/Methods -> AppShell() -> Main layout component
// ||                 |
// ||                 |---> handleLogout() -> Call auth logout -> Redirect to /login
// ||                 |
// ||                 |---> Logic Flow -> Component render:
// ||                                  |
// ||                                  |--- useAuth()    -> Destructure user + logout
// ||                                  |--- useNavigate() -> For post-logout redirect
// ||                                  |--- Render GlobalStyles
// ||                                  |--- Render Sidebar -> Pass user + onLogout
// ||                                  |--- Render <Outlet /> -> Inject active child route
// ||
// ======================================================================

// ---------------------------------------------------------------
// SECTION: IMPORTS
// ---------------------------------------------------------------
import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import GlobalStyles from '../components/dashboard/GlobalStyles.jsx'
import { useAuth } from '../context/AuthContext.jsx'

// ---------------------------------------------------------------
// SECTION: MAIN COMPONENT / EXPORT
// ---------------------------------------------------------------
export default function AppShell() {

  // ---------------------------------------------------------------
  // SECTION: STATE & HOOKS
  // ---------------------------------------------------------------
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // ---------------------------------------------------------------
  // SECTION: EVENT HANDLERS
  // ---------------------------------------------------------------

  // handleLogout -> Clear auth state + redirect to login
  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // ---------------------------------------------------------------
  // SECTION: RENDER
  // ---------------------------------------------------------------
  return (
    <>
      <GlobalStyles />
      <div style={{ display: 'flex', minHeight: '100vh' }}>

        {/* ── Sidebar -> Fixed left nav with user info + logout ── */}
        <Sidebar user={user} onLogout={handleLogout} />

        {/* ── Main -> Outlet renders active child route ── */}
        <main style={{ marginLeft: 250, flex: 1 }}>
          <Outlet />
        </main>

      </div>
    </>
  )
}