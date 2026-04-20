import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchProjects } from '../api'

const STATUS_COLORS = {
  Draft:     { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  Submitted: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  Approved:  { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  Rejected:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
}

const POLYGON_COLORS = {
  Draft: '#94a3b8', Submitted: '#2563eb', Approved: '#16a34a', Rejected: '#dc2626',
}

export default function Dashboard({ userInfo, onNavigate }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (mapInstanceRef.current) return
    const map = L.map(mapRef.current, { zoomControl: false }).setView([23.2599, 77.4126], 12)
    mapInstanceRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map)
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || projects.length === 0) return
    projects.forEach(p => {
      if (!p.coordinates?.length) return
      const color = POLYGON_COLORS[p.status] || '#94a3b8'
      L.polygon(p.coordinates, { color, fillColor: color, fillOpacity: 0.3, weight: 2 })
        .bindTooltip(p.name, { sticky: true })
        .addTo(map)
    })
  }, [projects])

  const stats = {
    total:    projects.length,
    approved: projects.filter(p => p.status === 'Approved').length,
    review:   projects.filter(p => p.status === 'Submitted').length,
    budget:   projects.reduce((sum, p) => {
      const n = parseFloat((p.budget || '0').replace(/[^0-9.]/g, ''))
      return sum + (isNaN(n) ? 0 : n)
    }, 0),
  }

  const formatBudget = (n) => {
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`
    if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`
    return `₹${n.toLocaleString()}`
  }

  const STAT_CARDS = [
    { label: 'Total Projects', value: loading ? '—' : stats.total,              icon: '📋', color: '#2563eb' },
    { label: 'Approved',       value: loading ? '—' : stats.approved,           icon: '✅', color: '#16a34a' },
    { label: 'Under Review',   value: loading ? '—' : stats.review,             icon: '🕐', color: '#f59e0b' },
    { label: 'Total Budget',   value: loading ? '—' : formatBudget(stats.budget), icon: '₹', color: '#8b5cf6' },
  ]

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '28px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1a2d45', margin: 0 }}>Dashboard</h1>
        <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>Overview of all infrastructure projects</p>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {STAT_CARDS.map(card => (
          <div key={card.label} style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', color: '#888', fontWeight: 500 }}>{card.label}</span>
              <div style={{ width: '32px', height: '32px', background: card.color + '18', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>{card.icon}</div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#1a2d45' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Map + Recent requests */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '16px' }}>
        {/* Mini Map */}
        <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#1a2d45' }}>Project Map</span>
            <button onClick={() => onNavigate('map')} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
              Open Full Map →
            </button>
          </div>
          <div ref={mapRef} style={{ height: '340px' }} />
        </div>

        {/* Recent requests */}
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#1a2d45' }}>Recent Requests</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && <div style={{ padding: '24px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>Loading...</div>}
            {!loading && projects.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>No projects yet.</div>
            )}
            {projects.slice(0, 10).map((p, i) => {
              const sc = STATUS_COLORS[p.status] || STATUS_COLORS.Draft
              return (
                <div key={p.id} onClick={() => onNavigate('workflow')} style={{
                  padding: '14px 18px', borderBottom: '1px solid #f8f8f8',
                  cursor: 'pointer', transition: 'background 0.15s',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px'
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a2d45', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{p.ward} • {p.type}</div>
                    {p.budget && <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>₹{p.budget}</div>}
                  </div>
                  <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '20px', fontWeight: 600, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {p.status === 'Submitted' ? 'Under Review' : p.status}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
