import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import { fetchProjects, createProject, updateStatus, deleteProject } from '../api'

const PROJECT_TYPES = ['Road Construction', 'Drainage Work', 'Water Pipeline', 'Other Infrastructure']

const STATUS_COLORS = {
  Draft:                 { bg: '#eff6ff', color: '#2563eb' }, // Blue
  'Pending for Request': { bg: '#fff7ed', color: '#ea580c' }, // Orange
  Correction:            { bg: '#fff1f2', color: '#e11d48' }, // Red-orange
  Submitted:             { bg: '#eff6ff', color: '#2563eb' }, // Blue
  Approved:              { bg: '#f0fdf4', color: '#16a34a' }, // Green
  Rejected:              { bg: '#fef2f2', color: '#dc2626' }, // Red
}

const POLYGON_COLORS = {
  Draft:                 '#2563eb', // Blue
  'Pending for Request': '#ea580c', // Orange
  Correction:            '#e11d48', // Red-orange
  Submitted:             '#ea580c', // Orange
  Approved:              '#16a34a', // Green
  Rejected:              '#dc2626', // Red
}

// Which status actions each role can take
const ROLE_ACTIONS = {
  'GIS Junior Engineer':    { canCreate: true,  canSubmit: true,  nextStatus: ['Submitted'] },
  'GIS Assistant Engineer': { canCreate: false, canSubmit: false, nextStatus: ['Approved', 'Rejected'] },
  'GIS Senior Engineer':    { canCreate: false, canSubmit: false, nextStatus: ['Approved', 'Rejected'] },
  'GIS Department Head':    { canCreate: false, canSubmit: false, nextStatus: ['Approved', 'Rejected'] },
  'System Manager':         { canCreate: true,  canSubmit: true,  nextStatus: ['Draft', 'Submitted', 'Approved', 'Rejected'] },
}

const EMPTY_FORM = {
  name: '', ward: '', type: 'Road Construction', description: '',
  budget: '', road_length: '', contractor_details: '',
  start_date: '', completion_date: '', remarks: '',
}

