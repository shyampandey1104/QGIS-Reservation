import { useEffect, useState } from 'react'
import { fetchProjects, updateStatus } from '../api'

const STATUS_COLORS = {
  Draft:     { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  Submitted: { bg: '#fef3c7', color: '#d97706', border: '#fde68a' },
  Approved:  { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  Rejected:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
}

const ROLE_ACTIONS = {
  'GIS Junior Engineer':    { nextStatus: ['Submitted'] },
  'GIS Assistant Engineer': { nextStatus: ['Approved', 'Rejected'] },
  'GIS Senior Engineer':    { nextStatus: ['Approved', 'Rejected'] },
  'GIS Department Head':    { nextStatus: ['Approved', 'Rejected'] },
  'System Manager':         { nextStatus: ['Draft', 'Submitted', 'Approved', 'Rejected'] },
}

const FILTERS = ['All', 'Draft', 'Submitted', 'Approved', 'Rejected']

export default function Workflow({ userInfo }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const role = userInfo?.role || ''
  const roleActions = ROLE_ACTIONS[role] || {}

  const load = () => {
    fetchProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = projects.filter(p => {
    const matchFilter = filter === 'All' || p.status === filter
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.ward?.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const counts = {
    All: projects.length,
    Draft: projects.filter(p => p.status === 'Draft').length,
    Submitted: projects.filter(p => p.status === 'Submitted').length,
    Approved: projects.filter(p => p.status === 'Approved').length,
    Rejected: projects.filter(p => p.status === 'Rejected').length,
  }

  const handleStatusChange = async (id, status) => {
    try {
      await updateStatus(id, status)
      load()
      setSelected(prev => prev?.id === id ? { ...prev, status } : prev)
    } catch (e) { alert(e.message) }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '18px 28px 14px', background: 'white', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1a2d45', margin: 0 }}>Workflow Management</h1>
        <p style={{ color: '#888', fontSize: '12px', margin: '2px 0 0' }}>Track and manage approval workflows</p>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left - project list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #f0f0f0', overflow: 'hidden' }}>
          {/* Search + filter bar */}
          <div style={{ padding: '14px 20px', background: 'white', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '14px' }}>🔍</span>
              <input
                type="text"
                placeholder="Search projects..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px 8px 32px', border: '1.5px solid #e5e7eb',
                  borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {FILTERS.map(f => {
                const sc = f === 'All' ? null : STATUS_COLORS[f]
                const isActive = filter === f
                return (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    padding: '4px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
                    border: isActive ? (sc ? `1.5px solid ${sc.border}` : '1.5px solid #1a2d45') : '1.5px solid #e5e7eb',
                    background: isActive ? (sc ? sc.bg : '#1a2d45') : 'white',
                    color: isActive ? (sc ? sc.color : 'white') : '#64748b',
                  }}>
                    {f === 'Submitted' ? 'Under Review' : f} ({counts[f]})
                  </button>
                )
              })}
            </div>
          </div>

          {/* Project list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {loading && <div style={{ padding: '32px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>Loading...</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>No projects found.</div>
            )}
            {filtered.map((p, i) => {
              const sc = STATUS_COLORS[p.status] || STATUS_COLORS.Draft
              const isSelected = selected?.id === p.id
              return (
                <div key={p.id} onClick={() => setSelected(p)} style={{
                  padding: '14px 16px', marginBottom: '8px', borderRadius: '10px',
                  border: `1.5px solid ${isSelected ? '#2563eb' : '#f0f0f0'}`,
                  background: isSelected ? '#eff6ff' : 'white',
                  cursor: 'pointer', transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace', fontWeight: 600 }}>
                        PRJ-{String(i + 1).padStart(3, '0')}
                      </span>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, flexShrink: 0 }}>
                        {p.status === 'Submitted' ? 'Under Review' : p.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a2d45', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{p.ward} • {p.type}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {p.budget && <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a2d45' }}>₹{p.budget}</div>}
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{p.created_at?.slice(0, 10)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right - detail panel */}
        <div style={{ width: '360px', background: 'white', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa', padding: '32px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.3 }}>☰</div>
              <div style={{ fontSize: '13px' }}>Select a project to view workflow details</div>
            </div>
          ) : (
            <>
              <div style={{ padding: '20px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a2d45', marginBottom: '4px' }}>{selected.name}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{selected.ward} • {selected.type}</div>
                  </div>
                  {(() => { const sc = STATUS_COLORS[selected.status] || STATUS_COLORS.Draft; return (
                    <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, flexShrink: 0, marginLeft: '8px' }}>
                      {selected.status === 'Submitted' ? 'Under Review' : selected.status}
                    </span>
                  )})()}
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {/* Details */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Project Details</div>
                  {[
                    ['Budget', selected.budget ? `₹ ${selected.budget}` : null],
                    ['Road Length', selected.road_length],
                    ['Start Date', selected.start_date],
                    ['Completion', selected.completion_date],
                    ['Contractor', selected.contractor_details],
                    ['Description', selected.description],
                    ['Remarks', selected.remarks],
                    ['Submitted By Role', selected.submitted_by_role],
                    ['Created', selected.created_at?.slice(0, 10)],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                      <span style={{ color: '#9ca3af', fontWeight: 500, flexShrink: 0, marginRight: '12px' }}>{label}</span>
                      <span style={{ color: '#374151', textAlign: 'right', flex: 1 }}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Workflow actions */}
                {roleActions.nextStatus?.length > 0 && (
                  <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Workflow Actions</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {roleActions.nextStatus.filter(s => s !== selected.status).map(s => {
                        const sc = STATUS_COLORS[s] || STATUS_COLORS.Draft
                        return (
                          <button key={s} onClick={() => handleStatusChange(selected.id, s)} style={{
                            padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
                            background: sc.bg, color: sc.color, border: `1.5px solid ${sc.border}`,
                            textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px'
                          }}>
                            <span>→</span>
                            {s === 'Submitted' ? 'Submit for Review' : `Mark as ${s}`}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
