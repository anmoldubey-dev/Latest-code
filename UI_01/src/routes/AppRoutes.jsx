// ======================== AppRoutes ========================
// AppRoutes -> Central route registry. Maps all paths to their page components
//              with role-based protection via ProtectedRoute.
// ||
// ||
// ||
// Functions/Methods -> AppRoutes() -> Main component
// ||                 |
// ||                 |---> Logic Flow -> Route tree structure:
// ||                                  |
// ||                                  |--- / (MainLayout)        -> Home (public)
// ||                                  |--- /login                -> Login (public)
// ||                                  |--- /register             -> Register (public)
// ||                                  |--- /welcome              -> GreetAi (role: user)
// ||                                  |
// ||                                  |--- /user (AppShell)      -> role: user
// ||                                  |    ├── index             -> HomePage
// ||                                  |    ├── analytics         -> AnalyticsPage
// ||                                  |    ├── send-call         -> SendCallPage
// ||                                  |    ├── personas          -> PersonasPage
// ||                                  |    ├── pathways          -> PathwaysPage
// ||                                  |    ├── batches           -> BatchesPage
// ||                                  |    ├── tools             -> ToolsPage
// ||                                  |    ├── billing           -> BillingPage
// ||                                  |    ├── voices            -> VoicesPage
// ||                                  |    ├── knowledge-bases   -> KnowledgeBasesPage
// ||                                  |    ├── web-widget        -> WebWidgetPage
// ||                                  |    └── call-logs         -> CallLogsPage
// ||                                  |
// ||                                  |--- /admin/dashboard      -> AdminDashboard (role: admin)
// ||                                  |--- /admin/settings       -> AdminSettings  (role: admin)
// ||                                  |--- /admin/*              -> AdminPage      (role: admin)
// ||                                  |
// ||                                  |--- /superuser            -> SuperuserPage        (role: superuser)
// ||                                  |--- /superuser/dashboard  -> SuperuserDashboard   (role: superuser)
// ||                                  |--- /superuser/agents     -> SuperuserAgents      (role: superuser)
// ||                                  |--- /superuser/agent/:id  -> SuperuserAgentDetail (role: superuser)
// ||                                  |--- /superuser/analytics  -> SuperuserAnalytics   (role: superuser)
// ||                                  |--- /superuser/settings   -> SuperuserSettings    (role: superuser)
// ||                                  |--- /superuser/ivr-studio -> IVRStudio            (role: superuser)
// ||                                  |--- /superuser/escalations   -> Escalations         (role: superuser)
// ||                                  |--- /superuser/business-hours -> BusinessHours      (role: superuser)
// ||                                  |
// ||                                  |--- /agent                -> AgentPage      (role: agent)
// ||                                  |--- /agent/dashboard      -> AgentDashboard (role: agent)
// ||                                  |--- *                     -> Navigate /welcome (fallback)
// ||
// ======================================================================

// ---------------------------------------------------------------
// SECTION: IMPORTS
// ---------------------------------------------------------------
import { Routes, Route, Navigate } from 'react-router-dom'
import GreetAi    from '../pages/GreetAi.jsx'
import MainLayout from '../components/layout/MainLayout.jsx'
import Home       from '../pages/Home.jsx'
import Login      from '../pages/Login.jsx'
import Register   from '../pages/Register.jsx'

import ProtectedRoute from './ProtectedRoute.jsx'
import AppShell       from '../layout/AppShell.jsx'

// User pages
import HomePage           from '../pages/user/HomePage.jsx'
import AnalyticsPage      from '../pages/user/AnalyticsPage.jsx'
import SendCallPage       from '../pages/user/SendCallPage.jsx'
import PersonasPage       from '../pages/user/PersonasPage.jsx'
import PathwaysPage       from '../pages/user/PathwaysPage.jsx'
import BatchesPage        from '../pages/user/BatchesPage.jsx'
import ToolsPage          from '../pages/user/ToolsPage.jsx'
import BillingPage        from '../pages/user/BillingPage.jsx'
import VoicesPage         from '../pages/user/VoicesPage.jsx'
import KnowledgeBasesPage from '../pages/user/KnowledgeBasesPage.jsx'
import WebWidgetPage      from '../pages/user/WebWidgetPage.jsx'
import CallLogsPage       from '../pages/user/CallLogsPage.jsx'
import BroadcastListener  from '../pages/user/BroadcastListener.jsx'
import AiAgentsPage       from '../pages/user/AiAgentsPage.jsx'

// Admin pages
import AdminPage      from '../pages/AdminPage.jsx'
import AdminDashboard from '../pages/admin/Admindashboard.jsx'
import AdminSettings  from '../pages/admin/AdminSettings.jsx'

// Agent pages
import AgentPage      from '../pages/AgentPage.jsx'
import AgentDashboard from '../pages/agent/AgentDashboard.jsx'

