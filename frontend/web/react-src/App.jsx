import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { initServer } from './hooks/useServer'
import NavBar    from './components/NavBar'
import Dashboard from './pages/Dashboard'
import BasicInfo from './pages/BasicInfo'
import Network   from './pages/Network'
import Accounts  from './pages/Accounts'
import Apps      from './pages/Apps'

export default function App() {
  // Initialise WebSocket once on app start — mirrors app.js run block
  useEffect(() => { initServer() }, [])

  const defaultTab = localStorage.getItem('currentTab') || 'system-status'

  return (
    <HashRouter>
      <NavBar />
      <div id="plugins">
        <Routes>
          <Route path="/"               element={<Navigate to={`/${defaultTab}`} replace />} />
          <Route path="/system-status"  element={<Dashboard />} />
          <Route path="/basic-info"     element={<BasicInfo />} />
          <Route path="/network"        element={<Network />} />
          <Route path="/accounts"       element={<Accounts />} />
          <Route path="/apps"           element={<Apps />} />
          <Route path="*"               element={<Navigate to="/system-status" replace />} />
        </Routes>
      </div>
    </HashRouter>
  )
}