export default function InternalPortal({ userInfo, onLogout }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const drawnLayersRef = useRef(null)

  const [projects, setProjects] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [pendingGeometry, setPendingGeometry] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)
  const [activeTab, setActiveTab] = useState('map')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [customAlert, setCustomAlert] = useState(null)

  const alert = (message, type = 'success') => {
    let alertType = type;
    const msgLower = String(message).toLowerCase();
    if (msgLower.includes('failed') || msgLower.includes('error') || msgLower.includes('missing') || msgLower.includes('exception') || msgLower.includes('please')) {
      alertType = 'error';
    }
    setCustomAlert({ type: alertType, message: String(message) });
  };

  const role = userInfo?.role || ''
  const roleActions = ROLE_ACTIONS[role] || {}

  const loadProjects = () => {
    fetchProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadProjects() }, [])

  useEffect(() => {
    if (mapInstanceRef.current) return
    const map = L.map(mapRef.current).setView([23.2599, 77.4126], 14)
    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)

    const drawnItems = new L.FeatureGroup()
    drawnLayersRef.current = drawnItems
    map.addLayer(drawnItems)

    // Only JE and System Manager can draw
    if (roleActions.canCreate) {
      const drawControl = new L.Control.Draw({
        draw: {
          polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: '#2d7dd2', fillOpacity: 0.3 } },
          rectangle: false, circle: false, marker: false, polyline: false, circlemarker: false,
        },
        edit: { featureGroup: drawnItems },
      })
      map.addControl(drawControl)

      map.on(L.Draw.Event.CREATED, (e) => {
        const { layer } = e
        drawnItems.addLayer(layer)
        const coords = layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng])
        setPendingGeometry(coords)
        setForm(EMPTY_FORM)
        setShowForm(true)
        setActiveTab('map')
      })
    }

    return () => { map.remove(); mapInstanceRef.current = null }
  }, [role])

  useEffect(() => {
    const map = mapInstanceRef.current
    const drawnItems = drawnLayersRef.current
    if (!map || !drawnItems) return
    drawnItems.clearLayers()

    projects.forEach((project) => {
      const color = POLYGON_COLORS[project.status] || '#999'
      const polygon = L.polygon(project.coordinates, {
        color, fillColor: color, fillOpacity: 0.25, weight: 2
      })
      polygon.bindTooltip(`${project.name} [${project.status}]`, { sticky: true })
      polygon.on('click', () => { setSelectedProject(project); setActiveTab('map') })
      drawnItems.addLayer(polygon)
    })
  }, [projects])

  const handleSave = async () => {
    if (!form.name || !form.ward || !pendingGeometry) return
    setSaving(true)
    try {
      await createProject({ ...form, coordinates: pendingGeometry })
      loadProjects()
      setShowForm(false)
      setPendingGeometry(null)
      setForm(EMPTY_FORM)
    } catch (e) {
      alert('Failed to save: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    drawnLayersRef.current?.clearLayers()
    setShowForm(false)
    setPendingGeometry(null)
    setForm(EMPTY_FORM)
  }

  const handleStatusChange = async (id, status) => {
    try {
      await updateStatus(id, status)
      loadProjects()
      setSelectedProject(prev => prev?.id === id ? { ...prev, status } : prev)
    } catch (e) {
      alert(e.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this project?')) return
    try {
      await deleteProject(id)
      setSelectedProject(null)
      loadProjects()
    } catch (e) {
      alert(e.message)
    }
  }

  const inp = { width: '100%', padding: '7px 10px', border: '1px solid #d0d0d0', borderRadius: '4px', fontSize: '13px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }
  const lbl = { fontSize: '12px', color: '#555', fontWeight: 500, display: 'block', marginBottom: '2px' }

  // Role badge color
  const roleBadge = {
    'GIS Junior Engineer':    { bg: '#e3f2fd', color: '#1565c0' },
    'GIS Assistant Engineer': { bg: '#f3e5f5', color: '#6a1b9a' },
    'GIS Senior Engineer':    { bg: '#e8f5e9', color: '#2e7d32' },
    'GIS Department Head':    { bg: '#fff3e0', color: '#e65100' },
    'System Manager':         { bg: '#fce4ec', color: '#880e4f' },
  }[role] || { bg: '#eee', color: '#333' }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Sidebar */}
      <div style={{ width: '320px', background: '#fff', borderRight: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header with user info */}
        <div style={{ padding: '14px 16px', background: '#1a3c5e', color: 'white' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>Internal GIS Portal</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '11px', opacity: 0.75 }}>{userInfo?.user}</div>
              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: roleBadge.bg, color: roleBadge.color, fontWeight: 700, marginTop: '3px', display: 'inline-block' }}>
                {role}
              </span>
            </div>
            <button onClick={onLogout} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>
              Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0' }}>
          {['map', 'projects'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: '10px', border: 'none',
              background: activeTab === tab ? '#eef3fa' : '#fff',
              color: activeTab === tab ? '#1a3c5e' : '#666',
              fontWeight: activeTab === tab ? 600 : 400, fontSize: '13px', cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid #1a3c5e' : '2px solid transparent',
            }}>
              {tab === 'map' ? (roleActions.canCreate ? 'Draw & Capture' : 'Map View') : `Projects (${projects.length})`}
            </button>
          ))}
        </div>

        {/* Draw tab */}
        {activeTab === 'map' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
            {!showForm ? (
              <div style={{ textAlign: 'center', padding: '30px 16px', color: '#888' }}>
                <div style={{ fontSize: '28px', marginBottom: '10px' }}>🗺️</div>
                {roleActions.canCreate ? (
                  <>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#555', marginBottom: '6px' }}>Draw a Polygon on the Map</div>
                    <div style={{ fontSize: '12px', lineHeight: '1.6' }}>Use the draw tool (top-left) to mark a project area.</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#555', marginBottom: '6px' }}>Review Mode</div>
                    <div style={{ fontSize: '12px', lineHeight: '1.6', color: '#888' }}>
                      As <strong>{role}</strong>, you can review and update the status of submitted projects. Click a polygon on the map.
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a3c5e', marginBottom: '12px' }}>New Project Details</div>

                {[
                  { label: 'Project Name *', key: 'name', placeholder: 'e.g. Ward 5 Road Repair' },
                  { label: 'Ward / Zone *', key: 'ward', placeholder: 'e.g. Ward 5' },
                  { label: 'Estimated Budget (₹)', key: 'budget', placeholder: 'e.g. 5,00,000' },
                  { label: 'Road Length / Area', key: 'road_length', placeholder: 'e.g. 500m or 2000 sqft' },
                  { label: 'Start Date', key: 'start_date', type: 'date' },
                  { label: 'Expected Completion', key: 'completion_date', type: 'date' },
                ].map(({ label, key, placeholder, type }) => (
                  <div key={key} style={{ marginBottom: '9px' }}>
                    <label style={lbl}>{label}</label>
                    <input type={type || 'text'} placeholder={placeholder} value={form[key]}
                      onChange={e => setForm({ ...form, [key]: e.target.value })} style={inp} />
                  </div>
                ))}

                <div style={{ marginBottom: '9px' }}>
                  <label style={lbl}>Project Type</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inp}>
                    {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                {[
                  { label: 'Description', key: 'description', rows: 2, placeholder: 'Describe the project...' },
                  { label: 'Contractor Details', key: 'contractor_details', rows: 2, placeholder: 'Contractor name, contact...' },
                  { label: 'Remarks', key: 'remarks', rows: 2, placeholder: 'Any additional remarks...' },
                ].map(({ label, key, rows, placeholder }) => (
                  <div key={key} style={{ marginBottom: '9px' }}>
                    <label style={lbl}>{label}</label>
                    <textarea placeholder={placeholder} value={form[key]} rows={rows}
                      onChange={e => setForm({ ...form, [key]: e.target.value })}
                      style={{ ...inp, resize: 'vertical' }} />
                  </div>
                ))}

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button onClick={handleSave} disabled={saving} style={{
                    flex: 1, padding: '9px', background: saving ? '#aaa' : '#1a3c5e',
                    color: 'white', border: 'none', borderRadius: '4px',
                    cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '13px',
                  }}>
                    {saving ? 'Saving...' : 'Save as Draft'}
                  </button>
                  <button onClick={handleCancel} style={{
                    flex: 1, padding: '9px', background: '#f5f5f5', color: '#555',
                    border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', fontSize: '13px',
                  }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Projects list tab */}
        {activeTab === 'projects' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {loading && <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: '13px' }}>Loading...</div>}
            {!loading && projects.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>No projects yet.</div>
            )}
            {projects.map(project => {
              const sc = STATUS_COLORS[project.status] || STATUS_COLORS.Draft
              return (
                <div key={project.id} onClick={() => { setSelectedProject(project); setActiveTab('map') }}
                  style={{ padding: '10px', marginBottom: '6px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{project.name}</div>
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{project.ward} • {project.type}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: sc.bg, color: sc.color, fontWeight: 600 }}>
                      {project.status}
                    </span>
                    <span style={{ fontSize: '10px', color: '#aaa' }}>{project.created_at?.slice(0, 10)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div ref={mapRef} style={{ height: '100%', width: '100%' }} />

        {/* Legend */}
        <div style={{ position: 'absolute', top: '10px', left: '50px', background: 'white', padding: '8px 12px', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 1000, fontSize: '11px' }}>
          {Object.keys(STATUS_COLORS).map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: POLYGON_COLORS[s] }} />
              <span style={{ color: '#555' }}>{s}</span>
            </div>
          ))}
        </div>

        {/* Project detail panel */}
        {selectedProject && activeTab === 'map' && (
          <div style={{ position: 'absolute', bottom: '20px', right: '20px', width: '300px', background: 'white', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 1000, overflow: 'hidden' }}>
            <div style={{ background: '#1a3c5e', color: 'white', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '13px' }}>{selectedProject.name}</span>
              <button onClick={() => setSelectedProject(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px' }}>×</button>
            </div>
            <div style={{ padding: '12px', fontSize: '12px', maxHeight: '320px', overflowY: 'auto' }}>
              {[
                ['Ward', selectedProject.ward],
                ['Type', selectedProject.type],
                ['Budget', selectedProject.budget ? `₹ ${selectedProject.budget}` : '-'],
                ['Road Length', selectedProject.road_length || '-'],
                ['Contractor', selectedProject.contractor_details || '-'],
                ['Start Date', selectedProject.start_date || '-'],
                ['Completion', selectedProject.completion_date || '-'],
                ['Description', selectedProject.description || '-'],
                ['Submitted By', selectedProject.submitted_by_role || '-'],
              ].map(([label, value]) => (
                <div key={label} style={{ marginBottom: '5px' }}>
                  <span style={{ color: '#888', fontWeight: 500 }}>{label}: </span>
                  <span>{value}</span>
                </div>
              ))}

              {/* Status badge */}
              <div style={{ marginTop: '8px' }}>
                <span style={{ color: '#888', fontWeight: 500 }}>Status: </span>
                <span style={{
                  fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600,
                  background: STATUS_COLORS[selectedProject.status]?.bg,
                  color: STATUS_COLORS[selectedProject.status]?.color,
                }}>
                  {selectedProject.status}
                </span>
              </div>

              {/* Role-based action buttons */}
              {roleActions.nextStatus?.length > 0 && (
                <div style={{ marginTop: '12px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Change Status:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {roleActions.nextStatus.filter(s => s !== selectedProject.status).map(s => (
                      <button key={s} onClick={() => handleStatusChange(selectedProject.id, s)} style={{
                        fontSize: '11px', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer',
                        background: STATUS_COLORS[s]?.bg, color: STATUS_COLORS[s]?.color,
                        border: `1px solid ${STATUS_COLORS[s]?.color}`, fontWeight: 600,
                      }}>
                        → {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Delete - only JE for Draft projects */}
              {(role === 'GIS Junior Engineer' || role === 'System Manager') && selectedProject.status === 'Draft' && (
                <button onClick={() => handleDelete(selectedProject.id)} style={{
                  marginTop: '8px', width: '100%', padding: '6px', fontSize: '12px',
                  background: '#fce4ec', color: '#c62828', border: '1px solid #c62828',
                  borderRadius: '4px', cursor: 'pointer', fontWeight: 600,
                }}>
                  Delete Project
                </button>
              )}
            </div>
          </div>
        )}

        {!showForm && roleActions.canCreate && (
          <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'white', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', color: '#555', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 1000 }}>
            Use polygon tool (top-left) to draw a project area
          </div>
      {/* Premium Custom Alert Modal */}
      {customAlert && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease'
        }}>
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes scaleUp {
              from { transform: scale(0.9); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }
            @keyframes bounceIn {
              0% { transform: scale(0.3); opacity: 0; }
              50% { transform: scale(1.05); }
              70% { transform: scale(0.9); }
              100% { transform: scale(1); opacity: 1; }
            }
          `}</style>
          <div style={{
            background: 'white',
            width: '420px',
            borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(226, 232, 240, 0.8)',
            padding: '28px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            transform: 'scale(1)',
            animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            {/* Animated Icon */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: customAlert.type === 'error' ? '#fef2f2' : '#f0fdf4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              color: customAlert.type === 'error' ? '#ef4444' : '#22c55e',
              boxShadow: customAlert.type === 'error' ? '0 0 0 8px #fee2e2' : '0 0 0 8px #dcfce7',
              animation: 'bounceIn 0.5s ease',
              fontWeight: 'bold'
            }}>
              {customAlert.type === 'error' ? '✕' : '✓'}
            </div>

            {/* Content */}
            <div style={{ marginTop: '8px' }}>
              <h3 style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: '700',
                color: '#0f172a',
                fontFamily: "'Outfit', 'Inter', sans-serif"
              }}>
                {customAlert.type === 'error' ? 'Operation Failed' : 'Success'}
              </h3>
              <p style={{
                margin: '8px 0 0 0',
                fontSize: '14px',
                color: '#64748b',
                lineHeight: '1.6',
                fontFamily: "'Inter', sans-serif"
              }}>
                {customAlert.message}
              </p>
            </div>

            {/* Action Button */}
            <button
              onClick={() => setCustomAlert(null)}
              style={{
                width: '100%',
                padding: '12px 24px',
                borderRadius: '14px',
                border: 'none',
                background: customAlert.type === 'error' ? '#ef4444' : '#1a73e8',
                color: 'white',
                fontWeight: '600',
                fontSize: '14px',
                cursor: 'pointer',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                transition: 'all 0.2s',
                fontFamily: "'Inter', sans-serif"
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.9'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              Okay
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
