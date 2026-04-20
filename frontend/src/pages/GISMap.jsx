import { useEffect, useRef, useState, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import { fetchProjects, createProject, updateStatus, deleteProject, updateGeometry, fetchNearbyPlaces, searchExternalLocations } from '../api'

// Color palette for dynamic layers
const DYNAMIC_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#d35400', 
  '#27ae60', '#2980b9', '#8e44ad', '#f1c40f', '#c0392b'
]

const getLayerColor = (type, index) => DYNAMIC_COLORS[index % DYNAMIC_COLORS.length]

const STATUS_COLORS = {
  Draft:     { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  Submitted: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  Approved:  { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  Rejected:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
}

const ROLE_ACTIONS = {
  'GIS Junior Engineer':    { canCreate: true,  nextStatus: ['Submitted'] },
  'GIS Assistant Engineer': { canCreate: true,  nextStatus: ['Approved', 'Rejected'] },
  'GIS Senior Engineer':    { canCreate: true,  nextStatus: ['Approved', 'Rejected'] },
  'GIS Department Head':    { canCreate: true,  nextStatus: ['Approved', 'Rejected'] },
  'System Manager':         { canCreate: true,  nextStatus: ['Draft', 'Submitted', 'Approved', 'Rejected'] },
}

const EMPTY_FORM = {
  name: '', road_name: '', ward: '', type: 'Road Construction', description: '',
  budget: '', road_length: '', contractor_details: '',
  start_date: '', completion_date: '', remarks: '',
  road_no: '', road_type: '', pave_type: '', landmark: '', 
  authority: '', traffic: '', width: '', shape_length: '',
  unp_name: '', unp_type: ''
}

export default function GISMap({ userInfo }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const drawnLayersRef = useRef(null)
  const nearbyLayersRef = useRef(null)
  const layerGroupsRef = useRef({})
  const [projects, setProjects] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [pendingGeometry, setPendingGeometry] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  // UI panels
  const [showLayers, setShowLayers] = useState(true)
  const [showAttributeTable, setShowAttributeTable] = useState(false)
  const [attrFilter, setAttrFilter] = useState('')
  const [selectedLayerStats, setSelectedLayerStats] = useState(null)
  const [isEditingShape, setIsEditingShape] = useState(false)
  const [mouseCoords, setMouseCoords] = useState({ lat: 0, lng: 0 })
  const [mapZoom, setMapZoom] = useState(13)
  const [showSideResults, setShowSideResults] = useState(false)

  // Nearby POI state
  const [nearbyPOIs, setNearbyPOIs] = useState([])
  const [nearbyRadius, setNearbyRadius] = useState(1000)
  const [nearbyType, setNearbyType] = useState('')
  const [isSearchingNearby, setIsSearchingNearby] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [externalResults, setExternalResults] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null) // For external geocoded locations
  const [activeTab, setActiveTab] = useState('Explore')
  const [recentProjects, setRecentProjects] = useState(() => {
    try {
      const saved = localStorage.getItem('gis_recentProjects')
      return saved ? JSON.parse(saved) : []
    } catch (e) {
      return []
    }
  })
  const [mapMode, setMapMode] = useState(localStorage.getItem('gis_mapMode') || 'default')
  const [layerVisibility, setLayerVisibility] = useState(() => {
    try {
      const saved = localStorage.getItem('gis_layerVisibility')
      return saved ? JSON.parse(saved) : {}
    } catch (e) {
      return {}
    }
  })

  // Derived dynamic project types
  const dynamicProjectTypes = Array.from(new Set(projects.map(p => p.type))).sort()
  
  // Initialize visibility for new types
  useEffect(() => {
    setLayerVisibility(prev => {
        const next = { ...prev }
        dynamicProjectTypes.forEach(t => {
            if (next[t] === undefined) next[t] = true
        })
        return next
    })
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('gis_mapMode', mapMode)
  }, [mapMode]);

  useEffect(() => {
    localStorage.setItem('gis_layerVisibility', JSON.stringify(layerVisibility))
  }, [layerVisibility])

  const role = userInfo?.role || ''
  const roleActions = ROLE_ACTIONS[role] || {}

  const loadProjects = () => {
    setLoading(true)
    fetchProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadProjects() }, []);

  useEffect(() => {
    localStorage.setItem('gis_recentProjects', JSON.stringify(recentProjects.slice(0, 10)))
  }, [recentProjects]);

  // Track recents when project selected
  useEffect(() => {
    if (selectedProject) {
      setRecentProjects(prev => {
        const filtered = prev.filter(p => p.id === selectedProject.id)
        if (filtered.length > 0) return prev
        return [selectedProject, ...prev].slice(0, 10)
      })
    }
  }, [selectedProject]);

  const projectsToDisplay = useMemo(() => {
    if (activeTab === 'Saved') return projects.filter(p => p.status === 'Approved')
    if (activeTab === 'Recents') return recentProjects
    return projects
  }, [activeTab, projects, recentProjects]);

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !map._baseLayers) return
    Object.values(map._baseLayers).forEach(l => map.removeLayer(l))
    const selected = map._baseLayers[mapMode] || map._baseLayers.standard
    selected.addTo(map)
  }, [mapMode])

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current) return
    if (mapInstanceRef.current) return

    const map = L.map(mapRef.current, { zoomControl: false }).setView([23.2599, 77.4126], 13)
    mapInstanceRef.current = map

    const layers = {
      standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }),
      satellite: L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { attribution: '© Google' }),
      terrain: L.tileLayer('https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', { attribution: '© Google' })
    }
    
    mapInstanceRef.current._baseLayers = layers
    const initialLayer = layers[mapMode] || layers.standard
    initialLayer.addTo(map)

    const drawnItems = new L.FeatureGroup()
    drawnLayersRef.current = drawnItems
    map.addLayer(drawnItems)

    const nearbyItems = new L.FeatureGroup()
    nearbyLayersRef.current = nearbyItems
    map.addLayer(nearbyItems)

    if (roleActions.canCreate) {
      const drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
          polygon: { 
            allowIntersection: false, 
            showArea: true, 
            shapeOptions: { color: '#1a73e8', fillOpacity: 0.3, weight: 3 } 
          },
          polyline: { 
            shapeOptions: { color: '#1a73e8', weight: 4 },
            showLength: true
          },
          rectangle: { shapeOptions: { color: '#1a73e8' } },
          circle: false,
          marker: { icon: new L.Icon.Default() },
          circlemarker: false,
        },
        edit: { 
          featureGroup: drawnItems,
          remove: true
        },
      })
      map.addControl(drawControl)

      map.on(L.Draw.Event.CREATED, (e) => {
        const { layer } = e
        drawnItems.addLayer(layer)
        let coords = extractCoords(layer)
        setPendingGeometry(coords)
        setForm({ ...EMPTY_FORM, type: 'Road Construction' })
        setShowForm(true)
      })

      // When vertices are edited or deleted using Leaflet Draw tools
      const updateCoords = () => {
        const layer = drawnItems.getLayers()[0]
        if (layer) setPendingGeometry(extractCoords(layer))
      }
      map.on(L.Draw.Event.EDITED, updateCoords)
    }

    map.on('mousemove', (e) => {
      setMouseCoords({ lat: e.latlng.lat.toFixed(6), lng: e.latlng.lng.toFixed(6) })
    })
    map.on('zoomend', () => setMapZoom(map.getZoom()))

    function extractCoords(layer) {
      if (layer instanceof L.Polygon) {
        return layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng])
      } else if (layer instanceof L.Polyline) {
        return layer.getLatLngs().map(ll => [ll.lat, ll.lng])
      }
      return []
    }

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [roleActions.canCreate])

  // Sync projects to map
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    // Cleanup and re-init feature groups for any dynamic types
    Object.values(layerGroupsRef.current).forEach(g => g.clearLayers())
    dynamicProjectTypes.forEach(t => {
      if (!layerGroupsRef.current[t]) {
        layerGroupsRef.current[t] = L.featureGroup().addTo(map)
      }
    })

    projectsToDisplay.forEach(p => {
      if (!p.coordinates?.length) return
      
      // Visibility check
      if (layerVisibility[p.type] === false) return;

      const idx = dynamicProjectTypes.indexOf(p.type)
      const color = getLayerColor(p.type, idx)
      const isLine = p.geom_type?.includes('LineString')
      const isPoint = p.geom_type?.includes('Point') && !p.geom_type?.includes('Multi')

      let layer;
      if (isPoint) {
         layer = L.circleMarker(p.coordinates, { radius: 6, color, fillColor: color, fillOpacity: 0.8, weight: 2 })
      } else if (isLine) {
         layer = L.polyline(p.coordinates, { color, weight: 6, opacity: 0.8 })
      } else {
         layer = L.polygon(p.coordinates, { color, fillOpacity: 0.3, weight: 2 })
      }
      
      layer.bindTooltip(`<b>${p.name}</b><br/>${p.type}<br/>Status: ${p.status}`, { sticky: true })
      layer.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        setSelectedProject(p)
        setSelectedLayerStats(null) 
      })
      
      const group = layerGroupsRef.current[p.type]
      if (group) group.addLayer(layer)
    })
  }, [projectsToDisplay, layerVisibility])

  const handleLayerClick = (layerName) => {
    const layerProjects = projects.filter(p => p.type === layerName)
    if (layerProjects.length === 0) return

    const stats = {
      name: layerName,
      count: layerProjects.length,
      statusBreakdown: {},
      totalBudget: 0
    }

    layerProjects.forEach(p => {
      stats.statusBreakdown[p.status] = (stats.statusBreakdown[p.status] || 0) + 1
      const num = parseFloat(String(p.budget).replace(/[^0-9.]/g, '')) || 0
      stats.totalBudget += num
    })

    setSelectedLayerStats(stats)
    setSelectedProject(null) // Ensure we show Layer Stats, not a specific Feature
    const group = layerGroupsRef.current[layerName]
    if (group && mapInstanceRef.current) {
      const bounds = group.getBounds()
      if (bounds.isValid()) mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] })
    }
  }

  const handleSave = async () => {
    if (!form.name || !pendingGeometry) return
    setSaving(true)
    try {
      await createProject({ ...form, coordinates: pendingGeometry })
      loadProjects()
      setShowForm(false)
      setPendingGeometry(null)
      drawnLayersRef.current?.clearLayers()
    } catch (e) {
      alert('Save failed: ' + e.message)
    } finally { setSaving(false) }
  }

  const handleDeleteProject = async (id) => {
    if (!confirm(`Are you sure you want to delete "${selectedProject.name}"?`)) return
    try {
      await deleteProject(id)
      loadProjects()
      setSelectedProject(null)
    } catch (e) {
      alert('Delete failed: ' + e.message)
    }
  }

  const handleUpdateStatus = async (id, status) => {
    try {
      await updateStatus(id, status)
      loadProjects()
      setSelectedProject(prev => prev ? { ...prev, status } : null)
    } catch (e) {
      alert('Update failed: ' + e.message)
    }
  }

  const handleStartEditingShape = () => {
    if (!selectedProject || !mapInstanceRef.current) return
    setIsEditingShape(true)
    
    // Clear current drawing group
    drawnLayersRef.current?.clearLayers()
    
    // 1. Create editable layer and add to DRAW group
    const isLine = selectedProject.geom_type?.includes('LineString')
    const layer = isLine 
      ? L.polyline(selectedProject.coordinates, { color: '#1a73e8', weight: 6, opacity: 0.6 })
      : L.polygon(selectedProject.coordinates, { color: '#1a73e8', fillOpacity: 0.3, weight: 3 })
    
    drawnLayersRef.current?.addLayer(layer)
    setPendingGeometry(selectedProject.coordinates)
    
    // 2. Enable Edit Mode automatically
    if (layer.editing) layer.editing.enable()
    
    // 3. Zoom to it
    mapInstanceRef.current.fitBounds(layer.getBounds(), { padding: [50, 50] })
  }

  const handleCancelEditing = () => {
    setIsEditingShape(false)
    setPendingGeometry(null)
    drawnLayersRef.current?.clearLayers()
  }

  const handleSaveModifiedShape = async () => {
    if (!selectedProject || !drawnLayersRef.current) return
    
    // Extract current coordinates from the map layer
    const layer = drawnLayersRef.current.getLayers()[0]
    if (!layer) return

    const currentCoords = extractCoords(layer)
    setSaving(true)
    try {
      await updateGeometry(selectedProject.id, currentCoords)
      loadProjects()
      setIsEditingShape(false)
      drawnLayersRef.current?.clearLayers()
    } catch (e) {
      alert('Update failed: ' + e.message)
    } finally { setSaving(false) }
  }

  const handleManualUpload = async (file) => {
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    setSaving(true)
    try {
      const response = await fetch('/api/method/qgis.api.gis_project.upload_manual_data', {
        method: 'POST',
        headers: { 'X-Frappe-CSRF-Token': 'fetch' },
        credentials: 'include',
        body: formData,
      })
      const data = await response.json()
      if (data.message?.success) {
        alert('File processed successfully')
        loadProjects()
      } else {
        alert('Upload failed: ' + (data.message?.error || 'Unknown error'))
      }
    } catch (e) { alert('Error: ' + e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    try {
      await deleteProject(id)
      setSelectedProject(null)
      loadProjects()
    } catch (e) { alert(e.message) }
  }

  const handleStatusUpdate = async (newStatus) => {
    if (!selectedProject) return
    try {
      await updateStatus(selectedProject.id, newStatus)
      loadProjects()
      const updated = { ...selectedProject, status: newStatus }
      setSelectedProject(updated)
    } catch (e) { alert(e.message) }
  }

  const handleSearchNearby = async () => {
    if (!selectedProject || !selectedProject.coordinates?.length) return
    
    // Helper to flatten nested coordinates
    const flatten = (coords) => {
       if (typeof coords[0] === 'number') return [coords]
       return coords.reduce((acc, val) => acc.concat(Array.isArray(val[0]) ? flatten(val) : [val]), [])
    }
    
    let center;
    const flatCoords = flatten(selectedProject.coordinates)
    if (flatCoords.length > 0) {
       const lats = flatCoords.map(c => c[0])
       const lngs = flatCoords.map(c => c[1])
       center = [
         (Math.min(...lats) + Math.max(...lats)) / 2,
         (Math.min(...lngs) + Math.max(...lngs)) / 2
       ]
    } else {
       center = [0, 0]
    }

    if (isNaN(center[0]) || isNaN(center[1])) {
       alert('Invalid coordinates for search.')
       return
    }

    setIsSearchingNearby(true)
    nearbyLayersRef.current?.clearLayers()
    
    try {
      const data = await fetchNearbyPlaces(center[0], center[1], nearbyRadius, nearbyType)
      if (data.success) {
        setNearbyPOIs(data.results)
        
        data.results.forEach(poi => {
           const icon = L.divIcon({
              html: `<div style="background:white; border:2px solid #2563eb; border-radius:50%; width:30px; height:30px; display:flex; alignItems:center; justifyContent:center; font-size:16px; box-shadow:0 2px 4px rgba(0,0,0,0.2)">${
                 poi.type === 'hospital' ? '🏥' : 
                 poi.type === 'school' ? '🎓' : 
                 poi.type === 'place_of_worship' ? '🛕' : 
                 poi.type === 'police' ? '👮' : 
                 poi.type === 'bank' ? '💰' : '📍'
              }</div>`,
              className: '',
              iconSize: [30, 30],
              iconAnchor: [15, 15]
           })

           const marker = L.marker([poi.lat, poi.lng], { icon })
              .bindPopup(`
                 <div style="font-family:sans-serif; min-width:150px">
                    <div style="font-weight:800; color:#1e2d45; border-bottom:1px solid #eee; padding-bottom:4px; margin-bottom:4px">${poi.name}</div>
                    <div style="font-size:11px; color:#64748b; margin-bottom:4px">Type: <b>${poi.type}</b></div>
                    <div style="font-size:11px; color:#475569; line-height:1.4">${poi.address}</div>
                 </div>
              `)
              .addTo(nearbyLayersRef.current)
        })

        if (data.results.length > 0) {
           const bounds = nearbyLayersRef.current.getBounds()
           mapInstanceRef.current?.fitBounds(bounds, { padding: [40, 40] })
        } else {
           alert('No results found for this area and type.')
        }
      } else {
        alert('Search failed: ' + data.error)
      }
    } catch (e) {
      alert('Error searching nearby: ' + e.message)
    } finally {
      setIsSearchingNearby(false)
    }
  }
  // External Search Debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchTerm.length >= 3) {
        const results = await searchExternalLocations(searchTerm)
        setExternalResults(results)
      } else {
        setExternalResults([])
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const handleSearch = (term) => {
    const val = term || searchTerm
    if (!val) return
    
    setIsSearchFocused(false)
    
    // 1. Search internally first
    const matched = projects.filter(p => 
      p.name.toLowerCase().includes(val.toLowerCase()) || 
      p.road_name?.toLowerCase().includes(val.toLowerCase()) ||
      p.ward?.toString().includes(val)
    )
    
    // In G-Maps, hitting Enter opens the best result in detail view
    if (matched.length > 0) {
       const bestMatch = matched[0]
       setSelectedProject(bestMatch)
       setSelectedLocation(null)
       setShowSideResults(false)
       setSearchTerm(bestMatch.name)
       mapInstanceRef.current?.setView(bestMatch.coordinates[0] || bestMatch.coordinates, 17)
    } else if (externalResults.length > 0) {
       // 2. Fallback to external geocoding best match
       const loc = externalResults[0]
       setSelectedLocation(loc)
       setSelectedProject(null)
       setShowSideResults(false)
       setSearchTerm(loc.display_name.split(',')[0])
       mapInstanceRef.current?.setView([loc.lat, loc.lon], 13)
    }
  }

  const handleSelectExternal = (loc) => {
    setSelectedLocation(loc)
    setSelectedProject(null)
    setShowSideResults(false)
    setSearchTerm(loc.display_name.split(',')[0])
    mapInstanceRef.current?.setView([loc.lat, loc.lon], 15)
  }

  const inp = { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', marginBottom: '10px' }
  const lbl = { fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }

  const tableHeaderStyle = { padding: '10px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 700, color: '#475569', textAlign: 'left', position: 'sticky', top: 0, zIndex: 10 }
  const tableCellStyle = { padding: '10px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#1e293b' }

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', background: '#e5e7eb', overflow: 'hidden', position: 'relative' }}>
      
      {/* 1. EXTREME LEFT MINI-SIDEBAR (GOOGLE STYLE) */}
      <div style={{ width: '72px', background: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '15px 0', gap: '15px', zIndex: 1100 }}>
         <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid #e2e8f0' }}>☰</div>
         <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', flex: 1 }}>
            {[
               { i: '📍', l: 'Explore' },
               { i: '🔖', l: 'Saved' },
               { i: '🕒', l: 'Recents' }
            ].map(item => (
               <div key={item.l} onClick={() => { setActiveTab(item.l); setShowSideResults(true); setSelectedProject(null); setSelectedLocation(null); }} style={{ textAlign: 'center', cursor: 'pointer', opacity: activeTab === item.l ? 1 : 0.6 }}>
                  <div style={{ fontSize: '20px', color: activeTab === item.l ? '#1a73e8' : '#64748b' }}>{item.i}</div>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: activeTab === item.l ? '#1a73e8' : '#64748b', marginTop: '4px' }}>{item.l}</div>
               </div>
            ))}
         </div>

            {[
               { id: 'standard', l: 'Default', img: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=80' },
               { id: 'satellite', l: 'Satellite', img: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=80' },
               { id: 'terrain', l: 'Terrain', img: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=80' }
            ].map(type => (
               <div key={type.id} onClick={() => setMapMode(type.id)} style={{ cursor: 'pointer', textAlign: 'center', marginBottom: '15px' }}>
                  <div style={{ width: '46px', height: '46px', borderRadius: '10px', overflow: 'hidden', border: mapMode === type.id ? '2px solid #1a73e8' : '1px solid #eee', margin: '0 auto', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                     <img src={type.img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ fontSize: '9px', marginTop: '4px', fontWeight: mapMode === type.id ? 700 : 500, color: mapMode === type.id ? '#1a73e8' : '#64748b' }}>{type.l}</div>
               </div>
            ))}

            <div onClick={() => setShowLayers(!showLayers)} style={{ textAlign: 'center', cursor: 'pointer', marginBottom: '10px' }}>
               <div style={{ fontSize: '20px', color: showLayers ? '#1a73e8' : '#64748b' }}>⚙️</div>
               <div style={{ fontSize: '9px', fontWeight: 600, color: showLayers ? '#1a73e8' : '#64748b' }}>Layers</div>
            </div>

            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px' }}>S</div>
         </div>

      {/* 2. SIDEBAR SYSTEM (RESULTS OR DETAILS) */}
      <div style={{ width: (showSideResults || selectedProject || selectedLocation) ? '408px' : '0', background: 'white', borderRight: (showSideResults || selectedProject || selectedLocation) ? '1px solid #e2e8f0' : 'none', display: 'flex', flexDirection: 'column', zIndex: 1001, boxShadow: '2px 0 10px rgba(0,0,0,0.05)', position: 'relative', transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)', overflow: 'hidden' }}>
         <div style={{ width: '408px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            
            {/* A. DYNAMIC LIST VIEW (Explore / Saved / Recents) */}
            {(showSideResults && !selectedProject && !selectedLocation) && (
               <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '24px 20px', borderBottom: '1px solid #f1f3f4' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: 600 }}>
                           {activeTab === 'Explore' ? (searchTerm ? 'Search Results' : 'Explore Projects') : `${activeTab} Projects`}
                        </div>
                        <button onClick={() => setShowSideResults(false)} style={{ border: 'none', background: '#f8f9fa', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}>✕</button>
                     </div>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
                     {projectsToDisplay.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#70757a' }}>
                           <div style={{ fontSize: '40px', marginBottom: '10px' }}>📁</div>
                           <div style={{ fontSize: '14px' }}>No records found in {activeTab}.</div>
                        </div>
                     ) : (
                        projectsToDisplay.map(p => (
                           <div key={'list-'+p.id} onClick={() => { setSelectedProject(p); setShowSideResults(false); mapInstanceRef.current?.setView(p.coordinates[0] || p.coordinates, 17); }} style={{ padding: '12px 20px', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <div style={{ display: 'flex', gap: '15px' }}>
                                 <div style={{ fontSize: '20px' }}>📍</div>
                                 <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 500, fontSize: '14px', color: '#202124' }}>{p.name}</div>
                                    <div style={{ fontSize: '13px', color: '#70757a' }}>{p.type} • Ward {p.ward}</div>
                                    <div style={{ marginTop: '4px', fontSize: '10px', display: 'inline-block', padding: '2px 6px', borderRadius: '4px', background: STATUS_COLORS[p.status]?.bg, color: STATUS_COLORS[p.status]?.color, fontWeight: 700 }}>{p.status.toUpperCase()}</div>
                                 </div>
                              </div>
                           </div>
                        ))
                     )}
                     
                     {activeTab === 'Explore' && externalResults.map((loc, idx) => (
                        <div key={'ext-list-'+idx} onClick={() => handleSelectExternal(loc)} style={{ padding: '12px 20px', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                           <div style={{ display: 'flex', gap: '15px' }}>
                              <div style={{ fontSize: '20px' }}>🌏</div>
                              <div>
                                 <div style={{ fontWeight: 500, fontSize: '14px' }}>{loc.display_name.split(',')[0]}</div>
                                 <div style={{ fontSize: '12px', color: '#70757a' }}>{loc.display_name}</div>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            )}

            {/* B. DETAIL VIEW SIDEBAR (THE GOOGLE MAPS LOOK) */}
            {(selectedProject || selectedLocation) && (
               <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {/* Hero Image */}
                  <div style={{ position: 'relative', width: '100%', height: '240px', background: '#e8eaed', overflow: 'hidden' }}>
                     <img 
                        src={selectedProject ? "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&h=240" : "https://images.unsplash.com/photo-1595841696677-5264379a0937?auto=format&fit=crop&w=400&h=240"} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        alt="Location"
                     />
                     <button onClick={() => { setSelectedProject(null); setSelectedLocation(null); }} style={{ position: 'absolute', top: '16px', right: '16px', borderRadius: '50%', width: '36px', height: '36px', background: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>✕</button>
                  </div>

                  <div style={{ padding: '24px 20px', flex: 1, overflowY: 'auto' }}>
                     {/* Title Section */}
                     <div style={{ marginBottom: '16px' }}>
                        <h1 style={{ fontSize: '24px', fontWeight: 500, color: '#202124', marginBottom: '4px' }}>
                           {selectedProject ? selectedProject.name : selectedLocation?.display_name.split(',')[0]}
                        </h1>
                        <div style={{ fontSize: '14px', color: '#70757a' }}>
                           {selectedProject ? `${selectedProject.type} • Ward ${selectedProject.ward}` : selectedLocation?.display_name}
                        </div>
                     </div>

                     {/* Action Buttons (The Circular Blue ones) */}
                     <div style={{ display: 'flex', gap: '24px', paddingBottom: '24px', borderBottom: '1px solid #f1f3f4', marginBottom: '24px' }}>
                        {[
                           { l: 'Directions', i: '↪️' },
                           { l: 'Save', i: '🔖' },
                           { l: 'Nearby', i: '🧭' },
                           { l: 'Send to phone', i: '📱' },
                           { l: 'Share', i: '🔗' }
                        ].map(act => (
                           <div key={act.l} style={{ textAlign: 'center', cursor: 'pointer', flex: 1 }}>
                              <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #dadce0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', color: '#1a73e8', fontSize: '18px' }}>
                                 {act.i}
                              </div>
                              <div style={{ fontSize: '11px', color: '#1a73e8', fontWeight: 500 }}>{act.l}</div>
                           </div>
                        ))}
                     </div>

                     {/* Info List */}
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                           <span style={{ fontSize: '18px' }}>📍</span>
                           <div style={{ fontSize: '14px', color: '#3c4043' }}>{selectedProject ? selectedProject.road_name : (selectedLocation?.display_name || 'Bhopal Central Area')}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                           <span style={{ fontSize: '18px' }}>🏢</span>
                           <div style={{ fontSize: '14px', color: '#3c4043' }}>{selectedProject ? `Contractor: ${selectedProject.contractor_details || 'City Council'}` : 'Municipal Corporation of Bhopal'}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                           <span style={{ fontSize: '18px' }}>📊</span>
                           <div style={{ fontSize: '14px', color: '#1a73e8', fontWeight: 600, cursor: 'pointer' }}>View GIS Attributes Table</div>
                        </div>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                           <span style={{ fontSize: '18px' }}>📅</span>
                           <div style={{ fontSize: '14px', color: '#3c4043' }}>Updated {selectedProject ? selectedProject.created_at.split(' ')[0] : 'Just now'}</div>
                        </div>
                     </div>

                     {/* Description / Quick Facts */}
                     <div style={{ marginTop: '30px', padding: '20px 0', borderTop: '8px solid #f1f3f4' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Quick facts</h3>
                        <p style={{ fontSize: '14px', color: '#3c4043', lineHeight: '1.6' }}>
                           {selectedProject 
                              ? `This project is part of the urban development initiative in ${selectedProject.ward}. It focuses on ${selectedProject.type.toLowerCase()} to improve resident accessibility and infrastructure quality.` 
                              : "Bhopal is a city in the central Indian state of Madhya Pradesh. It's one of India's greenest cities. There are two main lakes, the Upper Lake and the Lower Lake. On the banks of the Upper Lake is Van Vihar National Park."
                           }
                        </p>
                        <div style={{ color: '#1a73e8', fontSize: '13px', fontWeight: 600, marginTop: '8px', cursor: 'pointer' }}>View More ›</div>
                     </div>
                  </div>
               </div>
            )}
         </div>
      </div>

      {/* 3. MAIN MAP AREA */}
      <div style={{ flex: 1, position: 'relative' }}>
         <div ref={mapRef} style={{ height: '100%', width: '100%' }} />

         {/* 4. SEARCH BAR PANEL (MODERNIZED) */}
         <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 1000, width: '408px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ 
               background: 'white', 
               padding: '0 16px', 
               borderRadius: isSearchFocused && (searchTerm || externalResults.length > 0) ? '8px 8px 0 0' : '8px', 
               boxShadow: '0 2px 4px rgba(0,0,0,0.2), 0 -1px 0px rgba(0,0,0,0.02)', 
               display: 'flex', 
               alignItems: 'center', 
               height: '48px',
               transition: 'all 0.2s',
               borderBottom: (isSearchFocused && (searchTerm || externalResults.length > 0)) ? '1px solid #f1f3f4' : 'none'
            }}>
               <button onClick={() => setShowSideResults(!showSideResults)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#5f6368', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '100%' }}>☰</button>
               <input 
                  type="text" 
                  placeholder="Search Google Maps" 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onFocus={() => { setIsSearchFocused(true); setShowSideResults(false); }}
                  onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  style={{ border: 'none', outline: 'none', flex: 1, fontSize: '16px', color: '#202124', background: 'transparent', marginLeft: '4px' }} 
               />
               <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '100%' }}>
                  {searchTerm && (
                     <button onClick={() => setSearchTerm('')} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#70757a', padding: '0 8px', height: '100%' }}>✕</button>
                  )}
                  <div style={{ width: '1px', height: '28px', background: '#e8eaed', margin: '0 8px' }} />
                  <button onClick={() => handleSearch()} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#5f6368', padding: '0 8px', height: '100%' }}>🔍</button>
                  <button onClick={() => setShowForm(true)} title="Add GIS Project" style={{ border: 'none', background: '#1a73e8', color: 'white', fontWeight: 600, fontSize: '12px', padding: '0 12px', borderRadius: '4px', height: '32px', cursor: 'pointer', marginLeft: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                     + NEW
                  </button>
               </div>
            </div>

            {/* INSTANT DROPDOWN (GOOGLE STYLE) */}
            {(isSearchFocused && (searchTerm || externalResults.length > 0)) && (
               <div style={{ 
                  background: 'white', 
                  borderRadius: '0 0 8px 8px', 
                  boxShadow: '0 8px 16px rgba(0,0,0,0.15)', 
                  overflow: 'hidden', 
                  maxHeight: 'calc(100vh - 80px)',
                  marginTop: '0',
                  animation: 'fadeIn 0.1s ease-out'
               }}>
                  <div style={{ padding: '8px 0', overflowY: 'auto', maxHeight: '400px' }}>
                     {projects.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 3).map(p => (
                        <div key={'inst-s-'+p.id} onClick={() => { setSelectedProject(p); setSearchTerm(p.name); setIsSearchFocused(false); mapInstanceRef.current?.setView(p.coordinates[0] || p.coordinates, 17); }} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = '#f1f3f4'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                           <div style={{ fontSize: '18px', color: '#1a73e8', width: '24px', textAlign: 'center' }}>📍</div>
                           <div style={{ fontSize: '14px', color: '#202124', fontWeight: 500 }}>{p.name}</div>
                        </div>
                     ))}
                     {externalResults.map((loc, idx) => (
                        <div key={'inst-ext-'+idx} onClick={() => handleSelectExternal(loc)} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = '#f1f3f4'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                           <div style={{ fontSize: '18px', color: '#9aa0a6', width: '24px', textAlign: 'center' }}>🌏</div>
                           <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '14px', color: '#202124', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.display_name.split(',')[0]}</div>
                              <div style={{ fontSize: '12px', color: '#70757a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.display_name}</div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            )}
         </div>

         {/* 5. TOP CATEGORY CHIPS */}
         <div style={{ position: 'absolute', top: '16px', left: '420px', zIndex: 1000, display: 'flex', gap: '8px', alignItems: 'center', overflowX: 'auto', maxWidth: 'calc(100% - 100px)', paddingRight: '20px' }}>
             {[
                { l: 'State', v: 'state', i: '🇮🇳' },
                { l: 'District', v: 'district', i: '🏙️' },
                { l: 'City', v: 'city', i: '🏛️' },
                { l: 'Area', v: 'area', i: '🏘️' },
                { l: 'Roads', v: 'roads', i: '🛣️' },
             ].map(chip => (
                <button 
                   key={chip.v} 
                   onClick={() => { setSearchTerm(chip.l + ' '); setIsSearchFocused(true); }} 
                   style={{ whiteSpace: 'nowrap', padding: '0 14px', background: 'white', border: '1px solid #dadce0', borderRadius: '20px', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px', height: '32px', cursor: 'pointer', color: '#3c4043', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                   <span style={{ fontSize: '16px' }}>{chip.i}</span> {chip.l}
                </button>
             ))}
         </div>

         {/* 5. PLACE CARD (DETAILS PANEL) */}
         {selectedProject && (
            <div className="animate-slide" style={{ position: 'absolute', left: '12px', top: '70px', bottom: '12px', zIndex: 1001, width: '392px', background: 'white', borderTopLeftRadius: '0', borderBottomLeftRadius: '8px', borderTopRightRadius: '8px', borderBottomRightRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
               <div style={{ height: '220px', position: 'relative', background: getLayerColor(selectedProject.type, dynamicProjectTypes.indexOf(selectedProject.type)) }}>
                  <button onClick={() => setSelectedProject(null)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'rgba(255,255,255,0.9)', border: 'none', width: '28px', height: '28px', borderRadius: '50%', color: '#5f6368', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>✕</button>
                  <div style={{ position: 'absolute', bottom: '0', left: '0', right: '0', padding: '20px', background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}>
                     <h2 style={{ color: 'white', margin: 0, fontSize: '24px', fontWeight: 400 }}>{selectedProject.name}</h2>
                     <div style={{ color: 'white', fontSize: '14px', opacity: 0.9 }}>{selectedProject.type}</div>
                  </div>
               </div>

               <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                  <div style={{ display: 'flex', gap: '15px', marginBottom: '25px', borderBottom: '1px solid #e8eaed', paddingBottom: '20px' }}>
                     <div style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }} onClick={() => mapInstanceRef.current?.setView(selectedProject.coordinates[0] || selectedProject.coordinates, 17)}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #dadce0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 5px', color: '#1a73e8' }}>📍</div>
                        <div style={{ fontSize: '11px', color: '#1a73e8', fontWeight: 500 }}>Directions</div>
                     </div>
                     <div style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #dadce0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 5px', color: '#1a73e8' }}>🔖</div>
                        <div style={{ fontSize: '11px', color: '#1a73e8', fontWeight: 500 }}>Save</div>
                     </div>
                     <div style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #dadce0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 5px', color: '#1a73e8' }}>📱</div>
                        <div style={{ fontSize: '11px', color: '#1a73e8', fontWeight: 500 }}>Send to phone</div>
                     </div>
                     <div style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #dadce0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 5px', color: '#1a73e8' }}>↗️</div>
                        <div style={{ fontSize: '11px', color: '#1a73e8', fontWeight: 500 }}>Share</div>
                     </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                     <div style={{ display: 'flex', gap: '15px' }}>
                        <div style={{ color: '#70757a', fontSize: '20px' }}>🏛️</div>
                        <div style={{ fontSize: '14px', color: '#202124' }}>Ward {selectedProject.ward}, {selectedProject.road_name || 'Bhopal'}</div>
                     </div>
                     <div style={{ display: 'flex', gap: '15px' }}>
                        <div style={{ color: '#70757a', fontSize: '20px' }}>💰</div>
                        <div style={{ fontSize: '14px', color: '#202124', fontWeight: 500 }}>Budget: ₹ {selectedProject.budget}</div>
                     </div>
                     <div style={{ display: 'flex', gap: '15px' }}>
                        <div style={{ color: '#70757a', fontSize: '20px' }}>🕒</div>
                        <div style={{ fontSize: '14px', color: '#16a34a', fontWeight: 500 }}>Status: {selectedProject.status}</div>
                     </div>
                  </div>

                  {/* Main Action Buttons */}
                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px', marginBottom: '15px' }}>
                     {!isEditingShape ? (
                        <button onClick={handleStartEditingShape} style={{ flex: 1, padding: '12px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                           ✏️ Edit Geometry
                        </button>
                     ) : (
                        <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                           <button onClick={handleSaveModifiedShape} disabled={saving} style={{ flex: 2, padding: '12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                              {saving ? 'Saving...' : '✅ Save New Shape'}
                           </button>
                           <button onClick={handleCancelEditing} style={{ flex: 1, padding: '12px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2', borderRadius: '24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                              ✕ Cancel
                           </button>
                        </div>
                     )}
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                     <button onClick={() => handleDeleteProject(selectedProject.id)} style={{ flex: 1, padding: '8px', background: '#fff', color: '#d93025', border: '1px solid #dadce0', borderRadius: '20px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>🗑️ Delete Project</button>
                  </div>

                  {/* Status Workflow Buttons */}
                  {roleActions.nextStatus?.length > 0 && (
                     <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                        {roleActions.nextStatus.map(st => (
                           <button key={st} onClick={() => handleStatusUpdate(st)} style={{ padding: '6px 12px', background: STATUS_COLORS[st]?.bg || '#f1f1f1', color: STATUS_COLORS[st]?.color || '#333', border: `1px solid ${STATUS_COLORS[st]?.border || '#ddd'}`, borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                              MARK AS {st.toUpperCase()}
                           </button>
                        ))}
                     </div>
                  )}

                  <div style={{ marginTop: '30px' }}>
                     <button onClick={handleSearchNearby} style={{ width: '100%', padding: '12px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 500, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                        See Nearby Schools & Hospitals
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* 6. FLOATING ACTION BUTTONS (BOTTOM RIGHT) */}
         <div style={{ position: 'absolute', bottom: '30px', right: '12px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={() => mapInstanceRef.current?.locate({setView: true, maxZoom: 16})} title="My Location" style={{ width: '40px', height: '40px', borderRadius: '4px', background: 'white', border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', cursor: 'pointer', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎯</button>
            <div style={{ display: 'flex', flexDirection: 'column', borderRadius: '4px', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
               <button onClick={() => mapInstanceRef.current?.zoomIn()} style={{ width: '40px', height: '40px', background: 'none', border: 'none', borderBottom: '1px solid #eee', cursor: 'pointer', fontSize: '20px', color: '#5f6368' }}>+</button>
               <button onClick={() => mapInstanceRef.current?.zoomOut()} style={{ width: '40px', height: '40px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#5f6368' }}>-</button>
            </div>
         </div>

         {/* 7. DATA TABLE (BOTTOM FULL WIDTH) */}
         {showAttributeTable && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '350px', background: 'white', zIndex: 1100, boxShadow: '0 -4px 12px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
               <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f3f4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '15px' }}>Infrastructure Attribute Data</span>
                  <button onClick={() => setShowAttributeTable(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#5f6368' }}>✕</button>
               </div>
               <div style={{ flex: 1, overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                     <thead>
                        <tr>
                            <th style={tableHeaderStyle}>ID</th>
                            <th style={tableHeaderStyle}>ROAD NAME</th>
                            <th style={tableHeaderStyle}>TYPE</th>
                            <th style={tableHeaderStyle}>WARD</th>
                            <th style={tableHeaderStyle}>ROAD NO</th>
                            <th style={tableHeaderStyle}>LANDMARK</th>
                            <th style={tableHeaderStyle}>DMA NO</th>
                            <th style={tableHeaderStyle}>WARD NO</th>
                            <th style={tableHeaderStyle}>WIDTH</th>
                            <th style={tableHeaderStyle}>LENGTH</th>
                            <th style={tableHeaderStyle}>AUTHOR</th>
                            <th style={tableHeaderStyle}>ACTIONS</th>
                        </tr>
                     </thead>
                     <tbody>
                        {projects.map(p => (
                           <tr key={p.id} style={{ borderBottom: '1px solid #f1f3f4' }}>
                              <td style={tableCellStyle}>{p.id}</td>
                              <td style={tableCellStyle}><b>{p.road_name || p.name}</b></td>
                              <td style={tableCellStyle}>{p.type}</td>
                              <td style={tableCellStyle}>{p.ward}</td>
                              <td style={tableCellStyle}>{p.road_no || '-'}</td>
                              <td style={tableCellStyle}>{p.landmark || '-'}</td>
                              <td style={tableCellStyle}>{p.dma_no || '-'}</td>
                              <td style={tableCellStyle}>{p.ward_no || '-'}</td>
                              <td style={tableCellStyle}>{p.width || '-'}</td>
                              <td style={tableCellStyle}>{p.road_length || '-'}</td>
                              <td style={tableCellStyle}>{p.owner || 'System'}</td>
                              <td style={tableCellStyle}>
                                 <button onClick={() => { setSelectedProject(p); mapInstanceRef.current?.setView(p.coordinates[0] || p.coordinates, 16) }} style={{ padding: '4px 12px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>View</button>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
         )}

         {/* 6. GOOGLE STYLE LAYER SWITCHER (BOTTOM LEFT) */}
         <div style={{ position: 'absolute', bottom: '24px', left: '24px', zIndex: 1000, display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
            <div 
               style={{ 
                  width: '64px', 
                  height: '64px', 
                  borderRadius: '12px', 
                  border: '2px solid white', 
                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)', 
                  cursor: 'pointer', 
                  overflow: 'hidden', 
                  position: 'relative',
                  background: 'white',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
               }}
               onMouseEnter={e => {
                  e.currentTarget.style.width = '240px'
                  e.currentTarget.style.height = '80px'
               }}
               onMouseLeave={e => {
                  e.currentTarget.style.width = '64px'
                  e.currentTarget.style.height = '64px'
               }}
            >
               <div style={{ display: 'flex', height: '100%', padding: '4px', gap: '8px' }}>
                  {[
                     { id: 'standard', l: 'Default', img: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=72&h=72' },
                     { id: 'satellite', l: 'Satellite', img: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=72&h=72' },
                     { id: 'terrain', l: 'Terrain', img: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=72&h=72' }
                  ].map(m => (
                     <div 
                        key={m.id} 
                        onClick={(e) => {
                           e.stopPropagation();
                           setMapMode(m.id);
                        }}
                        style={{ 
                           flexShrink: 0,
                           width: '72px', 
                           height: '100%', 
                           borderRadius: '8px', 
                           position: 'relative',
                           overflow: 'hidden',
                           border: mapMode === m.id ? '2px solid #1a73e8' : '1px solid #dadce0',
                           cursor: 'pointer'
                        }}
                     >
                        <img src={m.img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={m.l} />
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '10px', textAlign: 'center', padding: '2px 0', fontWeight: 600 }}>
                           {m.l}
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         </div>
      </div>

      <input type="file" id="manual-upload" hidden onChange={(e) => handleManualUpload(e.target.files[0])} />

      {/* 8. FORM OVERLAY (GOOGLE MATERIAL DESIGN) */}
      {showForm && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(32,33,36,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000 }}>
          <div style={{ width: '520px', background: 'white', borderRadius: '8px', boxShadow: '0 12px 15px rgba(0,0,0,0.24)', padding: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px' }}>
               <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 500 }}>Create New Infrastructure Record</h3>
               <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#5f6368' }}>✕</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <input style={{...inp, height: '40px'}} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Feature ID..." />
                  <input style={{...inp, height: '40px'}} value={form.road_name} onChange={e => setForm({...form, road_name: e.target.value})} placeholder="Street/Area Name..." />
               </div>
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <input style={{...inp, height: '40px'}} value={form.ward} onChange={e => setForm({...form, ward: e.target.value})} placeholder="Ward Number..." />
                  <select style={{...inp, height: '40px'}} value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                    {['Road Construction', 'Drainage Work', 'Water Pipeline', 'Street Lights'].map(t => <option key={t}>{t}</option>)}
                  </select>
               </div>
               <textarea style={{ ...inp, height: '80px', padding: '10px' }} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Add remarks or description..." />
            </div>
            
            <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
               <button onClick={() => setShowForm(false)} style={{ padding: '10px 20px', background: 'none', color: '#1a73e8', border: 'none', fontWeight: 500, cursor: 'pointer' }}>CANCEL</button>
               <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 500, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                 {saving ? 'SAVING...' : 'SAVE PROJECT'}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
