import { useEffect, useRef, useState, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import { fetchProjects, createProject, deleteProject, manualUpload, updateCustomAttributes, submitWorkOrder, addTimelineEntry, fetchCategories, createCategory } from '../api'

const API = '/api/method/qgis.api.gis_project'

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
  Completed:             { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
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
  Water_Source: { color: '#8e44ad' },
  
  // Custom uploaded layers
  'VVCM-ALL-ROAD': { color: '#3b82f6', fill: false, weight: 2 },
  'VVCM_BOUNDARY': { color: '#ef4444', fill: false, weight: 4 },
  'VVCM_OFFICE_BUILDING': { color: '#1abc9c', fill: true, weight: 2 },
  'VVCM_VILLAGE BOUNDARY': { color: '#f97316', fill: false, weight: 1.5 },
  'Prabhag_Ward_Boundary': { color: '#9b59b6', fill: false, weight: 2 },
  'City_Boundary': { color: '#c0392b', fill: false, weight: 5 },
  'DMA_Location': { color: '#16a085', fill: true, weight: 2 }
}

const cleanCoords = (coords) => {
  if (!Array.isArray(coords)) return null;
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return [coords[0], coords[1]];
  }
  const cleaned = coords.map(cleanCoords).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

const STANDARD_KEYS = ['id', 'name', 'type', 'ward', 'status', 'road_name', 'road_no', 'road_type', 'pave_type', 'landmark', 'authority', 'traffic', 'width', 'shape_length', 'unp_name', 'unp_type', 'dma_no', 'ward_no', 'junc_name', 'facility', 'rail_route', 'bridg_name', 'bridg_type', 'fly_name', 'description', 'remarks', 'coordinates', 'color', 'geom_type', 'created_at', 'modified', 'owner', 'docstatus', 'approver', 'custom_attributes', 'timeline', 'stages', 'pdf_attachment', 'area_name', 'area_size', 'yearly_rent', 'plot_area', 'Plot Area', 'constructed_area', 'Constructed Area', 'Tenant Name', 'tenant_name', 'Profession', 'profession', 'Purpose of Use', 'purpose_of_use', 'Contact Information', 'contact_information', 'Rental Period', 'rental_period', 'Aadhar Number', 'aadhar_number', 'aadhar_no', 'GST Number', 'gst_number', 'gst_no', 'PAN Card Number', 'pan_card_number', 'pancard_no', 'Rent Amount', 'rent_amount', 'Renewal Date', 'renewal_date', 'Tenant Attachments', 'tenant_attachments', 'creation', 'modified_by', 'idx', 'amended_from'];

export default function GISMap({ userInfo, requestTrigger, liveFilterActive, setLiveFilterActive }) {
  const mapRef = useRef(null)
  const fileInputRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const mainGroupRef = useRef(null)
  const drawnLayersRef = useRef(null)
  const drawControlRef = useRef(null)
  const categoryGroupsRef = useRef({}) // Store groups by type: { 'Road': L.FeatureGroup, ... }
  const mapClickHandledRef = useRef(false)

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
  const [previewFile, setPreviewFile] = useState(null)

  // Generate Demand & Tenant Registration states
  const [showGenerateDemandPopup, setShowGenerateDemandPopup] = useState(false)
  const [demandAreaName, setDemandAreaName] = useState('')
  const [demandAreaSize, setDemandAreaSize] = useState('')
  const [demandYearlyRent, setDemandYearlyRent] = useState('')

  const [showTenantRegistrationPopup, setShowTenantRegistrationPopup] = useState(false)
  const [tenantName, setTenantName] = useState('')
  const [tenantProfession, setTenantProfession] = useState('')
  const [tenantPurposeOfUse, setTenantPurposeOfUse] = useState('')
  const [tenantContactInfo, setTenantContactInfo] = useState('')
  const [tenantRentalPeriod, setTenantRentalPeriod] = useState('')
  const [tenantAadharNo, setTenantAadharNo] = useState('')
  const [tenantGstNo, setTenantGstNo] = useState('')
  const [tenantPanCardNo, setTenantPanCardNo] = useState('')
  const [tenantRentAmount, setTenantRentAmount] = useState('')
  const [tenantRenewalDate, setTenantRenewalDate] = useState('')
  const [tenantAttachments, setTenantAttachments] = useState([])
  const [isUploadingTenantFile, setIsUploadingTenantFile] = useState(false)

  const getGeoLocationDisplay = (project) => {
    if (!project || !project.coordinates || project.coordinates.length === 0) return 'N/A';
    try {
      const findFirstCoordsPair = (arr) => {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        if (typeof arr[0] === 'number' && typeof arr[1] === 'number') {
          return arr;
        }
        for (let i = 0; i < arr.length; i++) {
          const res = findFirstCoordsPair(arr[i]);
          if (res) return res;
        }
        return null;
      };
      
      const firstPair = findFirstCoordsPair(project.coordinates);
      if (firstPair && firstPair.length >= 2) {
        const lat = parseFloat(firstPair[0]).toFixed(6);
        const lng = parseFloat(firstPair[1]).toFixed(6);
        return `[${lat}, ${lng}]`;
      }
    } catch (e) {
      console.error("Error formatting geo location:", e);
    }
    return 'N/A';
  };

  const getGroupedAttributes = () => {
    if (!selectedProject) return [];
    
    const groups = [
      {
        title: "Property Details",
        items: [
          { l: 'Project Name', v: selectedProject.project_name || selectedProject.name, k: 'project_name' },
          { l: 'Type', v: selectedProject.type, k: 'type' },
          { l: 'Status', v: selectedProject.status, k: 'status', ro: true },
          { l: 'Submitted By Role', v: selectedProject.submitted_by_role || selectedProject.submitted_by_role, k: 'submitted_by_role', ro: true },
        ]
      },
      {
        title: "Location of Property",
        items: [
          { l: 'Address', v: selectedProject.landmark || selectedProject.road_name || 'N/A', k: 'landmark' },
          { l: 'Geo Location', v: getGeoLocationDisplay(selectedProject), k: 'geo_location', ro: true },
        ]
      },
      {
        title: "Size Of the Property",
        items: [
          { l: 'Plot Area', v: selectedProject.plot_area || selectedProject["Plot Area"] || 'N/A', k: 'plot_area' },
          { l: 'Constructed Area', v: selectedProject.constructed_area || selectedProject["Constructed Area"] || 'N/A', k: 'constructed_area' },
        ]
      }
    ];

    groups.push({
      title: "Property User",
      items: [
        { l: 'Name', v: selectedProject.tenant_name || selectedProject["Tenant Name"], k: 'tenant_name' },
        { l: 'Profession', v: selectedProject.profession || selectedProject["Profession"], k: 'profession' },
        { l: 'Purpose of Use', v: selectedProject.purpose_of_use || selectedProject["Purpose of Use"], k: 'purpose_of_use' },
        { l: 'Contact Information', v: selectedProject.contact_information || selectedProject["Contact Information"], k: 'contact_information' },
        { l: 'Rental Period', v: selectedProject.rental_period || selectedProject["Rental Period"], k: 'rental_period' },
        { l: 'Aadhar Number', v: selectedProject.aadhar_number || selectedProject.aadhar_no || selectedProject["Aadhar Number"], k: 'aadhar_number' },
        { l: 'GST Number', v: selectedProject.gst_number || selectedProject.gst_no || selectedProject["GST Number"], k: 'gst_number' },
        { l: 'PAN Card Number', v: selectedProject.pan_card_number || selectedProject.pancard_no || selectedProject["PAN Card Number"], k: 'pan_card_number' },
        { l: 'Rent Amount', v: selectedProject.rent_amount || selectedProject["Rent Amount"], k: 'rent_amount' },
        { l: 'Renewal Date', v: selectedProject.renewal_date || selectedProject["Renewal Date"], k: 'renewal_date' },
      ]
    });

    // Parse section mappings
    let sectionMappings = {};
    if (selectedProject.section_mappings) {
      try {
        sectionMappings = typeof selectedProject.section_mappings === 'string'
          ? JSON.parse(selectedProject.section_mappings)
          : selectedProject.section_mappings;
      } catch (e) {
        console.error("Error parsing section_mappings", e);
      }
    }

    // Distribute custom attributes
    Object.keys(selectedProject).forEach(k => {
      if (!STANDARD_KEYS.includes(k) && k !== 'section_mappings') {
        const val = selectedProject[k];
        if (val !== undefined && val !== null) {
          const targetSectionTitle = sectionMappings[k] || "Property Details";
          // Check if group exists
          let group = groups.find(g => g.title === targetSectionTitle);
          if (!group) {
            // Fallback to Property Details
            group = groups.find(g => g.title === "Property Details");
          }
          if (group) {
            // Avoid duplicates
            if (!group.items.some(item => item.k === k)) {
              group.items.push({ l: k, v: val, k: k });
            }
          }
        }
      }
    });

    return groups;
  };

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

  const [categories, setCategories] = useState([])
  const [layerMetaLookup, setLayerMetaLookup] = useState({})
  const [formCategory, setFormCategory] = useState('Road')
  
  // New Category form states
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState('#1a73e8')
  const [newCatFill, setNewCatFill] = useState(true)
  const [newCatWeight, setNewCatWeight] = useState(3)

  const loadCategories = async () => {
    try {
      const fetched = await fetchCategories()
      if (fetched) {
        setCategories(fetched)
        const lookup = {}
        fetched.forEach(cat => {
          lookup[cat.category_name] = {
            color: cat.color,
            fill: !!cat.fill,
            weight: cat.weight !== undefined ? cat.weight : 3
          }
        })
        setLayerMetaLookup(lookup)
      }
    } catch (e) {
      console.error("Failed to load categories:", e)
    }
  }

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) {
      alert("Category name is required", "error")
      return
    }
    const cleanName = newCatName.trim().replace(/\s+/g, '_')
    try {
      const res = await createCategory({
        category_name: cleanName,
        color: newCatColor,
        fill: newCatFill,
        weight: newCatWeight
      })
      if (res && res.success) {
        alert(`Category ${cleanName} created successfully!`)
        await loadCategories()
        setFormCategory(cleanName)
        setSelectedColor(newCatColor)
        setShowNewCategoryForm(false)
        setNewCatName('')
        setLayerVisibility(prev => ({ ...prev, [cleanName]: true }))
      } else {
        alert(res?.error || "Failed to create category", "error")
      }
    } catch (err) {
      alert("Error: " + err.message, "error")
    }
  }

  const handleCategoryChange = (e) => {
    const val = e.target.value
    setFormCategory(val)
    const catMeta = layerMetaLookup[val] || LAYER_META[val]
    if (catMeta && catMeta.color) {
      setSelectedColor(catMeta.color)
    }
  }

  const handlePdfUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    // Validate all files
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const isImage = file.type.startsWith('image/')
      const isPdf = file.type === 'application/pdf'
      if (!isImage && !isPdf) {
        alert(`File "${file.name}" is not supported. Only Images and PDFs are allowed.`, "error")
        return
      }
    }
    
    const formData = new FormData()
    formData.append('project_id', selectedProject.id)
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i])
    }
    
    try {
      const res = await fetch(`${API}.upload_project_pdf`, {
        method: 'POST',
        headers: { 'X-Frappe-CSRF-Token': window.csrf_token || 'fetch' },
        credentials: 'include',
        body: formData,
      })
      const data = await res.json()
      if (data.exc) throw new Error(data.exc_type || 'Server error')
      if (!res.ok) throw new Error(data.message || 'Request failed')
      
      const attachmentsList = data.message.attachments
      alert("Attachments uploaded successfully!")
      setSelectedProject(prev => ({ ...prev, pdf_attachment: attachmentsList }))
      loadProjects()
    } catch (err) {
      alert("Upload failed: " + err.message, "error")
    }
  }

  const handleRemovePdf = async (fileUrl) => {
    if (!window.confirm("Are you sure you want to remove this attachment?")) return;
    
    try {
      const res = await fetch(`${API}.remove_project_attachment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Frappe-CSRF-Token': window.csrf_token || 'fetch' },
        credentials: 'include',
        body: `project_id=${encodeURIComponent(selectedProject.id)}&file_url=${encodeURIComponent(fileUrl)}`,
      })
      const data = await res.json()
      if (data.exc) throw new Error(data.exc_type || 'Server error')
      if (!res.ok) throw new Error(data.message || 'Request failed')
      
      alert("Attachment removed successfully!")
      setSelectedProject(prev => {
        const copy = { ...prev }
        if (Array.isArray(copy.pdf_attachment)) {
          copy.pdf_attachment = copy.pdf_attachment.filter(att => att.url !== fileUrl)
        } else {
          delete copy.pdf_attachment
        }
        return copy
      })
      loadProjects()
    } catch (err) {
      alert("Remove failed: " + err.message, "error")
    }
  }

  const handleTenantAttachmentUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const isValid = file.type.startsWith('image/') || file.type === 'application/pdf' || /\.(jpg|jpeg|png|gif|webp|svg|pdf)$/i.test(file.name)
      if (!isValid) {
        alert(`File "${file.name}" is not supported. Only Images and PDFs are allowed.`, "error")
        return
      }
    }
    
    setIsUploadingTenantFile(true)
    const formData = new FormData()
    formData.append('project_id', selectedProject.id)
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i])
    }
    
    try {
      const res = await fetch(`${API}.upload_tenant_attachments`, {
        method: 'POST',
        headers: { 'X-Frappe-CSRF-Token': window.csrf_token || 'fetch' },
        credentials: 'include',
        body: formData,
      })
      const data = await res.json()
      if (data.exc) throw new Error(data.exc_type || 'Server error')
      if (!res.ok) throw new Error(data.message || 'Request failed')
      
      const attachmentsList = data.message.attachments
      setTenantAttachments(attachmentsList)
      alert("Tenant attachments uploaded successfully!")
    } catch (err) {
      alert("Upload failed: " + err.message, "error")
    } finally {
      setIsUploadingTenantFile(false)
    }
  }

  const handleRemoveTenantAttachment = async (fileUrl) => {
    if (!window.confirm("Are you sure you want to remove this attachment?")) return;
    
    try {
      const res = await fetch(`${API}.remove_tenant_attachment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Frappe-CSRF-Token': window.csrf_token || 'fetch' },
        credentials: 'include',
        body: `project_id=${encodeURIComponent(selectedProject.id)}&file_url=${encodeURIComponent(fileUrl)}`,
      })
      const data = await res.json()
      if (data.exc) throw new Error(data.exc_type || 'Server error')
      if (!res.ok) throw new Error(data.message || 'Request failed')
      
      setTenantAttachments(prev => prev.filter(att => att.url !== fileUrl))
      alert("Attachment removed successfully!")
    } catch (err) {
      alert("Remove failed: " + err.message, "error")
    }
  }

  const [activeAddFieldSection, setActiveAddFieldSection] = useState(null)
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

  useEffect(() => {
    loadCategories()
    loadProjects()
  }, [])

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
      const liveStatuses = 'Pending for Request,Approved,Submitted,Work Started,Ongoing,On Hold,Hold,Near Completion,Completed';
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

    const closeAllTooltips = (m) => {
      if (!m) return;
      m.eachLayer(layer => {
        if (layer._tooltip && layer.closeTooltip) {
          try { layer.closeTooltip(); } catch(e) {}
        }
      });
    };

    // Clear selection and close stuck tooltips when clicking the map background
    map.on('click', () => {
      if (mapClickHandledRef.current) return;
      setSelectedProject(null);
      closeAllTooltips(map);
    });

    // Close tooltips when map begins to pan or zoom to prevent stuck tooltips
    map.on('zoomstart movestart', () => {
      closeAllTooltips(map);
    });

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
    if (map) {
      map.eachLayer(layer => {
        if (layer._tooltip && layer.closeTooltip) {
          try { layer.closeTooltip(); } catch(e) {}
        }
      });
    }
    Object.values(categoryGroupsRef.current).forEach(group => {
      if (group.eachLayer) {
        group.eachLayer(layer => {
          try {
            if (layer.closeTooltip && layer._map) {
              layer.closeTooltip();
            }
            if (layer.unbindTooltip) {
              layer.unbindTooltip();
            }
          } catch (err) {
            // Safe fallback: manually clear _tooltip references if unbind fails
            if (layer._tooltip) {
              try {
                if (map && map.closeTooltip) {
                  map.closeTooltip(layer._tooltip);
                }
              } catch (e) {}
              layer._tooltip = null;
            }
          }
        });
      }
      mainGroup.removeLayer(group);
    });
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

      // Get layer meta configuration
      const meta = layerMetaLookup[p.type] || LAYER_META[p.type] || {}
      const defaultColor = meta.color || '#1a73e8'
      const shouldFill = meta.fill !== false
      const layerWeight = meta.weight !== undefined ? meta.weight : (p.geom_type?.toLowerCase().includes('line') ? 5 : 3)

      // Always force green for post-approval statuses
      let color = p.color || defaultColor
      if (['Approved', 'Work Started', 'Ongoing', 'On Hold', 'Hold', 'Near Completion', 'Completed'].includes(p.status)) {
        color = '#16a34a' // Always Green for approved & all post-approval statuses including Completed
      } else if (p.status === 'Pending for Request') {
        color = '#f97316' // Vibrant Orange for pending features
      } else if (p.status === 'Submitted') {
        color = '#2563eb' // Blue for submitted
      }
      let layer;
      if (!p.coordinates || p.coordinates.length === 0) return;
      try {
        if (p.geom_type?.toLowerCase().includes('point')) {
          const pt = typeof p.coordinates[0] === 'number' ? p.coordinates : p.coordinates[0];
          layer = L.circleMarker(pt, { radius: 6, color: '#fff', fillColor: color, fillOpacity: 0.9, weight: 2 })
        } else if (p.geom_type?.toLowerCase().includes('line') || p.geom_type?.toLowerCase().includes('string')) {
          layer = L.polyline(p.coordinates, { color, weight: layerWeight, opacity: 0.8 })
        } else {
          layer = L.polygon(p.coordinates, {
            color,
            fillColor: color,
            fill: shouldFill,
            fillOpacity: shouldFill ? 0.25 : 0,
            weight: layerWeight
          })
        }

        layer.projectId = p.id
        layer.bindTooltip(p.name, { sticky: true }).on('click', (e) => {
          mapClickHandledRef.current = true;
          setTimeout(() => { mapClickHandledRef.current = false; }, 50);
          setSelectedProject(p);
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
      setSelectedProject(null); // Clear active selection when drawing new geometry
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
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    name="project_type" 
                    value={formCategory} 
                    onChange={handleCategoryChange}
                    required 
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ddd', outline: 'none' }}
                  >
                    {categories.length > 0 ? (
                      categories.map(c => <option key={c.category_name} value={c.category_name}>{c.category_name.replace(/_/g, ' ')}</option>)
                    ) : (
                      Object.keys(LAYER_META).map(k => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)
                    )}
                  </select>
                  <button 
                    type="button" 
                    onClick={() => setShowNewCategoryForm(!showNewCategoryForm)} 
                    style={{ padding: '10px 14px', background: '#e8f0fe', color: '#1a73e8', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {showNewCategoryForm ? '✕' : '+ New'}
                  </button>
                </div>
              </div>

              {showNewCategoryForm && (
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px dashed #1a73e8', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1a73e8' }}>➕ Create New Category</div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#555' }}>Category Name *</label>
                    <input 
                      value={newCatName} 
                      onChange={e => setNewCatName(e.target.value)} 
                      placeholder="e.g. Garden, Office_Plots"
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box' }} 
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#555' }}>Color</label>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input 
                          type="color" 
                          value={newCatColor} 
                          onChange={e => setNewCatColor(e.target.value)} 
                          style={{ border: 'none', background: 'none', cursor: 'pointer', width: '32px', height: '32px', padding: 0 }} 
                        />
                        <input 
                          type="text" 
                          value={newCatColor} 
                          onChange={e => setNewCatColor(e.target.value)} 
                          style={{ width: '80px', padding: '6px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} 
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', height: '32px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', color: '#555' }}>
                        <input 
                          type="checkbox" 
                          checked={newCatFill} 
                          onChange={e => setNewCatFill(e.target.checked)} 
                        />
                        Fill Shape
                      </label>
                    </div>
                    <div style={{ width: '70px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#555' }}>Weight</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="10" 
                        value={newCatWeight} 
                        onChange={e => setNewCatWeight(parseInt(e.target.value) || 3)} 
                        style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box' }} 
                      />
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={handleCreateCategory} 
                    style={{ background: '#1a73e8', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', alignSelf: 'flex-end' }}
                  >
                    Save Category
                  </button>
                </div>
              )}
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
            const meta = layerMetaLookup[type] || LAYER_META[type] || { color: '#ccc' }
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
              {getGroupedAttributes().map((group, groupIdx) => (
                <div key={groupIdx} style={{ marginBottom: '18px' }}>
                  <div style={{ 
                    fontSize: '11px', 
                    fontWeight: '800', 
                    color: '#1a73e8', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.5px',
                    paddingBottom: '6px',
                    borderBottom: '2px solid #e2e8f0',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {group.title}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <tbody>
                      {group.items.filter(r => r.v || isEditing).map((r, i) => (
                        <tr key={i}>
                          <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#64748b', width: '40%', maxWidth: '120px', wordBreak: 'break-word', verticalAlign: 'top' }}>{r.l}</td>
                          <td style={{ padding: '6px 8px', wordBreak: 'break-word', color: '#0f172a' }}>
                            {isEditing && r.k !== 'id' && !r.ro ? (
                              <input
                                value={(() => {
                                  const rawVal = selectedProject[r.k] !== undefined && selectedProject[r.k] !== null ? selectedProject[r.k] : (selectedProject[r.l] !== undefined && selectedProject[r.l] !== null ? selectedProject[r.l] : '');
                                  return (rawVal === 'N/A') ? '' : rawVal;
                                })()}
                                onChange={(e) => setSelectedProject({ ...selectedProject, [r.k]: e.target.value })}
                                style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}
                              />
                            ) : r.v}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Inline Add Field Form */}
                  {activeAddFieldSection === group.title ? (
                    <div style={{ 
                      marginTop: '10px', 
                      padding: '10px', 
                      background: '#f8fafc', 
                      borderRadius: '8px', 
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input 
                          placeholder="Field Name" 
                          value={newFieldLabel} 
                          onChange={(e) => setNewFieldLabel(e.target.value)} 
                          style={{ 
                            flex: 1, 
                            padding: '6px', 
                            borderRadius: '4px', 
                            border: '1px solid #cbd5e1', 
                            fontSize: '12px',
                            width: '50%'
                          }} 
                        />
                        <input 
                          placeholder="Value" 
                          value={newFieldValue} 
                          onChange={(e) => setNewFieldValue(e.target.value)} 
                          style={{ 
                            flex: 1, 
                            padding: '6px', 
                            borderRadius: '4px', 
                            border: '1px solid #cbd5e1', 
                            fontSize: '12px',
                            width: '50%'
                          }} 
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button 
                          type="button"
                          onClick={() => {
                            setActiveAddFieldSection(null);
                            setNewFieldLabel('');
                            setNewFieldValue('');
                          }} 
                          style={{ 
                            padding: '4px 10px', 
                            background: '#f1f5f9', 
                            color: '#475569', 
                            border: 'none', 
                            borderRadius: '4px', 
                            cursor: 'pointer', 
                            fontWeight: '600',
                            fontSize: '11px'
                          }}
                        >
                          Cancel
                        </button>
                        <button 
                          type="button"
                          onClick={async () => {
                            if (!newFieldLabel.trim()) {
                              alert("Please enter a field name.", "error");
                              return;
                            }
                            if (!newFieldValue.trim()) {
                              alert("Please enter a value.", "error");
                              return;
                            }
                            const lowerLabel = newFieldLabel.trim().toLowerCase();
                            const isStandard = STANDARD_KEYS.some(k => k.toLowerCase() === lowerLabel);
                            if (isStandard) {
                              alert("This field name is reserved. Please choose a different label.", "error");
                              return;
                            }

                            // Collect all existing custom attributes
                            const customAttrs = {};
                            Object.keys(selectedProject).forEach(k => {
                              if (!STANDARD_KEYS.includes(k) && k !== 'section_mappings') {
                                customAttrs[k] = selectedProject[k];
                              }
                            });

                            // Parse and update section mappings
                            let sectionMappings = {};
                            if (selectedProject.section_mappings) {
                              try {
                                sectionMappings = typeof selectedProject.section_mappings === 'string'
                                  ? JSON.parse(selectedProject.section_mappings)
                                  : selectedProject.section_mappings;
                              } catch (e) {}
                            }
                            const updatedMappings = { ...sectionMappings };
                            updatedMappings[newFieldLabel.trim()] = group.title;

                            customAttrs[newFieldLabel.trim()] = newFieldValue.trim();
                            customAttrs["section_mappings"] = updatedMappings;

                            try {
                              const res = await updateCustomAttributes(selectedProject.id, customAttrs);
                              const updatedProject = {
                                ...selectedProject,
                                [newFieldLabel.trim()]: newFieldValue.trim(),
                                section_mappings: updatedMappings,
                                custom_attributes: JSON.stringify(customAttrs)
                              };
                              if (res && res.id) {
                                updatedProject.id = res.id;
                                if (res.id !== selectedProject.id) {
                                  updatedProject.status = 'Draft';
                                  alert(`A new project copy has been created (ID: ${res.id}) with the status 'Draft'.`);
                                } else {
                                  alert("Field added successfully!");
                                }
                              } else {
                                alert("Field added successfully!");
                              }
                              setSelectedProject(updatedProject);
                              setActiveAddFieldSection(null);
                              setNewFieldLabel('');
                              setNewFieldValue('');
                              loadProjects();
                            } catch (e) {
                              alert('Failed to save field: ' + e.message, 'error');
                            }
                          }} 
                          style={{ 
                            padding: '4px 10px', 
                            background: '#1a73e8', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '4px', 
                            cursor: 'pointer', 
                            fontWeight: '600',
                            fontSize: '11px'
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: '6px', textAlign: 'right' }}>
                      <button 
                        type="button"
                        onClick={() => {
                          setActiveAddFieldSection(group.title);
                          setNewFieldLabel('');
                          setNewFieldValue('');
                        }} 
                        style={{ 
                          background: 'none', 
                          border: 'none', 
                          color: '#1a73e8', 
                          cursor: 'pointer', 
                          fontSize: '11.5px', 
                          fontWeight: '700',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        ➕ Add Field
                      </button>
                    </div>
                  )}
                  
                  {group.title === "Property User" && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1' }}>
                      <div style={{ fontSize: '11px', fontWeight: '850', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                        📄 Tenant Attachments (Images/PDFs)
                      </div>
                      {(() => {
                        const attachments = (() => {
                          const raw = selectedProject.tenant_attachments || selectedProject["Tenant Attachments"];
                          if (!raw) return [];
                          if (Array.isArray(raw)) return raw;
                          if (typeof raw === 'string') {
                            const trimmed = raw.trim();
                            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                              try {
                                return JSON.parse(trimmed);
                              } catch (e) {}
                            }
                            return [{ name: raw.split('/').pop(), url: raw }];
                          }
                          return [];
                        })();

                        if (attachments.length === 0) {
                          return <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No tenant attachments uploaded.</span>;
                        }

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {attachments.map((att, index) => {
                              const isImg = /\.(jpg|jpeg|png|gif|webp|svg)($|\?)/i.test(att.url);
                              return (
                                <div 
                                  key={index} 
                                  style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between', 
                                    padding: '6px 8px', 
                                    background: '#f8fafc', 
                                    borderRadius: '8px', 
                                    border: '1px solid #cbd5e1',
                                    gap: '6px'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                                    {isImg ? (
                                      <div 
                                        onClick={() => window.open(att.url, '_blank')}
                                        style={{ 
                                          width: '28px', 
                                          height: '28px', 
                                          borderRadius: '4px', 
                                          overflow: 'hidden', 
                                          border: '1px solid #cbd5e1', 
                                          cursor: 'zoom-in',
                                          flexShrink: 0
                                        }}
                                      >
                                        <img src={att.url} alt="thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: '16px', flexShrink: 0 }}>📕</span>
                                    )}
                                    <span 
                                      style={{ 
                                        fontSize: '11px', 
                                        fontWeight: '500', 
                                        color: '#334155', 
                                        textOverflow: 'ellipsis', 
                                        overflow: 'hidden', 
                                        whiteSpace: 'nowrap' 
                                      }}
                                      title={att.name}
                                    >
                                      {att.name}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                    <button 
                                      type="button"
                                      onClick={() => setPreviewFile(att)}
                                      title="View / Preview"
                                      style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        width: '24px', 
                                        height: '24px', 
                                        borderRadius: '4px', 
                                        background: '#10b981', 
                                        color: 'white', 
                                        border: 'none', 
                                        cursor: 'pointer',
                                        fontSize: '11px'
                                      }}
                                    >
                                      👁️
                                    </button>
                                    <button 
                                      type="button"
                                      onClick={async () => {
                                        if (!window.confirm("Are you sure you want to remove this tenant attachment?")) return;
                                        try {
                                          const res = await fetch(`${API}.remove_tenant_attachment`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Frappe-CSRF-Token': window.csrf_token || 'fetch' },
                                            credentials: 'include',
                                            body: `project_id=${encodeURIComponent(selectedProject.id)}&file_url=${encodeURIComponent(att.url)}`,
                                          });
                                          const data = await res.json();
                                          if (data.exc) throw new Error(data.exc_type || 'Server error');
                                          if (!res.ok) throw new Error(data.message || 'Request failed');
                                          
                                          alert("Attachment removed successfully!");
                                          setSelectedProject(prev => {
                                            const copy = { ...prev };
                                            const oldList = copy.tenant_attachments || copy["Tenant Attachments"] || [];
                                            const newList = (Array.isArray(oldList) ? oldList : JSON.parse(oldList)).filter(a => a.url !== att.url);
                                            copy.tenant_attachments = newList;
                                            copy["Tenant Attachments"] = newList;
                                            return copy;
                                          });
                                          loadProjects();
                                        } catch (err) {
                                          alert("Remove failed: " + err.message, "error");
                                        }
                                      }} 
                                      title="Remove"
                                      style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        width: '24px', 
                                        height: '24px', 
                                        borderRadius: '4px', 
                                        background: '#ef4444', 
                                        color: 'white', 
                                        border: 'none', 
                                        cursor: 'pointer',
                                        fontSize: '10px'
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}

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
                              {selectedProject.wo_attachment && (
                                <div style={{ marginTop: '6px' }}>
                                  <span style={{ display: 'block', fontSize: '9px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>Attachment / Photos</span>
                                  {(() => {
                                    const url = selectedProject.wo_attachment;
                                    const isImg = /\.(jpg|jpeg|png|gif|webp|svg)($|\?)/i.test(url);
                                    if (isImg) {
                                      return (
                                        <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e1', cursor: 'zoom-in', position: 'relative', height: '100px', width: '150px' }}
                                             onClick={() => window.open(url, '_blank')}>
                                          <img src={url} alt="work-order-attachment" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                        </div>
                                      );
                                    } else {
                                      return (
                                        <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#2563eb', fontWeight: '600', textDecoration: 'none', fontSize: '11px' }}>
                                          📄 View Document
                                        </a>
                                      );
                                    }
                                  })()}
                                </div>
                              )}
                              {!selectedProject.approver && !selectedProject.wo_comment && !selectedProject.wo_id && !selectedProject.wo_attachment && (
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
                                let imgs = [];
                                if (activeLog.images) {
                                  if (Array.isArray(activeLog.images)) {
                                    imgs = activeLog.images;
                                  } else if (typeof activeLog.images === 'string') {
                                    try {
                                      imgs = JSON.parse(activeLog.images);
                                    } catch (e) {
                                      imgs = [activeLog.images];
                                    }
                                  }
                                } else if (activeLog.image) {
                                  imgs = [activeLog.image];
                                }
                                imgs = imgs.filter(img => typeof img === 'string' && img.trim() !== '');
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

              {/* Attachment Card (PDF/Image) */}
              <div style={{ marginTop: '20px', borderTop: '2px solid #f1f5f9', paddingTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <h5 style={{ margin: 0, color: '#0f172a', fontSize: '13px', fontWeight: '800', letterSpacing: '0.3px' }}>📄 Project Attachments (Images/PDFs)</h5>
                </div>
                {(() => {
                  const attachments = (() => {
                    const raw = selectedProject.pdf_attachment;
                    if (!raw) return [];
                    if (Array.isArray(raw)) return raw;
                    if (typeof raw === 'string') {
                      const trimmed = raw.trim();
                      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                        try {
                          return JSON.parse(trimmed);
                        } catch (e) {}
                      }
                      return [{ name: raw.split('/').pop(), url: raw }];
                    }
                    return [];
                  })();

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {attachments.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {attachments.map((att, index) => {
                            const isImg = /\.(jpg|jpeg|png|gif|webp|svg)($|\?)/i.test(att.url);
                            return (
                              <div 
                                key={index} 
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'space-between', 
                                  padding: '8px 10px', 
                                  background: '#f8fafc', 
                                  borderRadius: '10px', 
                                  border: '1px solid #e2e8f0',
                                  gap: '8px'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                  {isImg ? (
                                    <div 
                                      onClick={() => window.open(att.url, '_blank')}
                                      style={{ 
                                        width: '32px', 
                                        height: '32px', 
                                        borderRadius: '6px', 
                                        overflow: 'hidden', 
                                        border: '1px solid #cbd5e1', 
                                        cursor: 'zoom-in',
                                        flexShrink: 0
                                      }}
                                    >
                                      <img src={att.url} alt="thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '18px', flexShrink: 0 }}>📕</span>
                                  )}
                                  <span 
                                    style={{ 
                                      fontSize: '11px', 
                                      fontWeight: '500', 
                                      color: '#334155', 
                                      textOverflow: 'ellipsis', 
                                      overflow: 'hidden', 
                                      whiteSpace: 'nowrap' 
                                    }}
                                    title={att.name}
                                  >
                                    {att.name}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                  <button 
                                    onClick={() => setPreviewFile(att)}
                                    title="View / Preview"
                                    style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'center', 
                                      width: '28px', 
                                      height: '28px', 
                                      borderRadius: '6px', 
                                      background: '#10b981', 
                                      color: 'white', 
                                      border: 'none', 
                                      cursor: 'pointer',
                                      fontSize: '12px'
                                    }}
                                  >
                                    👁️
                                  </button>
                                  <button 
                                    onClick={() => handleRemovePdf(att.url)} 
                                    title="Remove"
                                    style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'center', 
                                      width: '28px', 
                                      height: '28px', 
                                      borderRadius: '6px', 
                                      background: '#ef4444', 
                                      color: 'white', 
                                      border: 'none', 
                                      cursor: 'pointer',
                                      fontSize: '11px'
                                    }}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '18px' }}>📤</span>
                        <input 
                          type="file" 
                          multiple
                          accept="image/*,application/pdf" 
                          onChange={handlePdfUpload} 
                          style={{ fontSize: '11px', maxWidth: '100%', color: '#475569' }} 
                        />
                        <span style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'center' }}>Supported formats: Images or PDFs (Multiple allowed)</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div style={{ padding: '15px', borderTop: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {['Submitted', 'Approved', 'Work Started', 'Ongoing', 'On Hold', 'Hold', 'Near Completion'].includes(selectedProject.status) && (
                  <button 
                    onClick={() => {
                      const NEXT = { 'Submitted': 'Approved', 'Approved': 'Work Started', 'Work Started': 'Ongoing', 'Ongoing': 'Near Completion', 'Near Completion': 'Completed', 'Hold': 'Ongoing', 'On Hold': 'Ongoing' };
                      const nextStatus = NEXT[selectedProject.status] || 'Work Started';
                      loadTimelineStageData(nextStatus);
                      setShowStatusTimelinePopup(true);
                    }} 
                    style={{ 
                      width: '100%', 
                      padding: '11px', 
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '10px', 
                      cursor: 'pointer', 
                      fontWeight: '700', 
                      fontSize: '13px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '6px', 
                      boxShadow: '0 4px 12px rgba(37,99,235,0.3)', 
                      letterSpacing: '0.3px' 
                    }}
                  >
                    📦 Update Progress
                  </button>
                )}
                {['Draft', 'Correction'].includes(selectedProject.status) ? (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => setShowInitiatePopup(true)} 
                      style={{ 
                        flex: 1, 
                        padding: '10px 4px', 
                        background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '8px', 
                        cursor: 'pointer', 
                        fontWeight: 'bold', 
                        fontSize: '11.5px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '3px',
                        boxShadow: '0 4px 12px rgba(26,115,232,0.2)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {selectedProject.status === 'Correction' ? '🚀 Resubmit Proposal' : '🚀 Initiate Proposal'}
                    </button>
                    <button 
                      onClick={() => setShowGenerateDemandPopup(true)} 
                      style={{ 
                        flex: 1, 
                        padding: '10px 4px', 
                        background: '#10b981', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '8px', 
                        cursor: 'pointer', 
                        fontWeight: 'bold', 
                        fontSize: '11.5px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '3px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      🧾 Generate Demand
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => setShowGenerateDemandPopup(true)} 
                      style={{ 
                        flex: 1, 
                        padding: '10px', 
                        background: '#10b981', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '8px', 
                        cursor: 'pointer', 
                        fontWeight: 'bold', 
                        fontSize: '13px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '4px' 
                      }}
                    >
                      🧾 Generate Demand
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px' }}>
                  {isEditing ? (
                    <button 
                      onClick={async () => {
                        try {
                          const data = { ...selectedProject };
                          
                          // list of standard database columns in GIS Project doctype
                          const validDbFields = [
                            'project_name', 'road_name', 'ward', 'project_type', 'status', 'submitted_by_role',
                            'budget', 'road_length', 'start_date', 'completion_date', 'road_no', 'road_type',
                            'pave_type', 'landmark', 'authority', 'traffic', 'width', 'shape_length',
                            'unp_name', 'unp_type', 'description', 'contractor_details', 'remarks', 'color',
                            'dma_no', 'ward_no', 'junc_name', 'facility', 'rail_route', 'bridg_type', 'fly_name'
                          ];
                          
                          const dbData = {};
                          validDbFields.forEach(f => {
                            if (data[f] !== undefined) {
                              dbData[f] = data[f];
                            }
                          });

                          // list of custom fields with key (scrubbed) and label (capitalized)
                          const customFields = [
                             { key: 'plot_area', label: 'Plot Area' },
                             { key: 'constructed_area', label: 'Constructed Area' },
                             { key: 'tenant_name', label: 'Tenant Name' },
                             { key: 'profession', label: 'Profession' },
                             { key: 'purpose_of_use', label: 'Purpose of Use' },
                             { key: 'contact_information', label: 'Contact Information' },
                             { key: 'rental_period', label: 'Rental Period' },
                             { key: 'aadhar_number', label: 'Aadhar Number', alias: 'aadhar_no' },
                             { key: 'gst_number', label: 'GST Number', alias: 'gst_no' },
                             { key: 'pan_card_number', label: 'PAN Card Number', alias: 'pancard_no' },
                             { key: 'rent_amount', label: 'Rent Amount' },
                             { key: 'renewal_date', label: 'Renewal Date' },
                             { key: 'tenant_attachments', label: 'Tenant Attachments' }
                           ];

                           const customAttrs = {};
                           customFields.forEach(f => {
                             let val = data[f.key];
                             if (val === undefined) {
                               val = data[f.label];
                             }
                             if (val === undefined && f.alias) {
                               val = data[f.alias];
                             }
                             if (val !== undefined) {
                               customAttrs[f.label] = val;
                             }
                           });

                           // Collect all other dynamic custom fields from selectedProject keys
                           Object.keys(data).forEach(k => {
                             if (!STANDARD_KEYS.includes(k) && k !== 'section_mappings') {
                               customAttrs[k] = data[k];
                             }
                           });
                           if (data.section_mappings) {
                             customAttrs["section_mappings"] = data.section_mappings;
                           }

                           // 1. Save standard fields via set_value
                           const resDb = await fetch('/api/method/frappe.client.set_value', {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRToken': window.csrf_token || 'fetch' },
                             body: JSON.stringify({ doctype: 'GIS Project', name: selectedProject.id, fieldname: dbData })
                           }).then(r => r.json());

                           if (resDb.exc) throw new Error(resDb.exc_type || 'Failed to update database fields');

                           // 2. Save custom fields via updateCustomAttributes
                           if (Object.keys(customAttrs).length > 0) {
                             const resCustom = await updateCustomAttributes(selectedProject.id, customAttrs);
                             if (resCustom && resCustom.id) {
                               // If project duplicated on save, update ID and status locally
                               setSelectedProject(prev => {
                                 const updated = {
                                   ...prev,
                                   ...dbData,
                                   ...customAttrs,
                                   id: resCustom.id
                                 };
                                 if (resCustom.id !== selectedProject.id) {
                                   updated.status = 'Draft';
                                 }
                                 return updated;
                               });
                             }
                           }

                          alert('Project details updated successfully!');
                          setIsEditing(false);
                          loadProjects();
                        } catch (e) {
                          alert('Failed to update project: ' + e.message);
                        }
                      }} 
                      style={{ flex: 1, padding: '10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      💾 Update Current
                    </button>
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
            </div>
          </div>
        )}

        {/* Preview Overlay */}
        {previewFile && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3500,
            padding: '20px'
          }}>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '650px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh'
            }}>
              {/* Modal Header */}
              <div style={{
                padding: '16px 20px',
                background: '#1a73e8',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontWeight: '700', fontSize: '14px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                  🔍 Preview: {previewFile.name}
                </span>
                <button 
                  onClick={() => setPreviewFile(null)} 
                  style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', flex: 1, minHeight: '350px' }}>
                {(() => {
                  const isImg = /\.(jpg|jpeg|png|gif|webp|svg)($|\?)/i.test(previewFile.url);
                  if (isImg) {
                    return (
                      <img 
                        src={previewFile.url} 
                        alt={previewFile.name} 
                        style={{ maxWidth: '100%', maxHeight: '450px', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} 
                      />
                    );
                  } else {
                    return (
                      <iframe 
                        src={previewFile.url} 
                        title="PDF Preview"
                        style={{ width: '100%', height: '480px', border: '1px solid #cbd5e1', borderRadius: '8px', background: 'white' }}
                      />
                    );
                  }
                })()}
              </div>

              {/* Modal Footer */}
              <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: 'white' }}>
                <button 
                  onClick={() => setPreviewFile(null)} 
                  style={{ padding: '10px 16px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                >
                  Close
                </button>
                <a 
                  href={previewFile.url} 
                  download={previewFile.name}
                  style={{ 
                    padding: '10px 20px', 
                    background: '#10b981', 
                    color: 'white', 
                    borderRadius: '8px', 
                    cursor: 'pointer', 
                    fontWeight: 'bold', 
                    fontSize: '13px', 
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  ⬇️ Download File
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Generate Demand Popup Overlay */}
        {showGenerateDemandPopup && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            padding: '20px'
          }}>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Header */}
              <div style={{
                padding: '16px 20px',
                background: '#10b981',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontWeight: '850', fontSize: '15px' }}>
                  🧾 Generate Demand
                </span>
                <button 
                  onClick={() => setShowGenerateDemandPopup(false)} 
                  style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#f8fafc' }}>
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Area Name</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                      {selectedProject.project_name || selectedProject.name || 'N/A'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Area Size</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                      {selectedProject.plot_area || selectedProject["Plot Area"] || 'N/A'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Yearly Rent</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                      {(() => {
                        const plotAreaVal = selectedProject.plot_area || selectedProject["Plot Area"];
                        if (plotAreaVal) {
                          const cleanNum = parseFloat(String(plotAreaVal).replace(/[^\d.]/g, ''));
                          if (!isNaN(cleanNum)) {
                            return `₹${(cleanNum * 200).toLocaleString('en-IN')}`;
                          }
                        }
                        return selectedProject.yearly_rent || selectedProject["Yearly Rent"] || 'N/A';
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', background: 'white' }}>
                <button 
                  onClick={() => setShowGenerateDemandPopup(false)}
                  style={{ flex: 1, padding: '10px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                >
                  Cancel
                </button>
                 <button 
                  onClick={() => {
                    setTenantName(selectedProject["Tenant Name"] || selectedProject.tenant_name || '');
                    setTenantProfession(selectedProject["Profession"] || selectedProject.profession || '');
                    setTenantPurposeOfUse(selectedProject["Purpose of Use"] || selectedProject.purpose_of_use || '');
                    setTenantContactInfo(selectedProject["Contact Information"] || selectedProject.contact_information || '');
                    setTenantRentalPeriod(selectedProject["Rental Period"] || selectedProject.rental_period || '');
                    setTenantAadharNo(selectedProject["Aadhar Number"] || selectedProject.aadhar_number || selectedProject.aadhar_no || '');
                    setTenantGstNo(selectedProject["GST Number"] || selectedProject.gst_number || selectedProject.gst_no || '');
                    setTenantPanCardNo(selectedProject["PAN Card Number"] || selectedProject.pan_card_number || selectedProject.pancard_no || '');
                    setTenantRentAmount(selectedProject["Rent Amount"] || selectedProject.rent_amount || '');
                    setTenantRenewalDate(selectedProject["Renewal Date"] || selectedProject.renewal_date || '');
                    
                    let atts = [];
                    if (selectedProject["Tenant Attachments"] || selectedProject.tenant_attachments) {
                      const raw = selectedProject["Tenant Attachments"] || selectedProject.tenant_attachments;
                      if (Array.isArray(raw)) {
                        atts = raw;
                      } else if (typeof raw === 'string') {
                        try {
                          atts = JSON.parse(raw);
                        } catch(e) {
                          atts = [];
                        }
                      }
                    }
                    setTenantAttachments(atts);

                    setShowGenerateDemandPopup(false);
                    setShowTenantRegistrationPopup(true);
                  }}
                  style={{ flex: 1.5, padding: '10px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                >
                  👤 Tenant Registration
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Tenant Registration Popup Overlay */}
        {showTenantRegistrationPopup && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3100,
            padding: '20px'
          }}>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '500px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Header */}
              <div style={{
                padding: '16px 20px',
                background: '#0284c7',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontWeight: '850', fontSize: '15px' }}>
                  👤 New Tenant Registration
                </span>
                <button 
                  onClick={() => {
                    setShowTenantRegistrationPopup(false);
                    setTenantName('');
                    setTenantProfession('');
                    setTenantPurposeOfUse('');
                    setTenantContactInfo('');
                    setTenantRentalPeriod('');
                    setTenantAadharNo('');
                    setTenantGstNo('');
                    setTenantPanCardNo('');
                    setTenantRentAmount('');
                    setTenantRenewalDate('');
                    setTenantAttachments([]);
                  }} 
                  style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div style={{ 
                padding: '20px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '14px', 
                background: '#f8fafc',
                maxHeight: '65vh',
                overflowY: 'auto'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Tenant Name</label>
                  <input 
                    type="text" 
                    placeholder="Enter Tenant Name"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Profession</label>
                  <input 
                    type="text" 
                    placeholder="Enter Profession"
                    value={tenantProfession}
                    onChange={(e) => setTenantProfession(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Purpose of Use</label>
                  <input 
                    type="text" 
                    placeholder="Enter Purpose of Use"
                    value={tenantPurposeOfUse}
                    onChange={(e) => setTenantPurposeOfUse(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Contact Information</label>
                  <input 
                    type="text" 
                    placeholder="Enter Contact Info (Email / Phone)"
                    value={tenantContactInfo}
                    onChange={(e) => setTenantContactInfo(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Rental Period</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 1 Year, 3 Years"
                    value={tenantRentalPeriod}
                    onChange={(e) => setTenantRentalPeriod(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Aadhar Number</label>
                  <input 
                    type="text" 
                    placeholder="Enter 12-digit Aadhar Number"
                    value={tenantAadharNo}
                    onChange={(e) => setTenantAadharNo(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>GST Number</label>
                  <input 
                    type="text" 
                    placeholder="Enter GST Number"
                    value={tenantGstNo}
                    onChange={(e) => setTenantGstNo(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>PAN Card Number</label>
                  <input 
                    type="text" 
                    placeholder="Enter PAN Card Number"
                    value={tenantPanCardNo}
                    onChange={(e) => setTenantPanCardNo(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Rent Amount</label>
                  <input 
                    type="text" 
                    placeholder="Enter Rent Amount"
                    value={tenantRentAmount}
                    onChange={(e) => setTenantRentAmount(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Renewal Date</label>
                  <input 
                    type="date" 
                    value={tenantRenewalDate}
                    onChange={(e) => setTenantRenewalDate(e.target.value)}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Tenant Attachments (Images/PDFs)</label>
                  
                  {tenantAttachments && tenantAttachments.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f1f5f9', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                      {tenantAttachments.map((att, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: '#334155' }}>
                          <a href={att.url} target="_blank" rel="noreferrer" style={{ color: '#0284c7', textDecoration: 'none', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '380px' }}>
                            📎 {att.name || att.url.split('/').pop()}
                          </a>
                          <button 
                            type="button"
                            onClick={() => handleRemoveTenantAttachment(att.url)}
                            style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px dashed #0284c7',
                      background: '#f0f9ff',
                      color: '#0284c7',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: isUploadingTenantFile ? 'not-allowed' : 'pointer'
                    }}>
                      <input 
                        type="file" 
                        multiple 
                        accept="image/*,application/pdf"
                        onChange={handleTenantAttachmentUpload}
                        disabled={isUploadingTenantFile}
                        style={{ display: 'none' }}
                      />
                      {isUploadingTenantFile ? 'Uploading...' : '📁 Choose Files'}
                    </label>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', background: 'white' }}>
                <button 
                  onClick={() => {
                    setShowTenantRegistrationPopup(false);
                    setTenantName('');
                    setTenantProfession('');
                    setTenantPurposeOfUse('');
                    setTenantContactInfo('');
                    setTenantRentalPeriod('');
                    setTenantAadharNo('');
                    setTenantGstNo('');
                    setTenantPanCardNo('');
                    setTenantRentAmount('');
                    setTenantRenewalDate('');
                    setTenantAttachments([]);
                  }}
                  style={{ flex: 1, padding: '10px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    try {
                      const newAttrs = { ...selectedProject };
                      const customAttrs = {};
                      Object.keys(newAttrs).forEach(k => {
                        if (!STANDARD_KEYS.includes(k)) {
                          customAttrs[k] = newAttrs[k];
                        }
                      });
                      customAttrs["Tenant Name"] = tenantName;
                      customAttrs["Profession"] = tenantProfession;
                      customAttrs["Purpose of Use"] = tenantPurposeOfUse;
                      customAttrs["Contact Information"] = tenantContactInfo;
                      customAttrs["Rental Period"] = tenantRentalPeriod;
                      customAttrs["Aadhar Number"] = tenantAadharNo;
                      customAttrs["GST Number"] = tenantGstNo;
                      customAttrs["PAN Card Number"] = tenantPanCardNo;
                      customAttrs["Rent Amount"] = tenantRentAmount;
                      customAttrs["Renewal Date"] = tenantRenewalDate;
                      customAttrs["Tenant Attachments"] = tenantAttachments;
                      
                      const res = await updateCustomAttributes(selectedProject.id, customAttrs);
                      alert("Tenant registered successfully!");
                      setShowTenantRegistrationPopup(false);
                      setTenantName('');
                      setTenantProfession('');
                      setTenantPurposeOfUse('');
                      setTenantContactInfo('');
                      setTenantRentalPeriod('');
                      setTenantAadharNo('');
                      setTenantGstNo('');
                      setTenantPanCardNo('');
                      setTenantRentAmount('');
                      setTenantRenewalDate('');
                      setTenantAttachments([]);
                      
                      if (res && res.id) {
                        setSelectedProject(prev => ({
                          ...prev,
                          ...customAttrs,
                          id: res.id
                        }));
                      } else {
                        setSelectedProject(prev => ({
                          ...prev,
                          ...customAttrs
                        }));
                      }
                      loadProjects();
                    } catch (e) {
                      alert("Failed to save: " + e.message);
                    }
                  }}
                  style={{ flex: 1, padding: '10px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                >
                  Register
                </button>
              </div>
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
