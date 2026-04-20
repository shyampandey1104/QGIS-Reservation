const FRAPPE_BASE = ''
const API = `${FRAPPE_BASE}/api/method/qgis.api.gis_project`

async function call(method, params = {}) {
  const res = await fetch(`${API}.${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': 'fetch' },
    credentials: 'include',
    body: JSON.stringify(params),
  })
  const data = await res.json()
  if (data.exc) throw new Error(data.exc_type || 'Server error')
  if (!res.ok) throw new Error(data.message || 'Request failed')
  return data.message
}

export function fetchPublicStats() {
  return call('get_public_stats')
}

export function fetchProjects(status = null) {
  return call('get_projects', status ? { status } : {})
}

export function fetchApprovedProjects() {
  return call('get_approved_projects')
}

export function createProject(data) {
  return call('create_project', {
    project_name: data.name,
    road_name: data.road_name,
    ward: data.ward,
    project_type: data.type,
    description: data.description,
    budget: data.budget,
    road_length: data.road_length,
    contractor_details: data.contractor_details,
    start_date: data.start_date || null,
    completion_date: data.completion_date || null,
    remarks: data.remarks,
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

export function updateStatus(id, status) {
  return call('update_status', { project_id: id, status })
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
