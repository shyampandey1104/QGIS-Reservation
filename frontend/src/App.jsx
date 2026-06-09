import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import GISMap from './pages/GISMap'
import Workflow from './pages/Workflow'
import UsersRoles from './pages/UsersRoles'
import PublicPortal from './pages/PublicPortal'
import { getPendingWorkOrdersCount } from './api'
import './App.css'

const FRAPPE_BASE = ''

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
  { id: 'map',       label: 'GIS Map',   icon: '🗺' },
  { id: 'live_map',  label: 'Live Project', icon: '🔴' },
  { id: 'workflow',  label: 'Workflow',  icon: '☰' },
  { id: 'users',     label: 'Users & Roles', icon: '👤' },
  { id: 'settings',  label: 'Settings',  icon: '⚙' },
]

export default function App() {
  const [view, setView] = useState('loading')
  const [userInfo, setUserInfo] = useState(null)
  const [activePage, setActivePage] = useState(() => localStorage.getItem('gis_activePage') || 'dashboard')
  const [requestTrigger, setRequestTrigger] = useState(0)
  const [notificationCount, setNotificationCount] = useState(0)
  const [liveFilterActive, setLiveFilterActive] = useState(false)

  useEffect(() => {
    if (!userInfo) return
    const updateCount = async () => {
      try {
        const res = await getPendingWorkOrdersCount()
        if (res && typeof res.count === 'number') {
          setNotificationCount(res.count)
        }
      } catch (e) {
        console.error("Failed to fetch notification count", e)
      }
    }
    updateCount()
    const interval = setInterval(updateCount, 15000)
    return () => clearInterval(interval)
  }, [userInfo])

  useEffect(() => {
    if (activePage) {
      localStorage.setItem('gis_activePage', activePage)
    }
  }, [activePage])

  useEffect(() => {
    fetch(`${FRAPPE_BASE}/api/method/qgis.api.gis_project.get_current_user_role`, {
      credentials: 'include',
      headers: { 'X-Frappe-CSRF-Token': 'fetch' },
    })
      .then(r => r.json())
      .then(data => {
        if (data.message?.role) {
          setUserInfo(data.message)
          setView('internal')
        } else {
          setView('login')
        }
      })
      .catch(() => setView('login'))
  }, [])

  const handleLogin = (info) => {
    setUserInfo(info)
    setActivePage('dashboard')
    setView('internal')
  }

  const handleLogout = async () => {
    await fetch(`${FRAPPE_BASE}/api/method/logout`, { method: 'GET', credentials: 'include' })
    setUserInfo(null)
    setView('login')
  }

  // Loading screen
  if (view === 'loading') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f9' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', background: '#2563eb', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto 16px' }}>🗺</div>
          <div style={{ color: '#1a2d45', fontWeight: 700, fontSize: '16px' }}>Municipal GIS</div>
          <div style={{ color: '#888', fontSize: '13px', marginTop: '6px' }}>Loading...</div>
        </div>
      </div>
    )
  }

  // Public portal
  if (view === 'public') {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#1a2d45', color: 'white', padding: '0 20px', height: '48px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '15px', marginRight: 'auto' }}>Municipal Web-GIS System</span>
          <button onClick={() => setView('login')} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            Staff Login
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <PublicPortal />
        </div>
      </div>
    )
  }

  // Login page
  if (view === 'login') {
    return <Login onLogin={handleLogin} onBack={() => setView('public')} />
  }

  // Internal portal with sidebar
  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard userInfo={userInfo} onNavigate={setActivePage} />
      case 'map':       return <GISMap userInfo={userInfo} requestTrigger={requestTrigger} liveFilterActive={liveFilterActive} setLiveFilterActive={setLiveFilterActive} />
      case 'workflow':  return <Workflow userInfo={userInfo} />
      case 'users':     return <UsersRoles userInfo={userInfo} />
      case 'settings':  return <div style={{ padding: '32px', color: '#555' }}>Settings — Coming Soon</div>
      default:          return <Dashboard userInfo={userInfo} onNavigate={setActivePage} />
    }
  }

  const roleBadge = {
    'GIS Junior Engineer':    'Junior Engineer',
    'GIS Assistant Engineer': 'Asst. Engineer',
    'GIS Senior Engineer':    'Senior Engineer',
    'GIS Department Head':    'Dept. Head',
    'System Manager':         'Admin',
  }[userInfo?.role] || userInfo?.role || ''

  const initials = (userInfo?.user || 'U').split('@')[0].slice(0, 2).toUpperCase()

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: '220px', background: '#1a2d45', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', background: '#2563eb', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🗺</div>
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: '14px', lineHeight: 1.2 }}>Municipal GIS</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Internal Portal</div>
            </div>
          </div>
        </div>

        {/* New Request button */}
        <div style={{ padding: '14px 12px 8px' }}>
          <button onClick={() => { setActivePage('map'); setRequestTrigger(t => t + 1); }} style={{
            width: '100%', padding: '9px', background: '#2563eb', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600,
            fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}>
            <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> New Request
          </button>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '4px 8px' }}>
          {NAV_ITEMS.map(item => {
            const isActive = item.id === 'map' 
              ? (activePage === 'map' && !liveFilterActive)
              : item.id === 'live_map'
                ? (activePage === 'map' && liveFilterActive)
                : (activePage === item.id);
                
            return (
              <button 
                key={item.id} 
                onClick={() => {
                  if (item.id === 'map') {
                    setActivePage('map');
                    setLiveFilterActive(false);
                  } else if (item.id === 'live_map') {
                    setActivePage('map');
                    setLiveFilterActive(true);
                  } else {
                    setActivePage(item.id);
                  }
                }} 
                style={{
                  width: '100%', padding: '10px 12px', marginBottom: '2px',
                  background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: isActive ? 'white' : 'rgba(255,255,255,0.6)',
                  border: 'none', borderRadius: '8px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  fontSize: '13px', fontWeight: isActive ? 600 : 400,
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '15px', width: '18px', textAlign: 'center' }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User info at bottom */}
        <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <div style={{ width: '34px', height: '34px', background: '#2563eb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'white', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userInfo?.user?.split('@')[0] || 'User'}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>{roleBadge}</div>
            </div>
          </div>
          <button onClick={handleLogout} style={{
            width: '100%', padding: '7px', background: 'transparent',
            color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}>
            ↪ Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'hidden', background: '#f4f6f9', display: 'flex', flexDirection: 'column' }}>
        {/* Top Header */}
        <div style={{ height: '56px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', textTransform: 'capitalize' }}>
            {activePage === 'map' ? (liveFilterActive ? 'Live Projects Map' : 'GIS Map') : activePage}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {/* Bell Icon Notification */}
            <div 
              style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '50%', background: '#f1f5f9', transition: 'background 0.2s' }} 
              onClick={() => setActivePage('workflow')}
              title={`${notificationCount} pending work orders`}
            >
              <span style={{ fontSize: '18px' }}>🔔</span>
              {notificationCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-2px', right: '-2px',
                  background: '#ef4444', color: 'white', fontSize: '9px',
                  fontWeight: 'bold', borderRadius: '50%', width: '16px', height: '16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 0 2px white'
                }}>
                  {notificationCount}
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Role:</span>
              <strong style={{ color: '#0f172a', background: '#eff6ff', padding: '4px 8px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                {userInfo?.role || 'Guest'}
              </strong>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'hidden' }}>
          {renderPage()}
        </div>
      </div>
    </div>
  )
}
