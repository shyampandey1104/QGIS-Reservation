import { useState, useEffect } from 'react'
import { fetchPublicStats } from '../api'

const FRAPPE_BASE = ''

export default function Login({ onLogin, onBack }) {
  const [form, setForm] = useState({ usr: '', pwd: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    fetchPublicStats()
      .then(setStats)
      .catch(() => setStats(null))
  }, [])

  const statCards = [
    { label: 'PROJECTS', value: stats ? stats.total_projects : '—' },
    { label: 'WARDS',    value: stats ? stats.total_wards    : '—' },
    { label: 'BUDGET',   value: stats ? stats.total_budget   : '—' },
  ]

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${FRAPPE_BASE}/api/method/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': 'fetch' },
        credentials: 'include',
        body: JSON.stringify({ usr: form.usr, pwd: form.pwd }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Invalid credentials'); return }

      const roleRes = await fetch(
        `${FRAPPE_BASE}/api/method/qgis.api.gis_project.get_current_user_role`,
        { credentials: 'include', headers: { 'X-Frappe-CSRF-Token': 'fetch' } }
      )
      const roleData = await roleRes.json()
      if (!roleData.message?.role) {
        setError('Login successful but no GIS role assigned. Contact admin.')
        return
      }
      onLogin(roleData.message)
    } catch {
      setError('Could not connect to server. Make sure Frappe is running.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '11px 14px', border: '1.5px solid #e5e7eb',
    borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
    color: '#1a2d45', background: 'white',
  }

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Left panel ── */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(145deg, #0f1f35 0%, #1a3a6e 60%, #2563eb 100%)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '56px 64px', color: 'white', position: 'relative', overflow: 'hidden'
      }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: '300px', height: '300px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', bottom: '-60px', left: '-60px', width: '240px', height: '240px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '56px' }}>
          <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.12)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', backdropFilter: 'blur(4px)' }}>🗺</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '17px', letterSpacing: '-0.3px' }}>Municipal GIS</div>
            <div style={{ fontSize: '10px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1.5px', marginTop: '2px' }}>Workflow & Infrastructure Management</div>
          </div>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: '40px', fontWeight: 900, lineHeight: 1.15, margin: '0 0 18px', letterSpacing: '-1px' }}>
          Spatial Infrastructure<br />Management Platform
        </h1>
        <p style={{ fontSize: '14px', opacity: 0.65, lineHeight: 1.8, margin: '0 0 56px', maxWidth: '440px' }}>
          Digitally manage infrastructure projects through map-based GIS workflows. Route requests, track approvals, and publish works — all on one platform.
        </p>

        {/* Dynamic stat cards */}
        <div style={{ display: 'flex', gap: '14px' }}>
          {statCards.map(({ label, value }) => (
            <div key={label} style={{
              flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: '12px',
              padding: '18px 20px', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div style={{ fontSize: '26px', fontWeight: 900, letterSpacing: '-0.5px' }}>{value}</div>
              <div style={{ fontSize: '10px', opacity: 0.55, marginTop: '4px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{
        flex: 1, background: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px',
      }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#0f1f35', margin: '0 0 6px', letterSpacing: '-0.5px' }}>
            Internal Portal Login
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '14px', margin: '0 0 36px' }}>
            Sign in to access the GIS workflow system
          </p>

          <form onSubmit={handleLogin}>
            {/* Email */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '7px' }}>Email / Username</label>
              <input
                type="text"
                placeholder="Enter your email"
                value={form.usr}
                onChange={e => setForm({ ...form, usr: e.target.value })}
                required
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = '#2563eb'}
                onBlur={e => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: '28px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '7px' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={form.pwd}
                  onChange={e => setForm({ ...form, pwd: e.target.value })}
                  required
                  style={{ ...inputStyle, paddingRight: '40px' }}
                  onFocus={e => e.target.style.borderColor = '#2563eb'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#9ca3af',
                    padding: '0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: '#fef2f2', color: '#dc2626', padding: '11px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '18px', border: '1px solid #fecaca' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px', background: loading ? '#93c5fd' : '#2563eb',
              color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px',
              fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              letterSpacing: '-0.2px', transition: 'background 0.2s',
            }}>
              {loading ? 'Signing in...' : <><span>Sign In</span><span>→</span></>}
            </button>
          </form>

          <button onClick={onBack} style={{
            marginTop: '14px', width: '100%', padding: '12px',
            background: 'transparent', color: '#9ca3af',
            border: '1.5px solid #f0f0f0', borderRadius: '10px',
            cursor: 'pointer', fontSize: '14px', transition: 'border-color 0.2s',
          }}
            onMouseEnter={e => e.target.style.borderColor = '#d1d5db'}
            onMouseLeave={e => e.target.style.borderColor = '#f0f0f0'}
          >
            View Public Portal →
          </button>
        </div>
      </div>
    </div>
  )
}
