import React, { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchProjects } from '../api';

export default function GISListView({ userInfo, onNavigate }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [layerFilter, setLayerFilter] = useState('All');
  const [wardFilter, setWardFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [previewFile, setPreviewFile] = useState(null);
  const [activeDropdownRowId, setActiveDropdownRowId] = useState(null);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const data = await fetchProjects();
        setProjects(data || []);
      } catch (err) {
        console.error('Failed to load GIS projects data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Binds unique values for dropdowns
  const layersList = useMemo(() => {
    const types = projects.map(p => p.project_type || p.type).filter(Boolean);
    return ['All', ...Array.from(new Set(types))].sort();
  }, [projects]);

  const wardsList = useMemo(() => {
    const wards = projects.map(p => p.ward).filter(Boolean);
    return ['All', ...Array.from(new Set(wards))].sort();
  }, [projects]);

  const statusesList = useMemo(() => {
    const statuses = projects.map(p => p.status).filter(Boolean);
    return ['All', ...Array.from(new Set(statuses))].sort();
  }, [projects]);

  // Filters logic
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return projects.filter(p => {
      const type = p.project_type || p.type || '';
      const name = p.project_name || p.name || '';
      const ward = p.ward || '';
      const status = p.status || '';
      const gisId = p.name || p.id || '';
      const tenant = p.tenant_name || p['Tenant Name'] || '';

      const matchQuery = !q || 
        gisId.toLowerCase().includes(q) || 
        name.toLowerCase().includes(q) || 
        type.toLowerCase().includes(q) || 
        ward.toLowerCase().includes(q) ||
        tenant.toLowerCase().includes(q);

      const matchLayer = layerFilter === 'All' || type === layerFilter;
      const matchWard = wardFilter === 'All' || ward === wardFilter;
      const matchStatus = statusFilter === 'All' || status === statusFilter;

      return matchQuery && matchLayer && matchWard && matchStatus;
    });
  }, [projects, search, layerFilter, wardFilter, statusFilter]);

  // Paginated data
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [search, layerFilter, wardFilter, statusFilter]);

  // Leaflet map initialization
  useEffect(() => {
    if (loading || filtered.length === 0 || !mapRef.current) return;

    if (mapInstanceRef.current) {
      // Map already exists, clear existing markers and re-add for updated filtered records
      mapInstanceRef.current.eachLayer(layer => {
        if (layer instanceof L.CircleMarker) {
          mapInstanceRef.current.removeLayer(layer);
        }
      });
    } else {
      // Initialize map
      const CENTER = [19.2813, 72.8697]; // MBMC Center
      const map = L.map(mapRef.current, {
        center: CENTER,
        zoom: 13,
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: false
      });
      mapInstanceRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    }

    const map = mapInstanceRef.current;

    // Status colors - reads from custom_attributes matching MASTER EXCEL
    const getAttrs = (p) => {
      if (!p.custom_attributes) return {};
      try { return typeof p.custom_attributes === 'string' ? JSON.parse(p.custom_attributes) : p.custom_attributes; } catch(e) { return {}; }
    };
    const statusColor = (p) => {
      const attrs = getAttrs(p);
      const ls = (attrs['LAND ACQUIRED STATUS'] || attrs['Land Acquired Status'] || p.land_status || '').toUpperCase();
      const enc = (attrs['ENCROACHMENT_STATUS'] || p.encroachment || '').toUpperCase();
      if (ls === 'ACQUIRED') return '#16a34a';
      if (enc === 'ENCROACHMENT') return '#dc2626';
      if (ls === 'NOT_ACQUIRED') return '#d97706';
      if (ls === 'PARTIALLY_ACQUIRED') return '#7c3aed';
      return '#64748b';
    };

    const VILLAGE_BOUNDS = {
      'Rai':       { lat: [19.270, 19.295], lng: [72.855, 72.885] },
      'Kashigaon': { lat: [19.285, 19.310], lng: [72.860, 72.890] },
      'Bhayander': { lat: [19.295, 19.320], lng: [72.845, 72.875] },
      'Navghar':   { lat: [19.260, 19.285], lng: [72.850, 72.880] },
      'Uttan':     { lat: [19.310, 19.335], lng: [72.840, 72.865] },
      'Dongri':    { lat: [19.250, 19.270], lng: [72.855, 72.880] },
      default:     { lat: [19.268, 19.308], lng: [72.852, 72.888] },
    };

    const seededRand = (seed) => { const x = Math.sin(seed + 1) * 10000; return x - Math.floor(x); };

    // Plot markers
    filtered.slice(0, 200).forEach((p, i) => {
      const bounds = VILLAGE_BOUNDS[p.ward || p.village] || VILLAGE_BOUNDS.default;
      const lat = bounds.lat[0] + seededRand(i * 3 + 1) * (bounds.lat[1] - bounds.lat[0]);
      const lng = bounds.lng[0] + seededRand(i * 3 + 2) * (bounds.lng[1] - bounds.lng[0]);
      const color = statusColor(p);

      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        fillColor: color,
        color: '#fff',
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.85
      });

      marker.bindPopup(
        `<div style="font-family:sans-serif;min-width:160px">
          <div style="font-weight:800;font-size:12px;color:#0f172a;margin-bottom:4px">${p.name || p.id}</div>
          <div style="font-size:11px;color:#475569"><b>Layer:</b> ${p.project_type || p.type || 'N/A'}</div>
          <div style="font-size:11px;color:#475569"><b>Name:</b> ${p.project_name || p.name || 'N/A'}</div>
          <div style="font-size:11px;color:#475569"><b>Location:</b> ${p.ward || 'N/A'}</div>
          <div style="margin-top:5px">
            <span style="background:${color}22;color:${color};font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;border:1px solid ${color}44">${p.status || 'Active'}</span>
          </div>
        </div>`
      );

      marker.addTo(map);
    });

  }, [loading, filtered]);

  // Helper: parse custom_attributes JSON
  const getAttrs = (p) => {
    if (!p.custom_attributes) return {};
    try { return typeof p.custom_attributes === 'string' ? JSON.parse(p.custom_attributes) : p.custom_attributes; } catch(e) { return {}; }
  };

  const formatArea = (val) => {
    if (!val || val === '—') return '—';
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' sq.m';
  };

  const getAvailableDocLinks = (p) => {
    const a = getAttrs(p);
    const linkKeys = [
      '7/12 LINK', '7/12 Link', 'link_712',
      'DOC_8A Link', '8A Link', 'link_8a',
      'FN6 LINK', 'Form No. 6 Link', 'link_fn6',
      'T.D.R.C. LINK', 'TDR Certificate Document', 'link_tdrc',
      'T.D.R Link', 'TDR Link', 'link_tdr',
      'Agreement Link', 'link_agreement',
      'PR Link', 'PR Card Link', 'link_pr',
      'Tahsildar Letter Link', 'link_tahsildar',
      'LOCAL MAP LINK', 'Local Map Link', 'link_local_map',
      'Stability Certificate_Link', 'Stability Certificate Link', 'link_stability',
      'FERFAR_Link', 'Ferfar Link', 'link_ferfar',
      'ULC_Link', 'ULC Link', 'link_ulc',
      'RESERVATION_DRAWING LINK', 'RESERVATION_DRAWING_LINK',
      'ENCROACHMENT_LINK', 'encroachment_link'
    ];
    
    const validLinks = [];
    for (const key of linkKeys) {
      const val = a[key] || p[key.toLowerCase().replace(/ /g, '_')];
      if (val && typeof val === 'string' && val.trim() !== '' && val.toLowerCase() !== 'na' && val.toLowerCase() !== 'no') {
        if (!val.toLowerCase().endsWith('na.pdf') && !val.toLowerCase().endsWith('/na.pdf')) {
          let label = key.replace(/ Link| LINK|_Link|_link/g, '');
          if (label === 'RESERVATION_DRAWING') label = 'Drawing';
          else if (label === '2019_FORMAT_CZMP_AFFECTED_AREA') label = 'CZMP';
          validLinks.push({ label, url: val.startsWith('/') ? val : `/${val}` });
        }
      }
    }
    return validLinks;
  };

  // Export to Excel (CSV) — columns match MASTER EXCEL.csv exactly
  const handleExportExcel = () => {
    if (filtered.length === 0) return;

    const headers = [
      'GIS ID',
      'Old Survey No/Hissa No',
      'New Survey No/Hissa No',
      'Reservation Number',
      'DRC NO',
      'Reservation Name',
      'Area',
      'Village Name',
      'Land Acquired Status',
      'MBMC 7/12',
      'CZMP 2019',
      'Encroachment Status',
      'Comment',
      'Layer / Project Type',
      'Status'
    ];

    const csvRows = [headers.join(',')];
    filtered.forEach(p => {
      const a = getAttrs(p);
      const row = [
        `"${p.name || p.id || ''}"`,
        `"${a['Old Survey No_Hissa No'] || a['Old Survey No/Hissa No'] || ''}"`,
        `"${a['New Survey No_Hissa No'] || a['New Survey No/Hissa No'] || p.road_name || ''}"`,
        `"${a['Reservation Number'] || a['reservation_number'] || ''}"`,
        `"${a['DRC NO'] || a['drc_no'] || ''}"`,
        `"${(p.project_name || p.name || '').replace(/"/g, '""')}"`,
        `"${a['AREA'] || a['AREA IN SQ'] || p.area || ''}"`,
        `"${(p.ward || '').replace(/"/g, '""')}"`,
        `"${a['LAND ACQUIRED STATUS'] || a['Land Acquired Status'] || p.land_status || ''}"`,
        `"${a['MBMC 7_12'] || a['MBMC 7/12'] || ''}"`,
        `"${a['2019_FORMAT_CZMP_AFFECTED_AREA'] || a['CZMP'] || p.czmp_2019 || ''}"`,
        `"${a['ENCROACHMENT_STATUS'] || p.encroachment || ''}"`,
        `"${(p.description || p.remarks || '').replace(/"/g, '""')}"`,
        `"${p.project_type || p.type || ''}"`,
        `"${p.status || ''}"`
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `GIS_Map_Layers_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Status badge style mapper
  const statusColors = {
    'Draft': { bg: '#e2e8f0', color: '#475569' },
    'Approved': { bg: '#dcfce7', color: '#15803d' },
    'Completed': { bg: '#dcfce7', color: '#166534' },
    'Pending Senior Engineer': { bg: '#fffbeb', color: '#b45309' },
    'Pending Department Head': { bg: '#fffbeb', color: '#9a3412' },
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>
      
      {/* ── Header Section ────────────────────────────────────────────────── */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', flexShrink: 0, padding: '16px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>GIS Map Layers List</h1>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b', maxWidth: '600px' }}>
              Maintain digital records for corporation owned properties, rented properties, vacant properties, tenant history, billing and collection.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexShrink: 0, alignItems: 'center' }}>
            <button
              onClick={handleExportExcel}
              disabled={filtered.length === 0}
              style={{
                padding: '8px 18px',
                background: 'white',
                color: '#1e293b',
                border: '1.5px solid #cbd5e1',
                borderRadius: '9px',
                cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: filtered.length === 0 ? 0.6 : 1,
              }}
            >
              📥 Export Excel
            </button>
            <button style={{ padding: '8px 18px', background: 'linear-gradient(135deg, #1a73e8, #1d4ed8)', color: 'white', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', boxShadow: '0 2px 8px rgba(26,115,232,0.25)' }}>Add Property</button>
          </div>
        </div>

        {/* Stats strip - 6 cards */}
        <div style={{ display: 'flex', gap: '0', padding: '14px 0 16px', overflowX: 'auto', borderTop: '1px solid #f1f5f9', marginTop: '16px' }}>
          {[
            { label: 'Total Properties', value: projects.length.toLocaleString(), color: '#1a73e8' },
            { label: 'Rented', value: projects.filter(p => p.tenant_name || p['Tenant Name']).length.toLocaleString(), color: '#22c55e' },
            { label: 'Not Rented', value: projects.filter(p => !(p.tenant_name || p['Tenant Name'])).length.toLocaleString(), color: '#f59e0b' },
            { label: 'Filtered Result', value: filtered.length.toLocaleString(), color: '#7c3aed' },
            { label: 'Yearly Demand', value: 'INR 8.4 Cr', color: '#059669' },
            { label: 'Collection', value: 'INR 5.9 Cr', color: '#10b981' }
          ].map((s, i) => (
            <div key={i} style={{ flex: '1 1 120px', minWidth: '110px', padding: '0 20px', borderRight: i < 5 ? '1px solid #e2e8f0' : 'none' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{s.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrollable Body Section ────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Middle Row: Map + Demand vs Collection */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px' }}>
          
          {/* Map Card */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 855, color: '#0f172a' }}>Property Geo Distribution</div>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', padding: '2px 8px', borderRadius: '99px' }}>
                VVCMC Property Map
              </span>
            </div>
            <div
              ref={mapRef}
              style={{ height: '170px', borderRadius: '10px', overflow: 'hidden', border: '1.5px solid #e2e8f0' }}
            />
          </div>

          {/* Demand vs Collection Card */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '13px', fontWeight: 855, color: '#0f172a', marginBottom: '12px' }}>Demand vs Collection</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, justifyContent: 'center' }}>
              {[
                { label: 'Demand', value: 'INR 8.4 Cr', pct: 100, color: '#1a73e8' },
                { label: 'Collected', value: 'INR 5.9 Cr', pct: 70, color: '#22c55e' },
                { label: 'Pending', value: 'INR 2.5 Cr', pct: 30, color: '#f59e0b' }
              ].map((bar, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{bar.label}</span>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: bar.color }}>{bar.value}</span>
                  </div>
                  <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${bar.pct}%`, background: bar.color, borderRadius: '99px' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Badges footer */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
              {[['#1a73e8','55% Rented'], ['#f59e0b','31% Vacant'], ['#64748b','14% Other']].map(([c, l]) => (
                <span key={l} style={{ background: c + '15', color: c, fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '99px' }}>
                  {l}
                </span>
              ))}
            </div>
          </div>

        </div>

        {/* Bottom Row: Property Records Table Card */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column' }}>
          
          {/* Table Toolbar */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', background: '#fafbfc' }}>
            <span style={{ fontSize: '13px', fontWeight: 855, color: '#0f172a', marginRight: 'auto' }}>Property Records</span>
            
            {/* Search Input */}
            <input
              placeholder="Search GIS ID, survey, ward..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '7px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', outline: 'none', background: 'white', minWidth: '200px' }}
            />

            {/* Layer Filter */}
            <select
              value={layerFilter}
              onChange={e => setLayerFilter(e.target.value)}
              style={{ padding: '7px 10px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', outline: 'none', background: 'white', cursor: 'pointer' }}
            >
              {layersList.map(l => <option key={l} value={l}>{l === 'All' ? 'All Layers' : l}</option>)}
            </select>

            {/* Ward Filter */}
            <select
              value={wardFilter}
              onChange={e => setWardFilter(e.target.value)}
              style={{ padding: '7px 10px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', outline: 'none', background: 'white', cursor: 'pointer' }}
            >
              {wardsList.map(w => <option key={w} value={w}>{w === 'All' ? 'All Wards' : w}</option>)}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '7px 10px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', outline: 'none', background: 'white', cursor: 'pointer' }}
            >
              {statusesList.map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
            </select>
          </div>

          {/* Table Data */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['GIS ID', 'Old Survey No', 'New Survey No', 'Res. No', 'DRC No', 'Reservation Name', 'Area', 'Village', 'Land Status', 'MBMC 7/12', 'CZMP', 'Encroachment', 'Comment', 'Action'].map(th => (
                    <th key={th} style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{th}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={14} style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>
                      ⏳ Loading GIS features data...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={14} style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>
                      🔍 No matching records found.
                    </td>
                  </tr>
                ) : (
                  paginated.map(p => {
                    const a = getAttrs(p);
                    const oldSurvey  = a['Old Survey No_Hissa No'] || a['Old Survey No/Hissa No'] || '—';
                    const newSurvey  = a['New Survey No_Hissa No'] || a['New Survey No/Hissa No'] || p.road_name || '—';
                    const resNo      = a['Reservation Number'] || a['RESERVATIO'] || a['reservation_number'] || '—';
                    const drcNo      = a['DRC NO'] || a['drc_no'] || '—';
                    const resName    = p.project_name || a['Reservation Name'] || a['BUILDING N'] || p.name || '—';
                    const area       = a['AREA'] || a['AREA IN SQ'] || p.area || '—';
                    const village    = p.ward || a['Village Name'] || '—';
                    const landStatus = a['LAND ACQUIRED STATUS'] || a['Land Acquired Status'] || p.land_status || '—';
                    const mbmc       = a['MBMC 7_12'] || a['MBMC 7/12'] || '—';
                    const czmp       = a['2019_FORMAT_CZMP_AFFECTED_AREA'] || a['CZMP'] || p.czmp_2019 || '—';
                    const encStatus  = a['ENCROACHMENT_STATUS'] || a['ENCROACHME'] || p.encroachment || '—';
                    const comment    = p.description || p.remarks || '—';

                    // Encroachment badge color
                    const encColor = encStatus.toUpperCase() === 'ENCROACHMENT' ? { bg: '#fee2e2', color: '#dc2626' } : { bg: '#f0fdf4', color: '#16a34a' };
                    // Land status badge color
                    const landColor = landStatus.toUpperCase() === 'ACQUIRED' ? { bg: '#dcfce7', color: '#15803d' } : landStatus.toUpperCase() === 'NOT_ACQUIRED' ? { bg: '#fffbeb', color: '#b45309' } : { bg: '#f1f5f9', color: '#475569' };

                    const cellStyle = { padding: '10px 14px', fontSize: '12px', color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' };
                    const mutedStyle = { ...cellStyle, color: '#64748b' };

                    return (
                      <tr key={p.name || p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>

                        {/* GIS ID */}
                        <td style={{ ...cellStyle, fontWeight: 800, color: '#1d4ed8' }}>{p.name || p.id}</td>

                        {/* Old Survey No */}
                        <td style={mutedStyle}>{oldSurvey}</td>

                        {/* New Survey No */}
                        <td style={mutedStyle}>{newSurvey}</td>

                        {/* Reservation Number */}
                        <td style={cellStyle}>{resNo}</td>

                        {/* DRC NO */}
                        <td style={mutedStyle}>{drcNo}</td>

                        {/* Reservation Name */}
                        <td style={{ ...cellStyle, fontWeight: 700, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{resName}</td>

                        {/* Area */}
                        <td style={mutedStyle}>{formatArea(area)}</td>

                        {/* Village Name */}
                        <td style={mutedStyle}>{village}</td>

                        {/* Land Acquired Status */}
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: landColor.bg, color: landColor.color, fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '99px', whiteSpace: 'nowrap' }}>
                            {landStatus}
                          </span>
                        </td>

                        {/* MBMC 7/12 */}
                        <td style={mutedStyle}>{mbmc}</td>

                        {/* CZMP */}
                        <td style={{ ...mutedStyle, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{czmp}</td>

                        {/* Encroachment Status */}
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: encColor.bg, color: encColor.color, fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '99px', whiteSpace: 'nowrap' }}>
                            {encStatus}
                          </span>
                        </td>

                        {/* Comment */}
                        <td style={{ ...mutedStyle, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{comment}</td>

                        {/* Action - View on Map & Documents */}
                        <td style={{ padding: '8px 14px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            onClick={() => {
                              localStorage.setItem('gis_selected_project_id', p.name || p.id);
                              onNavigate('map');
                            }}
                            style={{
                              padding: '5px 10px',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            🗺️ Map
                          </button>
                          {(() => {
                            const docs = getAvailableDocLinks(p);
                            if (docs.length === 0) return null;
                            if (docs.length === 1) {
                              return (
                                <button
                                  onClick={() => setPreviewFile({ url: docs[0].url, name: `${p.name || p.id} - ${docs[0].label}` })}
                                  style={{
                                    padding: '5px 10px',
                                    background: '#f0fdf4',
                                    color: '#16a34a',
                                    border: '1px solid #bbf7d0',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  📄 View
                                </button>
                              );
                            }
                            return (
                              <div style={{ position: 'relative' }}>
                                <button
                                  onClick={() => setActiveDropdownRowId(activeDropdownRowId === (p.name || p.id) ? null : (p.name || p.id))}
                                  style={{
                                    padding: '5px 10px',
                                    background: '#f0fdf4',
                                    color: '#16a34a',
                                    border: '1px solid #bbf7d0',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  📄 View ({docs.length})
                                </button>
                                {activeDropdownRowId === (p.name || p.id) && (
                                  <div style={{
                                    position: 'absolute',
                                    bottom: '100%',
                                    right: 0,
                                    background: 'white',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    zIndex: 100,
                                    minWidth: '160px',
                                    padding: '4px 0',
                                    display: 'flex',
                                    flexDirection: 'column'
                                  }}>
                                    {docs.map((doc, didx) => (
                                      <button
                                        key={didx}
                                        onClick={() => {
                                          setPreviewFile({ url: doc.url, name: `${p.name || p.id} - ${doc.label}` });
                                          setActiveDropdownRowId(null);
                                        }}
                                        style={{
                                          padding: '8px 12px',
                                          background: 'none',
                                          border: 'none',
                                          textAlign: 'left',
                                          fontSize: '11px',
                                          color: '#334155',
                                          cursor: 'pointer',
                                          fontWeight: 600,
                                          display: 'block',
                                          width: '100%'
                                        }}
                                        onMouseEnter={e => e.target.style.background = '#f1f5f9'}
                                        onMouseLeave={e => e.target.style.background = 'none'}
                                      >
                                        {doc.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {!loading && totalPages > 1 && (
            <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', background: '#fafbfc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                Showing page {page} of {totalPages} ({filtered.length} records)
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: 'white',
                    color: '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                    opacity: page === 1 ? 0.5 : 1
                  }}
                >
                  ← Prev
                </button>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: 'white',
                    color: '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: page === totalPages ? 'not-allowed' : 'pointer',
                    opacity: page === totalPages ? 0.5 : 1
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

        </div>

      </div>

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
                Preview: {previewFile.name}
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
                  alignItems: 'center'
                }}
              >
                Download
              </a>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
