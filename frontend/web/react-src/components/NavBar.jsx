import { useEffect } from 'react'
import { useLocation, NavLink } from 'react-router-dom'

const TABS = ['system-status', 'basic-info', 'network', 'accounts', 'apps']

export default function NavBar() {
  const location = useLocation()

  // Persist last visited tab — mirrors AngularJS routes.js behaviour
  useEffect(() => {
    const tab = location.pathname.replace('/', '')
    if (tab) localStorage.setItem('currentTab', tab)
  }, [location.pathname])

  return (
    <nav className="kp-navbar">
      <span className="title">KernelPulse</span>
      <ul>
        {TABS.map(tab => (
          <li key={tab} className={location.pathname === `/${tab}` ? 'active' : ''}>
            <NavLink to={`/${tab}`}>
              {tab.replace('-', ' ')}
            </NavLink>
          </li>
        ))}
      </ul>
      <span className="right-content">
        Built by Vanisha Raj |{' '}
        <a target="_blank" rel="noreferrer" href="https://github.com/pickaboo/KernelPulse">
          GitHub
        </a>
      </span>
    </nav>
  )
}
