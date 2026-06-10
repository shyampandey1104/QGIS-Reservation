import { useEffect, useRef, useState, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import { fetchProjects, createProject, deleteProject, manualUpload, updateCustomAttributes, submitWorkOrder, addTimelineEntry } from '../api'

const STATUS_COLORS = {
  Draft:                 { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  Submitted:             { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  Approved:              { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  Rejected:              { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  'Pending for Request': { bg: '#fef3c7', color: '#d97706', border: '#fde68a' },
  'Work Started':        { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  Ongoing:               { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  'On Hold':             { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  Hold:                  { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green (legacy key)
  'Near Completion':     { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  Completed:             { bg: '#dcfce7', color: '#14532d', border: '#86efac' }, // Dark Green
}

const LAYER_META = {
  Chambers_Manhole: { color: '#e74c3c' },
  Drainage: { color: '#3498db' },
  Pipeline_Network: { color: '#2ecc71' },
  Railway_Underpass: { color: '#f39c12' },
  Raw_Water_Station: { color: '#9b59b6' },
  Road: { color: '#2c3e50' },
  Road_Bridge: { color: '#1abc9c' },
  Road_Flyover: { color: '#16a085' },
  Road_Underpass: { color: '#d35400' },
  Sewage_Treatment_Plant: { color: '#7f8c8d' },
  Sewer_Pipeline_Network: { color: '#c0392b' },
  Sewerage_Collection_Point: { color: '#2980b9' },
  Storage_Tank: { color: '#27ae60' },
  Treatment_Plant: { color: '#f1c40f' },
  Water_Source: { color: '#8e44ad' }
}

const cleanCoords = (coords) => {
  if (!Array.isArray(coords)) return null;
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return [coords[0], coords[1]];
  }
  const cleaned = coords.map(cleanCoords).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

const STANDARD_KEYS = ['id', 'name', 'type', 'ward', 'status', 'road_name', 'road_no', 'road_type', 'pave_type', 'landmark', 'authority', 'traffic', 'width', 'shape_length', 'unp_name', 'unp_type', 'dma_no', 'ward_no', 'junc_name', 'facility', 'rail_route', 'bridg_name', 'bridg_type', 'fly_name', 'description', 'remarks', 'coordinates', 'color', 'geom_type', 'created_at', 'modified', 'owner', 'docstatus', 'approver', 'custom_attributes', 'timeline', 'stages'];

export default function GISMap({ userInfo, requestTrigger, liveFilterActive, setLiveFilterActive }) {
  const mapRef = useRef(null)
  const fileInputRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const mainGroupRef = useRef(null)
  const drawnLayersRef = useRef(null)
  const drawControlRef = useRef(null)
  const categoryGroupsRef = useRef({}) // Store groups by type: { 'Road': L.FeatureGroup, ... }

  const [projects, setProjects] = useState(() => {
    const cached = localStorage.getItem('gis_projects_light');
    if (cached) {
      try { return JSON.parse(cached); } catch(e) {}
    }
    return [];
  })
  const [showLayers, setShowLayers] = useState(false)
  const [mapMode, setMapMode] = useState('satellite')
  const [layerVisibility, setLayerVisibility] = useState(() => {
    const saved = localStorage.getItem('gis_layer_vis');
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return {};
  })
  
  useEffect(() => {
    localStorage.setItem('gis_layer_vis', JSON.stringify(layerVisibility));
  }, [layerVisibility]);

  const [selectedProject, setSelectedProject] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [showInitiatePopup, setShowInitiatePopup] = useState(false)
  const [initiateComment, setInitiateComment] = useState('')
  const [initiateAttachment, setInitiateAttachment] = useState(null)
  const [initiateApprover, setInitiateApprover] = useState('')
  const [activeStatusFilter, setActiveStatusFilter] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [customAlert, setCustomAlert] = useState(null)
  const [showStatusTimelinePopup, setShowStatusTimelinePopup] = useState(false)
  const [timelineStatus, setTimelineStatus] = useState('Work Started')
  const [timelineDate, setTimelineDate] = useState(() => new Date().toISOString().split('T')[0])
  const [timelineComment, setTimelineComment] = useState('')
  const [existingTimelineImages, setExistingTimelineImages] = useState([])
  const [newTimelineImages, setNewTimelineImages] = useState([])
  const [selectedJourneyStep, setSelectedJourneyStep] = useState(null)

  useEffect(() => {
    setSelectedJourneyStep(null);
  }, [selectedProject?.id]);

  const loadTimelineStageData = (status) => {
    setTimelineStatus(status);
    const existingEntry = selectedProject?.timeline?.find(t => t.status === status);
    if (existingEntry) {
      setTimelineDate(existingEntry.date || new Date().toISOString().split('T')[0]);
      setTimelineComment(existingEntry.comment || '');
      setExistingTimelineImages(existingEntry.images || (existingEntry.image ? [existingEntry.image] : []));
    } else {
      setTimelineDate(new Date().toISOString().split('T')[0]);
      setTimelineComment('');
      setExistingTimelineImages([]);
    }
    setNewTimelineImages([]);
  };

  const alert = (message, type = 'success') => {
    let alertType = type;
    const msgLower = String(message).toLowerCase();
    if (msgLower.includes('failed') || msgLower.includes('error') || msgLower.includes('missing') || msgLower.includes('exception')) {
      alertType = 'error';
    }
    setCustomAlert({ type: alertType, message: String(message) });
  };

  const isLayerVisible = (type) => {
    // Return explicit visibility flag; default to false if not set
    return !!layerVisibility[type];
  };

  const [drawnCoordinates, setDrawnCoordinates] = useState(null)
  const [drawnGeomType, setDrawnGeomType] = useState('Polygon')
  const [selectedColor, setSelectedColor] = useState('#1a73e8')

  const [showAddField, setShowAddField] = useState(false)
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldValue, setNewFieldValue] = useState('')

  // Optimized: Pre-calculate counts to avoid O(N) filtering in every render
  const projectCounts = useMemo(() => {
    const counts = {}
    projects.forEach(p => {
      counts[p.type] = (counts[p.type] || 0) + 1
    })
    return counts
  }, [projects])

  useEffect(() => {
    if (requestTrigger > 0) setShowForm(true)
  }, [requestTrigger])

  const dynamicProjectTypes = useMemo(() => {
    return Array.from(new Set(projects.map(p => p.type).filter(Boolean))).sort()
  }, [projects])

  const loadProjects = async (overrideStatus) => {
    const statusToFetch = overrideStatus !== undefined ? overrideStatus : activeStatusFilter;
    try {
      let isFullLoaded = false;
      
      // 1. Fetch lightweight project metadata first for instant sidebar rendering
      fetchProjects(statusToFetch, null, true).then(lightweightData => {
        if (!isFullLoaded && lightweightData) {
          const parsedLightweight = lightweightData.map(p => ({
            ...p,
            coordinates: p.coordinates || []
          }));
          setProjects(parsedLightweight);
          try {
            const tinyCache = parsedLightweight.map(p => ({ type: p.type, status: p.status }));
            localStorage.setItem('gis_projects_light', JSON.stringify(tinyCache));
          } catch(err) {
            console.warn("Storage quota exceeded, skipping cache.");
          }
        }
      }).catch(e => console.error("Lightweight load failed:", e));

      // 2. Fetch full projects with geometry to draw on map
      const data = await fetchProjects(statusToFetch)
      const parsedData = (data || []).map(p => {
        let coords = p.coordinates
        if (typeof coords === 'string') {
          try { coords = JSON.parse(coords) } catch (e) { coords = [] }
        }
        return { ...p, coordinates: cleanCoords(coords) }
      }).filter(p => p.coordinates)
      
      isFullLoaded = true;
      setProjects(parsedData);
    } catch (e) { console.error(e) }
  }

  useEffect(() => { loadProjects() }, [])

  useEffect(() => {
    if (projects.length > 0) {
      const uniqueTypes = Array.from(new Set(projects.map(p => p.type)));
      setLayerVisibility(prev => {
        const updated = { ...prev };
        let changed = false;
        uniqueTypes.forEach(type => {
          if (updated[type] === undefined) {
            updated[type] = false;
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
    }
  }, [projects]);

  useEffect(() => {
    if (liveFilterActive !== undefined) {
      const liveStatuses = 'Pending for Request,Approved,Submitted';
      const newFilter = liveFilterActive ? liveStatuses : null;
      setActiveStatusFilter(newFilter);
      loadProjects(newFilter);
    }
  }, [liveFilterActive])

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      zoomControl: false,
      doubleClickZoom: false,
      renderer: L.canvas({ padding: 0.5 }) // SIGNIFICANT PERFORMANCE BOOST for 10k+ features
    }).setView([19.25, 72.85], 12)
    mapInstanceRef.current = map

    const layers = {
      standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }),
      satellite: L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { attribution: '© Google' }),
      terrain: L.tileLayer('https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', { attribution: '© Google' })
    }
    layers.standard.addTo(map)
    mapInstanceRef.current._baseLayers = layers

    mainGroupRef.current = L.featureGroup().addTo(map)
    drawnLayersRef.current = L.featureGroup().addTo(map)

    const drawControl = new L.Control.Draw({
      position: 'topright',
      edit: {
        featureGroup: drawnLayersRef.current,
        remove: true,
        allowIntersection: true
      },
      draw: {
        polygon: {
          allowIntersection: true,
          showArea: true,
          guidelineDistance: 15,
          shapeOptions: { color: '#1a73e8', fillColor: '#1a73e8', fillOpacity: 0.65, weight: 4, clickable: true }
        },
        polyline: {
          metric: true,
          showLength: true,
          shapeOptions: { color: '#1a73e8', weight: 5, opacity: 0.9 }
        },
        rectangle: {
          allowIntersection: true,
          shapeOptions: { color: '#1a73e8', fillColor: '#1a73e8', fillOpacity: 0.65, weight: 4 }
        },
        circle: false, circlemarker: false,
        marker: {
          icon: L.divIcon({
            className: 'custom-div-icon',
            html: `<div style='background-color:#1a73e8; width:14px; height:14px; border-radius:50%; border:3px solid white; box-shadow:0 0 10px rgba(0,0,0,0.3)'></div>`,
            iconSize: [14, 14], iconAnchor: [7, 7]
          })
        }
      }
    })
    // We don't add the drawControl toolbar to the map to keep the UI extremely clean,
    // but we still keep it in reference so we can use its drawing options programmatically!
    // map.addControl(drawControl)
    drawControlRef.current = drawControl

    map.on(L.Draw.Event.CREATED, (e) => {
      const layer = e.layer
      drawnLayersRef.current.addLayer(layer)

      let coords = []
      if (e.layerType === 'marker') {
        const latlng = layer.getLatLng()
        coords = [[latlng.lat, latlng.lng]]
      } else {
        const lls = layer.getLatLngs()
        const flat = Array.isArray(lls[0]) ? lls[0] : lls
        coords = flat.map(ll => [ll.lat, ll.lng])

        // Auto-close Polygons if not already closed
        if (e.layerType === 'polygon' || e.layerType === 'rectangle') {
          if (coords.length > 2) {
            const first = coords[0]
            const last = coords[coords.length - 1]
            if (first[0] !== last[0] || first[1] !== last[1]) {
              coords.push([first[0], first[1]])
            }
          }
        }
      }

      setDrawnGeomType(e.layerType === 'marker' ? 'Point' : e.layerType === 'polyline' ? 'LineString' : 'Polygon')
      setDrawnCoordinates(coords)
      setShowForm(true)
    })

    map.on(L.Draw.Event.EDITED, async (e) => {
      const layers = e.layers
      layers.eachLayer(async (layer) => {
        // If it's an existing project, it should have a custom ID property
        if (layer.projectId) {
          let coords = []
          if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
            coords = [[layer.getLatLng().lat, layer.getLatLng().lng]]
          } else {
            const extractCoords = (item) => {
              if (Array.isArray(item)) return item.map(extractCoords);
              return item ? [item.lat, item.lng] : null;
            };
            coords = extractCoords(layer.getLatLngs());
          }
          try {
            await updateGeometry(layer.projectId, coords)
            alert("Geometry updated successfully!")
            loadProjects()
          } catch (err) { alert("Update failed: " + err.message) }
        }
      })
    })

    map.on(L.Draw.Event.DELETED, async (e) => {
      const layers = e.layers
      layers.eachLayer(async (layer) => {
        if (layer.projectId) {
          if (window.confirm("Delete this project from database?")) {
            try {
              await deleteProject(layer.projectId)
              loadProjects()
            } catch (err) { alert("Delete failed: " + err.message) }
          }
        }
      })
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // Sync Base Layers
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !map._baseLayers) return
    Object.values(map._baseLayers).forEach(l => map.removeLayer(l))
    const selected = map._baseLayers[mapMode] || map._baseLayers.standard
    selected.addTo(map)
  }, [mapMode])

  // REFACTORED: Organize layers into groups by category for instant toggling
  useEffect(() => {
    const map = mapInstanceRef.current
    const mainGroup = mainGroupRef.current
    if (!map || !mainGroup) return

    // 1. Clear existing category groups from mainGroup and the ref
    Object.values(categoryGroupsRef.current).forEach(group => mainGroup.removeLayer(group))
    categoryGroupsRef.current = {}

    if (projects.length === 0) return;
    categoryGroupsRef.current = {}

    // 2. Create new groups for each project type
    const sortedProjects = [...projects].sort((a, b) => {
      const score = { 'Draft': 1, 'Correction': 2, 'Pending for Request': 3, 'Submitted': 4, 'Approved': 5 };
      return (score[a.status] || 0) - (score[b.status] || 0);
    });
    sortedProjects.forEach(p => {
      if (!categoryGroupsRef.current[p.type]) {
        categoryGroupsRef.current[p.type] = L.featureGroup()
      }

      let color = p.color || '#1a73e8'
      if (p.status === 'Pending for Request') {
        color = '#f97316' // Vibrant Orange for pending features
      } else {
        const isDefaultColor = !p.color || p.color.toLowerCase() === '#1a73e8' || p.color.toLowerCase() === '#2563eb' || p.color.toLowerCase() === '#2c3e50';
        if (isDefaultColor) {
          if (p.status === 'Completed') {
            color = '#14532d' // Dark Green for completed
          } else if (['Submitted', 'Approved', 'Work Started', 'Ongoing', 'On Hold', 'Hold', 'Near Completion'].includes(p.status)) {
            color = '#16a34a' // Green for approved & all post-approval statuses
          }
        }
      }
      let layer;
      if (!p.coordinates || p.coordinates.length === 0) return;
      try {
        const isClosedLoop = () => {
          let coords = p.coordinates;
          if (!Array.isArray(coords) || coords.length === 0) return false;

          // If it is a double-nested coordinate array (e.g. GeoJSON polygon ring), extract the outer ring
          if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
            coords = coords[0];
          }

          if (coords.length >= 4) {
            const first = coords[0];
            const last = coords[coords.length - 1];
            if (first && last && typeof first[0] === 'number' && typeof last[0] === 'number') {
              return Math.abs(first[0] - last[0]) < 0.005 && Math.abs(first[1] - last[1]) < 0.005;
            }
          }
          return false;
        };

        if (p.geom_type?.toLowerCase().includes('point')) {
          const pt = typeof p.coordinates[0] === 'number' ? p.coordinates : p.coordinates[0];
          layer = L.circleMarker(pt, { radius: 6, color: '#fff', fillColor: color, fillOpacity: 0.9, weight: 2 })
        } else if ((p.geom_type?.toLowerCase().includes('line') || p.geom_type?.toLowerCase().includes('string')) && !isClosedLoop()) {
          layer = L.polyline(p.coordinates, { color, weight: 5, opacity: 0.8 })
        } else {
          layer = L.polygon(p.coordinates, { color, fillColor: color, fillOpacity: 0.85, weight: 3 })
        }

        layer.projectId = p.id
        layer.bindTooltip(p.name, { sticky: true }).on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          setSelectedProject(p)
        })

        categoryGroupsRef.current[p.type].addLayer(layer)
      } catch (e) { console.error("Layer error:", e) }
    })

    // 3. Add groups to the map based on initial visibility
    Object.keys(categoryGroupsRef.current).forEach(type => {
      if (isLayerVisible(type)) {
        mainGroup.addLayer(categoryGroupsRef.current[type])
      }
    })
  }, [projects]) // Only rebuild when data actually changes

  // REFACTORED: Instant toggle without rebuilding the world
  useEffect(() => {
    const mainGroup = mainGroupRef.current
    if (!mainGroup) return

    Object.keys(categoryGroupsRef.current).forEach(type => {
      const group = categoryGroupsRef.current[type]
      const shouldBeVisible = isLayerVisible(type)

      if (group) {
        if (shouldBeVisible && !mainGroup.hasLayer(group)) {
          mainGroup.addLayer(group)
        } else if (!shouldBeVisible && mainGroup.hasLayer(group)) {
          mainGroup.removeLayer(group)
        }
      }
    })
  }, [layerVisibility])

  const handleSave = async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const data = Object.fromEntries(formData.entries())

    // Explicitly check for color
    const finalColor = selectedColor || '#1a73e8'

    try {
      await createProject({
        ...data,
        ward: data.ward || "N/A",
        coordinates: drawnCoordinates || [],
        type: data.project_type,
        color: data.color || selectedColor,
        geom_type: drawnGeomType
      })
      alert("Successfully saved! Color: " + finalColor)
      setShowForm(false); setDrawnCoordinates(null); setDrawnGeomType('Polygon');
      drawnLayersRef.current.clearLayers()
      loadProjects()
    } catch (err) {
      alert("Save failed: " + err.message)
    }
  }

  const handleFitAll = () => {
    if (mainGroupRef.current && mapInstanceRef.current) {
      const bounds = mainGroupRef.current.getBounds()
      if (bounds.isValid()) mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] })
    }
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setUploadProgress(10) // Start at 10% exactly like user screenshot!

    // Simulate smooth progress
    let progress = 10;
    const interval = setInterval(() => {
      if (progress < 90) {
        progress += Math.floor(Math.random() * 8) + 2;
        if (progress > 90) progress = 90;
        setUploadProgress(progress);
      } else if (progress < 98) {
        progress += 1;
        setUploadProgress(progress);
      }
    }, 250);

    try {
      const res = await manualUpload(file)
      clearInterval(interval);
      setUploadProgress(100);
      setTimeout(() => {
        alert(res.message || "Upload successful")
        loadProjects()
        setUploadProgress(null);
      }, 500);
    } catch (err) {
      clearInterval(interval);
      setUploadProgress(null);
      alert(err.message)
    } finally {
      setUploading(false);
      e.target.value = ''
    }
  }

  const handleDrawPolygon = () => {
    if (mapInstanceRef.current && drawControlRef.current) {
      drawnLayersRef.current.clearLayers();
      setDrawnCoordinates(null);

      const polygonDrawer = new L.Draw.Polygon(
        mapInstanceRef.current,
        drawControlRef.current.options.draw.polygon
      );
      polygonDrawer.enable();
    }
  }


  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', background: '#f0f2f5' }}>
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".zip,.geojson,.kml,.gpkg" onChange={handleUpload} />

      {/* New Entry Modal */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', width: '500px', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '20px', background: '#1a73e8', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>New GIS Entry</h3>
              <button onClick={() => { setShowForm(false); setDrawnCoordinates(null); drawnLayersRef.current.clearLayers(); }} style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input type="hidden" name="color" value={selectedColor} />
              <div><label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Project Name *</label><input name="name" required style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }} /></div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Category *</label>
                <select name="project_type" defaultValue="Road" required style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}>
                  {Object.keys(LAYER_META).map(k => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '8px', fontSize: '12px', color: '#666', border: '1px dashed #ccc', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>🎨 Selected Style:</span>
                  <div style={{ width: '40px', height: '15px', background: selectedColor, borderRadius: '4px', border: '1px solid #ddd' }}></div>
                  <span style={{ fontWeight: 'bold', color: '#333' }}>{selectedColor}</span>
                </div>
                <div>📍 {drawnCoordinates ? `${drawnCoordinates.length} points captured (${drawnGeomType})` : "Please draw on map first."}</div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button type="button" onClick={() => { setShowForm(false); setDrawnCoordinates(null); drawnLayersRef.current.clearLayers(); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ddd', background: 'white' }}>Cancel</button>
                <button type="submit" disabled={!drawnCoordinates} style={{ flex: 2, padding: '12px', borderRadius: '8px', border: 'none', background: drawnCoordinates ? '#1a73e8' : '#ccc', color: 'white', fontWeight: 'bold' }}>Save Feature</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sidebar - only visible in GIS Map mode, not in Live Project mode */}
      {!liveFilterActive && <div style={{ width: showLayers ? '320px' : '0', height: '100%', background: 'white', borderRight: '1px solid #e0e0e0', transition: 'width 0.3s ease', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1001 }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><h3 style={{ margin: 0, fontSize: '18px' }}>Map Layers</h3></div>
          <button onClick={handleFitAll} style={{ padding: '6px 12px', background: '#e8f0fe', border: 'none', borderRadius: '15px', color: '#1a73e8', fontSize: '12px', cursor: 'pointer' }}>🔍 Fit All</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
          {dynamicProjectTypes.map(type => {
            const count = projectCounts[type] || 0
            const meta = LAYER_META[type] || { color: '#ccc' }
            return (
              <div key={type} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '15px', borderBottom: '1px solid #f9f9f9' }}>
                <input type="checkbox" checked={isLayerVisible(type)} onChange={e => setLayerVisibility({ ...layerVisibility, [type]: e.target.checked })} />
                <div style={{ flex: 1 }}><div style={{ fontSize: '14px', fontWeight: '500' }}>{type}</div><div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}><div style={{ width: '20px', height: '3px', background: meta.color }} /><span style={{ fontSize: '11px', color: '#888' }}>{count} features</span></div></div>
              </div>
            )
          })}
        </div>
      </div>}

      {/* Map Content Area */}
      <div style={{ flex: 1, position: 'relative', height: '100%' }}>
        <div style={{ position: 'absolute', top: '20px', left: '20px', right: '20px', zIndex: 1000, display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'white', borderRadius: '25px', padding: '5px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', flex: 1, maxWidth: '450px', alignItems: 'center' }}>
            <button onClick={() => setShowLayers(!showLayers)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', marginRight: '10px' }}>☰</button>
            <input placeholder="Search Maps" style={{ border: 'none', padding: '10px', flex: 1, outline: 'none' }} />
          </div>
          {!liveFilterActive && (uploadProgress === null ? (
            <button onClick={() => fileInputRef.current.click()} disabled={uploading} style={{ background: '#34a853', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', opacity: uploading ? 0.7 : 1 }}>↑ UPLOAD</button>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: '#04a777',
              borderRadius: '30px',
              height: '42px',
              padding: '4px',
              minWidth: '240px',
              boxShadow: '0 4px 12px rgba(4, 167, 119, 0.25)',
              animation: 'fadeIn 0.2s ease',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              {/* Percentage label */}
              <div style={{
                color: 'white',
                fontWeight: '800',
                fontSize: '14px',
                padding: '0 12px 0 16px',
                fontFamily: "'Inter', sans-serif",
                minWidth: '55px',
                textAlign: 'center'
              }}>
                {uploadProgress}%
              </div>

              {/* Progress track */}
              <div style={{
                flex: 1,
                height: '32px',
                border: '3px solid white',
                borderRadius: '20px',
                overflow: 'hidden',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                marginRight: '4px'
              }}>
                {/* Progress fill */}
                <div style={{
                  width: `${uploadProgress}%`,
                  height: '100%',
                  background: 'white',
                  borderRadius: '16px',
                  transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}></div>
              </div>
            </div>
          ))}
          {!liveFilterActive && <button onClick={handleDrawPolygon} style={{ background: '#1a73e8', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>✏️ Draw Polygon</button>}
        </div>

        {/* Color Palette (Commented Out)
        <div style={{ position: 'absolute', top: '20px', right: '110px', zIndex: 1000, background: 'white', padding: '12px', borderRadius: '16px', boxShadow: '0 8px 30px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#999', letterSpacing: '0.5px' }}>THEME</div>
          {['#1a73e8', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#34495e', '#000000'].map(c => (
            <div key={c} 
                 onClick={() => setSelectedColor(c)} 
                 title={c}
                 style={{ 
                   width: '26px', 
                   height: '26px', 
                   background: c, 
                   borderRadius: '50%', 
                   cursor: 'pointer', 
                   transition: 'all 0.2s ease',
                   transform: selectedColor === c ? 'scale(1.15)' : 'scale(1)',
                   border: selectedColor === c ? '3px solid #333' : '2px solid white', 
                   boxShadow: selectedColor === c ? '0 4px 10px rgba(0,0,0,0.3)' : '0 2px 5px rgba(0,0,0,0.1)' 
                 }} 
            />
          ))}
        </div>
        */}

        {/* Map Switcher */}
        <div style={{ position: 'absolute', bottom: '30px', left: '20px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {['standard', 'satellite', 'terrain'].map(id => (
            (showLayers || mapMode === id) && (
              <div key={id} onClick={() => setMapMode(id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '12px', border: mapMode === id ? '3px solid #1a73e8' : '3px solid white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                  <img src={id === 'standard' ? 'https://a.tile.openstreetmap.org/0/0/0.png' : `https://mt1.google.com/vt/lyrs=${id === 'satellite' ? 'y' : 'p'}&x=0&y=0&z=0`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                {showLayers && <span style={{ fontSize: '11px', fontWeight: '700', color: mapMode === id ? '#1a73e8' : '#5f6368' }}>{id === 'standard' ? 'Default' : id === 'satellite' ? 'Satellite' : 'Terrain'}</span>}
              </div>
            )
          ))}
          <div onClick={() => setShowLayers(!showLayers)} style={{ width: '56px', height: '56px', background: 'white', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: '20px' }}>☰</span><span style={{ fontSize: '10px', fontWeight: 'bold' }}>Layers</span></div>
        </div>

        {/* Right Controls */}
        <div style={{ position: 'absolute', right: '20px', bottom: '30px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
            <button onClick={() => mapInstanceRef.current?.zoomIn()} style={{ width: '45px', height: '45px', border: 'none', borderBottom: '1px solid #eee', cursor: 'pointer', fontSize: '20px', background: 'white', fontWeight: 'bold' }}>+</button>
            <button onClick={() => mapInstanceRef.current?.zoomOut()} style={{ width: '45px', height: '45px', border: 'none', cursor: 'pointer', fontSize: '20px', background: 'white', fontWeight: 'bold' }}>-</button>
          </div>
        </div>

        {/* Attribute Sidebar */}
        {selectedProject && (
          <div style={{ position: 'absolute', top: '85px', right: showLayers ? '20px' : '80px', width: 'calc(100% - 40px)', maxWidth: '350px', background: 'white', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', border: '1px solid #f1f5f9', zIndex: 1002, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100% - 110px)', overflow: 'hidden' }}>
            <div style={{ padding: '20px', background: '#1a73e8', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h4 style={{ margin: 0 }}>Attributes</h4><button onClick={() => setSelectedProject(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>✕</button></div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '15px', minHeight: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <tbody>
                  {[
                    { l: 'Project ID', v: selectedProject.id, k: 'id' },
                    { l: 'Name', v: selectedProject.name, k: 'name' },
                    { l: 'Type', v: selectedProject.type, k: 'type' },
                    { l: 'Ward', v: selectedProject.ward, k: 'ward' },
                    { l: 'Status', v: selectedProject.status, k: 'status' },
                    { l: 'Road Name', v: selectedProject.road_name, k: 'road_name' },
                    { l: 'Road No', v: selectedProject.road_no, k: 'road_no' },
                    { l: 'Road Type', v: selectedProject.road_type, k: 'road_type' },
                    { l: 'Pave Type', v: selectedProject.pave_type, k: 'pave_type' },
                    { l: 'Landmark', v: selectedProject.landmark, k: 'landmark' },
                    { l: 'Authority', v: selectedProject.authority, k: 'authority' },
                    { l: 'Traffic', v: selectedProject.traffic, k: 'traffic' },
                    { l: 'Width', v: selectedProject.width, k: 'width' },
                    { l: 'SHAPE Length', v: selectedProject.shape_length, k: 'shape_length' },
                    { l: 'UNP Name', v: selectedProject.unp_name, k: 'unp_name' },
                    { l: 'UNP Type', v: selectedProject.unp_type, k: 'unp_type' },
                    { l: 'DMA No', v: selectedProject.dma_no, k: 'dma_no' },
                    { l: 'Ward No', v: selectedProject.ward_no, k: 'ward_no' },
                    { l: 'Junction Name', v: selectedProject.junc_name, k: 'junc_name' },
                    { l: 'Facility', v: selectedProject.facility, k: 'facility' },
                    { l: 'Rail Route', v: selectedProject.rail_route, k: 'rail_route' },
                    { l: 'Bridge Name', v: selectedProject.bridg_name, k: 'bridg_name' },
                    { l: 'Bridge Type', v: selectedProject.bridg_type, k: 'bridg_type' },
                    { l: 'Flyover Name', v: selectedProject.fly_name, k: 'fly_name' },
                    { l: 'Description', v: selectedProject.description, k: 'description' },
                    { l: 'Remarks', v: selectedProject.remarks, k: 'remarks' },
                    { l: 'Approver', v: selectedProject.approver, k: 'approver', ro: true },
                    ...Object.keys(selectedProject).filter(k => !STANDARD_KEYS.includes(k)).map(k => ({ l: k, v: selectedProject[k], k: k }))
                  ].filter(r => r.v || isEditing).map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '8px', fontWeight: 'bold', color: '#666', width: '40%', maxWidth: '120px', wordBreak: 'break-word', verticalAlign: 'top' }}>{r.l}</td>
                      <td style={{ padding: '8px', wordBreak: 'break-word' }}>
                        {isEditing && r.k !== 'id' && !r.ro ? (
                          <input
                            value={r.v || ''}
                            onChange={(e) => setSelectedProject({ ...selectedProject, [r.k]: e.target.value })}
                            style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}
                          />
                        ) : r.v}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Amazon-style Horizontal Progress Tracker */}
              {(() => {
                const backendStages = selectedProject.stages || [
                  { status: 'Approved', label: 'Approved', icon: '📋', color: '#16a34a' },
                  { status: 'Work Started', label: 'Work Started', icon: '🔨', color: '#2563eb' },
                  { status: 'Ongoing', label: 'Ongoing', icon: '⚙️', color: '#7c3aed' },
                  { status: 'Hold', label: 'On Hold', icon: '⏸', color: '#ef4444' },
                  { status: 'Near Completion', label: 'Near Completion', icon: '🏁', color: '#0891b2' },
                  { status: 'Completed', label: 'Completed', icon: '✅', color: '#16a34a' }
                ];
                const STEPS = backendStages.map(s => s.status);
                const STEP_LABELS = {};
                const STEP_ICONS = {};
                const STEP_COLORS = {};
                backendStages.forEach(s => {
                  STEP_LABELS[s.status] = s.label;
                  STEP_ICONS[s.status] = s.icon;
                  STEP_COLORS[s.status] = s.color;
                });

                const timeline = selectedProject.timeline || [];
                const currentStatus = selectedProject.status;
                const isOnHold = currentStatus === 'Hold';

                // Collect detailed logs per step from timeline
                const logsByStep = {};
                STEPS.forEach(s => { logsByStep[s] = []; });
                timeline.forEach(t => { if (logsByStep[t.status]) logsByStep[t.status].push(t); });

                const showTracker = STEPS.includes(currentStatus) || timeline.length > 0;
                if (!showTracker) return null;

                return (
                  <div style={{ marginTop: '20px', borderTop: '2px solid #f1f5f9', paddingTop: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <h5 style={{ margin: 0, color: '#0f172a', fontSize: '13px', fontWeight: '800', letterSpacing: '0.3px' }}>📦 Project Journey</h5>
                      {isOnHold && (
                        <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '20px', border: '1px solid #fecaca' }}>⏸ On Hold</span>
                      )}
                    </div>
                    <div style={{ position: 'relative', paddingBottom: '6px', overflowX: 'auto' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: '320px', position: 'relative' }}>
                        {STEPS.map((step, idx) => {
                          const isDone = STEPS.indexOf(currentStatus) > idx || currentStatus === step && step === 'Completed';
                          const isCurrent = currentStatus === step;
                          const stepColor = isDone || isCurrent ? STEP_COLORS[step] : '#cbd5e1';

                          // Active/Selected state
                          const activeStep = selectedJourneyStep || currentStatus;
                          const isSelected = activeStep === step;

                          return (
                            <div key={step} 
                                 onClick={() => setSelectedJourneyStep(step)}
                                 style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative', minWidth: '52px', cursor: 'pointer' }}>
                              {/* Connector line before */}
                              {idx > 0 && (
                                <div style={{
                                  position: 'absolute',
                                  top: '14px',
                                  right: '50%',
                                  left: '-50%',
                                  height: '3px',
                                  background: isDone ? STEP_COLORS[step] : '#e2e8f0',
                                  zIndex: 0,
                                  transition: 'background 0.3s'
                                }} />
                              )}

                              {/* Circle */}
                              <div style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '50%',
                                background: isDone ? stepColor : isCurrent ? stepColor : '#f1f5f9',
                                border: `3px solid ${isSelected ? '#0f172a' : stepColor}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: isDone ? '14px' : '12px',
                                position: 'relative',
                                zIndex: 1,
                                boxShadow: isSelected ? '0 0 0 4px rgba(15, 23, 42, 0.15)' : isCurrent ? `0 0 0 4px ${stepColor}30` : 'none',
                                transform: isSelected ? 'scale(1.1)' : 'none',
                                transition: 'all 0.3s',
                                flexShrink: 0
                              }}>
                                {isDone ? <span style={{ color: '#fff', fontSize: '13px' }}>✓</span>
                                  : isCurrent ? <span style={{ fontSize: '12px' }}>{STEP_ICONS[step]}</span>
                                  : <span style={{ color: '#94a3b8', fontSize: '10px', fontWeight: '700' }}>{idx + 1}</span>}
                              </div>

                              {/* Label */}
                              <div style={{ marginTop: '6px', textAlign: 'center', maxWidth: '60px' }}>
                                <span style={{
                                  fontSize: '9px',
                                  fontWeight: isSelected ? '800' : isCurrent ? '700' : isDone ? '600' : '500',
                                  color: isSelected ? '#0f172a' : isCurrent ? stepColor : isDone ? '#334155' : '#94a3b8',
                                  lineHeight: '1.2',
                                  display: 'block'
                                }}>{STEP_LABELS[step] || step}</span>
                                {/* Date from latest log for this step */}
                                {logsByStep[step].length > 0 && (
                                  <span style={{ fontSize: '8px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                                    {logsByStep[step][logsByStep[step].length - 1].date}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dynamic Step Detail Card */}
                    {(() => {
                      const activeStep = selectedJourneyStep || currentStatus;
                      const activeLogs = logsByStep[activeStep] || [];
                      const activeLog = activeLogs.length > 0 ? activeLogs[activeLogs.length - 1] : null;
                      const sc = STATUS_COLORS[activeStep] || STATUS_COLORS.Draft;

                      return (
                        <div style={{
                          marginTop: '16px',
                          background: '#f8fafc',
                          border: `1.5px solid ${sc.border || '#e2e8f0'}`,
                          borderRadius: '12px',
                          padding: '14px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '800', color: sc.color, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {STEP_ICONS[activeStep] || '📌'} {STEP_LABELS[activeStep] || activeStep} Details
                            </span>
                            {activeLog && (
                              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>{activeLog.date}</span>
                            )}
                          </div>

                          {activeStep === 'Approved' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px', color: '#475569' }}>
                              {selectedProject.approver && (
                                <div>
                                  <span style={{ fontWeight: '700', color: '#64748b' }}>Approved By: </span>
                                  <span>{selectedProject.approver}</span>
                                </div>
                              )}
                              {selectedProject.wo_comment && (
                                <div>
                                  <span style={{ fontWeight: '700', color: '#64748b' }}>Engineer Comments: </span>
                                  <span>{selectedProject.wo_comment}</span>
                                </div>
                              )}
                              {selectedProject.wo_id && (
                                <div>
                                  <span style={{ fontWeight: '700', color: '#64748b' }}>Work Order ID: </span>
                                  <span>{selectedProject.wo_id}</span>
                                </div>
                              )}
                              {!selectedProject.approver && !selectedProject.wo_comment && !selectedProject.wo_id && (
                                <div style={{ color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>No initial approval notes recorded.</div>
                              )}
                            </div>
                          ) : activeLog ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px', color: '#475569' }}>
                              {activeLog.comment && (
                                <p style={{ margin: 0, fontSize: '12px', color: '#334155', lineHeight: '1.5', whiteSpace: 'pre-line' }}>{activeLog.comment}</p>
                              )}
                              
                              {/* Multi-image / Single image render */}
                              {(() => {
                                const imgs = activeLog.images || (activeLog.image ? [activeLog.image] : []);
                                if (imgs.length === 0) return null;
                                return (
                                  <div style={{ marginTop: '4px' }}>
                                    <span style={{ display: 'block', fontSize: '9px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>Photos ({imgs.length})</span>
                                    <div style={{ display: 'grid', gridTemplateColumns: imgs.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: '8px' }}>
                                      {imgs.map((imgUrl, i) => (
                                        <div key={i} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e1', cursor: 'zoom-in', position: 'relative', height: '100px' }}
                                             onClick={() => window.open(imgUrl, '_blank')}>
                                          <img src={imgUrl} alt={`milestone-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          ) : (
                            <div style={{ textAlign: 'center', padding: '16px 8px', color: '#94a3b8', fontSize: '11px', fontStyle: 'italic' }}>
                              No progress details recorded for this stage yet.
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
            <div style={{ padding: '15px', borderTop: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {showAddField ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input placeholder="Label (e.g. Area)" value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', width: '50%' }} />
                    <input placeholder="Value (e.g. 100 sqft)" value={newFieldValue} onChange={(e) => setNewFieldValue(e.target.value)} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', width: '50%' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={async () => {
                      if (newFieldLabel && newFieldValue) {
                        const customAttrs = {};
                        Object.keys(selectedProject).forEach(k => {
                          if (!STANDARD_KEYS.includes(k)) customAttrs[k] = selectedProject[k];
                        });
                        customAttrs[newFieldLabel] = newFieldValue;

                        try {
                          const res = await updateCustomAttributes(selectedProject.id, customAttrs);
                          if (res && res.id) {
                            alert(`A new project copy has been created (ID: ${res.id}) with the status 'Draft'.`);
                            setSelectedProject({
                              ...selectedProject,
                              id: res.id,
                              status: 'Draft',
                              [newFieldLabel]: newFieldValue,
                              custom_attributes: JSON.stringify(customAttrs)
                            });
                          } else {
                            setSelectedProject({
                              ...selectedProject,
                              [newFieldLabel]: newFieldValue,
                              custom_attributes: JSON.stringify(customAttrs)
                            });
                          }
                          setShowAddField(false);
                          setNewFieldLabel('');
                          setNewFieldValue('');
                          loadProjects(); // refresh map to ensure consistency
                        } catch (e) {
                          alert('Failed to save field: ' + e.message);
                        }
                      }
                    }} style={{ flex: 1, padding: '8px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Save Field</button>
                    <button onClick={() => { setShowAddField(false); setNewFieldLabel(''); setNewFieldValue(''); }} style={{ flex: 1, padding: '8px', background: '#f1f5f9', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {['Approved', 'Work Started', 'Ongoing', 'Hold', 'Near Completion'].includes(selectedProject.status) && (
                    <button onClick={() => {
                      const NEXT = { 'Approved': 'Work Started', 'Work Started': 'Ongoing', 'Ongoing': 'Near Completion', 'Near Completion': 'Completed', 'Hold': 'Ongoing' };
                      const nextStatus = NEXT[selectedProject.status] || 'Work Started';
                      loadTimelineStageData(nextStatus);
                      setShowStatusTimelinePopup(true);
                    }} style={{ width: '100%', padding: '11px', background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(37,99,235,0.3)', letterSpacing: '0.3px' }}>
                      📦 Update Progress
                    </button>
                  )}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setShowAddField(true)} style={{ flex: 1, padding: '10px', background: '#e8f0fe', color: '#1a73e8', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>➕ Add Field</button>
                    <button onClick={() => setShowInitiatePopup(true)} style={{ flex: 1.2, padding: '10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      {selectedProject.status === 'Correction' ? '🚀 Resubmit Proposal' : '🚀 Initiate Proposal'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {isEditing ? (
                      <button onClick={async () => {
                        try {
                          const data = { ...selectedProject };
                          delete data.coordinates;
                          const res = await fetch('/api/method/frappe.client.set_value', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ doctype: 'GIS Project', name: selectedProject.id, fieldname: data })
                          }).then(r => r.json());
                          if (!res.exc) {
                            alert('Project details updated successfully!');
                            setIsEditing(false);
                            loadProjects();
                          } else {
                            throw new Error(res.exc);
                          }
                        } catch (e) {
                          alert('Failed to update project: ' + e.message);
                        }
                      }} style={{ flex: 1, padding: '10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>💾 Update Current</button>
                    ) : (
                      <button onClick={() => setIsEditing(true)} style={{ flex: 1, padding: '10px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>✏️ Edit</button>
                    )}
                    <button onClick={async () => {
                      if (window.confirm('Are you sure you want to delete this feature?')) {
                        try {
                          await deleteProject(selectedProject.id);
                          setSelectedProject(null);
                          loadProjects();
                        } catch (e) {
                          alert('Failed to delete: ' + e.message);
                        }
                      }
                    }} style={{ flex: 1, padding: '10px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>🗑️ Delete</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Initiate Popup Overlay */}
        {showInitiatePopup && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', width: '300px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#333' }}>Initiate Proposal</h3>
              <textarea
                placeholder="Enter comments..."
                value={initiateComment}
                onChange={(e) => setInitiateComment(e.target.value)}
                style={{ width: '100%', height: '80px', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px', resize: 'none', marginBottom: '15px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <span style={{ fontWeight: 600, color: '#64748b', fontSize: '13px' }}>Approver</span>
                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>Executive Engineer</span>
              </div>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setInitiateAttachment(e.target.files[0])}
                style={{ width: '100%', marginBottom: '15px', fontSize: '13px' }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={async () => {
                  try {
                    const res = await submitWorkOrder(selectedProject.id, initiateComment, initiateAttachment, "Executive Engineer");
                    if (res && res.id) {
                      alert(`Initiated Proposal successfully! New ID: ${res.id}`);
                      setSelectedProject(null);
                      loadProjects();
                    }
                  } catch (e) {
                    alert('Failed to initiate: ' + e.message);
                  }
                  setShowInitiatePopup(false);
                  setInitiateComment('');
                  setInitiateAttachment(null);
                  setInitiateApprover('');
                }} style={{ flex: 1, padding: '10px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                <button onClick={() => {
                  setShowInitiatePopup(false);
                  setInitiateComment('');
                  setInitiateAttachment(null);
                  setInitiateApprover('');
                }} style={{ flex: 1, padding: '10px', background: '#f1f5f9', color: '#333', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Status Update Popup Overlay — Amazon-style */}
        {showStatusTimelinePopup && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '360px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', color: '#fff', fontWeight: '800' }}>📦 Update Progress</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>{selectedProject?.name}</p>
                </div>
                <button onClick={() => { setShowStatusTimelinePopup(false); setTimelineComment(''); setExistingTimelineImages([]); setNewTimelineImages([]); }} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', color: '#fff', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>

              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                {/* Mini progress tracker inside dialog */}
                {(() => {
                  const backendStages = selectedProject.stages || [
                    { status: 'Approved', label: 'Approved', icon: '📋', color: '#16a34a' },
                    { status: 'Work Started', label: 'Work Started', icon: '🔨', color: '#2563eb' },
                    { status: 'Ongoing', label: 'Ongoing', icon: '⚙️', color: '#7c3aed' },
                    { status: 'Hold', label: 'On Hold', icon: '⏸', color: '#ef4444' },
                    { status: 'Near Completion', label: 'Near Completion', icon: '🏁', color: '#0891b2' },
                    { status: 'Completed', label: 'Completed', icon: '✅', color: '#16a34a' }
                  ];
                  // Exclude Approved as it is the starting point, not a progress stage
                  const progressStages = backendStages.filter(s => s.status !== 'Approved');
                  const STEPS = progressStages.map(s => s.status);
                  const STEP_LABELS = {};
                  const STEP_ICONS = {};
                  const STEP_COLORS = {};
                  progressStages.forEach(s => {
                    STEP_LABELS[s.status] = s.label;
                    STEP_ICONS[s.status] = s.icon;
                    STEP_COLORS[s.status] = s.color;
                  });

                  const selIdx = STEPS.indexOf(timelineStatus);
                  return (
                    <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px 10px 10px', border: '1px solid #e2e8f0' }}>
                      <p style={{ margin: '0 0 10px 0', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.5px' }}>Select Stage</p>
                      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                        {STEPS.map((s, i) => {
                          const done = i < selIdx;
                          const active = i === selIdx;
                          const col = done || active ? STEP_COLORS[s] : '#cbd5e1';
                          return (
                            <div key={s} onClick={() => loadTimelineStageData(s)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', position: 'relative' }}>
                              {i > 0 && (
                                <div style={{ position: 'absolute', top: '13px', right: '50%', left: '-50%', height: '3px', background: done ? STEP_COLORS[s] : '#e2e8f0', zIndex: 0 }} />
                              )}
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: done ? col : active ? col : '#f1f5f9', border: `3px solid ${col}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, boxShadow: active ? `0 0 0 4px ${col}25` : 'none', transition: 'all 0.2s' }}>
                                {done ? <span style={{ color: '#fff', fontSize: '12px', fontWeight: '800' }}>✓</span>
                                  : <span style={{ fontSize: '11px' }}>{STEP_ICONS[s]}</span>}
                              </div>
                              <span style={{ fontSize: '8px', marginTop: '5px', fontWeight: active ? '800' : '500', color: active ? col : done ? '#475569' : '#94a3b8', textAlign: 'center', lineHeight: '1.2', maxWidth: '52px' }}>{STEP_LABELS[s] || s}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Date */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Date</label>
                  <input
                    type="date"
                    value={timelineDate}
                    onChange={(e) => setTimelineDate(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontWeight: '600', color: '#0f172a' }}
                  />
                </div>

                {/* Comment */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Comments</label>
                  <textarea
                    placeholder="Describe what happened at this stage..."
                    value={timelineComment}
                    onChange={(e) => setTimelineComment(e.target.value)}
                    style={{ width: '100%', height: '75px', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', resize: 'none', outline: 'none', boxSizing: 'border-box', color: '#334155', lineHeight: '1.5' }}
                  />
                </div>

                {/* Milestone Photos (Multiselect) */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Milestone Photos</label>
                  
                  {/* Grid of current images */}
                  {((existingTimelineImages.length > 0) || (newTimelineImages.length > 0)) && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px', maxHeight: '130px', overflowY: 'auto', padding: '2px' }}>
                      {/* Existing Images */}
                      {existingTimelineImages.map((imgUrl, i) => (
                        <div key={`existing-${i}`} style={{ position: 'relative', height: '60px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                          <img src={imgUrl} alt="existing-milestone" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button 
                            type="button"
                            onClick={() => setExistingTimelineImages(prev => prev.filter((_, idx) => idx !== i))}
                            style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(239, 68, 68, 0.85)', color: '#fff', border: 'none', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '10px', padding: 0 }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      
                      {/* New local image previews */}
                      {newTimelineImages.map((file, i) => {
                        const previewUrl = URL.createObjectURL(file);
                        return (
                          <div key={`new-${i}`} style={{ position: 'relative', height: '60px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #2563eb' }}>
                            <img src={previewUrl} alt="new-milestone" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button 
                              type="button"
                              onClick={() => setNewTimelineImages(prev => prev.filter((_, idx) => idx !== i))}
                              style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(239, 68, 68, 0.85)', color: '#fff', border: 'none', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '10px', padding: 0 }}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add Photos Input Button */}
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 12px', border: '1.5px dashed #2563eb', borderRadius: '8px', cursor: 'pointer', background: '#f0f4ff', fontSize: '12px', color: '#2563eb', fontWeight: '700', transition: 'all 0.2s' }}>
                    📷 Add Photos (Multiselect)
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple 
                      onChange={(e) => {
                        if (e.target.files) {
                          const filesArray = Array.from(e.target.files);
                          setNewTimelineImages(prev => [...prev, ...filesArray]);
                        }
                      }} 
                      style={{ display: 'none' }} 
                    />
                  </label>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button
                    onClick={async () => {
                      try {
                        const res = await addTimelineEntry(
                          selectedProject.id,
                          timelineStatus,
                          timelineDate,
                          timelineComment,
                          newTimelineImages,
                          existingTimelineImages
                        );
                        if (res && res.success) {
                          alert(`Project moved to '${res.status}' successfully!`);
                          setSelectedProject(prev => {
                            if (!prev) return null;
                            return { ...prev, status: res.status, color: res.color, timeline: res.timeline };
                          });
                          loadProjects();
                        }
                      } catch (e) {
                        alert('Failed to update status: ' + e.message, 'error');
                      }
                      setShowStatusTimelinePopup(false);
                      setTimelineComment('');
                      setExistingTimelineImages([]);
                      setNewTimelineImages([]);
                    }}
                    style={{ flex: 1, padding: '11px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '800', fontSize: '13px', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}
                  >
                    ✅ Save
                  </button>
                  <button
                    onClick={() => { setShowStatusTimelinePopup(false); setTimelineComment(''); setExistingTimelineImages([]); setNewTimelineImages([]); }}
                    style={{ flex: 1, padding: '11px', background: '#f1f5f9', color: '#475569', border: '1.5px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={mapRef} style={{ height: '100%', width: '100%', zIndex: 1 }} />

        {/* Custom Alert Modal */}
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
    </div>
  )
}
