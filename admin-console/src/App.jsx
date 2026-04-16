// ================================================================
// FILE EXECUTION FLOW
// ================================================================
//
// [ START ]
//     |
//     v
// +---------------------------+
// | App()                     |
// | * root router component   |
// +---------------------------+
//     |
//     |----> Layout()
//     |        * wraps all routes
//     |
//     |----> Routes()
//     |        * defines page routing
//     |
//     v
// [ END ]
// ================================================================

import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout.jsx'
import Dashboard       from './pages/Dashboard.jsx'
import ServicesMonitor from './pages/ServicesMonitor.jsx'
import VoiceLab        from './pages/VoiceLab.jsx'
import STTDiagnostics  from './pages/STTDiagnostics.jsx'
import LanguageConfig  from './pages/LanguageConfig.jsx'
import MemoryExplorer  from './pages/MemoryExplorer.jsx'
import AvatarManager   from './pages/AvatarManager.jsx'
import Analytics       from './pages/Analytics.jsx'
import Translator      from './pages/Translator.jsx'
import CallSessions    from './pages/CallSessions.jsx'
import RagSearch       from './pages/RagSearch.jsx'
import AICallOverview  from './pages/AICallOverview.jsx'
import RoutingRules    from './pages/RoutingRules.jsx'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"              element={<Dashboard />} />
        <Route path="/services"      element={<ServicesMonitor />} />
        <Route path="/voice-lab"     element={<VoiceLab />} />
        <Route path="/stt"           element={<STTDiagnostics />} />
        <Route path="/languages"     element={<LanguageConfig />} />
        <Route path="/memory"        element={<MemoryExplorer />} />
        <Route path="/avatars"       element={<AvatarManager />} />
        <Route path="/analytics"     element={<Analytics />} />
        <Route path="/ai-calls"      element={<AICallOverview />} />
        <Route path="/routing"       element={<RoutingRules />} />
        <Route path="/translator"    element={<Translator />} />
        <Route path="/sessions"      element={<CallSessions />} />
        <Route path="/rag-search"    element={<RagSearch />} />
      </Routes>
    </Layout>
  )
}
