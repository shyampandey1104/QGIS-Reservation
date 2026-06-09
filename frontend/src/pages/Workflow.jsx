import { useEffect, useState } from 'react'
import { fetchProjects, updateStatus } from '../api'

const STATUS_COLORS = {
  Draft:                 { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' }, // Blue
  'Pending for Request': { bg: '#fff7ed', color: '#ea580c', border: '#fde68a' }, // Orange
  Correction:            { bg: '#fff1f2', color: '#e11d48', border: '#fecaca' }, // Rose/Red-orange
  Submitted:             { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' }, // Blue
  Approved:              { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  Rejected:              { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' }, // Red
  Cancelled:             { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' }, // Grey
  'Work Started':        { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  Ongoing:               { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  'On Hold':             { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  Hold:                  { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  'Near Completion':     { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }, // Green
  Completed:             { bg: '#dcfce7', color: '#14532d', border: '#86efac' }, // Dark Green
}

const ROLE_ACTIONS = {
  'GIS Junior Engineer':    { nextStatus: ['Submitted', 'Cancelled'] },
  'GIS Assistant Engineer': { nextStatus: ['Approved', 'Rejected'] },
  'GIS Senior Engineer':    { nextStatus: ['Approved', 'Rejected'] },
  'GIS Department Head':    { nextStatus: ['Approved', 'Rejected'] },
  'System Manager':         { nextStatus: ['Submitted', 'Approved', 'Rejected', 'Cancelled'] },
  'Executive Engineer':     { nextStatus: ['Approved', 'Rejected', 'Correction'] },
  'City Engineer':          { nextStatus: ['Approved', 'Rejected', 'Correction'] },
  'Muncipal Commissioner':  { nextStatus: ['Approved', 'Rejected', 'Correction'] },
}

const FILTERS = ['All', 'Draft', 'Submitted', 'Pending for Request', 'Correction', 'Approved', 'Rejected', 'Cancelled']

export default function Workflow({ userInfo }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('Pending for Request')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [limit, setLimit] = useState(100)
  const [correctionComment, setCorrectionComment] = useState('')
  const [customAlert, setCustomAlert] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showAddField, setShowAddField] = useState(false)
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldValue, setNewFieldValue] = useState('')

  const alert = (message, type = 'success') => {
    let alertType = type;
    const msgLower = String(message).toLowerCase();
    if (msgLower.includes('failed') || msgLower.includes('error') || msgLower.includes('missing') || msgLower.includes('exception') || msgLower.includes('please') || msgLower.includes('enter')) {
      alertType = 'error';
    }
    setCustomAlert({ type: alertType, message: String(message) });
  };

  const role = userInfo?.role || ''
  const roleActions = ROLE_ACTIONS[role] || {}

  // If System Manager (Admin), dynamically inherit the actions of the current project's approver role
  const allowedNextStatus = (() => {
    if (role !== 'System Manager') {
      return roleActions.nextStatus || [];
    }
    if (!selected) return [];
    
    const activeRole = selected.approver || 'GIS Junior Engineer';
    const activeActions = ROLE_ACTIONS[activeRole] || ROLE_ACTIONS['GIS Junior Engineer'];
    return activeActions.nextStatus || [];
  })();

  const load = () => {
    fetchProjects(null, null, true)
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Reset limit when filter or search changes
  useEffect(() => {
    setLimit(100)
  }, [filter, search])

  const isApproverRole = ['Executive Engineer', 'City Engineer', 'Muncipal Commissioner'].includes(role)
  const roleProjects = projects.filter(p => {
    if (isApproverRole) {
      return p.approver === role
    }
    return true
  })

  const filtered = roleProjects.filter(p => {
    const matchFilter = filter === 'All' || p.status === filter
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.ward?.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const counts = {
    All: roleProjects.length,
    Draft: roleProjects.filter(p => p.status === 'Draft').length,
    Submitted: roleProjects.filter(p => p.status === 'Submitted').length,
    'Pending for Request': roleProjects.filter(p => p.status === 'Pending for Request').length,
    Correction: roleProjects.filter(p => p.status === 'Correction').length,
    Approved: roleProjects.filter(p => p.status === 'Approved').length,
    Rejected: roleProjects.filter(p => p.status === 'Rejected').length,
    Cancelled: roleProjects.filter(p => p.status === 'Cancelled').length,
  }

  const handleStatusChange = async (id, status, comment = null) => {
    try {
      await updateStatus(id, status, comment)
      load()
      setSelected(prev => prev?.id === id ? { ...prev, status, wo_comment: comment || prev.wo_comment } : prev)
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
            {filtered.slice(0, limit).map((p, i) => {
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
                        {p.id}
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
            
            {filtered.length > limit && (
               <button 
                  onClick={() => setLimit(prev => prev + 100)}
                  style={{ width: '100%', padding: '12px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginTop: '8px' }}
               >
                  Load More ({filtered.length - limit} remaining)
               </button>
            )}
          </div>
        </div>

        {/* Right - detail panel */}
        <div style={{ width: '580px', background: 'white', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Project Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                      <span style={{ color: '#9ca3af', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '3px' }}>Project ID</span>
                      <span style={{ color: '#1a2d45', fontSize: '13px', fontWeight: 700, fontFamily: 'monospace' }}>{selected.id}</span>
                    </div>
                    {Object.entries(selected)
                      .filter(([k, v]) => {
                        const skipKeys = [
                          'id', 'name', 'status', 'geom_type', 'coordinates', 
                          'wo_id', 'wo_comment', 'wo_attachment', 'approver', 
                          'created_at', 'modified', 'doctype', 'owner', 'modified_by',
                          'submitted_by_role'
                        ]
                        return !skipKeys.includes(k) && (isEditing || (v !== null && v !== undefined && v !== ''))
                      })
                      .map(([key, value]) => {
                        const formatLabel = (s) => s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                        return (
                          <div key={key} style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                            <span style={{ color: '#9ca3af', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '3px' }}>
                              {formatLabel(key)}
                            </span>
                            {isEditing ? (
                              <input
                                value={value || ''}
                                onChange={(e) => setSelected({ ...selected, [key]: e.target.value })}
                                style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                              />
                            ) : (
                              <span style={{ color: '#1e293b', fontSize: '13px', fontWeight: 500, wordBreak: 'break-word' }}>
                                {String(value)}
                              </span>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>

                {/* Work Order Details */}
                {selected.wo_id && (
                  <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px', marginTop: '16px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Work Order Details</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                      <span style={{ color: '#9ca3af', fontWeight: 500 }}>Work Order ID</span>
                      <span style={{ color: '#374151', fontWeight: 600 }}>{selected.wo_id}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                      <span style={{ color: '#9ca3af', fontWeight: 500 }}>Approver</span>
                      <span style={{ color: '#374151', fontWeight: 600 }}>{selected.approver}</span>
                    </div>
                    {selected.wo_comment && (
                      <div style={{ marginBottom: '8px', fontSize: '13px' }}>
                        <div style={{ color: '#9ca3af', fontWeight: 500, marginBottom: '4px' }}>Comment</div>
                        <div style={{ color: '#374151', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap' }}>
                          {selected.wo_comment}
                        </div>
                      </div>
                    )}
                    {selected.wo_attachment && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '13px' }}>
                        <span style={{ color: '#9ca3af', fontWeight: 500 }}>Attachment</span>
                        <a 
                          href={selected.wo_attachment} 
                          target="_blank" 
                          rel="noreferrer" 
                          style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          📎 View Attachment
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Junior Engineer/Admin Correction Editing Tools */}
                {(selected.status === 'Correction') && (role === 'GIS Junior Engineer' || role === 'System Manager') && (
                  <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px', marginTop: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Correction Tools</div>
                    
                    {showAddField ? (
                      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Add Custom Field</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input placeholder="Label (e.g. Area)" value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', width: '50%' }} />
                          <input placeholder="Value (e.g. 100 sqft)" value={newFieldValue} onChange={(e) => setNewFieldValue(e.target.value)} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', width: '50%' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={async () => {
                            if (newFieldLabel && newFieldValue) {
                              const skipKeys = [
                                'id', 'name', 'status', 'geom_type', 'coordinates', 
                                'wo_id', 'wo_comment', 'wo_attachment', 'approver', 
                                'created_at', 'modified', 'doctype', 'owner', 'modified_by',
                                'submitted_by_role'
                              ];
                              const customAttrs = {};
                              Object.keys(selected).forEach(k => {
                                if (!skipKeys.includes(k)) customAttrs[k] = selected[k];
                              });
                              customAttrs[newFieldLabel] = newFieldValue;

                              try {
                                const res = await fetch('/api/method/qgis.api.gis_project.update_custom_attributes', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ project_id: selected.id, custom_attributes: customAttrs })
                                }).then(r => r.json());

                                if (res.message && res.message.id) {
                                  alert('Field added successfully!');
                                  setSelected({
                                    ...selected,
                                    [newFieldLabel]: newFieldValue,
                                    custom_attributes: JSON.stringify(customAttrs)
                                  });
                                  load();
                                }
                              } catch (e) {
                                alert('Failed to save field: ' + e.message);
                              }
                              setShowAddField(false);
                              setNewFieldLabel('');
                              setNewFieldValue('');
                            }
                          }} style={{ flex: 1, padding: '8px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Save Field</button>
                          <button onClick={() => { setShowAddField(false); setNewFieldLabel(''); setNewFieldValue(''); }} style={{ flex: 1, padding: '8px', background: '#e2e8f0', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                        <button onClick={() => setShowAddField(true)} style={{ flex: 1, padding: '10px', background: '#e8f0fe', color: '#1a73e8', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>➕ Add Field</button>
                        
                        {isEditing ? (
                          <button onClick={async () => {
                            try {
                              const data = { ...selected };
                              const skipKeys = [
                                'wo_id', 'wo_comment', 'wo_attachment', 'approver', 
                                'created_at', 'modified', 'doctype', 'owner', 'modified_by',
                                'submitted_by_role'
                              ];
                              skipKeys.forEach(k => delete data[k]);
                              
                              const res = await fetch('/api/method/frappe.client.set_value', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ doctype: 'GIS Project', name: selected.id, fieldname: data })
                              }).then(r => r.json());
                              if (!res.exc) {
                                alert('Project details updated successfully!');
                                setIsEditing(false);
                                load();
                              } else {
                                throw new Error(res.exc);
                              }
                            } catch (e) {
                              alert('Failed to update project: ' + e.message);
                            }
                          }} style={{ flex: 1.2, padding: '10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>💾 Update Changes</button>
                        ) : (
                          <button onClick={() => setIsEditing(true)} style={{ flex: 1, padding: '10px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>✏️ Edit Attributes</button>
                        )}
                        {isEditing && (
                          <button onClick={() => { setIsEditing(false); load(); }} style={{ padding: '10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Cancel</button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Workflow actions */}
                {allowedNextStatus?.length > 0 && (
                  <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Workflow Actions</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {allowedNextStatus.filter(s => s !== selected.status).map(s => {
                        const sc = STATUS_COLORS[s] || STATUS_COLORS.Draft
                        return (
                          <button key={s} onClick={() => {
                            if (s === 'Correction') {
                              if (!correctionComment.trim()) {
                                alert("Please enter correction notes in the comment box below before sending.");
                                return;
                              }
                              handleStatusChange(selected.id, 'Correction', correctionComment);
                              setCorrectionComment('');
                            } else {
                              handleStatusChange(selected.id, s);
                            }
                          }} style={{
                            padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
                            background: sc.bg, color: sc.color, border: `1.5px solid ${sc.border}`,
                            textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px'
                          }}>
                            <span>→</span>
                            {s === 'Submitted' ? 'Submit for Review' : (s === 'Correction' ? 'Send for Correction' : `Mark as ${s}`)}
                          </button>
                        )
                      })}

                      {/* Send for Correction block with Comment input */}
                      {allowedNextStatus.includes('Correction') && selected.status !== 'Correction' && (
                        <div style={{ marginTop: '10px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Correction Comment</div>
                          <textarea
                            placeholder="Specify details or fields that need correction..."
                            value={correctionComment}
                            onChange={(e) => setCorrectionComment(e.target.value)}
                            style={{
                              width: '100%', minHeight: '70px', padding: '10px', fontSize: '13px',
                              border: '1.5px solid #cbd5e1', borderRadius: '8px', outline: 'none',
                              resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                              background: 'white'
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
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
                {customAlert.type === 'error' ? 
                  (customAlert.message.toLowerCase().includes('note') || customAlert.message.toLowerCase().includes('comment') ? 'Note Required' : 'Operation Failed') 
                  : 'Success'}
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
