import { useEffect, useState, useMemo } from 'react';
import { fetchProjects, updateStatus } from '../api';

const STATUS_COLORS = {
  Draft:                 { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe', text: 'Draft' },
  'Pending for Request': { bg: '#fff7ed', color: '#ea580c', border: '#fde68a', text: 'Pending' },
  Correction:            { bg: '#fff1f2', color: '#e11d48', border: '#fecaca', text: 'Correction' },
  Submitted:             { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe', text: 'Under Review' },
  Approved:              { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', text: 'Approved' },
  Rejected:              { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', text: 'Rejected' },
  Cancelled:             { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1', text: 'Cancelled' },
};

const ROLE_ACTIONS = {
  'GIS Junior Engineer':    { nextStatus: ['Submitted', 'Cancelled'] },
  'GIS Assistant Engineer': { nextStatus: ['Approved', 'Rejected'] },
  'GIS Senior Engineer':    { nextStatus: ['Approved', 'Rejected'] },
  'GIS Department Head':    { nextStatus: ['Approved', 'Rejected'] },
  'System Manager':         { nextStatus: ['Submitted', 'Approved', 'Rejected', 'Cancelled'] },
  'Executive Engineer':     { nextStatus: ['Approved', 'Rejected', 'Correction'] },
  'City Engineer':          { nextStatus: ['Approved', 'Rejected', 'Correction'] },
  'Muncipal Commissioner':  { nextStatus: ['Approved', 'Rejected', 'Correction'] },
};

export default function Workflow({ userInfo, onNavigate }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All'); // 'All', 'Draft', 'Under Review', 'Pending'
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState(null);
  
  // Action states
  const [correctionComment, setCorrectionComment] = useState('');
  const [actioning, setActioning] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchProjects(null, null, true);
      setProjects(data || []);
      // If none selected, default to the first request in list
      if (data && data.length > 0 && !selected) {
        setSelected(data[0]);
      }
    } catch (e) {
      console.error(e);
      showNotification('Failed to load workflow requests', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showNotification = (msg, type = 'success') => {
    if (type === 'success') {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  const role = userInfo?.role || '';
  const roleActions = ROLE_ACTIONS[role] || {};

  // If System Manager (Admin), dynamically inherit the actions of the current project's approver role
  const allowedNextStatus = useMemo(() => {
    if (role !== 'System Manager') {
      return roleActions.nextStatus || [];
    }
    if (!selected) return [];
    
    const activeRole = selected.approver || 'GIS Junior Engineer';
    const activeActions = ROLE_ACTIONS[activeRole] || ROLE_ACTIONS['GIS Junior Engineer'];
    return activeActions.nextStatus || [];
  }, [role, selected, roleActions.nextStatus]);

  // Dynamic tab counts calculation matching old UI's logic for all 8 states
  const counts = useMemo(() => {
    const res = {
      All: 0,
      Draft: 0,
      'Under Review': 0,
      'Pending for Request': 0,
      Correction: 0,
      Approved: 0,
      Rejected: 0,
      Cancelled: 0
    };
    projects.forEach(p => {
      res.All++;
      if (p.status === 'Draft') res.Draft++;
      else if (p.status === 'Submitted') res['Under Review']++;
      else if (p.status === 'Pending for Request') res['Pending for Request']++;
      else if (p.status === 'Correction') res.Correction++;
      else if (p.status === 'Approved') res.Approved++;
      else if (p.status === 'Rejected') res.Rejected++;
      else if (p.status === 'Cancelled') res.Cancelled++;
    });
    return res;
  }, [projects]);

  // UI Filter tabs mapping to backend statuses:
  // - 'Under Review' -> 'Submitted'
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      // 1. Status Filter
      let matchesFilter = true;
      if (activeFilter === 'Draft') {
        matchesFilter = p.status === 'Draft';
      } else if (activeFilter === 'Under Review') {
        matchesFilter = p.status === 'Submitted';
      } else if (activeFilter === 'Pending for Request') {
        matchesFilter = p.status === 'Pending for Request';
      } else if (activeFilter === 'Correction') {
        matchesFilter = p.status === 'Correction';
      } else if (activeFilter === 'Approved') {
        matchesFilter = p.status === 'Approved';
      } else if (activeFilter === 'Rejected') {
        matchesFilter = p.status === 'Rejected';
      } else if (activeFilter === 'Cancelled') {
        matchesFilter = p.status === 'Cancelled';
      }

      // 2. Search Filter
      let matchesSearch = true;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        matchesSearch = 
          p.name?.toLowerCase().includes(query) ||
          p.id?.toLowerCase().includes(query) ||
          p.ward?.toLowerCase().includes(query);
      }

      return matchesFilter && matchesSearch;
    });
  }, [projects, activeFilter, searchQuery]);

  // Handle request selection
  const handleSelectRequest = (p) => {
    setSelected(p);
    setCorrectionComment('');
  };

  // Status transition handler
  const handleStatusChange = async (status, comment = null) => {
    if (!selected) return;
    setActioning(true);
    try {
      await updateStatus(selected.id, status, comment);
      showNotification(`Request successfully updated to: ${status}`);
      setCorrectionComment('');
      // Reload projects list
      const data = await fetchProjects(null, null, true);
      setProjects(data || []);
      // Keep selected but update locally
      const updated = data.find(p => p.id === selected.id);
      if (updated) setSelected(updated);
    } catch (e) {
      console.error(e);
      showNotification(e.message || 'Failed to update request status', 'error');
    } finally {
      setActioning(false);
    }
  };

  // Dynamic Submitter Details mapping
  const submittedBy = useMemo(() => {
    if (!selected) return '';
    return selected.owner || 'N/A';
  }, [selected]);

  const submissionDate = useMemo(() => {
    if (!selected) return '';
    const rawDate = selected.created_at || selected.creation;
    if (!rawDate) return 'N/A';
    try {
      const d = new Date(rawDate);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return String(rawDate).slice(0, 16);
    }
  }, [selected]);

  const documentsAttached = useMemo(() => {
    if (!selected) return 'No Documents Attached';
    const attach = selected.wo_attachment || selected.pdf_attachment;
    if (attach) {
      const filename = attach.split('/').pop();
      return (
        <a href={attach} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>
          {filename} 📎
        </a>
      );
    }
    return 'No Documents Attached';
  }, [selected]);

  // Dynamic Approval Timeline computation matching database workflow roles
  const timelineSteps = useMemo(() => {
    if (!selected) return [];

    const status = selected.status;
    const approver = selected.approver;

    // Workflow steps matching backend roles
    const steps = [
      {
        id: 1,
        title: 'Proposal Created',
        description: 'Completed',
        status: 'completed'
      },
      {
        id: 2,
        title: 'Executive Engineer Approval',
        description: 'Awaiting action',
        status: 'pending'
      },
      {
        id: 3,
        title: 'City Engineer Approval',
        description: 'Awaiting action',
        status: 'pending'
      },
      {
        id: 4,
        title: 'Muncipal Commissioner Approval',
        description: 'Awaiting action',
        status: 'pending'
      }
    ];

    if (status === 'Draft') {
      steps[0].status = 'completed';
      steps[1].status = 'pending';
      steps[1].description = 'Awaiting submission';
      steps[2].status = 'pending';
      steps[3].status = 'pending';
    } 
    else if (status === 'Pending for Request') {
      steps[0].status = 'completed';
      
      if (approver === 'Executive Engineer') {
        steps[1].status = 'active';
        steps[1].description = 'Awaiting action';
        steps[2].status = 'pending';
        steps[3].status = 'pending';
      } 
      else if (approver === 'City Engineer') {
        steps[1].status = 'completed';
        steps[1].description = 'Approved';
        steps[2].status = 'active';
        steps[2].description = 'Awaiting action';
        steps[3].status = 'pending';
      } 
      else if (approver === 'Muncipal Commissioner') {
        steps[1].status = 'completed';
        steps[1].description = 'Approved';
        steps[2].status = 'completed';
        steps[2].description = 'Approved';
        steps[3].status = 'active';
        steps[3].description = 'Awaiting action';
      }
    } 
    else if (status === 'Correction') {
      steps[0].status = 'completed';
      steps[1].status = 'error';
      steps[1].description = 'Sent for Correction';
      steps[2].status = 'pending';
      steps[3].status = 'pending';
    }
    else if (status === 'Approved') {
      steps[0].status = 'completed';
      steps[1].status = 'completed';
      steps[1].description = 'Approved';
      steps[2].status = 'completed';
      steps[2].description = 'Approved';
      steps[3].status = 'completed';
      steps[3].description = 'Approved';
    }
    else if (status === 'Rejected') {
      steps[0].status = 'completed';
      if (approver === 'Executive Engineer') {
        steps[1].status = 'error';
        steps[1].description = 'Rejected';
        steps[2].status = 'pending';
        steps[3].status = 'pending';
      } else if (approver === 'City Engineer') {
        steps[1].status = 'completed';
        steps[2].status = 'error';
        steps[2].description = 'Rejected';
        steps[3].status = 'pending';
      } else {
        steps[1].status = 'completed';
        steps[2].status = 'completed';
        steps[3].status = 'error';
        steps[3].description = 'Rejected';
      }
    }

    return steps;
  }, [selected]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc', overflow: 'hidden' }}>
      
      {/* Top Banner / Breadcrumb */}
      <div style={{ padding: '16px 28px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0, tracking: '-0.5px' }}>Workflow Management</h1>
          <p style={{ color: '#64748b', fontSize: '12px', margin: '4px 0 0' }}>Route development proposals, track approval timeline node status and edit attributes.</p>
        </div>
      </div>

      {/* Main Split Layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '24px' }}>
        
        {/* LEFT COLUMN: Requests List */}
        <div style={{ width: '380px', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', marginRight: '24px', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
            <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: '0 0 14px' }}>Requests</h2>
            
            {/* Search Input */}
            <div style={{ position: 'relative', marginBottom: '14px' }}>
              <input
                type="text"
                placeholder="Search project or request ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  fontSize: '13px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  background: '#f1f5f9'
                }}
                onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
              />
              <span style={{ position: 'absolute', left: '12px', top: '9px', color: '#94a3b8', fontSize: '13px' }}>🔍</span>
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['All', 'Draft', 'Under Review', 'Pending for Request', 'Correction', 'Approved', 'Rejected', 'Cancelled'].map((f) => {
                const isActive = activeFilter === f;
                const count = counts[f] || 0;
                return (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                      background: isActive ? '#2563eb' : '#f1f5f9',
                      color: isActive ? 'white' : '#64748b',
                      transition: 'background 0.2s'
                    }}
                  >
                    {f} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* List Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: '#94a3b8' }}>
                🔄 Loading requests...
              </div>
            ) : filteredProjects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>
                No requests found.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredProjects.map((p) => {
                  const isSelected = selected && selected.id === p.id;
                  const sc = STATUS_COLORS[p.status] || STATUS_COLORS.Draft;
                  
                  // Format creation date (e.g. 2026-08-16)
                  let displayDate = '';
                  const rawDate = p.created_at || p.creation;
                  if (rawDate) {
                    try {
                      const d = new Date(rawDate);
                      displayDate = d.toISOString().split('T')[0];
                    } catch (e) {
                      displayDate = String(rawDate).slice(0, 10);
                    }
                  }

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelectRequest(p)}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: isSelected ? '1px solid #bfdbfe' : '1px solid #f1f5f9',
                        background: isSelected ? '#eff6ff' : 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = '#bfdbfe';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.04)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = '#f1f5f9';
                          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.02)';
                        }
                      }}
                    >
                      {/* Top line: Project ID and Status Badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
                          {p.id}
                        </span>
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 8px',
                          borderRadius: '20px',
                          fontWeight: 700,
                          background: sc.bg,
                          color: sc.color,
                          border: `1px solid ${sc.border}`
                        }}>
                          {sc.text}
                        </span>
                      </div>
                      
                      {/* Middle line: Project Name (bold) */}
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                        {p.name}
                      </div>

                      {/* Bottom line: Ward/Type and Date */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94a3b8' }}>
                        <span>{p.ward || 'Manual Upload'} - {p.type}</span>
                        <span>{displayDate}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Request Details & Timeline */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', padding: '32px', textAlign: 'center' }}>
              <div style={{ fontSize: '42px', marginBottom: '12px', opacity: 0.3 }}>📋</div>
              <div style={{ fontSize: '13px' }}>Select a workflow request to view details</div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              
              {/* Profile Header */}
              <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                        {selected.name} Proposal
                      </h2>
                      {(() => {
                        const sc = STATUS_COLORS[selected.status] || STATUS_COLORS.Draft;
                        return (
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 8px',
                            borderRadius: '20px',
                            fontWeight: 700,
                            background: sc.bg,
                            color: sc.color,
                            border: `1px solid ${sc.border}`
                          }}>
                            {sc.text}
                          </span>
                        );
                      })()}
                    </div>
                    
                    <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>
                      Project ID: {selected.id} • Linked GIS location: {selected.road_name || selected.landmark || 'N/A'}, Ward {selected.ward?.replace('Ward', '').trim() || '08'}
                    </p>
                  </div>
                </div>

                {/* Submitter Details Block */}
                <div style={{ display: 'flex', gap: '32px', marginTop: '16px', background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #f1f5f9', fontSize: '12px', color: '#475569' }}>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Submitted By</span>
                    <span style={{ fontWeight: 700 }}>
                      {submittedBy}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Submission Date</span>
                    <span style={{ fontWeight: 700 }}>
                      {submissionDate}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Documents Attached</span>
                    <span style={{ fontWeight: 700 }}>
                      {documentsAttached}
                    </span>
                  </div>
                </div>
              </div>

              {/* Scrollable Timeline & Comments */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                
                <h3 style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 20px' }}>
                  Approval Timeline
                </h3>

                {/* Vertical Timeline container */}
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '24px', paddingLeft: '8px' }}>
                  {/* Vertical connecting line */}
                  <div style={{
                    position: 'absolute', left: '19px', top: '12px', bottom: '12px', width: '2px', background: '#e2e8f0', zIndex: 0
                  }} />

                  {timelineSteps.map(step => {
                    let iconBg = '#ffffff';
                    let iconBorder = '2px solid #cbd5e1';
                    let iconColor = '#94a3b8';
                    let iconSymbol = '•';
                    let titleColor = '#64748b';

                    if (step.status === 'completed') {
                      iconBg = '#22c55e';
                      iconBorder = '2px solid #22c55e';
                      iconColor = 'white';
                      iconSymbol = '✓';
                      titleColor = '#0f172a';
                    } else if (step.status === 'active') {
                      iconBg = '#f97316';
                      iconBorder = '2px solid #f97316';
                      iconColor = 'white';
                      iconSymbol = '!';
                      titleColor = '#ea580c';
                    } else if (step.status === 'error') {
                      iconBg = '#ef4444';
                      iconBorder = '2px solid #ef4444';
                      iconColor = 'white';
                      iconSymbol = '✕';
                      titleColor = '#dc2626';
                    }

                    return (
                      <div key={step.id} style={{ display: 'flex', gap: '16px', position: 'relative', zIndex: 1 }}>
                        <div style={{
                          width: '24px', height: '24px', borderRadius: '50%', background: iconBg, border: iconBorder, color: iconColor,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, flexShrink: 0
                        }}>
                          {iconSymbol}
                        </div>
                        
                        <div>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: titleColor, display: 'block' }}>
                            {step.title}
                          </span>
                          <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                            {step.description}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Show active comments or correction notes if present */}
                {selected.wo_comment && (
                  <div style={{ marginTop: '24px', padding: '16px', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca' }}>
                    <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#991b1b', margin: '0 0 6px', textTransform: 'uppercase' }}>
                      Correction Notes / Remarks
                    </h4>
                    <p style={{ fontSize: '12px', color: '#ef4444', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {selected.wo_comment}
                    </p>
                  </div>
                )}

                {/* Workflow Actions - Compact Modern Design */}
                {allowedNextStatus?.length > 0 && (
                  <div style={{ marginTop: '28px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                      <div style={{ width: '3px', height: '16px', background: 'linear-gradient(135deg, #1a73e8, #6366f1)', borderRadius: '2px' }} />
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Workflow Actions
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                      {allowedNextStatus.filter(s => s !== selected.status).map(s => {
                        const isApprove = s === 'Approved';
                        const isReject = s === 'Rejected';
                        const isCorrection = s === 'Correction';
                        const isSubmit = s === 'Submitted';
                        
                        const btnConfig = isApprove
                          ? { bg: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', border: 'transparent', icon: '✓', shadow: '0 2px 8px rgba(22,163,74,0.25)' }
                          : isReject
                          ? { bg: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff', border: 'transparent', icon: '✕', shadow: '0 2px 8px rgba(220,38,38,0.25)' }
                          : isCorrection
                          ? { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', icon: '↩', shadow: '0 2px 6px rgba(194,65,12,0.1)' }
                          : isSubmit
                          ? { bg: 'linear-gradient(135deg, #1a73e8, #1d4ed8)', color: '#fff', border: 'transparent', icon: '↑', shadow: '0 2px 8px rgba(26,115,232,0.25)' }
                          : { bg: '#f8fafc', color: '#475569', border: '#cbd5e1', icon: '→', shadow: 'none' };

                        const label = isSubmit ? 'Submit for Review' : isCorrection ? 'Send for Correction' : `Mark as ${s}`;

                        return (
                          <button
                            key={s}
                            onClick={() => {
                              if (isCorrection) {
                                if (!correctionComment.trim()) {
                                  showNotification("Please enter correction notes in the comment box below before sending.", "error");
                                  return;
                                }
                                handleStatusChange('Correction', correctionComment);
                              } else {
                                handleStatusChange(s);
                              }
                            }}
                            style={{
                              padding: '9px 18px',
                              borderRadius: '20px',
                              cursor: 'pointer',
                              fontWeight: 700,
                              fontSize: '12px',
                              background: btnConfig.bg,
                              color: btnConfig.color,
                              border: `1.5px solid ${btnConfig.border}`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              boxShadow: btnConfig.shadow,
                              transition: 'transform 0.15s, box-shadow 0.15s',
                              letterSpacing: '0.2px'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = btnConfig.shadow.replace('0.25', '0.4').replace('0.1', '0.2'); }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = btnConfig.shadow; }}
                          >
                            <span style={{ fontSize: '12px', fontWeight: 900 }}>{btnConfig.icon}</span>
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Correction Comment textarea */}
                    {allowedNextStatus.includes('Correction') && selected.status !== 'Correction' && (
                      <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: '10px', padding: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span>↩</span> Correction Note
                        </div>
                        <textarea
                          placeholder="Specify details or fields that need correction..."
                          value={correctionComment}
                          onChange={(e) => setCorrectionComment(e.target.value)}
                          style={{
                            width: '100%',
                            minHeight: '72px',
                            padding: '10px 12px',
                            fontSize: '13px',
                            border: '1.5px solid #fdba74',
                            borderRadius: '8px',
                            outline: 'none',
                            resize: 'vertical',
                            boxSizing: 'border-box',
                            fontFamily: 'inherit',
                            background: 'white',
                            color: '#1e293b'
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Action Buttons Panel */}
              <div style={{ padding: '20px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                {userInfo?.role === 'System Manager' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Admin Status Override:</span>
                    <select
                      value={selected.status}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      style={{
                        padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, outline: 'none', background: 'white', color: '#1e293b', cursor: 'pointer'
                      }}
                    >
                      <option value="Draft">Draft</option>
                      <option value="Submitted">Under Review</option>
                      <option value="Pending for Request">Pending</option>
                      <option value="Correction">Correction</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                )}

                <button
                  onClick={() => {
                    localStorage.setItem('gis_selected_project_id', selected.id);
                    if (onNavigate) onNavigate('map');
                  }}
                  style={{
                    background: 'white', color: '#2563eb', border: '1px solid #bfdbfe', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    marginLeft: 'auto'
                  }}
                >
                  View on Map
                </button>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* NOTIFICATIONS */}
      {successMsg && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#10b981', color: 'white', padding: '12px 24px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, boxShadow: '0 4px 12px rgba(16,185,129,0.3)', zIndex: 100 }}>
          ✅ {successMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#ef4444', color: 'white', padding: '12px 24px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, boxShadow: '0 4px 12px rgba(239,68,68,0.3)', zIndex: 100 }}>
          ❌ {errorMsg}
        </div>
      )}

    </div>
  );
}
