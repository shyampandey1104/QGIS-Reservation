import { useEffect, useState, useMemo } from 'react';
import {
  fetchGisUsersAndRoles,
  createGisUser,
  updateGisUser,
  deleteGisUser,
  updateGisRolePermissions,
  createGisRole,
  fetchUserPermissions,
  addUserPermission,
  deleteUserPermission
} from '../api';

export default function UsersRoles() {
  const [users, setUsers] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  const [roleCounts, setRoleCounts] = useState({});
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tab selector for highlighting role details
  const [activeRoleTab, setActiveRoleTab] = useState('Administrator');
  
  // Selected user state for details view
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPerms, setUserPerms] = useState([]);
  const [loadingPerms, setLoadingPerms] = useState(false);
  
  // State for adding new user permission
  const [newPerm, setNewPerm] = useState({
    allow: 'GIS Project',
    for_value: ''
  });

  // Modal for creating a new user
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Inline Role Creation State
  const [newRoleName, setNewRoleName] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);

  // Form states - now using roles array
  const [newUser, setNewUser] = useState({
    email: '',
    first_name: '',
    last_name: '',
    roles: ['GIS Junior Engineer'],
    ward_access: 'Ward 08',
    password: '',
    custom_ward: ''
  });
  const [editUser, setEditUser] = useState({
    email: '',
    first_name: '',
    last_name: '',
    roles: [],
    ward_access: 'Ward 08',
    enabled: true,
    custom_ward: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchGisUsersAndRoles();
      setUsers(data.users || []);
      setAllRoles(data.all_roles || []);
      setRoleCounts(data.role_counts || {});
      setPermissions(data.permissions || {});
    } catch (e) {
      console.error(e);
      showNotification('Failed to load users and roles data', 'error');
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

  // Filtered users list based on search
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(u => 
      u.name.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query) ||
      u.ward_access.toLowerCase().includes(query) ||
      u.roles.some(r => r.toLowerCase().includes(query))
    );
  }, [users, searchQuery]);

  // Load backend User Permissions for selected user
  const loadUserPermissions = async (email) => {
    setLoadingPerms(true);
    try {
      const perms = await fetchUserPermissions(email);
      setUserPerms(perms || []);
    } catch (err) {
      console.error(err);
      showNotification('Failed to load user permissions', 'error');
    } finally {
      setLoadingPerms(false);
    }
  };

  // Select user click handler
  const handleUserSelect = (u) => {
    setSelectedUser(u);
    const isCustom = !['All Wards', 'Ward 08', 'Ward 12', 'Ward 14', 'Roads'].includes(u.ward_access);
    setEditUser({
      email: u.email,
      first_name: u.first_name || u.name.split(' ')[0],
      last_name: u.last_name || u.name.split(' ').slice(1).join(' ') || '',
      roles: u.roles || [],
      ward_access: isCustom ? 'Custom' : u.ward_access,
      enabled: u.enabled === 1 || u.enabled === true,
      custom_ward: isCustom ? u.ward_access : ''
    });
    loadUserPermissions(u.email);
  };

  // Handle permission toggle in the matrix
  const handlePermissionToggle = async (role, permKey) => {
    const updatedPermissions = { ...permissions };
    if (!updatedPermissions[role]) updatedPermissions[role] = {};
    updatedPermissions[role][permKey] = !updatedPermissions[role][permKey];
    
    // Optimistic UI update
    setPermissions(updatedPermissions);

    try {
      await updateGisRolePermissions(updatedPermissions);
      showNotification(`Permissions updated for ${role}`);
    } catch (e) {
      console.error(e);
      showNotification('Failed to save permissions to backend', 'error');
      // Rollback
      loadData();
    }
  };

  // Handle adding new Role level to database
  const handleCreateRole = async (e) => {
    e.preventDefault();
    if (!newRoleName.trim()) {
      showNotification('Please enter a role name', 'error');
      return;
    }
    setCreatingRole(true);
    try {
      await createGisRole(newRoleName.trim());
      showNotification(`Role "${newRoleName}" created successfully`);
      setNewRoleName('');
      // Reload roles list
      const data = await fetchGisUsersAndRoles();
      setAllRoles(data.all_roles || []);
    } catch (err) {
      console.error(err);
      showNotification(err.message || 'Failed to create role', 'error');
    } finally {
      setCreatingRole(false);
    }
  };

  // Create User submit handler
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.first_name || !newUser.password) {
      showNotification('Please fill in all mandatory fields', 'error');
      return;
    }
    if (newUser.roles.length === 0) {
      showNotification('Please select at least one role', 'error');
      return;
    }
    setSaving(true);
    try {
      const ward = newUser.ward_access === 'Custom' ? newUser.custom_ward : newUser.ward_access;
      await createGisUser({
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        roles: newUser.roles,
        ward_access: ward || 'All Wards',
        password: newUser.password
      });
      showNotification('User created successfully');
      setIsAddModalOpen(false);
      setNewUser({
        email: '',
        first_name: '',
        last_name: '',
        roles: ['GIS Junior Engineer'],
        ward_access: 'Ward 08',
        password: '',
        custom_ward: ''
      });
      loadData();
    } catch (err) {
      console.error(err);
      showNotification(err.message || 'Failed to create user', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Update User submit handler
  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (editUser.roles.length === 0) {
      showNotification('Please select at least one role', 'error');
      return;
    }
    setSaving(true);
    try {
      const ward = editUser.ward_access === 'Custom' ? editUser.custom_ward : editUser.ward_access;
      await updateGisUser({
        email: editUser.email,
        first_name: editUser.first_name,
        last_name: editUser.last_name,
        roles: editUser.roles,
        ward_access: ward || 'All Wards',
        enabled: editUser.enabled
      });
      showNotification('User profile settings updated');
      
      // Update selected user local state reference
      const updatedUser = {
        ...selectedUser,
        first_name: editUser.first_name,
        last_name: editUser.last_name,
        name: `${editUser.first_name} ${editUser.last_name}`.strip || editUser.email,
        roles: editUser.roles,
        ward_access: ward || 'All Wards',
        enabled: editUser.enabled
      };
      setSelectedUser(updatedUser);
      loadData();
    } catch (err) {
      console.error(err);
      showNotification(err.message || 'Failed to update user', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Delete User handler
  const handleDeleteUser = async (email) => {
    if (!window.confirm(`Are you sure you want to delete user ${email}?`)) return;
    try {
      await deleteGisUser(email);
      showNotification('User deleted successfully');
      setSelectedUser(null);
      loadData();
    } catch (err) {
      console.error(err);
      showNotification(err.message || 'Failed to delete user', 'error');
    }
  };

  // User Permission handlers
  const handleAddUserPerm = async (e) => {
    e.preventDefault();
    if (!newPerm.for_value.trim()) {
      showNotification('Please enter a allowed value', 'error');
      return;
    }
    try {
      await addUserPermission({
        user: selectedUser.email,
        allow: newPerm.allow,
        for_value: newPerm.for_value.trim()
      });
      showNotification('User permission added');
      setNewPerm({ ...newPerm, for_value: '' });
      loadUserPermissions(selectedUser.email);
    } catch (err) {
      console.error(err);
      showNotification(err.message || 'Failed to add permission', 'error');
    }
  };

  const handleDeleteUserPerm = async (name) => {
    try {
      await deleteUserPermission(name);
      showNotification('User permission deleted');
      loadUserPermissions(selectedUser.email);
    } catch (err) {
      console.error(err);
      showNotification(err.message || 'Failed to delete permission', 'error');
    }
  };

  // Helper to format roles array for display on user card
  const formatUserRoles = (roles) => {
    const displayRoles = roles.filter(r => r !== 'All');
    if (displayRoles.length === 0) return 'No Roles';
    
    const mapped = displayRoles.map(r => {
      if (r === 'System Manager') return 'Admin';
      if (r === 'GIS Junior Engineer') return 'Junior Eng';
      if (r === 'GIS Assistant Engineer') return 'Asst Eng';
      if (r === 'GIS Senior Engineer') return 'Sr Eng';
      return r;
    });
    return mapped.join(', ');
  };

  // Active matrix roles tabs filter list
  const matrixRoles = ['System Manager', 'Executive Engineer', 'City Engineer', 'Muncipal Commissioner'];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc', overflow: 'hidden' }}>
      
      {/* Top Banner / Breadcrumb */}
      <div style={{ padding: '16px 28px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0, tracking: '-0.5px' }}>Users & Role Management</h1>
          <p style={{ color: '#64748b', fontSize: '12px', margin: '4px 0 0' }}>Manage municipal staff accounts, role levels, and platform access permissions.</p>
        </div>
        
        {/* Global Search Input */}
        <div style={{ position: 'relative', width: '280px' }}>
          <input
            type="text"
            placeholder="Search staff, role, ward..."
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
      </div>

      {/* Main Split Layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '24px' }}>
        
        {/* LEFT COLUMN: Users List */}
        <div style={{ width: '380px', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', marginRight: '24px', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Users</h2>
              {selectedUser && (
                <button
                  onClick={() => setSelectedUser(null)}
                  style={{
                    background: '#f1f5f9', color: '#64748b', border: 'none', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Clear Selection
                </button>
              )}
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              style={{
                background: '#2563eb', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                cursor: 'pointer', boxShadow: '0 2px 4px rgba(37,99,235,0.2)', transition: 'opacity 0.2s'
              }}
              onMouseOver={(e) => e.target.style.opacity = 0.9}
              onMouseOut={(e) => e.target.style.opacity = 1}
            >
              + Add User
            </button>
          </div>

          {/* List Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: '#94a3b8' }}>
                🔄 Loading staff...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>
                No staff members found matching search.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredUsers.map((u) => {
                  const isSelected = selectedUser && selectedUser.email === u.email;
                  return (
                    <div
                      key={u.email}
                      onClick={() => handleUserSelect(u)}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: isSelected ? '1px solid #bfdbfe' : '1px solid #f1f5f9',
                        background: isSelected ? '#eff6ff' : (u.enabled ? '#ffffff' : '#f8fafc'),
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                        boxShadow: isSelected ? '0 4px 12px rgba(37,99,235,0.06)' : '0 1px 2px rgba(0,0,0,0.02)'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = '#bfdbfe';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = '#f1f5f9';
                          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.02)';
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '85%' }}>
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '50%',
                          background: isSelected ? '#2563eb' : (u.enabled ? '#eff6ff' : '#f1f5f9'),
                          color: isSelected ? 'white' : (u.enabled ? '#2563eb' : '#94a3b8'),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '14px', flexShrink: 0
                        }}>
                          {u.name.substring(0, 2).toUpperCase()}
                        </div>
                        
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: u.enabled ? '#0f172a' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {u.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <span style={{ color: isSelected ? '#1d4ed8' : '#2563eb', fontWeight: 600 }}>{formatUserRoles(u.roles)}</span>
                            <span>•</span>
                            <span style={{ color: '#64748b', fontWeight: 500 }}>{u.ward_access}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {!u.enabled && (
                          <span style={{ fontSize: '10px', color: '#ef4444', background: '#fee2e2', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            Disabled
                          </span>
                        )}
                        <span style={{ color: isSelected ? '#2563eb' : '#cbd5e1', fontSize: '14px' }}>➔</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: DYNAMIC PANEL (Global Settings OR Selected User Configuration) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          
          {!selectedUser ? (
            /* ========================================================================= */
            /* GLOBAL SETTINGS MODE: Permission Matrix                                   */
            /* ========================================================================= */
            <>
              <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Global Roles & Permissions</h2>
                  <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: '11px' }}>Toggle standard Custom DocPerm values dynamically in backend database.</p>
                </div>
              </div>

              {/* Role selector tabs */}
              <div style={{ padding: '20px 24px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '14px', flexShrink: 0 }}>
                {matrixRoles.map(rName => {
                  const active = activeRoleTab === rName || (rName === 'System Manager' && activeRoleTab === 'Administrator') || (rName === 'GIS Junior Engineer' && activeRoleTab === 'Junior Engineer');
                  const friendlyName = rName === 'System Manager' ? 'Administrator' : rName.replace('GIS ', '');
                  return (
                    <div
                      key={rName}
                      onClick={() => setActiveRoleTab(rName === 'System Manager' ? 'Administrator' : rName === 'GIS Junior Engineer' ? 'Junior Engineer' : rName.replace('GIS ', ''))}
                      style={{
                        flex: 1,
                        background: active ? '#ffffff' : '#f1f5f9',
                        border: active ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: active ? '0 4px 6px rgba(37,99,235,0.04)' : 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                    >
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>ROLE</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: active ? '#1e3a8a' : '#475569' }}>
                        {friendlyName === 'Administrator' ? 'Admin' : friendlyName}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontWeight: 500 }}>
                        {roleCounts[friendlyName] || 0} user{(roleCounts[friendlyName] || 0) !== 1 ? 's' : ''}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Scrollable Matrix Table */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <h3 style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 16px' }}>
                  Permission Matrix
                </h3>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: 800, color: '#475569', width: '30%' }}>Feature / Action</th>
                        {matrixRoles.map(rBackend => {
                          const rUi = rBackend === 'System Manager' ? 'Administrator' : rBackend === 'GIS Junior Engineer' ? 'Junior Engineer' : rBackend.replace('GIS ', '');
                          const friendlyName = rUi === 'Administrator' ? 'Admin' : (rUi === 'Muncipal Commissioner' ? 'Municipal Comm' : (rUi === 'Executive Engineer' ? 'Exec Eng' : (rUi === 'City Engineer' ? 'City Eng' : rUi)));
                          return (
                            <th key={rBackend} style={{ padding: '14px 12px', fontSize: '12px', fontWeight: 800, color: activeRoleTab === rUi ? '#2563eb' : '#475569', textAlign: 'center' }}>
                              {friendlyName}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'view_map', label: 'View Map' },
                        { key: 'upload_layer', label: 'Upload Layer' },
                        { key: 'edit_attributes', label: 'Edit Attributes' },
                        { key: 'create_proposal', label: 'Create Proposal' },
                        { key: 'approve_request', label: 'Approve Request' },
                        { key: 'generate_work_order', label: 'Generate Work Order' },
                        { key: 'manage_users', label: 'Manage Users' }
                      ].map((row, idx) => (
                        <tr
                          key={row.key}
                          style={{
                            borderBottom: idx === 6 ? 'none' : '1px solid #f1f5f9',
                            background: idx % 2 === 0 ? '#ffffff' : '#fafafa'
                          }}
                        >
                          <td style={{ padding: '14px 18px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                             {row.label}
                          </td>
                          {matrixRoles.map(rBackend => {
                            const checked = !!(permissions[rBackend] && permissions[rBackend][row.key]);
                            const rUi = rBackend === 'System Manager' ? 'Administrator' : rBackend === 'GIS Junior Engineer' ? 'Junior Engineer' : rBackend.replace('GIS ', '');
                            const highlight = activeRoleTab === rUi;
                            return (
                              <td key={rBackend} style={{ padding: '14px 12px', textAlign: 'center', background: highlight ? '#eff6ff' : 'transparent' }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => handlePermissionToggle(rBackend, row.key)}
                                  style={{
                                    width: '17px', height: '17px', accentColor: '#2563eb', cursor: 'pointer', transition: 'transform 0.1s'
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: '24px', padding: '16px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#1e3a8a', margin: '0 0 4px' }}>
                    Standard Custom DocPerm Integration
                  </h4>
                  <p style={{ fontSize: '12px', color: '#2563eb', margin: 0, lineHeight: 1.5 }}>
                    These check boxes represent backend permissions on standard Frappe documents. Checking a box updates the actual security database rules instantly in the backend. Click on any staff member on the left list to see their individual document-level permissions.
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* ========================================================================= */
            /* USER DETAIL CONFIGURATION MODE                                            */
            /* ========================================================================= */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              
              {/* Profile Header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '16px'
                  }}>
                    {selectedUser.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>{selectedUser.name}</h3>
                    <p style={{ color: '#64748b', fontSize: '12px', margin: '2px 0 0' }}>{selectedUser.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  style={{
                    background: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  ✕ Close Profile
                </button>
              </div>

              {/* Scrollable Configuration Forms */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* Section 1: Account Info */}
                <form onSubmit={handleUpdateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Account Profile Settings
                  </h4>

                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>First Name</label>
                      <input
                        type="text"
                        required
                        value={editUser.first_name}
                        onChange={(e) => setEditUser({ ...editUser, first_name: e.target.value })}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '13px' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Last Name</label>
                      <input
                        type="text"
                        value={editUser.last_name}
                        onChange={(e) => setEditUser({ ...editUser, last_name: e.target.value })}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '13px' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Ward Access level</label>
                    <select
                      value={editUser.ward_access}
                      onChange={(e) => setEditUser({ ...editUser, ward_access: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '13px', background: 'white' }}
                    >
                      <option value="All Wards">All Wards</option>
                      <option value="Ward 08">Ward 08</option>
                      <option value="Ward 12">Ward 12</option>
                      <option value="Ward 14">Ward 14</option>
                      <option value="Roads">Roads</option>
                      <option value="Custom">Custom Level...</option>
                    </select>
                  </div>

                  {editUser.ward_access === 'Custom' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Enter Custom Ward / Access Level Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Ward 18, Water Dept"
                        value={editUser.custom_ward}
                        onChange={(e) => setEditUser({ ...editUser, custom_ward: e.target.value })}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '13px' }}
                      />
                    </div>
                  )}

                  {/* Role Assignment Checklist */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Assigned System Roles</label>
                    <div style={{ maxHeight: '110px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', background: '#f8fafc' }}>
                      {allRoles.map(role => (
                        <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={editUser.roles.includes(role)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditUser({ ...editUser, roles: [...editUser.roles, role] });
                              } else {
                                setEditUser({ ...editUser, roles: editUser.roles.filter(r => r !== role) });
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          {role}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Enable Switch and Update Action */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        id="userEnabledCheckbox"
                        checked={editUser.enabled}
                        onChange={(e) => setEditUser({ ...editUser, enabled: e.target.checked })}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <label htmlFor="userEnabledCheckbox" style={{ fontSize: '13px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                        Enable account login
                      </label>
                    </div>
                    
                    <button
                      type="submit"
                      disabled={saving}
                      style={{
                        padding: '8px 20px', background: '#2563eb', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: 'white'
                      }}
                    >
                      {saving ? 'Updating...' : 'Save Profile Changes'}
                    </button>
                  </div>
                </form>

                {/* Section 2: User Permissions List (ACTUAL BACKEND USER PERMISSIONS) */}
                <div style={{ padding: '20px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    User Permissions (Document Access Control)
                  </h4>
                  <p style={{ margin: '0 0 16px', color: '#94a3b8', fontSize: '11px', lineHeight: '1.4' }}>
                    Explicit document-level access permissions mapped to standard backend <b>User Permission</b> rules.
                  </p>

                  {/* List of Permissions */}
                  <div style={{ marginBottom: '20px' }}>
                    {loadingPerms ? (
                      <div style={{ padding: '10px', color: '#94a3b8', fontSize: '12px' }}>🔄 Loading permissions...</div>
                    ) : userPerms.length === 0 ? (
                      <div style={{ padding: '16px', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>
                        No explicit document permissions assigned. This user defaults to standard role access.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {userPerms.map(perm => (
                          <div
                            key={perm.name}
                            style={{
                              padding: '10px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}
                          >
                            <div>
                              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', fontWeight: 700 }}>ALLOW DOCTYPE: {perm.allow}</span>
                              <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>Value: {perm.for_value}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteUserPerm(perm.name)}
                              style={{
                                border: 'none', background: '#fee2e2', color: '#ef4444', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add Permission Inline Form */}
                  <form onSubmit={handleAddUserPerm} style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block' }}>ADD NEW DOCUMENT PERMISSION</span>
                    
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <select
                          value={newPerm.allow}
                          onChange={(e) => setNewPerm({ ...newPerm, allow: e.target.value })}
                          style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '12px', background: 'white' }}
                        >
                          <option value="GIS Project">GIS Project</option>
                          <option value="Initiate Work Order">Initiate Work Order</option>
                          <option value="User">User</option>
                        </select>
                      </div>
                      
                      <div style={{ flex: 1.5 }}>
                        <input
                          type="text"
                          required
                          placeholder="For Value (e.g. Ward 08 or GIS-PROJ-00001)"
                          value={newPerm.for_value}
                          onChange={(e) => setNewPerm({ ...newPerm, for_value: e.target.value })}
                          style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '12px' }}
                        />
                      </div>
                      
                      <button
                        type="submit"
                        style={{
                          background: '#2563eb', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        + Add Perm
                      </button>
                    </div>
                  </form>
                </div>

                {/* Section 3: Dangerous Zone (Account Deletion) */}
                <div style={{ padding: '20px', border: '1px solid #fecaca', borderRadius: '12px', background: '#fff5f5' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#991b1b', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Danger Zone
                  </h4>
                  <p style={{ margin: '0 0 16px', color: '#dc2626', fontSize: '11px' }}>
                    Once deleted, this user account and its custom profile settings will be permanently removed from the backend database.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDeleteUser(selectedUser.email)}
                    style={{
                      padding: '8px 18px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    Delete Staff Account Permanently
                  </button>
                </div>

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

      {/* ADD USER MODAL */}
      {isAddModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90 }}>
          <div style={{ background: 'white', borderRadius: '16px', width: '500px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Add New Staff Member</h3>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            
            <form onSubmit={handleCreateUser} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>First Name *</label>
                  <input
                    type="text"
                    required
                    value={newUser.first_name}
                    onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '13px' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Last Name</label>
                  <input
                    type="text"
                    value={newUser.last_name}
                    onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Email Address *</label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Login Password *</label>
                <input
                  type="password"
                  required
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Ward Access</label>
                <select
                  value={newUser.ward_access}
                  onChange={(e) => setNewUser({ ...newUser, ward_access: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '13px', background: 'white' }}
                >
                  <option value="All Wards">All Wards</option>
                  <option value="Ward 08">Ward 08</option>
                  <option value="Ward 12">Ward 12</option>
                  <option value="Ward 14">Ward 14</option>
                  <option value="Roads">Roads</option>
                  <option value="Custom">Custom Level...</option>
                </select>
              </div>

              {newUser.ward_access === 'Custom' && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Enter Custom Ward / Access Level Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ward 18, Water Dept"
                    value={newUser.custom_ward}
                    onChange={(e) => setNewUser({ ...newUser, custom_ward: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '13px' }}
                  />
                </div>
              )}

              {/* Roles Checklist */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Assign System Roles *</label>
                <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', background: '#fafafa' }}>
                  {allRoles.map(role => (
                    <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={newUser.roles.includes(role)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewUser({ ...newUser, roles: [...newUser.roles, role] });
                          } else {
                            setNewUser({ ...newUser, roles: newUser.roles.filter(r => r !== role) });
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      {role}
                    </label>
                  ))}
                </div>
              </div>

              {/* Inline Create New Role */}
              <div style={{ padding: '10px 14px', background: '#f1f5f9', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>CREATE NEW ROLE LEVEL</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    placeholder="Role name, e.g. GIS Coordinator"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    style={{ flex: 1, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '12px' }}
                  />
                  <button
                    type="button"
                    onClick={handleCreateRole}
                    disabled={creatingRole}
                    style={{
                      background: '#475569', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {creatingRole ? '...' : '+ Create'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: '#475569' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ padding: '8px 20px', background: '#2563eb', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', color: 'white', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
