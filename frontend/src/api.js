const FRAPPE_BASE = ''
const API = `${FRAPPE_BASE}/api/method/qgis.api.gis_project`

async function call(method, params = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': window.csrf_token || 'fetch' }
  const res = await fetch(`${API}.${method}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(params),
  })
  // Always capture new CSRF token if server returns one
  const newToken = res.headers.get('x-frappe-csrf-token')
  if (newToken) window.csrf_token = newToken
  const data = await res.json()
  if (data.exc) throw new Error(data.exc_type || 'Server error')
  if (!res.ok) throw new Error(data.message || 'Request failed')
  return data.message
}

export function fetchPublicStats() {
  return call('get_public_stats')
}

export function fetchProjects(status = null, limit = null, omit_geometry = false) {
  return call('get_projects', { status, limit, omit_geometry })
}

export function fetchProject(id) {
  return call('get_project', { project_id: id })
}

export function fetchApprovedProjects() {
  return call('get_approved_projects')
}

export function createProject(data) {
  return call('create_project', {
    project_name: data.name,
    road_name: data.road_name,
    ward: data.ward || "N/A",
    project_type: data.type,
    description: data.description,
    budget: data.budget,
    road_length: data.road_length,
    contractor_details: data.contractor_details,
    start_date: data.start_date || null,
    completion_date: data.completion_date || null,
    remarks: data.remarks,
    color: data.color,
    geom_type: data.geom_type,
    coordinates: JSON.stringify(data.coordinates),
    road_no: data.road_no,
    road_type: data.road_type,
    pave_type: data.pave_type,
    landmark: data.landmark,
    authority: data.authority,
    traffic: data.traffic,
    width: data.width,
    shape_length: data.shape_length,
    unp_name: data.unp_name,
    unp_type: data.unp_type
  })
}

export function updateStatus(id, status, comment = null) {
  return call('update_status', { project_id: id, status, comment })
}

export function deleteProject(id) {
  return call('delete_project', { project_id: id })
}

export function updateGeometry(id, coordinates) {
  return call('update_geometry', { project_id: id, coordinates: JSON.stringify(coordinates) })
}

export function fetchNearbyPlaces(lat, lng, radius = 1000, type = null) {
  return call('get_nearby_places', { lat, lng, radius, place_type: type })
}

export async function searchExternalLocations(query) {
  if (!query || query.length < 3) return []
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`)
    return await res.json()
  } catch (e) {
    console.error('External search failed', e)
    return []
  }
}

export async function manualUpload(file) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${API}.upload_manual_data`, {
    method: 'POST',
    headers: { 'X-Frappe-CSRF-Token': 'fetch' },
    credentials: 'include',
    body: formData,
  })
  const data = await res.json()
  if (data.exc) throw new Error(data.exc_type || 'Server error')
  if (!res.ok) throw new Error(data.message || 'Request failed')
  return data.message
}

export function updateCustomAttributes(id, attributes) {
  return call('update_custom_attributes', { project_id: id, custom_attributes: attributes })
}

export async function submitWorkOrder(projectId, comment, file, approver) {
  const formData = new FormData()
  formData.append('project_id', projectId)
  formData.append('comment', comment)
  if (approver) {
    formData.append('approver', approver)
  }
  if (file) {
    formData.append('file', file)
  }

  const res = await fetch(`${API}.submit_work_order`, {
    method: 'POST',
    headers: { 'X-Frappe-CSRF-Token': 'fetch' },
    credentials: 'include',
    body: formData,
  })
  const data = await res.json()
  if (data.exc) throw new Error(data.exc_type || 'Server error')
  if (!res.ok) throw new Error(data.message || 'Request failed')
  return data.message
}

export async function getPendingWorkOrdersCount() {
  return call('get_pending_work_orders_count')
}

export async function addTimelineEntry(projectId, status, date, comment, files = [], existingImages = []) {
  const formData = new FormData()
  formData.append('project_id', projectId)
  formData.append('status', status)
  formData.append('date', date)
  formData.append('comment', comment || '')
  formData.append('existing_images', JSON.stringify(existingImages))
  
  if (Array.isArray(files)) {
    files.forEach(file => {
      if (file) {
        formData.append('file', file)
      }
    })
  } else if (files) {
    formData.append('file', files)
  }

  const res = await fetch(`${API}.add_timeline_entry`, {
    method: 'POST',
    headers: { 'X-Frappe-CSRF-Token': 'fetch' },
    credentials: 'include',
    body: formData,
  })
  const data = await res.json()
  if (data.exc) throw new Error(data.exc_type || 'Server error')
  if (!res.ok) throw new Error(data.message || 'Request failed')
  return data.message
}

