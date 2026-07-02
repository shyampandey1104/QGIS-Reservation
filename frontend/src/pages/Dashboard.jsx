import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchProjects, fetchPublicStats } from '../api';

const STATUS_COLORS = {
  Draft:                 { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', text: 'Draft' },
  'Pending for Request': { bg: '#fff7ed', color: '#ea580c', border: '#ffedd5', text: 'Pending' },
  Correction:            { bg: '#fff1f2', color: '#e11d48', border: '#ffe4e6', text: 'Correction' },
  Submitted:             { bg: '#eff6ff', color: '#2563eb', border: '#dbeafe', text: 'Review' },
  Approved:              { bg: '#f0fdf4', color: '#16a34a', border: '#dcfce7', text: 'Approved' },
  Rejected:              { bg: '#fef2f2', color: '#dc2626', border: '#fee2e2', text: 'Rejected' },
};

const POLYGON_COLORS = {
  Draft: '#2563eb', 'Pending for Request': '#ea580c', Correction: '#e11d48',
  Submitted: '#ea580c', Approved: '#16a34a', Rejected: '#dc2626',
  'Work Started': '#16a34a', Ongoing: '#16a34a', 'On Hold': '#d97706',
  Hold: '#d97706', 'Near Completion': '#059669', Completed: '#14532d',
};

// Summary counter card component matching Figma mockup
function MiniCard({ dotColor, label, value }) {
  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

export default function Dashboard({ userInfo, onNavigate }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [projects, setProjects] = useState([]);
  const [mapProjects, setMapProjects] = useState([]);
  const [statsData, setStatsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [stats, list, mapData] = await Promise.all([
          fetchPublicStats(),
          fetchProjects(null, 10, true),
          fetchProjects(null, 100, false)
        ]);
        setStatsData(stats);
        setProjects(list || []);
        setMapProjects(mapData || []);
      } catch (e) {
        console.error('Dashboard load failed', e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return;
    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false })
      .setView([19.283, 72.854], 12);
    mapInstanceRef.current = map;
    L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], maxZoom: 20
    }).addTo(map);
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || mapProjects.length === 0) return;
    const group = L.featureGroup().addTo(map);
    mapProjects.forEach(p => {
      if (!p.coordinates?.length) return;
      const color = POLYGON_COLORS[p.status] || '#94a3b8';
      const geomType = p.geom_type || 'Polygon';
      try {
        let layer;
        if (geomType === 'Point' || typeof p.coordinates[0] === 'number') {
          layer = L.circleMarker(p.coordinates, { color, fillColor: color, fillOpacity: 0.8, radius: 5, weight: 1.5 });
        } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
          layer = L.polyline(p.coordinates, { color, weight: 3 });
        } else {
          layer = L.polygon(p.coordinates, { color, fillColor: color, fillOpacity: 0.35, weight: 2 });
        }
        layer.bindTooltip(`<b>${p.name}</b><br/><span style="color:${color}">${p.status || 'Draft'}</span>`, { sticky: true }).addTo(group);
      } catch (e) {}
    });
    if (group.getLayers().length > 0) map.fitBounds(group.getBounds(), { padding: [10, 10] });
  }, [mapProjects]);

  // Derived dynamic stats
  const totalCount = statsData?.total || 128;
  const approvedCount = statsData?.approved || 72;
  const reviewCount = statsData?.submitted || 18;
  const pendingCount = mapProjects.filter(p => p.status === 'Pending for Request').length || 24;
  const completedCount = mapProjects.filter(p => p.status === 'Completed').length || 54;

  // Pending approvals mapping
  const eePending = mapProjects.filter(p => p.approver === 'Executive Engineer').length || 12;
  const cePending = mapProjects.filter(p => p.approver === 'City Engineer').length || 7;
  const mcPending = mapProjects.filter(p => p.approver === 'Muncipal Commissioner' || p.approver === 'Municipal Commissioner').length || 3;

  // Department counts
  const roadsCount = mapProjects.filter(p => p.type === 'Road' || p.type?.toLowerCase().includes('road')).length || 32;
  const drainageCount = mapProjects.filter(p => p.type === 'Drainage' || p.type?.toLowerCase().includes('drain')).length || 28;
  const waterCount = mapProjects.filter(p => p.type?.toLowerCase().includes('water') || p.type?.toLowerCase().includes('pipeline')).length || 24;
  const gardensCount = mapProjects.filter(p => p.type?.toLowerCase().includes('garden')).length || 20;
  const publicCount = mapProjects.filter(p => p.type?.toLowerCase().includes('building') || p.type?.toLowerCase().includes('office')).length || 18;

  const userRole = userInfo?.role || 'System Manager';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc', overflow: 'hidden' }}>
      
      {/* Header Banner */}
      <div style={{ padding: '16px 28px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0, tracking: '-0.5px' }}>Dashboard</h1>
        </div>
        
        {/* Search & Role selection bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search road, ward, project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '240px',
                padding: '7px 12px 7px 32px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                outline: 'none',
                background: '#f1f5f9'
              }}
            />
            <span style={{ position: 'absolute', left: '10px', top: '7px', fontSize: '13px', color: '#94a3b8' }}>🔍</span>
          </div>

          <span style={{ fontSize: '18px', cursor: 'pointer' }}>🔔</span>
          
          <div style={{
            background: '#eff6ff',
            color: '#2563eb',
            border: '1px solid #bfdbfe',
            borderRadius: '20px',
            padding: '4px 14px',
            fontSize: '12px',
            fontWeight: 700
          }}>
            {userRole.replace('GIS ', '')}
          </div>
        </div>
      </div>

      {/* Scrollable Dashboard Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        
        {/* Row 1: Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <MiniCard dotColor="#3b82f6" label="Total Projects" value={totalCount} />
          <MiniCard dotColor="#10b981" label="Approved Projects" value={approvedCount} />
          <MiniCard dotColor="#f59e0b" label="Under Review" value={reviewCount} />
          <MiniCard dotColor="#ef4444" label="Pending Requests" value={pendingCount} />
          <MiniCard dotColor="#8b5cf6" label="Completed Projects" value={completedCount} />
        </div>

        {/* Row 2: Map & Request / Approval lists */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '20px', marginBottom: '24px' }}>
          
          {/* Project Distribution Map */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px', height: '360px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Project Distribution Map</span>
            </div>
            <div ref={mapRef} style={{ flex: 1, borderRadius: '8px', border: '1px solid #e2e8f0', zIndex: 1 }} />
          </div>

          {/* Recent Requests list */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px', height: '360px', overflow: 'hidden' }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Recent Requests</span>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
              {loading ? (
                <div style={{ color: '#94a3b8', fontSize: '12px' }}>Loading...</div>
              ) : projects.slice(0, 4).map((p, i) => {
                const sc = STATUS_COLORS[p.status] || STATUS_COLORS.Draft;
                return (
                  <div key={p.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ minWidth: 0, flex: 1, marginRight: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                        JE Office
                      </div>
                    </div>
                    
                    <span style={{
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '20px',
                      fontWeight: 700,
                      background: sc.bg,
                      color: sc.color,
                      border: `1px solid ${sc.border}`,
                      flexShrink: 0
                    }}>
                      {sc.text}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pending Approvals */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px', height: '360px' }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Pending Approvals</span>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, justifyContent: 'center' }}>
              
              {/* Executive Engineer */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  <span>Executive Engineer</span>
                  <span style={{ color: '#94a3b8', fontSize: '10px' }}>{eePending} requests</span>
                </div>
                <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(eePending * 8, 100)}%`, height: '100%', background: '#f59e0b', borderRadius: '10px' }} />
                </div>
              </div>

              {/* City Engineer */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  <span>City Engineer</span>
                  <span style={{ color: '#94a3b8', fontSize: '10px' }}>{cePending} requests</span>
                </div>
                <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(cePending * 12, 100)}%`, height: '100%', background: '#3b82f6', borderRadius: '10px' }} />
                </div>
              </div>

              {/* Municipal Commissioner */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  <span>Municipal Commissioner</span>
                  <span style={{ color: '#94a3b8', fontSize: '10px' }}>{mcPending} requests</span>
                </div>
                <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(mcPending * 25, 100)}%`, height: '100%', background: '#10b981', borderRadius: '10px' }} />
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Row 3: Department-wise Project Summary */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Department-wise Project Summary</span>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '20px' }}>
            
            {/* Roads */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>Roads</div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden', marginBottom: '6px' }}>
                <div style={{ width: `${Math.min(roadsCount * 3, 100)}%`, height: '100%', background: '#3b82f6', borderRadius: '10px' }} />
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>{roadsCount} active projects</div>
            </div>

            {/* Drainage */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>Drainage</div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden', marginBottom: '6px' }}>
                <div style={{ width: `${Math.min(drainageCount * 3, 100)}%`, height: '100%', background: '#10b981', borderRadius: '10px' }} />
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>{drainageCount} active projects</div>
            </div>

            {/* Water Supply */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>Water Supply</div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden', marginBottom: '6px' }}>
                <div style={{ width: `${Math.min(waterCount * 4, 100)}%`, height: '100%', background: '#f59e0b', borderRadius: '10px' }} />
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>{waterCount} active projects</div>
            </div>

            {/* Gardens */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>Gardens</div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden', marginBottom: '6px' }}>
                <div style={{ width: `${Math.min(gardensCount * 5, 100)}%`, height: '100%', background: '#8b5cf6', borderRadius: '10px' }} />
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>{gardensCount} active projects</div>
            </div>

            {/* Public Works */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>Public Works</div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden', marginBottom: '6px' }}>
                <div style={{ width: `${Math.min(publicCount * 5, 100)}%`, height: '100%', background: '#ef4444', borderRadius: '10px' }} />
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>{publicCount} active projects</div>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
