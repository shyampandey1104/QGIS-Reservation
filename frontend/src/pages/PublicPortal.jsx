import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchApprovedProjects } from '../api'

const TYPE_COLORS = {
  'Road Construction':    '#e74c3c',
  'Drainage Work':        '#3498db',
  'Water Pipeline':       '#2ecc71',
  'Other Infrastructure': '#f39c12',
}

const STATUS_COLORS = {
  Draft:                 { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  Submitted:             { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  Approved:              { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  Rejected:              { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  'Pending for Request': { bg: '#fef3c7', color: '#d97706', border: '#fde68a' },
  'Work Started':        { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  Ongoing:               { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  'On Hold':             { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  Hold:                  { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  'Near Completion':     { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  Completed:             { bg: '#dcfce7', color: '#14532d', border: '#86efac' }, // Dark Green
}

export default function PublicPortal() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const layerGroupRef = useRef(null)

  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchApprovedProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (mapInstanceRef.current) return
    const map = L.map(mapRef.current).setView([23.2599, 77.4126], 14)
    mapInstanceRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)
    layerGroupRef.current = L.layerGroup().addTo(map)
  }, [])

  const filteredProjects = projects.filter(p => {
    const matchType = filter === 'All' || p.type === filter
    const matchSearch = !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.ward?.toLowerCase().includes(search.toLowerCase()) ||
      p.type?.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  useEffect(() => {
    const group = layerGroupRef.current
    if (!group) return
    group.clearLayers()

    filteredProjects.forEach((project) => {
      const color = TYPE_COLORS[project.type] || '#999'
      const polygon = L.polygon(project.coordinates, {
        color, fillColor: color, fillOpacity: 0.35, weight: 2,
      })
      polygon.bindTooltip(project.name, { sticky: true })
      polygon.on('click', () => setSelectedProject(project))
      group.addLayer(polygon)
    })
  }, [filteredProjects])

  // Fly to project on click from list
  const handleProjectClick = (project) => {
    setSelectedProject(project)
    const map = mapInstanceRef.current
    if (map && project.coordinates?.length > 0) {
      const bounds = L.latLngBounds(project.coordinates)
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }

  const types = ['All', ...new Set(projects.map(p => p.type).filter(Boolean))]

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Sidebar */}
      <div style={{ width: '300px', background: '#fff', borderRight: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div style={{ padding: '16px', background: '#1a3c5e', color: 'white' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>Public GIS Portal</div>
          <div style={{ fontSize: '11px', opacity: 0.8 }}>Approved Municipal Projects</div>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee' }}>
          <input
            type="text"
            placeholder="Search by name, ward, type..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '7px 10px', border: '1px solid #d0d0d0',
              borderRadius: '6px', fontSize: '13px', outline: 'none', boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Filter by type */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '5px' }}>Filter by Type</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {types.map(t => (
              <button key={t} onClick={() => setFilter(t)} style={{
                fontSize: '11px', padding: '3px 10px', borderRadius: '12px',
                border: '1px solid #ccc',
                background: filter === t ? '#1a3c5e' : '#f5f5f5',
                color: filter === t ? 'white' : '#333', cursor: 'pointer',
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '5px' }}>Legend</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '12px', height: '12px', background: color, borderRadius: '2px', flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: '#555' }}>{type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Project count */}
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #eee', fontSize: '11px', color: '#888' }}>
          {loading ? 'Loading...' : `${filteredProjects.length} project${filteredProjects.length !== 1 ? 's' : ''} found`}
        </div>

        {/* Project list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {!loading && filteredProjects.length === 0 && (
            <div style={{ padding: '30px 16px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>
              No approved projects found.
            </div>
          )}
          {filteredProjects.map(project => (
            <div key={project.id} onClick={() => handleProjectClick(project)} style={{
              padding: '10px', marginBottom: '6px', borderRadius: '6px', cursor: 'pointer',
              border: `1px solid ${selectedProject?.id === project.id ? '#1a3c5e' : '#e0e0e0'}`,
              background: selectedProject?.id === project.id ? '#eef3fa' : '#fff',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: TYPE_COLORS[project.type] || '#999', flexShrink: 0, marginTop: '3px' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{project.name}</div>
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{project.ward} • {project.type}</div>
                  {project.budget && (
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>₹ {project.budget}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div ref={mapRef} style={{ height: '100%', width: '100%' }} />

        {/* Project detail panel */}
        {selectedProject && (
          <div style={{
            position: 'absolute', bottom: '20px', right: '20px', width: '300px',
            background: 'white', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            zIndex: 1000, overflow: 'hidden'
          }}>
            <div style={{
              background: TYPE_COLORS[selectedProject.type] || '#1a3c5e',
              color: 'white', padding: '10px 14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>{selectedProject.name}</div>
                <div style={{ fontSize: '11px', opacity: 0.85 }}>{selectedProject.type}</div>
              </div>
              <button onClick={() => setSelectedProject(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: '12px', fontSize: '12px', maxHeight: '300px', overflowY: 'auto' }}>
              {[
                ['Ward / Zone', selectedProject.ward],
                ['Estimated Budget', selectedProject.budget ? `₹ ${selectedProject.budget}` : null],
                ['Road Length / Area', selectedProject.road_length],
                ['Start Date', selectedProject.start_date],
                ['Expected Completion', selectedProject.completion_date],
                ['Description', selectedProject.description],
                ['Contractor', selectedProject.contractor_details],
                ['Remarks', selectedProject.remarks],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label} style={{ marginBottom: '7px', paddingBottom: '7px', borderBottom: '1px solid #f5f5f5' }}>
                  <div style={{ color: '#888', fontSize: '11px', marginBottom: '2px' }}>{label}</div>
                  <div style={{ color: '#333', lineHeight: '1.4' }}>{value}</div>
                </div>
              ))}
              {(() => {
                const sc = STATUS_COLORS[selectedProject.status] || STATUS_COLORS.Approved;
                return (
                  <div style={{
                    display: 'inline-block',
                    marginTop: '4px',
                    fontSize: '11px',
                    padding: '3px 10px',
                    borderRadius: '10px',
                    background: sc.bg,
                    color: sc.color,
                    border: `1px solid ${sc.border || 'transparent'}`,
                    fontWeight: 600
                  }}>
                    {selectedProject.status || 'Approved'}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
