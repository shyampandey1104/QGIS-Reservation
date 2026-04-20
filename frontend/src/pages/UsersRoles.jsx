export default function UsersRoles() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '18px 28px 14px', background: 'white', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1a2d45', margin: 0 }}>Users & Roles</h1>
        <p style={{ color: '#888', fontSize: '12px', margin: '2px 0 0' }}>Manage municipal staff accounts and role assignments.</p>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '48px', background: 'white', borderRadius: '16px', border: '1px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', maxWidth: '360px', width: '100%' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.25 }}>👤</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a2d45', marginBottom: '6px' }}>Coming Soon</div>
          <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.6' }}>
            User and role management will be available here.<br />
            Assign roles via Frappe admin panel for now.
          </div>
          <a
            href="http://qgis.com:8000/app/user"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-block', marginTop: '20px', padding: '9px 20px',
              background: '#1a2d45', color: 'white', borderRadius: '8px',
              textDecoration: 'none', fontSize: '13px', fontWeight: 600
            }}
          >
            Open Frappe User Manager →
          </a>
        </div>
      </div>
    </div>
  )
}
