const FRAPPE_BASE = ''
const API = `${FRAPPE_BASE}/api/method/qgis.api.gis_project`

async function ensureCsrfToken() {
  if (window.csrf_token && window.csrf_token !== 'fetch') return
  try {
    const res = await fetch(`${FRAPPE_BASE}/api/method/qgis.api.gis_project.get_csrf_token_api`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    })
    const data = await res.json()
    if (data.message) {
      window.csrf_token = data.message
    }
  } catch (e) {
    console.error("Failed to fetch CSRF token", e)
  }
}

async function call(method, params = {}) {
  await ensureCsrfToken()
  const headers = { 
    'Content-Type': 'application/json', 
    'X-Frappe-CSRF-Token': window.csrf_token || 'fetch' 
  }
  let res = await fetch(`${API}.${method}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(params),
  })
  
  // Always capture new CSRF token if server returns one
  let newToken = res.headers.get('x-frappe-csrf-token')
  if (newToken) window.csrf_token = newToken
  
  let data = await res.json()
  
  // Self-healing: If CSRFTokenError, fetch a new token and retry once
  if (!res.ok && data.exception && data.exception.includes("CSRFTokenError")) {
    console.warn("CSRF token expired or invalid, retrying...")
    window.csrf_token = null
    await ensureCsrfToken()
    
    const retryHeaders = {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': window.csrf_token || 'fetch'
    }
    res = await fetch(`${API}.${method}`, {
      method: 'POST',
      headers: retryHeaders,
      credentials: 'include',
      body: JSON.stringify(params),
    })
    
    newToken = res.headers.get('x-frappe-csrf-token')
    if (newToken) window.csrf_token = newToken
    data = await res.json()
  }
  
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

export function manualUpload(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    if (xhr.upload && onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          onProgress(percentComplete);
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.exc) {
            reject(new Error(data.exc_type || 'Server error'));
          } else {
            resolve(data.message);
          }
        } catch (err) {
          reject(new Error('Invalid server response'));
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          reject(new Error(data.message || `Request failed with status ${xhr.status}`));
        } catch (e) {
          reject(new Error(`Request failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error occurred during upload'));
    });

    xhr.open('POST', `${API}.upload_manual_data`);
    xhr.setRequestHeader('X-Frappe-CSRF-Token', window.csrf_token || 'fetch');
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}

export async function pollUploadJob(jobId) {
  return call('get_upload_job_status', { job_id: jobId })
}

export function updateCustomAttributes(id, attributes) {
  return call('update_custom_attributes', { project_id: id, custom_attributes: attributes })
}

export function checkFilesExist(paths) {
  return call('check_files_exist', { paths: JSON.stringify(paths) })
}

export async function submitWorkOrder(projectId, comment, file, approver, description, estimatedCost, estimatedDuration, tentativeStartDate) {
  const formData = new FormData()
  formData.append('project_id', projectId)
  formData.append('comment', comment || '')
  if (approver) {
    formData.append('approver', approver)
  }
  if (file) {
    formData.append('file', file)
  }
  if (description) {
    formData.append('description', description)
  }
  if (estimatedCost) {
    formData.append('estimated_cost', estimatedCost)
  }
  if (estimatedDuration) {
    formData.append('estimated_duration', estimatedDuration)
  }
  if (tentativeStartDate) {
    formData.append('tentative_start_date', tentativeStartDate)
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

export function fetchCategories() {
  return call('get_categories')
}

export function createCategory(data) {
  return call('create_category', {
    category_name: data.category_name,
    color: data.color || '#1a73e8',
    fill: data.fill ? 1 : 0,
    weight: data.weight || 3
  })
}

export function fetchGisUsersAndRoles() {
  return call('get_gis_users_and_roles')
}

export function createGisUser(data) {
  return call('create_gis_user', {
    email: data.email,
    first_name: data.first_name,
    last_name: data.last_name,
    roles: data.roles,
    ward_access: data.ward_access,
    password: data.password
  })
}

export function updateGisUser(data) {
  return call('update_gis_user', {
    email: data.email,
    first_name: data.first_name,
    last_name: data.last_name,
    roles: data.roles,
    ward_access: data.ward_access,
    enabled: data.enabled ? 1 : 0
  })
}

export function deleteGisUser(email) {
  return call('delete_gis_user', { email })
}

export function updateGisRolePermissions(permissions) {
  return call('update_gis_role_permissions', { permissions })
}

export function createGisRole(roleName) {
  return call('create_gis_role', { role_name: roleName })
}

export function fetchUserPermissions(email) {
  return call('get_user_permissions', { user: email })
}

export function addUserPermission(data) {
  return call('add_user_permission', {
    user: data.user,
    allow: data.allow,
    for_value: data.for_value
  })
}

export function deleteUserPermission(name) {
  return call('delete_user_permission', { name })
}

export function savePropertySurvey(data) {
  return call('save_property_survey', { data: JSON.stringify(data) })
}

export function fetchPropertySurveys() {
  return call('get_property_surveys')
}

export function registerTenant(data) {
  return call('register_tenant', data)
}

export function fetchRegisteredTenants(propertyId) {
  return call('get_registered_tenants', { property_id: propertyId })
}

export function fetchAllRegisteredTenants() {
  return call('get_all_registered_tenants')
}

export function fetchReportsData() {
  return call('get_reports_data')
}