// Superuser pages
import SuperuserPage        from '../pages/SuperuserPage.jsx'
import SuperuserDashboard   from '../pages/superuser/Dashboard.jsx'
import SuperuserAgents      from '../pages/superuser/Agents.jsx'
import SuperuserAgentDetail from '../pages/superuser/AgentDetail.jsx'
import SuperuserAnalytics   from '../pages/superuser/CallAnalytics.jsx'
import SuperuserSettings    from '../pages/superuser/Settings.jsx'
import IVRStudio            from '../pages/superuser/IVRStudio.jsx'
import Escalations          from '../pages/superuser/Escalations.jsx'
import Scheduling           from '../pages/superuser/Scheduling.jsx'
import BusinessHours        from '../pages/superuser/BusinessHours.jsx'

// ---------------------------------------------------------------
// SECTION: MAIN COMPONENT / EXPORT
// ---------------------------------------------------------------
const AppRoutes = () => {
  return (
    <Routes>

      {/* ── Public routes ── */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
      </Route>

      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* ── Welcome -> GreetAi demo (role: user) ── */}
      <Route
        path="/welcome"
        element={
          <ProtectedRoute role="user">
            <GreetAi />
          </ProtectedRoute>
        }
      />

      {/* ── User routes -> Nested inside AppShell (role: user) ── */}
      <Route
        path="/user"
        element={
          <ProtectedRoute role="user">
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index                  element={<HomePage />} />
        <Route path="analytics"       element={<AnalyticsPage />} />
        <Route path="send-call"       element={<SendCallPage />} />
        <Route path="personas"        element={<PersonasPage />} />
        <Route path="pathways"        element={<PathwaysPage />} />
        <Route path="batches"         element={<BatchesPage />} />
        <Route path="tools"           element={<ToolsPage />} />
        <Route path="billing"         element={<BillingPage />} />
        <Route path="voices"          element={<VoicesPage />} />
        <Route path="knowledge-bases" element={<KnowledgeBasesPage />} />
        <Route path="web-widget"      element={<WebWidgetPage />} />
        <Route path="call-logs"       element={<CallLogsPage />} />
        <Route path="ai-agents"       element={<AiAgentsPage />} />
      </Route>

      {/* ── Broadcast Listener (public) ── */}
      <Route path="/broadcast/:id/listen" element={<BroadcastListener />} />

      {/* ── Admin routes -> Specific before wildcard (role: admin) ── */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute role="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute role="admin">
            <AdminSettings />
          </ProtectedRoute>
        }
      />

      {/* Wildcard -> Catches all other /admin/* paths */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute role="admin">
            <AdminPage />
          </ProtectedRoute>
        }
      />

      {/* ── Superuser routes -> Specific before wildcard (role: superuser) ── */}
      <Route
        path="/superuser"
        element={
          <ProtectedRoute role="superuser">
            <SuperuserPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/superuser/dashboard"
        element={
          <ProtectedRoute role="superuser">
            <SuperuserDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/superuser/agents"
        element={
          <ProtectedRoute role="superuser">
            <SuperuserAgents />
          </ProtectedRoute>
        }
      />

      {/* Dynamic -> :id resolved from URL params */}
      <Route
        path="/superuser/agent/:id"
        element={
          <ProtectedRoute role="superuser">
            <SuperuserAgentDetail />
          </ProtectedRoute>
        }
      />

      <Route
        path="/superuser/analytics"
        element={
          <ProtectedRoute role="superuser">
            <SuperuserAnalytics />
          </ProtectedRoute>
        }
      />

      <Route
        path="/superuser/settings"
        element={
          <ProtectedRoute role="superuser">
            <SuperuserSettings />
          </ProtectedRoute>
        }
      />

      <Route
        path="/superuser/ivr-studio"
        element={
          <ProtectedRoute role="superuser">
            <IVRStudio />
          </ProtectedRoute>
        }
      />

      <Route
        path="/superuser/escalations"
        element={
          <ProtectedRoute role="superuser">
            <Escalations />
          </ProtectedRoute>
        }
      />

      <Route
        path="/superuser/scheduling"
        element={
          <ProtectedRoute role="superuser">
            <Scheduling />
          </ProtectedRoute>
        }
      />

      <Route
        path="/superuser/business-hours"
        element={
          <ProtectedRoute role="superuser">
            <BusinessHours />
          </ProtectedRoute>
        }
      />

      {/* ── Agent routes (role: agent) ── */}
      <Route
        path="/agent"
        element={
          <ProtectedRoute role="agent">
            <AgentPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/agent/dashboard"
        element={
          <ProtectedRoute role="agent">
            <AgentDashboard />
          </ProtectedRoute>
        }
      />

      {/* Fallback -> Redirect all unmatched paths to /welcome */}
      <Route path="*" element={<Navigate to="/welcome" replace />} />

    </Routes>
  )
}

export default AppRoutes