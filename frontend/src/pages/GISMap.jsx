import { useEffect, useRef, useState, useMemo, Fragment } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import DOCUMENT_LINKS from '../data/document_links.json';
import { fetchProjects, createProject, deleteProject, manualUpload, pollUploadJob, updateCustomAttributes, submitWorkOrder, addTimelineEntry, fetchCategories, createCategory, checkFilesExist } from '../api'

const resolveLink = (val) => {
  if (!val || typeof val !== 'string') return null;
  let clean = val.trim();
  if (clean.toLowerCase() === 'na' || clean.toLowerCase() === 'n/a' || clean.toLowerCase() === 'none' || clean.toLowerCase() === 'null' || clean === '') return null;
  
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean;
  }
  
  if (clean.includes('/') || clean.includes('\\') || clean.toLowerCase().endsWith('.pdf') || clean.toLowerCase().endsWith('.png') || clean.toLowerCase().endsWith('.jpg') || clean.toLowerCase().endsWith('.jpeg')) {
    let path = clean.replace(/\\/g, '/');
    if (path.startsWith('/files/')) {
      path = path.substring(7);
    } else if (path.startsWith('files/')) {
      path = path.substring(6);
    } else if (path.startsWith('/')) {
      path = path.substring(1);
    }
    if (path.toLowerCase().endsWith('/na.pdf') || path.toLowerCase().endsWith('/na.png') || path.toLowerCase().endsWith('/na.jpg') || path.toLowerCase().endsWith('/na.jpeg') ||
        path.toLowerCase().endsWith('/none.pdf') || path.toLowerCase().endsWith('/none.png') || path.toLowerCase().endsWith('/none.jpg') || path.toLowerCase().endsWith('/none.jpeg') ||
        path.toLowerCase().endsWith('/null.pdf') || path.toLowerCase().endsWith('/null.png') || path.toLowerCase().endsWith('/null.jpg') || path.toLowerCase().endsWith('/null.jpeg')) {
      return null;
    }
    
    return `/files/${path}`;
  }
  return null;
};

const resolveLinks = (val) => {
  if (!val || typeof val !== 'string') return [];
  return val.split(',')
    .map(s => s.trim())
    .map(resolveLink)
    .filter(Boolean);
};

const checkAndResolveLinkStringAsync = async (val) => {
  if (!val || typeof val !== 'string') return val;
  const links = resolveLinks(val);
  if (links.length === 0) return val;
  
  try {
    const results = await checkFilesExist(links);
    const validLinks = links.filter(link => results[link] === true);
    if (validLinks.length > 0) {
      return validLinks.map(link => link.startsWith('/') ? (window.location.origin + link) : link).join(', ');
    }
  } catch (e) {}
  
  return 'File not on disk';
};


const DetailRowValue = ({ val }) => {
  const [activeLinks, setActiveLinks] = useState([]);
  const [checking, setChecking] = useState(true);

  const resolvedLinks = useMemo(() => {
    if (typeof val !== 'string') return [];
    return val.split(',')
      .map(p => p.trim())
      .map(resolveLink)
      .filter(Boolean);
  }, [val]);

  useEffect(() => {
    if (resolvedLinks.length === 0) {
      setChecking(false);
      return;
    }
    let isMounted = true;
    const check = async () => {
      try {
        const results = await checkFilesExist(resolvedLinks);
        if (isMounted) {
          const valid = resolvedLinks.filter(link => results[link] === true);
          setActiveLinks(valid);
          setChecking(false);
        }
      } catch (e) {
        if (isMounted) {
          setChecking(false);
        }
      }
    };
    check();
    return () => { isMounted = false; };
  }, [resolvedLinks]);

  if (resolvedLinks.length > 0) {
    if (checking) {
      return <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>🔍 Checking...</span>;
    }
    if (activeLinks.length > 0) {
      return (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {activeLinks.map((link, idx) => {
            const filename = link.split('/').pop();
            return (
              <a
                key={idx}
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#1a73e8',
                  textDecoration: 'none',
                  fontWeight: '700',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#e8f0fe',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  border: '1px solid #bfdbfe',
                  cursor: 'pointer'
                }}
              >
                📄 {filename}
              </a>
            );
          })}
        </div>
      );
    }
    return <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>File not on disk</span>;
  }

  const displayVal = val && typeof val === 'object' ? JSON.stringify(val) : val;
  return (
    <span style={{ color: (!displayVal || displayVal === 'N/A' || displayVal === 'null') ? '#94a3b8' : '#0f172a' }}>
      {displayVal || 'N/A'}
    </span>
  );
};

const DocumentCard = ({ item }) => {
  const [activeLinks, setActiveLinks] = useState([]);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!item.links || item.links.length === 0) {
      setChecking(false);
      return;
    }

    let isMounted = true;
    const checkLinks = async () => {
      try {
        const results = await checkFilesExist(item.links);
        if (isMounted) {
          const valid = item.links.filter(link => results[link] === true);
          setActiveLinks(valid);
          setChecking(false);
        }
      } catch (e) {
        if (isMounted) {
          setChecking(false);
        }
      }
    };

    checkLinks();
    return () => { isMounted = false; };
  }, [item.links]);

  const isNA = !item.val || item.val === 'NA' || item.val === 'N/A' || item.val === '';
  const isDocumentCard = !['GIS ID', 'Old Survey No / Hissa No', 'Reservation Number', 'New Survey No / Hissa No', 'Comments'].includes(item.label);
  const hasNoFile = isDocumentCard && activeLinks.length === 0;
  const showInactive = isNA || (isDocumentCard && !checking && hasNoFile);

  return (
    <div style={{
      background: showInactive ? '#fafafa' : 'white',
      padding: '16px 18px',
      borderRadius: '12px',
      border: showInactive ? '1px solid #e2e8f0' : '1px solid #bfdbfe',
      boxShadow: showInactive ? 'none' : '0 2px 8px rgba(37,99,235,0.08)',
      display: 'flex', flexDirection: 'column', gap: '8px',
      transition: 'box-shadow 0.2s',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: showInactive ? '#94a3b8' : '#1e40af', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
        {item.label}
      </div>
      <div style={{ fontSize: '13px', color: showInactive ? '#94a3b8' : '#0f172a', fontWeight: showInactive ? 400 : 600, wordBreak: 'break-all' }}>
        {showInactive ? '— Not Available' : item.val}
      </div>
      {isDocumentCard && (
        checking ? (
          <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>🔍 Checking...</span>
        ) : activeLinks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
            {activeLinks.map((link, lIdx) => {
              const filename = link.split('/').pop();
              return (
                <a key={lIdx} href={link} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#1a73e8', color: 'white', padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>
                  📄 {filename}
                </a>
              );
            })}
          </div>
        ) : isNA ? (
          <span style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px' }}>⚠️ Not available</span>
        ) : (
          <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', marginTop: '4px' }}>File not on disk</span>
        )
      )}
    </div>
  );
};

// AsyncDocChecklist: renders a document row list where View button only appears
// after verifying the file actually exists on disk via checkFilesExist API
const AsyncDocChecklist = ({ items, onPreview }) => {
  const [verified, setVerified] = useState({});
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const urls = items.map(i => i.url).filter(Boolean);
    if (urls.length === 0) { setChecking(false); return; }
    let mounted = true;
    checkFilesExist(urls).then(results => {
      if (mounted) { setVerified(results); setChecking(false); }
    }).catch(() => { if (mounted) setChecking(false); });
    return () => { mounted = false; };
  }, [items.map(i => i.url).join(',')]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
      {items.map((item, idx) => {
        const fileExists = item.url && !checking && verified[item.url] === true;
        return (
          <div key={idx} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px',
            background: fileExists ? '#eff6ff' : '#f8fafc',
            borderRadius: '8px',
            border: fileExists ? '1.5px solid #dbeafe' : '1.5px solid #e2e8f0',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '18px', color: fileExists ? '#1a73e8' : '#94a3b8', flexShrink: 0 }}>
                {fileExists ? (item.url.toLowerCase().endsWith('.pdf') ? '📕' : '📷') : '📄'}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: fileExists ? '#1e3a8a' : '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '11px', color: fileExists ? '#60a5fa' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {checking ? '🔍 Checking...' : fileExists ? item.fileName : 'Pending Upload'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              {fileExists ? (
                <>
                  <button
                    onClick={() => onPreview({ url: item.url, name: item.title })}
                    style={{ background: '#1a73e8', border: 'none', color: 'white', fontSize: '11px', fontWeight: '800', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    👁️ View
                  </button>
                  <a href={item.url} download style={{ background: 'white', border: '1.5px solid #cbd5e1', color: '#475569', fontSize: '11px', fontWeight: '800', padding: '5px 12px', borderRadius: '6px', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Download
                  </a>
                </>
              ) : (
                <span style={{ fontSize: '11px', color: '#93c5fd', fontWeight: '700', fontStyle: 'italic' }}>{checking ? '...' : 'Pending'}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const getDocumentCards = (attrs) => {
  const docPairs = [
    { label: 'Document 7/12',             valKeys: ['Document 7/12', '7/12 Document', 'doc_712'],           linkKeys: ['7/12 LINK', '7/12 Link', 'link_712'] },
    { label: 'Document 8A',               valKeys: ['Document_8A', 'Document 8A', 'doc_8a'],               linkKeys: ['DOC_8A Link', '8A Link', 'link_8a'] },
    { label: 'Form No. 6',                 valKeys: ['FORM NO6', 'Form No. 6', 'form_no6'],                  linkKeys: ['FN6 LINK', 'Form No. 6 Link', 'link_fn6'] },
    { label: 'T.D.R. Certificate & Use',  valKeys: ['T.D.R.Certificate & Use', 'TDR Certificate', 'tdrc'],  linkKeys: ['T.D.R.C. LINK', 'TDR Certificate Document', 'link_tdrc'] },
    { label: 'T.D.R.',                    valKeys: ['T.D.R.', 'TDR Details', 'tdr'],                        linkKeys: ['T.D.R Link', 'TDR Link', 'link_tdr'] },
    { label: 'Agreement',                 valKeys: ['Agreement', 'agreement'],                              linkKeys: ['Agreement Link', 'link_agreement'] },
    { label: 'PR Document',               valKeys: ['PR_Document', 'PR Card', 'pr_document'],               linkKeys: ['PR Link', 'PR Card Link', 'link_pr'] },
    { label: 'Tahsildar Letter',          valKeys: ['Tahsildar Letter', 'tahsildar_letter'],                linkKeys: ['Tahsildar Letter Link', 'link_tahsildar'] },
    { label: 'Local Map',                 valKeys: ['LOCAL MAP', 'Local Map', 'local_map'],                 linkKeys: ['LOCAL MAP LINK', 'Local Map Link', 'link_local_map'] },
    { label: 'Stability Certificate',     valKeys: ['Stability Certificate', 'stability_cert'],             linkKeys: ['Stability Certificate_Link', 'Stability Certificate Link', 'link_stability'] },
    { label: 'FERFAR',                    valKeys: ['FERFAR', 'Ferfar', 'ferfar'],                          linkKeys: ['FERFAR_Link', 'Ferfar Link', 'link_ferfar'] },
    { label: 'ULC',                       valKeys: ['ULC', 'ulc'],                                          linkKeys: ['ULC_Link', 'ULC Link', 'link_ulc'] }
  ];

  const getFirstVal = (keys) => {
    for (const k of keys) {
      if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') {
        return String(attrs[k]).trim();
      }
    }
    return null;
  };

  const cards = docPairs.map(p => {
    const val = getFirstVal(p.valKeys);
    const linkVal = getFirstVal(p.linkKeys);
    const resolvedLinks = [
      ...resolveLinks(linkVal),
      ...resolveLinks(val)
    ];
    const uniqueLinks = Array.from(new Set(resolvedLinks));
    return {
      label: p.label,
      val: val && val.toLowerCase() !== 'na' ? val : (uniqueLinks.length > 0 ? 'Available' : null),
      links: uniqueLinks
    };
  });

  const metadata = [
    { label: 'GIS ID', val: attrs['GIS_ID'] || attrs['GIS ID'] || attrs['gis_id'] || null, links: [] },
    { label: 'Old Survey No / Hissa No', val: attrs['Old Survey No_Hissa No'] || attrs['Old Survey No / Hissa No'] || attrs['old_survey_no'] || null, links: [] },
    { label: 'Reservation Number', val: attrs['Reservation Number'] || attrs['RESERVATIO'] || attrs['reservation_number'] || null, links: [] },
    { label: 'New Survey No / Hissa No', val: attrs['New Survey No_Hissa No'] || attrs['New Survey No / Hissa No'] || attrs['new_survey_no'] || null, links: [] },
    { label: 'Comments', val: attrs['Comments'] || attrs['Comment'] || attrs['comments'] || attrs['Document Comments'] || null, links: [] }
  ];

  const allCards = [...metadata, ...cards];

  const standardKeys = new Set();
  docPairs.forEach(p => {
    p.valKeys.forEach(k => standardKeys.add(k));
    p.linkKeys.forEach(k => standardKeys.add(k));
  });
  metadata.forEach(m => {
    standardKeys.add('GIS_ID');
    standardKeys.add('GIS ID');
    standardKeys.add('gis_id');
    standardKeys.add('Old Survey No_Hissa No');
    standardKeys.add('Old Survey No / Hissa No');
    standardKeys.add('old_survey_no');
    standardKeys.add('Reservation Number');
    standardKeys.add('RESERVATIO');
    standardKeys.add('reservation_number');
    standardKeys.add('New Survey No_Hissa No');
    standardKeys.add('New Survey No / Hissa No');
    standardKeys.add('new_survey_no');
    standardKeys.add('Comments');
    standardKeys.add('Comment');
    standardKeys.add('comments');
    standardKeys.add('Document Comments');
  });

  Object.entries(attrs).forEach(([k, v]) => {
    if (standardKeys.has(k)) return;
    if (typeof v === 'string' && (v.startsWith('/files/') || v.includes('\\') || v.toLowerCase().endsWith('.pdf') || v.toLowerCase().endsWith('.png') || v.toLowerCase().endsWith('.jpg') || v.toLowerCase().endsWith('.jpeg'))) {
      const resolved = resolveLinks(v);
      if (resolved.length > 0) {
        allCards.push({
          label: k,
          val: v,
          links: resolved
        });
      }
    }
  });

  return allCards;
};

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
  'DMA_Location': { color: '#16a085', fill: true, weight: 2 },
  
  // MBMC specific layers — exact QGIS colors from screenshots
  'MBMC-RESERVSTION':                    { color: '#00e5ff', fill: true,  fillOpacity: 0.55, weight: 1.5 },   // Cyan fill (photo 1,4,5)
  'MBMC-RESERVSTION-BOUNDARY':           { color: '#90ee90', fill: false, weight: 2.5 },                      // Light green outline (photo 3,4,5)
  'MBMC-ROAD':                           { color: '#90a4ae', fill: true,  fillOpacity: 0.4,  weight: 1 },    // Light grey
  'MBMC-ROAD_CENTER_LINE':               { color: '#ff8f00', fill: false, weight: 2 },                        // Amber/orange
  'MBMC-VILLAGE-BOUNDARY':               { color: '#1565c0', fill: true,  fillOpacity: 0.38, weight: 2.5 },  // Blue fill (photo 2)
  'MBMC-VILLAGES-SURVEY_No._BOUNDARY':   { color: '#546e7a', fill: false, weight: 1 },                        // Dark grey thin outline (photo 5)
  'BUILDING_INFO':                        { color: '#dc2626', fill: true,  fillOpacity: 0.9,  weight: 1.5 },  // Hatch pattern styled
  'building_info':                        { color: '#dc2626', fill: true,  fillOpacity: 0.9,  weight: 1.5 }   // Hatch pattern styled
}

const cleanCoords = (coords) => {
  if (!Array.isArray(coords)) return null;
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return [coords[0], coords[1]];
  }
  const cleaned = coords.map(cleanCoords).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

const extractPoints = (coords) => {
  if (!Array.isArray(coords)) return [];
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return [[coords[0], coords[1]]];
  }
  let points = [];
  for (const c of coords) {
    if (Array.isArray(c)) {
      points = points.concat(extractPoints(c));
    }
  }
  return points;
};

const isPointInPolygon = (point, polygonCoords) => {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
    const pI = polygonCoords[i];
    const pJ = polygonCoords[j];
    if (!Array.isArray(pI) || !Array.isArray(pJ) || pI.length < 2 || pJ.length < 2) continue;
    const xi = pI[0], yi = pI[1];
    const xj = pJ[0], yj = pJ[1];
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const getResNumFromProj = (proj) => {
  let attrs = {};
  try { attrs = typeof proj.custom_attributes === 'string' ? JSON.parse(proj.custom_attributes) : (proj.custom_attributes || {}); } catch(e){}
  const val = attrs['Reservation Number'] || attrs['RESERVATIO'] || attrs['Reservation Number_doc'] || '';
  if (val) return String(val).trim();
  const match = String(proj.project_name || proj.name || '').match(/(\d+)/);
  return match ? match[1] : '';
};

const findOverlappingFeatures = (selected, allProjects) => {
  if (!selected || !selected.coordinates) return [];
  
  const selPoints = extractPoints(selected.coordinates);
  if (selPoints.length === 0) return [];
  
  // Calculate bounding box of selected
  let selMinLat = Infinity, selMaxLat = -Infinity;
  let selMinLng = Infinity, selMaxLng = -Infinity;
  for (const [lat, lng] of selPoints) {
    if (lat < selMinLat) selMinLat = lat;
    if (lat > selMaxLat) selMaxLat = lat;
    if (lng < selMinLng) selMinLng = lng;
    if (lng > selMaxLng) selMaxLng = lng;
  }
  
  // Outer ring of selected
  let selOuterRing = [];
  if (Array.isArray(selected.coordinates[0])) {
    if (typeof selected.coordinates[0][0] === 'number') {
      selOuterRing = selected.coordinates;
    } else if (Array.isArray(selected.coordinates[0][0])) {
      selOuterRing = selected.coordinates[0];
    }
  } else {
    selOuterRing = selPoints;
  }
  
  const selResNum = getResNumFromProj(selected);
  
  return allProjects.filter(p => {
    if (p.id === selected.id) return false;
    
    // Check attribute matching
    const pResNum = getResNumFromProj(p);
    if (selResNum && pResNum) {
      if (selResNum === pResNum || pResNum.startsWith(selResNum + '_') || selResNum.startsWith(pResNum + '_') || pResNum.startsWith(selResNum + '-') || selResNum.startsWith(pResNum + '-')) {
        return true;
      }
    }
    
    const pPoints = extractPoints(p.coordinates);
    if (pPoints.length === 0) return false;
    
    // Calculate bounding box of p
    let pMinLat = Infinity, pMaxLat = -Infinity;
    let pMinLng = Infinity, pMaxLng = -Infinity;
    for (const [lat, lng] of pPoints) {
      if (lat < pMinLat) pMinLat = lat;
      if (lat > pMaxLat) pMaxLat = lat;
      if (lng < pMinLng) pMinLng = lng;
      if (lng > pMaxLng) pMaxLng = lng;
    }
    
    // Bounding box intersection check
    const boxesOverlap = !(selMaxLat < pMinLat || selMinLat > pMaxLat || selMaxLng < pMinLng || selMinLng > pMaxLng);
    if (!boxesOverlap) return false;
    
    // 1. Check coordinate sharing (touching/contiguous)
    const sharesVertex = pPoints.some(ptP => 
      selPoints.some(ptS => Math.abs(ptP[0] - ptS[0]) < 0.00005 && Math.abs(ptP[1] - ptS[1]) < 0.00005)
    );
    if (sharesVertex) return true;
    
    // 2. Check centroid of p is inside selected
    let sumLat = 0, sumLng = 0;
    for (const [lat, lng] of pPoints) {
      sumLat += lat;
      sumLng += lng;
    }
    const pCentroid = [sumLat / pPoints.length, sumLng / pPoints.length];
    
    if (isPointInPolygon(pCentroid, selOuterRing)) return true;
    
    return false;
  });
}

const STANDARD_KEYS = ['id', 'name', 'type', 'ward', 'status', 'road_name', 'road_no', 'road_type', 'pave_type', 'landmark', 'authority', 'traffic', 'width', 'shape_length', 'unp_name', 'unp_type', 'dma_no', 'ward_no', 'junc_name', 'facility', 'rail_route', 'bridg_name', 'bridg_type', 'fly_name', 'description', 'remarks', 'coordinates', 'color', 'geom_type', 'created_at', 'modified', 'owner', 'docstatus', 'approver', 'custom_attributes', 'timeline', 'stages', 'pdf_attachment', 'area_name', 'area_size', 'yearly_rent', 'plot_area', 'Plot Area', 'constructed_area', 'Constructed Area', 'Tenant Name', 'tenant_name', 'Profession', 'profession', 'Purpose of Use', 'purpose_of_use', 'Contact Information', 'contact_information', 'Rental Period', 'rental_period', 'Aadhar Number', 'aadhar_number', 'aadhar_no', 'GST Number', 'gst_number', 'gst_no', 'PAN Card Number', 'pan_card_number', 'pancard_no', 'Rent Amount', 'rent_amount', 'Renewal Date', 'renewal_date', 'Tenant Attachments', 'tenant_attachments', 'creation', 'modified_by', 'idx', 'amended_from'];

export default function GISMap({ userInfo, requestTrigger, liveFilterActive, setLiveFilterActive }) {
  const mapRef = useRef(null)
  const fileInputRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const svgRendererRef = useRef(null)



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
  const [showLayers, setShowLayers] = useState(true)
  const [mapMode, setMapMode] = useState('satellite')
  const [layerVisibility, setLayerVisibility] = useState(() => {
    try {
      const saved = localStorage.getItem('gis_layer_vis');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return {};
  })

  useEffect(() => {
    localStorage.setItem('gis_layer_vis', JSON.stringify(layerVisibility));
  }, [layerVisibility]);

  const [selectedProject, setSelectedProject] = useState(null)
  const lastSelectedProjectRef = useRef(null);
  const mapSavedStateRef = useRef(null); // Saves center+zoom BEFORE entering details

  // Wrapper: save map state synchronously BEFORE React re-renders with new selectedProject
  // This avoids the race where fitBounds fires and overwrites the saved state
  const openProjectDetails = (project) => {
    if (mapInstanceRef.current) {
      try {
        mapSavedStateRef.current = {
          center: mapInstanceRef.current.getCenter(),
          zoom: mapInstanceRef.current.getZoom()
        };
      } catch(e) {}
    }
    lastSelectedProjectRef.current = project;
    setSelectedProject(project);
  };

  // When closing details: restore map state — lightweight only, no heavy ops in setTimeout
  useEffect(() => {
    if (!selectedProject && mapInstanceRef.current) {
      const map = mapInstanceRef.current;

      // Immediately invalidate so Leaflet knows its container is visible again
      try { map.invalidateSize({ animate: false }); } catch(e) {}

      const restoreView = () => {
        try {
          map.invalidateSize({ animate: false });
          // Use the saved center+zoom (saved before details was opened)
          if (mapSavedStateRef.current && mapSavedStateRef.current.center) {
            map.setView(
              mapSavedStateRef.current.center,
              mapSavedStateRef.current.zoom,
              { animate: false }
            );
          }
        } catch(e) {
          console.error('Map restore error:', e);
        }
      };

      const t1 = setTimeout(restoreView, 50);
      const t2 = setTimeout(restoreView, 250);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [selectedProject]);
  const [showForm, setShowForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [showInitiatePopup, setShowInitiatePopup] = useState(false)
  const [initiateComment, setInitiateComment] = useState('')
  const [initiateAttachment, setInitiateAttachment] = useState(null)
  const [initiateApprover, setInitiateApprover] = useState('')

  const [proposalDescription, setProposalDescription] = useState('')
  const [proposalEstimatedCost, setProposalEstimatedCost] = useState('')
  const [proposalEstimatedDuration, setProposalEstimatedDuration] = useState('')
  const [proposalTentativeStartDate, setProposalTentativeStartDate] = useState('')
  const [activeStatusFilter, setActiveStatusFilter] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [customAlert, setCustomAlert] = useState(null)
  const [currentZoom, setCurrentZoom] = useState(12)
  const [showStatusTimelinePopup, setShowStatusTimelinePopup] = useState(false)
  const [timelineStatus, setTimelineStatus] = useState('Work Started')
  const [timelineDate, setTimelineDate] = useState(() => new Date().toISOString().split('T')[0])
  const [timelineComment, setTimelineComment] = useState('')
  const [existingTimelineImages, setExistingTimelineImages] = useState([])
  const [newTimelineImages, setNewTimelineImages] = useState([])
  const [selectedJourneyStep, setSelectedJourneyStep] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)
  // Filter States
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [selectedResNames, setSelectedResNames] = useState([])
  const [resNameSearchQuery, setResNameSearchQuery] = useState('')
  const [showResNameDropdown, setShowResNameDropdown] = useState(false)
  const resNameDropdownRef = useRef(null)

  const [selectedResNumbers, setSelectedResNumbers] = useState([])
  const [resNumberSearchQuery, setResNumberSearchQuery] = useState('')
  const [showResNumberDropdown, setShowResNumberDropdown] = useState(false)
  const resNumberDropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (resNameDropdownRef.current && !resNameDropdownRef.current.contains(event.target)) {
        setShowResNameDropdown(false);
      }
      if (resNumberDropdownRef.current && !resNumberDropdownRef.current.contains(event.target)) {
        setShowResNumberDropdown(false);
      }
      if (surveyNoDropdownRef.current && !surveyNoDropdownRef.current.contains(event.target)) {
        setShowSurveyNoDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  const [filterVillage, setFilterVillage] = useState('All')
  const [filterLandAcquired, setFilterLandAcquired] = useState('All')
  const [filterMbmc712, setFilterMbmc712] = useState('All')
  const [filterCzmp, setFilterCzmp] = useState('All')
  const [filterEncroachment, setFilterEncroachment] = useState('All')
  const [selectedSurveyNos, setSelectedSurveyNos] = useState([])
  const [surveyNoSearchQuery, setSurveyNoSearchQuery] = useState('')
  const [showSurveyNoDropdown, setShowSurveyNoDropdown] = useState(false)
  const surveyNoDropdownRef = useRef(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMapTab, setActiveMapTab] = useState('layers')
  const [filteredCount, setFilteredCount] = useState(0)
  const filteredDataRef = useRef([])

  const filterOptions = useMemo(() => {
    const villages = new Set();
    const landStatuses = new Set();
    const mbmc712s = new Set();
    const czmps = new Set();
    const encroachments = new Set();
    const reservationNames = new Set();
    const reservationNumbers = new Set();
    const surveyNumbers = new Set();

    projects.forEach(p => {
      if (p.reservation_number) reservationNumbers.add(String(p.reservation_number));
      if (p.custom_attributes) {
        try {
          const attrs = typeof p.custom_attributes === 'string' ? JSON.parse(p.custom_attributes) : p.custom_attributes;
          if (attrs['Village Name']) villages.add(attrs['Village Name']);
          if (attrs['LAND ACQUIRED STATUS']) landStatuses.add(attrs['LAND ACQUIRED STATUS']);
          if (attrs['MBMC 7_12']) mbmc712s.add(attrs['MBMC 7_12']);
          if (attrs['2019_FORMAT_CZMP_AFFECTED_AREA']) czmps.add(attrs['2019_FORMAT_CZMP_AFFECTED_AREA']);
          if (attrs['ENCROACHMENT_STATUS']) encroachments.add(attrs['ENCROACHMENT_STATUS']);
          
          if (attrs['Reservation Name']) reservationNames.add(attrs['Reservation Name']);
          if (attrs['RES_NAME']) reservationNames.add(attrs['RES_NAME']);

          if (attrs['Reservation Number']) reservationNumbers.add(String(attrs['Reservation Number']));

          const oldS = attrs['Old Survey No_Hissa No'] || attrs['Old Survey No / Hissa No'];
          const newS = attrs['New Survey No_Hissa No'] || attrs['New Survey No / Hissa No'];
          const surv = attrs['SURVEY_No.'];
          if (oldS) surveyNumbers.add(String(oldS));
          if (newS) surveyNumbers.add(String(newS));
          if (surv) surveyNumbers.add(String(surv));
        } catch(e) {}
      }
    });

    return {
      villages: ['All', ...Array.from(villages).sort()],
      landStatuses: ['All', ...Array.from(landStatuses).sort()],
      mbmc712s: ['All', ...Array.from(mbmc712s).sort()],
      czmps: ['All', ...Array.from(czmps).sort()],
      encroachments: ['All', ...Array.from(encroachments).sort()],
      reservationNames: Array.from(reservationNames).sort(),
      reservationNumbers: Array.from(reservationNumbers).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      surveyNumbers: Array.from(surveyNumbers).sort(),
    };
  }, [projects]);

  const filteredResNumberDatalist = useMemo(() => {
    const query = (resNumberSearchQuery || '').toLowerCase();
    if (!query) {
      return filterOptions.reservationNumbers.slice(0, 100);
    }
    const matches = [];
    for (let i = 0; i < filterOptions.reservationNumbers.length; i++) {
      const num = filterOptions.reservationNumbers[i];
      if (num.toLowerCase().includes(query)) {
        matches.push(num);
        if (matches.length >= 100) break;
      }
    }
    return matches;
  }, [filterOptions.reservationNumbers, resNumberSearchQuery]);

  const filteredResNameDatalist = useMemo(() => {
    const query = (resNameSearchQuery || '').toLowerCase();
    if (!query) {
      return filterOptions.reservationNames.slice(0, 100);
    }
    const matches = [];
    for (let i = 0; i < filterOptions.reservationNames.length; i++) {
      const name = filterOptions.reservationNames[i];
      if (name.toLowerCase().includes(query)) {
        matches.push(name);
        if (matches.length >= 100) break;
      }
    }
    return matches;
  }, [filterOptions.reservationNames, resNameSearchQuery]);

  const filteredSurveyNoDatalist = useMemo(() => {
    const query = (surveyNoSearchQuery || '').toLowerCase();
    if (!query) {
      return filterOptions.surveyNumbers.slice(0, 100);
    }
    const matches = [];
    for (let i = 0; i < filterOptions.surveyNumbers.length; i++) {
      const s = filterOptions.surveyNumbers[i];
      if (s.toLowerCase().includes(query)) {
        matches.push(s);
        if (matches.length >= 100) break;
      }
    }
    return matches;
  }, [filterOptions.surveyNumbers, surveyNoSearchQuery]);

  const activeFiltersCount = [
    selectedResNames.length > 0 ? 'active' : '',
    selectedResNumbers.length > 0 ? 'active' : '',
    selectedSurveyNos.length > 0 ? 'active' : '',
    filterVillage !== 'All' ? filterVillage : '',
    filterLandAcquired !== 'All' ? filterLandAcquired : '',
    filterMbmc712 !== 'All' ? filterMbmc712 : '',
    filterCzmp !== 'All' ? filterCzmp : '',
    filterEncroachment !== 'All' ? filterEncroachment : '',
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSelectedResNames([]);
    setResNameSearchQuery('');
    setSelectedResNumbers([]);
    setResNumberSearchQuery('');
    setSelectedSurveyNos([]);
    setSurveyNoSearchQuery('');
    setFilterVillage('All');
    setFilterLandAcquired('All');
    setFilterMbmc712('All');
    setFilterCzmp('All');
    setFilterEncroachment('All');
  };


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
  const [activeDetailsTab, setActiveDetailsTab] = useState('overview')
  const [expandedRelatedFeatureId, setExpandedRelatedFeatureId] = useState(null)
  useEffect(() => {
    if (selectedProject) {
      setShowLayers(false);
    } else {
      setShowLayers(true);
    }
  }, [selectedProject]);
  const miniMapInstanceRef = useRef(null);
  useEffect(() => {
    if (!selectedProject) {
      if (miniMapInstanceRef.current) {
        miniMapInstanceRef.current.remove();
        miniMapInstanceRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      const container = document.getElementById('details-mini-map');
      if (!container) return;
      if (miniMapInstanceRef.current) {
        miniMapInstanceRef.current.remove();
        miniMapInstanceRef.current = null;
      }

      const miniMap = L.map('details-mini-map', {
        zoomControl: false,
        attributionControl: false
      });

      // Synchronize tile layer based on mapMode
      let tileUrl = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'; // satellite (default)
      if (mapMode === 'standard') {
        tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      } else if (mapMode === 'terrain') {
        tileUrl = 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}';
      }
      L.tileLayer(tileUrl).addTo(miniMap);

      miniMapInstanceRef.current = miniMap;

      // Draw overlapping features first (so they are in the background)
      const miniMapSvgRenderer = L.svg();
      miniMapSvgRenderer.addTo(miniMap);
      
      const overlapping = findOverlappingFeatures(selectedProject, projects);
      overlapping.forEach(feat => {
        if (!feat.coordinates || feat.coordinates.length === 0) return;
        try {
          const isBuilding = feat.type === 'BUILDING_INFO' || feat.type === 'building_info';
          const featMeta = layerMetaLookup[feat.type] || LAYER_META[feat.type] || {};
          const featColor = featMeta.color || '#475569';
          const featFillOpacity = featMeta.fillOpacity !== undefined ? featMeta.fillOpacity : 0.45;
          const featShouldFill = featMeta.fill !== false;
          const featGeomType = feat.geom_type || 'Polygon';

          if (isBuilding) {
            L.polygon(feat.coordinates, {
              color: '#dc2626',
              fillColor: 'url(#redBuildingHatch)',
              fill: true,
              fillOpacity: 0.9,
              weight: 1.5,
              renderer: miniMapSvgRenderer
            }).addTo(miniMap);
          } else if (featGeomType.toLowerCase().includes('point')) {
            const pt = typeof feat.coordinates[0] === 'number' ? feat.coordinates : feat.coordinates[0];
            L.circleMarker(pt, { radius: 5, color: '#fff', fillColor: featColor, fillOpacity: 0.8, weight: 1.5, renderer: miniMapSvgRenderer }).addTo(miniMap);
          } else if (featGeomType.toLowerCase().includes('line') || featGeomType.toLowerCase().includes('string')) {
            L.polyline(feat.coordinates, { color: featColor, weight: featMeta.weight || 3, opacity: 0.8, renderer: miniMapSvgRenderer }).addTo(miniMap);
          } else {
            L.polygon(feat.coordinates, {
              color: featColor,
              fillColor: featColor,
              fill: featShouldFill,
              fillOpacity: featShouldFill ? featFillOpacity : 0,
              weight: featMeta.weight || 2,
              renderer: miniMapSvgRenderer
            }).addTo(miniMap);
          }
        } catch (e) {
          console.error("Error drawing overlapping layer on miniMap", e);
        }
      });

      // Draw only the selected feature geometry
      if (selectedProject.coordinates && selectedProject.coordinates.length > 0) {
        try {
          // Use same color logic as main map: LAYER_META for reference layers, status-based for user features
          const isReferenceLayer = selectedProject.type && (
            selectedProject.type.startsWith('MBMC-') ||
            selectedProject.type.startsWith('VVCM') ||
            selectedProject.type === 'BUILDING_INFO' ||
            selectedProject.type === 'building_info' ||
            selectedProject.type === 'Road'
          );
          const meta = layerMetaLookup[selectedProject.type] || LAYER_META[selectedProject.type] || {};
          const isProjectOrReservation = !isReferenceLayer || selectedProject.type === 'MBMC-RESERVSTION';
          if (isReferenceLayer && selectedProject.type !== 'MBMC-RESERVSTION') {
            color = meta.color || '#1a73e8';
          } else {
            const st = selectedProject.status || '';
            if (['Approved','Work Started','Ongoing','On Hold','Hold','Near Completion','Completed'].includes(st)) color = '#16a34a';
            else if (st === 'Pending for Request') color = '#ea580c';
            else if (st === 'Submitted') color = '#2563eb';
            else if (st === 'Correction') color = '#e11d48';
            else if (st === 'Draft') color = selectedProject.type === 'MBMC-RESERVSTION' ? (meta.color || '#00e5ff') : '#64748b';
            else if (st === 'Rejected') color = '#dc2626';
            else color = selectedProject.color || meta.color || '#1a73e8';
          }
          const fillOpacity = meta.fillOpacity !== undefined ? meta.fillOpacity : 0.45;
          const shouldFill = meta.fill !== false;
          const geomType = selectedProject.geom_type || 'Polygon';
          let layer;

          
          if (geomType.toLowerCase().includes('point')) {
            const pt = typeof selectedProject.coordinates[0] === 'number' ? selectedProject.coordinates : selectedProject.coordinates[0];
            layer = L.circleMarker(pt, { radius: 8, color: '#fff', fillColor: color, fillOpacity: 0.9, weight: 2, renderer: miniMapSvgRenderer });
            miniMap.setView(pt, 16);
          } else if (geomType.toLowerCase().includes('line') || geomType.toLowerCase().includes('string')) {
            layer = L.polyline(selectedProject.coordinates, { color, weight: meta.weight || 4, opacity: 0.9, renderer: miniMapSvgRenderer });
            miniMap.fitBounds(layer.getBounds(), { padding: [15, 15] });
          } else {
            // Polygon — use same fill/opacity as main map
            const isBuilding = selectedProject.type === 'BUILDING_INFO' || selectedProject.type === 'building_info';
            layer = L.polygon(selectedProject.coordinates, {
              color: isBuilding ? '#dc2626' : color,
              fillColor: isBuilding ? 'url(#redBuildingHatch)' : color,
              fill: shouldFill,
              fillOpacity: isBuilding ? 0.9 : (shouldFill ? fillOpacity : 0),
              weight: isBuilding ? 1.5 : (meta.weight || 2.5),
              renderer: miniMapSvgRenderer
            });
            miniMap.fitBounds(layer.getBounds(), { padding: [15, 15] });
          }


          layer.addTo(miniMap);

          // Add a permanent label on the polygon with the reservation/survey number
          try {
            const attrs = (() => {
              if (!selectedProject?.custom_attributes) return {};
              try { return typeof selectedProject.custom_attributes === 'string' ? JSON.parse(selectedProject.custom_attributes) : selectedProject.custom_attributes; } catch(e) { return {}; }
            })();
            const isReservation = selectedProject.type?.startsWith('MBMC-RESERVSTION');
            let labelText = '';
            if (isReservation) {
              const resNum = attrs['Reservation Number'] || attrs['RES_NUMBER'] || attrs['Reservation Number_doc'] || attrs['RES_CODE'] || attrs['RESERVATIO'] || attrs['GIS ID'] || '';
              const newSurvey = attrs['New Survey No_Hissa No'] || attrs['New Survey No / Hissa No'] || attrs['New Survey No'] || '';
              if (resNum) {
                let clean = String(resNum).trim();
                if (clean.includes('_')) { const parts = clean.split('_'); if (parts[0] && /\d/.test(parts[0])) clean = parts[0].trim(); }
                labelText = clean;
                if (newSurvey) {
                  labelText = `${clean} <span style="color: #1e293b; font-weight: 700; font-size: 11px; margin-left: 3px;">(${newSurvey})</span>`;
                }
              }
            } else {
              const oldH = attrs['Old Survey No_Hissa No'] || attrs['Old Survey No / Hissa No'] || '';
              const survNo = attrs['SURVEY_No.'] || '';
              labelText = oldH || survNo;
            }

            if (labelText) {
              // Compute center of bounds for label placement
              let center;
              if (layer.getCenter) { center = layer.getCenter(); }
              else if (layer.getBounds) { center = layer.getBounds().getCenter(); }
              else if (layer.getLatLng) { center = layer.getLatLng(); }

              if (center) {
                L.marker(center, {
                  icon: L.divIcon({
                    className: 'resnum-map-label-mini',
                    html: `<div style="
                      background: transparent;
                      border: none;
                      color: #dc2626;
                      font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
                      font-size: 14px;
                      font-weight: 800;
                      letter-spacing: 0.3px;
                      text-shadow: 
                       -1.8px -1.8px 0 #fff, 
                        1.8px -1.8px 0 #fff, 
                       -1.8px  1.8px 0 #fff, 
                        1.8px  1.8px 0 #fff,
                       -1.8px  0px   0 #fff,
                        1.8px  0px   0 #fff,
                        0px   -1.8px 0 #fff,
                        0px    1.8px 0 #fff;
                      white-space: nowrap;
                      pointer-events: none;
                      text-align: center;
                      transform: translate(-50%, -50%);
                    ">${labelText}</div>`,
                    iconAnchor: [0, 0]
                  }),
                  interactive: false
                }).addTo(miniMap);
              }
            }
          } catch(labelErr) { /* label is optional, skip silently */ }

        } catch(e) {
          console.error("Error drawing mini map layer", e);
          miniMap.setView([19.2812, 72.8561], 12);
        }
      } else {
        miniMap.setView([19.2812, 72.8561], 12);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [selectedProject, mapMode, projects]);


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

  const ALL_GENERAL_FIELDS = [
    { k: 'RESERVATIO', l: 'Reservation ID' },
    { k: 'Old Survey No_Hissa No', l: 'Old Survey No / Hissa No' },
    { k: 'New Survey No_Hissa No', l: 'New Survey No / Hissa No' },
    { k: 'Reservation Number', l: 'Reservation Number' },
    { k: 'DRC NO', l: 'DRC No.' },
    { k: 'Reservation Name', l: 'Reservation Name' },
    { k: 'Village Name', l: 'Village Name' },
    { k: 'RESERVATION_DRAWING LINK', l: 'Reservation Drawing' },
    { k: 'LAND ACQUIRED STATUS', l: 'Land Acquired Status' },
    { k: 'MBMC 7_12', l: 'MBMC 7/12' },
    { k: '2019_FORMAT_CZMP_AFFECTED_AREA', l: 'CZMP Affected Area (2019)' },
    { k: 'ENCROACHMENT_STATUS', l: 'Encroachment Status' },
    { k: 'ENCROACHMENT_PHOTOS', l: 'Encroachment Photo' },
    { k: 'ENCROACHMENT_LINK', l: 'Encroachment Document' },
    { k: 'COMMENT', l: 'Comment' }
  ];

  const ALL_DOCUMENT_FIELDS = [
    { k: 'GIS_ID', l: 'GIS ID' },
    { k: 'Old Survey No_Hissa No_doc', l: 'Old Survey No / Hissa No (Doc)' },
    { k: 'Reservation Number_doc', l: 'Reservation Number (Doc)' },
    { k: 'New Survey No_Hissa No_doc', l: 'New Survey No / Hissa No (Doc)' },
    { k: 'Document 7/12', l: 'Document 7/12' },
    { k: '7/12 LINK', l: '7/12 Document' },
    { k: 'Document_8A', l: 'Document 8A' },
    { k: 'DOC_8A Link', l: '8A Document' },
    { k: 'FORM NO6', l: 'Form No. 6' },
    { k: 'FN6 LINK', l: 'Form No. 6 Document' },
    { k: 'T.D.R.Certificate & Use', l: 'TDR Certificate' },
    { k: 'T.D.R.C. LINK', l: 'TDR Certificate Document' },
    { k: 'T.D.R.', l: 'TDR Details' },
    { k: 'T.D.R Link', l: 'TDR Document' },
    { k: 'Agreement', l: 'Agreement' },
    { k: 'Agreement Link', l: 'Agreement Document' },
    { k: 'PR_Document', l: 'PR Card' },
    { k: 'PR Link', l: 'PR Card Document' },
    { k: 'Tahsildar Letter', l: 'Tahsildar Letter' },
    { k: 'Tahsildar Letter Link', l: 'Tahsildar Letter Document' },
    { k: 'LOCAL MAP', l: 'Local Map' },
    { k: 'LOCAL MAP LINK', l: 'Local Map Document' },
    { k: 'Stability Certificate', l: 'Stability Certificate' },
    { k: 'Stability Certificate_Link', l: 'Stability Certificate Document' },
    { k: 'FERFAR', l: 'Ferfar' },
    { k: 'FERFAR_Link', l: 'Ferfar Document' },
    { k: 'ULC', l: 'ULC' },
    { k: 'ULC_Link', l: 'ULC Document' },
    { k: 'Comments', l: 'Document Comments' }
  ];

  const DOCUMENT_KEYS = [
    'GIS_ID', 'Old Survey No_Hissa No_doc', 'Reservation Number_doc', 'New Survey No_Hissa No_doc',
    'Document 7/12', '7/12 LINK', 'Document_8A', 'DOC_8A Link', 'FORM NO6', 
    'FN6 LINK', 'T.D.R.Certificate & Use', 'T.D.R.C. LINK', 'T.D.R.', 
    'T.D.R Link', 'Agreement', 'Agreement Link', 'PR_Document', 'PR Link', 
    'Tahsildar Letter', 'Tahsildar Letter Link', 'LOCAL MAP', 'LOCAL MAP LINK', 
    'Stability Certificate', 'Stability Certificate_Link', 'FERFAR', 'FERFAR_Link', 
    'ULC', 'ULC_Link', 'Comments'
  ];

  const getTabForField = (k) => {
    const cleanKey = k.startsWith('attr_') ? k.substring(5) : k;
    if (DOCUMENT_KEYS.includes(cleanKey)) {
      return 'documents';
    }
    return 'general';
  };

  const renderFieldValue = (r) => {
    if (isEditing && r.k !== 'id' && !r.ro) {
      return (
        <input
          value={(() => {
            const rawVal = selectedProject[r.k] !== undefined && selectedProject[r.k] !== null ? selectedProject[r.k] : (selectedProject[r.l] !== undefined && selectedProject[r.l] !== null ? selectedProject[r.l] : '');
            return (rawVal === 'N/A') ? '' : rawVal;
          })()}
          onChange={(e) => setSelectedProject({ ...selectedProject, [r.k]: e.target.value })}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
        />
      );
    }
    return <DetailRowValue val={r.v} />;
  };

  const getGroupedAttributes = () => {
    if (!selectedProject) return [];

    // Parse custom_attributes once
    let attrs = {};
    if (selectedProject.custom_attributes) {
      try {
        attrs = typeof selectedProject.custom_attributes === 'string'
          ? JSON.parse(selectedProject.custom_attributes)
          : selectedProject.custom_attributes;
      } catch(e) {}
    }

    // Smart MBMC Reservation detection:
    // Check type/project_type name OR if the attributes contain RESERVATIO key (the QGIS field)
    const isMbmcReservation = 
      selectedProject.type?.startsWith('MBMC-RESERVSTION') || 
      selectedProject.project_type?.startsWith('MBMC-RESERVSTION') ||
      (attrs && attrs['RESERVATIO'] !== undefined && attrs['Reservation Number'] !== undefined);

    if (isMbmcReservation) {
      // ── MBMC Reservation: show exactly the fields from the QGIS screenshot ──
      const attrItems = [];
      ALL_GENERAL_FIELDS.forEach(f => {
        let val = attrs[f.k];
        if (val === undefined || val === null || val === 'null' || String(val).trim() === '') {
          val = 'N/A';
        }
        attrItems.push({ l: f.l, v: String(val), k: `attr_${f.k}`, ro: true });
      });

      const docItems = [];
      ALL_DOCUMENT_FIELDS.forEach(f => {
        let val = attrs[f.k];
        if (f.k === 'GIS_ID')                     val = attrs['GIS ID'] || attrs['RESERVATIO'];
        else if (f.k === 'Old Survey No_Hissa No_doc')   val = attrs['Old Survey No_Hissa No'];
        else if (f.k === 'New Survey No_Hissa No_doc')   val = attrs['New Survey No_Hissa No'];
        else if (f.k === 'Reservation Number_doc')       val = attrs['Reservation Number'];

        if (val === undefined || val === null || val === 'null' || String(val).trim() === '') val = 'N/A';
        docItems.push({ l: f.l, v: String(val), k: `attr_${f.k}`, ro: true });
      });

      const groups = [];
      if (attrItems.length > 0) groups.push({ title: '📋 MBMC Reservation Attributes', items: attrItems });
      if (docItems.length > 0)  groups.push({ title: '📄 Document Checklist', items: docItems });
      return groups;
    }

    // ── Non-MBMC-reservation: generic grouped view ──
    const groups = [
      {
        title: "Property Details",
        items: [
          { l: 'Project Name', v: selectedProject.project_name || selectedProject.name, k: 'project_name' },
          { l: 'Type', v: selectedProject.type, k: 'type' },
          { l: 'Status', v: selectedProject.status, k: 'status', ro: true },
          { l: 'Submitted By Role', v: selectedProject.submitted_by_role, k: 'submitted_by_role', ro: true },
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
      } catch (e) {}
    }

    // Distribute extra project-level keys into sections
    Object.keys(selectedProject).forEach(k => {
      if (!STANDARD_KEYS.includes(k) && k !== 'section_mappings') {
        const val = selectedProject[k];
        if (val !== undefined && val !== null) {
          const targetSectionTitle = sectionMappings[k] || "Property Details";
          let group = groups.find(g => g.title === targetSectionTitle) || groups.find(g => g.title === "Property Details");
          if (group && !group.items.some(item => item.k === k)) {
            group.items.push({ l: k, v: val, k: k });
          }
        }
      }
    });

    // Add custom shapefile attributes as GIS Data section
    if (Object.keys(attrs).length > 0) {
      const FIELD_LABELS = {
        'VILLAGE_NA': 'Village Name', 'SURVEY_No.': 'Survey No.', 'RES_NUMBER': 'Reservation Number',
        'RES_NAME': 'Reservation Name', 'RES_CODE': 'Reservation Code', 'RESERVATIO': 'Reservation ID',
        'BUILDING I': 'Building ID', 'BUILDING N': 'Building Name', 'WIDTH (SQM': 'Width (sqm)',
        'LENGTH (SQ': 'Length (sqm)', 'AREA (SQM)': 'Area (sqm)', 'BUILDING P': 'Building Photo',
        'BUILDING_1': 'Document Link', 'ENCROACHME': 'Encroachment Status', 'Text': 'GIS ID',
        'SHAPE_Leng': 'Shape Length', 'Pave type': 'Pavement Type', 'Authority': 'Authority',
        'Traffic': 'Traffic', 'road_name': 'Road Name', 'road_no': 'Road Number',
        'road type': 'Road Type', 'landmark': 'Landmark', 'length': 'Length (m)', 'width': 'Width (m)',
      };
      const attrItems = Object.entries(attrs)
        .filter(([k, v]) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).toLowerCase() !== 'null')
        .map(([k, v]) => ({ l: FIELD_LABELS[k] || k, v: String(v), k: `attr_${k}`, ro: true }));

      if (attrItems.length > 0) {
        groups.push({ title: '📋 GIS Data (from Shapefile)', items: attrItems });
      }
    }

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
      // Fetch full projects with geometry to draw on map (only one setProjects call = no flash)
      const data = await fetchProjects(statusToFetch)
      const parsedData = (data || []).map(p => {
        let coords = p.coordinates
        if (typeof coords === 'string') {
          try { coords = JSON.parse(coords) } catch (e) { coords = [] }
        }
        return { ...p, coordinates: cleanCoords(coords) }
      }).filter(p => p.coordinates)
      
      setProjects(parsedData);

      const selId = localStorage.getItem('gis_selected_project_id');
      if (selId) {
        localStorage.removeItem('gis_selected_project_id');
        const found = parsedData.find(p => p.id === selId);
        if (found) {
          openProjectDetails(found);
        }
      }
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    loadCategories()
    loadProjects()
  }, [])

  useEffect(() => {
    if (projects.length > 0) {
      const uniqueTypes = Array.from(new Set(projects.map(p => p.type)));
      // Layers that are ON by default (key reference layers)
      const DEFAULT_ON = new Set([]);
      setLayerVisibility(prev => {
        const updated = { ...prev };
        let changed = false;
        uniqueTypes.forEach(type => {
          if (updated[type] === undefined) {
            // Default ON for key layers, OFF for heavy layers like BUILDING_INFO
            updated[type] = DEFAULT_ON.has(type);
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
    }
  }, [projects]);


  useEffect(() => {
    if (liveFilterActive !== undefined) {
      const liveStatuses = 'Approved,Work Started,Ongoing,On Hold,Hold,Near Completion,Completed';
      const newFilter = liveFilterActive ? liveStatuses : null;
      setActiveStatusFilter(newFilter);
      loadProjects(newFilter);
    }
  }, [liveFilterActive])

  // Only fit bounds on the mini-map inside the details view, not on the main map
  // (the main map's fitBounds was causing the black screen by running during state restoration)
  // This effect is intentionally left empty — mini map handles its own centering
  useEffect(() => {
    // intentionally removed fitBounds here to prevent black-screen race condition
    // mini map (details-mini-map) handles centering independently
  }, [selectedProject]);

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      zoomControl: false,
      doubleClickZoom: false,
      renderer: L.canvas({ padding: 0.5 }) // SIGNIFICANT PERFORMANCE BOOST for 10k+ features
    }).setView([19.25, 72.85], 12)
    mapInstanceRef.current = map
    svgRendererRef.current = L.svg()

    const layers = {
      standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }),
      satellite: L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { attribution: '© Google' }),
      terrain: L.tileLayer('https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', { attribution: '© Google' })
    }
    layers.satellite.addTo(map)
    mapInstanceRef.current._baseLayers = layers

    mainGroupRef.current = L.featureGroup().addTo(map)
    drawnLayersRef.current = L.featureGroup().addTo(map)

    // Create custom Leaflet panes so MBMC-RESERVSTION is always on top (clickable)
    // Default overlayPane z-index is 400. We assign explicit z-indices per layer type.
    map.createPane('pane-village');      map.getPane('pane-village').style.zIndex      = 350;
    map.createPane('pane-survey');       map.getPane('pane-survey').style.zIndex       = 360;
    map.createPane('pane-road');         map.getPane('pane-road').style.zIndex         = 370;
    map.createPane('pane-roadcenter');   map.getPane('pane-roadcenter').style.zIndex   = 380;
    map.createPane('pane-resboundary'); map.getPane('pane-resboundary').style.zIndex  = 420;
    map.createPane('pane-reservation'); map.getPane('pane-reservation').style.zIndex  = 450; // ← on top
    // Make panes pointer-events clickable
    ['pane-village','pane-survey','pane-road','pane-roadcenter','pane-resboundary','pane-reservation'].forEach(pn => {
      map.getPane(pn).style.pointerEvents = 'auto';
    });

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
          const tooltip = typeof layer.getTooltip === 'function' ? layer.getTooltip() : null;
          if (tooltip && tooltip.options && tooltip.options.permanent) {
            // Keep permanent tooltips open
            return;
          }
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

    // Track zoom level updates to dynamically toggle label visibility classes
    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
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
      // Switch back to layers tab so layers are visible behind the save form
      setActiveMapTab('layers')
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
    // Layer z-order: render MBMC-RESERVSTION last so it's on top (clickable over VILLAGE-BOUNDARY)
    const TYPE_Z = {
      'MBMC-VILLAGE-BOUNDARY': 1,
      'MBMC-VILLAGES-SURVEY_No._BOUNDARY': 2,
      'MBMC-ROAD': 3,
      'MBMC-ROAD_CENTER_LINE': 4,
      'MBMC-RESERVSTION-BOUNDARY': 8,
      'MBMC-RESERVSTION': 10,  // ← highest: always clickable on top
    };
    const sortedProjects = [...projects].sort((a, b) => {
      const za = TYPE_Z[a.type] || 5;
      const zb = TYPE_Z[b.type] || 5;
      if (za !== zb) return za - zb;  // lower z rendered first (= underneath)
      const score = { 'Draft': 1, 'Correction': 2, 'Pending for Request': 3, 'Submitted': 4, 'Approved': 5 };
      return (score[a.status] || 0) - (score[b.status] || 0);
    });
    const filteredProjects = sortedProjects.filter(p => {
      let attrs = {};
      if (p.custom_attributes) {
        try {
          attrs = typeof p.custom_attributes === 'string' ? JSON.parse(p.custom_attributes) : p.custom_attributes;
        } catch(e) {}
      }

      // 1. Text Search Filter (applies to project name, reservation name, survey numbers, etc.)
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesProjName = (p.project_name || p.name || '').toLowerCase().includes(q);
        const matchesResName = (attrs['Reservation Name'] || '').toLowerCase().includes(q);
        const matchesResId = (attrs['RESERVATIO'] || '').toLowerCase().includes(q);
        const matchesSurveyNo = (attrs['Old Survey No_Hissa No'] || '').toLowerCase().includes(q) || (attrs['New Survey No_Hissa No'] || '').toLowerCase().includes(q);
        if (!matchesProjName && !matchesResName && !matchesResId && !matchesSurveyNo) {
          return false;
        }
      }

      // Apply filters globally to all features (from any layer) when active
      // 2. Reservation Name Filter (multiselect filter)
      if (selectedResNames && selectedResNames.length > 0) {
        const resName = attrs['Reservation Name'] || attrs['RES_NAME'] || '';
        if (!selectedResNames.some(selectedName => resName.toLowerCase() === selectedName.toLowerCase())) return false;
      }

      // Reservation Number Filter (multiselect filter)
      if (selectedResNumbers && selectedResNumbers.length > 0) {
        const resNo = attrs['Reservation Number'] || p.reservation_number || '';
        if (!selectedResNumbers.some(selectedNum => String(resNo).toLowerCase() === String(selectedNum).toLowerCase())) return false;
      }

      // Survey Number Filter (multiselect filter)
      if (selectedSurveyNos && selectedSurveyNos.length > 0) {
        const oldSurvey = attrs['Old Survey No_Hissa No'] || attrs['Old Survey No / Hissa No'] || '';
        const newSurvey = attrs['New Survey No_Hissa No'] || attrs['New Survey No / Hissa No'] || '';
        const surveyNoAttr = attrs['SURVEY_No.'] || '';
        const matched = selectedSurveyNos.some(selectedVal => {
          const s = selectedVal.toLowerCase();
          return String(oldSurvey).toLowerCase().includes(s) || 
                 String(newSurvey).toLowerCase().includes(s) ||
                 String(surveyNoAttr).toLowerCase().includes(s);
        });
        if (!matched) return false;
      }

      // 3. Village Name Filter
      if (filterVillage && filterVillage !== 'All') {
        const village = attrs['Village Name'] || attrs['VILLAGE_NA'] || '';
        // If it's a survey boundary, extract village name prefix (e.g. "GHODBUNDAR_95" -> "GHODBUNDAR")
        let projVillage = village;
        if (!projVillage && attrs['SURVEY_No.']) {
          const parts = String(attrs['SURVEY_No.']).split('_');
          if (parts[0]) projVillage = parts[0].trim();
        }
        if (projVillage.toLowerCase() !== filterVillage.toLowerCase()) return false;
      }

      // 4. Land Acquired Status Filter
      if (filterLandAcquired && filterLandAcquired !== 'All') {
        const status = attrs['LAND ACQUIRED STATUS'] || '';
        if (status !== filterLandAcquired) return false;
      }

      // 5. MBMC 7/12 Filter
      if (filterMbmc712 && filterMbmc712 !== 'All') {
        const mbmc712 = attrs['MBMC 7_12'] || '';
        if (mbmc712 !== filterMbmc712) return false;
      }

      // 6. CZMP Affected Area Filter
      if (filterCzmp && filterCzmp !== 'All') {
        const czmp = attrs['2019_FORMAT_CZMP_AFFECTED_AREA'] || '';
        if (czmp !== filterCzmp) return false;
      }

      // 7. Encroachment Status Filter
      if (filterEncroachment && filterEncroachment !== 'All') {
        const encroachment = attrs['ENCROACHMENT_STATUS'] || '';
        if (encroachment !== filterEncroachment) return false;
      }

      return true;
    });

    // Store filtered data for Excel export
    filteredDataRef.current = filteredProjects;
    setFilteredCount(filteredProjects.length);

    const seenResLabels = new Set();

    filteredProjects.forEach(p => {
      if (!categoryGroupsRef.current[p.type]) {
        categoryGroupsRef.current[p.type] = L.featureGroup()
      }

      // Get layer meta configuration
      const meta = layerMetaLookup[p.type] || LAYER_META[p.type] || {}
      const defaultColor = meta.color || '#1a73e8'
      const shouldFill = meta.fill !== false
      // Use custom fillOpacity from meta if provided (e.g. for MBMC layers)
      const metaFillOpacity = meta.fillOpacity !== undefined ? meta.fillOpacity : 0.25
      const layerWeight = meta.weight !== undefined ? meta.weight : (p.geom_type?.toLowerCase().includes('line') ? 5 : 3)

      // Reference/base-map layer types: always use LAYER_META color, ignore DB stored color
      // (DB may have wrong default color #2563eb from initial import)
      const isReferenceLayers = p.type && (
        p.type.startsWith('MBMC-') ||
        p.type.startsWith('VVCM') ||
        p.type === 'BUILDING_INFO' ||
        p.type === 'building_info' ||
        p.type === 'Road'
      );

      // For reference layers (except reservations) use meta color; for user-drawn projects / reservations use status-based color
      const isProjectOrReservation = !isReferenceLayers || p.type === 'MBMC-RESERVSTION';
      let color = (isReferenceLayers && p.type !== 'MBMC-RESERVSTION') ? defaultColor : (p.color || defaultColor)
      let fillOpacity = metaFillOpacity

      if (isProjectOrReservation && p.status) {
        if (['Approved', 'Work Started', 'Ongoing', 'On Hold', 'Hold', 'Near Completion', 'Completed'].includes(p.status)) {
          color = '#16a34a' // Green
        } else if (p.status === 'Pending for Request') {
          color = '#ea580c' // Orange
        } else if (p.status === 'Submitted') {
          color = '#2563eb' // Blue
        } else if (p.status === 'Correction') {
          color = '#e11d48' // Rose/Red
        } else if (p.status === 'Draft') {
          color = p.type === 'MBMC-RESERVSTION' ? defaultColor : '#64748b' // Cyan for reservations, Slate/Gray for others
        } else if (p.status === 'Rejected') {
          color = '#dc2626' // Red
        }
        fillOpacity = (p.type === 'MBMC-RESERVSTION' && p.status === 'Draft') ? metaFillOpacity : 0.45
      }
      let layer;
      if (!p.coordinates || p.coordinates.length === 0) return;
      try {
        if (p.geom_type?.toLowerCase().includes('point')) {
          const pt = typeof p.coordinates[0] === 'number' ? p.coordinates : p.coordinates[0];
          layer = L.circleMarker(pt, { radius: 6, color: '#fff', fillColor: color, fillOpacity: 0.9, weight: 2 })
        } else if (p.geom_type?.toLowerCase().includes('line') || p.geom_type?.toLowerCase().includes('string')) {
          layer = L.polyline(p.coordinates, { color, weight: layerWeight, opacity: 0.85 })
        } else {
          // Assign to the correct pane for precise z-order control
          const PANE_MAP = {
            'MBMC-VILLAGE-BOUNDARY':            'pane-village',
            'MBMC-VILLAGES-SURVEY_No._BOUNDARY': 'pane-survey',
            'MBMC-ROAD':                         'pane-road',
            'MBMC-ROAD_CENTER_LINE':             'pane-roadcenter',
            'MBMC-RESERVSTION-BOUNDARY':         'pane-resboundary',
            'MBMC-RESERVSTION':                  'pane-reservation',
          };
          const featurePane = PANE_MAP[p.type] || undefined;
          const isBuildingInfo = p.type === 'BUILDING_INFO' || p.type === 'building_info';
          layer = L.polygon(p.coordinates, {
            color: isBuildingInfo ? '#dc2626' : color,
            fillColor: isBuildingInfo ? 'url(#redBuildingHatch)' : color,
            fill: shouldFill,
            fillOpacity: isBuildingInfo ? 0.9 : (shouldFill ? fillOpacity : 0),
            weight: isBuildingInfo ? 1.5 : layerWeight,
            renderer: isBuildingInfo ? svgRendererRef.current : undefined,
            ...(featurePane ? { pane: featurePane } : {})
          })
        }

        layer.projectId = p.id
        
        let displayName = p.name;
        if (p.custom_attributes) {
          try {
            const attrs = typeof p.custom_attributes === 'string' ? JSON.parse(p.custom_attributes) : p.custom_attributes;

            const isReservationNum = p.type === 'MBMC-RESERVSTION' || p.type === 'MBMC-RESERVSTION-BOUNDARY';
            if (isReservationNum) {
              const resNum = attrs['Reservation Number'] || attrs['RES_NUMBER'] || attrs['Reservation Number_doc'] || attrs['RES_CODE'] || attrs['RESERVATIO'] || attrs['GIS ID'] || '';
              const newSurvey = attrs['New Survey No_Hissa No'] || attrs['New Survey No / Hissa No'] || attrs['New Survey No'] || '';
              if (resNum) {
                let cleanRes = String(resNum).trim();
                if (cleanRes.includes('_')) {
                  const parts = cleanRes.split('_');
                  if (parts[0] && /\d/.test(parts[0])) {
                    cleanRes = parts[0].trim();
                  }
                }
                displayName = cleanRes;
                if (newSurvey) {
                  displayName = `${cleanRes} <span style="color: #1e293b; font-weight: 700; font-size: 10px; margin-left: 3px;">(${newSurvey})</span>`;
                }
              }
            } else if (p.type === 'BUILDING_INFO' || p.type === 'building_info') {
              const bldgId = attrs['BUILDING I'] || attrs['Text'] || attrs['BUILDING N'] || '';
              if (bldgId) {
                displayName = String(bldgId).trim();
              }
            } else {
              // Priority order: other layers
              const mbmcKey = 
                attrs['Reservation Number'] ? 'Reservation Number' :
                attrs['Reservation Number_doc'] ? 'Reservation Number_doc' :
                attrs['RESERVATIO'] ? 'RESERVATIO' :
                attrs['GIS ID']     ? 'GIS ID'     :
                attrs['RES_CODE']   ? 'RES_CODE'   :
                attrs['RES_NAME']   ? 'RES_NAME'   :
                attrs['SURVEY_No.'] ? 'SURVEY_No.' :
                attrs['VILLAGE_NA'] ? 'VILLAGE_NA' :
                null;
              if (mbmcKey && attrs[mbmcKey]) {
                displayName = String(attrs[mbmcKey]);
              } else if (displayName && displayName.includes('Feature ')) {
                const nameKey = Object.keys(attrs).find(k =>
                  k.toLowerCase().includes('name') ||
                  k.toLowerCase().includes('village') ||
                  k.toLowerCase().includes('survey') ||
                  k.toLowerCase().includes('ward')
                );
                if (nameKey && attrs[nameKey]) {
                  displayName = String(attrs[nameKey]);
                }
              }
            }
          } catch(e){}
        }

        if (displayName) {
          displayName = displayName.replace(/^Feature\s+/i, '');
        }

        const isVillageLayer = p.type === 'MBMC-VILLAGE-BOUNDARY';
        const isSurveyLayer  = p.type === 'MBMC-VILLAGES-SURVEY_No._BOUNDARY';
        const isResLayer     = p.type === 'MBMC-RESERVSTION-BOUNDARY';
        const isReservationLayer = p.type === 'MBMC-RESERVSTION';
        const isBuildingLayer = p.type === 'BUILDING_INFO' || p.type === 'building_info';
        
        let showPermanentLabel = isVillageLayer || isSurveyLayer || isResLayer || isReservationLayer || isBuildingLayer;
        if (isResLayer || isReservationLayer) {
          const labelKey = p.type + '_' + displayName;
          if (seenResLabels.has(labelKey)) {
            showPermanentLabel = false;
          } else {
            seenResLabels.add(labelKey);
          }
        } else if (isBuildingLayer) {
          const labelKey = p.type + '_' + displayName;
          if (seenResLabels.has(labelKey)) {
            showPermanentLabel = false;
          } else {
            seenResLabels.add(labelKey);
          }
        }
        const labelClass = isVillageLayer      ? 'village-map-label' :
                           isSurveyLayer       ? 'survey-map-label'  :
                           isResLayer          ? 'reservation-map-label' :
                           isReservationLayer  ? 'resnum-map-label' :
                           isBuildingLayer     ? 'building-map-label' : '';

        layer.bindTooltip(displayName, { 
          permanent: showPermanentLabel, 
          sticky: !showPermanentLabel,
          direction: 'center',
          className: labelClass
        }).on('click', (e) => {
          mapClickHandledRef.current = true;
          setTimeout(() => { mapClickHandledRef.current = false; }, 50);
          openProjectDetails(p);
        })

        categoryGroupsRef.current[p.type].addLayer(layer)
      } catch (e) { console.error("Layer error:", e) }
    })

    // 3. Add groups to map in z-order (RESERVSTION added last = on top, so it's clickable)
    const GROUP_Z = {
      'MBMC-VILLAGE-BOUNDARY': 1, 'MBMC-VILLAGES-SURVEY_No._BOUNDARY': 2,
      'MBMC-ROAD': 3, 'MBMC-ROAD_CENTER_LINE': 4,
      'MBMC-RESERVSTION-BOUNDARY': 8, 'MBMC-RESERVSTION': 10,
    };
    const sortedTypes = Object.keys(categoryGroupsRef.current).sort((a, b) => (GROUP_Z[a] || 5) - (GROUP_Z[b] || 5));
    sortedTypes.forEach(type => {
      if (isLayerVisible(type)) {
        mainGroup.addLayer(categoryGroupsRef.current[type])
      }
    })
  }, [projects, searchQuery, selectedResNames, selectedResNumbers, selectedSurveyNos, filterVillage, filterLandAcquired, filterMbmc712, filterCzmp, filterEncroachment]) // Only rebuild when data actually changes

  // REFACTORED: Instant toggle without rebuilding the world
  useEffect(() => {
    const mainGroup = mainGroupRef.current
    if (!mainGroup) return

    const TOGGLE_Z = {
      'MBMC-VILLAGE-BOUNDARY': 1, 'MBMC-VILLAGES-SURVEY_No._BOUNDARY': 2,
      'MBMC-ROAD': 3, 'MBMC-ROAD_CENTER_LINE': 4,
      'MBMC-RESERVSTION-BOUNDARY': 8, 'MBMC-RESERVSTION': 10,
    };
    // Sort types so RESERVSTION is added last (highest z-order = on top)
    const sortedToggleTypes = Object.keys(categoryGroupsRef.current)
      .sort((a, b) => (TOGGLE_Z[a] || 5) - (TOGGLE_Z[b] || 5));

    sortedToggleTypes.forEach(type => {
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
      alert("Successfully saved!")
      setShowForm(false); setDrawnCoordinates(null); setDrawnGeomType('Polygon');
      drawnLayersRef.current.clearLayers()
      setActiveMapTab('layers') // Return to layers view after saving
      // Auto turn ON the saved feature's layer type so it's immediately visible
      if (data.project_type) {
        setLayerVisibility(prev => ({ ...prev, [data.project_type]: true }))
      }
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

  const handleCenterRelated = (feat) => {
    if (!mapInstanceRef.current || !feat.coordinates) return;
    // Save state FIRST before fitBounds moves the map
    if (mapInstanceRef.current) {
      try {
        mapSavedStateRef.current = {
          center: mapInstanceRef.current.getCenter(),
          zoom: mapInstanceRef.current.getZoom()
        };
      } catch(e) {}
    }
    const pts = extractPoints(feat.coordinates);
    if (pts.length === 0) return;
    const bounds = L.latLngBounds(pts.map(p => [p[0], p[1]]));
    if (bounds.isValid()) {
      mapInstanceRef.current.fitBounds(bounds, { maxZoom: 18, padding: [50, 50] });
    }
    lastSelectedProjectRef.current = feat;
    setSelectedProject(feat);
  };

  const getSelectedProjectAttrs = () => {
    if (!selectedProject) return [];
    let attrs = {};
    try { attrs = typeof selectedProject.custom_attributes === 'string' ? JSON.parse(selectedProject.custom_attributes) : (selectedProject.custom_attributes || {}); } catch(e){}
    const allAttrs = { ...selectedProject, ...attrs };
    const excludeKeys = ['coordinates', 'custom_attributes', 'stages', 'timeline', 'pdf_attachment', 'owner_doc', 'idx', 'amended_from', 'creation', 'modified', 'owner', 'modified_by', 'docstatus', 'allow_guest'];
    
    const result = [];
    Object.entries(allAttrs).forEach(([k, v]) => {
      if (excludeKeys.includes(k)) return;
      if (v === null || v === undefined || String(v).trim() === '') return;
      if (typeof v === 'object') return;
      let label = k;
      if (k.startsWith('attr_')) label = k.substring(5);
      label = label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      result.push({ label, val: String(v) });
    });
    return result;
  };

  const handleExportExcel = () => {
    if (!selectedProject) return;
    const primaryAttrs = getSelectedProjectAttrs();
    
    let csvContent = "";
    csvContent += "PRIMARY FEATURE DETAILS\n";
    csvContent += "Attribute,Value\n";
    primaryAttrs.forEach(attr => {
      csvContent += `"${attr.label.replace(/"/g, '""')}","${attr.val.replace(/"/g, '""')}"\n`;
    });
    
    const overlapping = findOverlappingFeatures(selectedProject, projects).filter(
      feat => feat.type === 'BUILDING_INFO' || feat.type === 'building_info'
    );
    if (overlapping.length === 0) {
      csvContent += "No overlapping building layers detected.,\n";
    } else {
      csvContent += "Layer Type,Feature ID,Attribute,Value\n";
      overlapping.forEach(feat => {
        let attrs = {};
        try { attrs = typeof feat.custom_attributes === 'string' ? JSON.parse(feat.custom_attributes) : (feat.custom_attributes || {}); } catch(e){}
        const allAttrs = { ...feat, ...attrs };
        const excludeKeys = ['coordinates', 'custom_attributes', 'stages', 'timeline', 'pdf_attachment', 'owner_doc', 'idx', 'amended_from', 'creation', 'modified', 'owner', 'modified_by', 'docstatus', 'allow_guest'];
        
        Object.entries(allAttrs).forEach(([k, v]) => {
          if (excludeKeys.includes(k)) return;
          if (v === null || v === undefined || String(v).trim() === '') return;
          if (typeof v === 'object') return;
          let label = k;
          if (k.startsWith('attr_')) label = k.substring(5);
          label = label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          csvContent += `"${(feat.type || '').replace(/"/g, '""')}","${(feat.id || '').replace(/"/g, '""')}","${label.replace(/"/g, '""')}","${String(v).replace(/"/g, '""')}"\n`;
        });
      });
    }
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GIS_Attributes_${selectedProject.id || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    if (!selectedProject) return;
    const primaryAttrs = getSelectedProjectAttrs();
    const overlapping = findOverlappingFeatures(selectedProject, projects);
    
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert("Please allow popups to export PDF.");
      return;
    }
    
    const layerNameMap = {
      'BUILDING_INFO': 'Building Information',
      'building_info': 'Building Information',
      'MBMC-RESERVSTION': 'Reservation Polygons',
      'MBMC-RESERVSTION-BOUNDARY': 'Reservation Boundaries',
      'MBMC-ROAD': 'Municipal Roads',
      'MBMC-ROAD_CENTER_LINE': 'Road Center Lines',
      'MBMC-VILLAGE-BOUNDARY': 'Village Boundaries',
      'MBMC-VILLAGES-SURVEY_No._BOUNDARY': 'Survey Boundaries'
    };

    let overlappingHTML = '';
    if (overlapping.length === 0) {
      overlappingHTML = '<p style="color: #64748b; font-style: italic; font-size: 13px; margin-top: 10px;">No overlapping building, survey, or boundary layers detected.</p>';
    } else {
      const grouped = {};
      overlapping.forEach(item => {
        const type = item.type || 'Other Layer';
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(item);
      });
      
      Object.entries(grouped).forEach(([layerType, items]) => {
        const title = layerNameMap[layerType] || layerType;
        overlappingHTML += `
          <div class="section-card" style="margin-top: 20px;">
            <h3 class="section-title">${title}</h3>
        `;
        
        items.forEach(feat => {
          let name = feat.project_name || feat.name || `Feature ${feat.id}`;
          let attrs = {};
          try { attrs = typeof feat.custom_attributes === 'string' ? JSON.parse(feat.custom_attributes) : (feat.custom_attributes || {}); } catch(e){}
          
          if (feat.type === 'BUILDING_INFO' || feat.type === 'building_info') {
            const bldgId = attrs['BUILDING I'] || attrs['Text'] || attrs['BUILDING N'] || '';
            if (bldgId) name = `Building ID: ${bldgId}`;
          } else if (feat.type === 'MBMC-VILLAGES-SURVEY_No._BOUNDARY') {
            const surveyNo = attrs['SURVEY_No.'] || '';
            if (surveyNo) name = `Survey No: ${surveyNo}`;
          } else if (feat.type === 'MBMC-RESERVSTION') {
            const resNo = attrs['RESERVATIO'] || attrs['Reservation Number'] || '';
            if (resNo) name = `Reservation: ${resNo}`;
          }
          
          const featAttrs = [];
          const allAttrs = { ...feat, ...attrs };
          const excludeKeys = ['coordinates', 'custom_attributes', 'stages', 'timeline', 'pdf_attachment', 'owner_doc', 'idx', 'amended_from', 'creation', 'modified', 'owner', 'modified_by', 'docstatus', 'allow_guest'];
          Object.entries(allAttrs).forEach(([k, v]) => {
            if (excludeKeys.includes(k)) return;
            if (v === null || v === undefined || String(v).trim() === '') return;
            if (typeof v === 'object') return;
            let label = k;
            if (k.startsWith('attr_')) label = k.substring(5);
            label = label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            featAttrs.push({ label, val: String(v) });
          });
          
          overlappingHTML += `
            <div class="feat-sub-card">
              <div class="feat-header">${name} <span style="font-weight: normal; color: #94a3b8; font-size: 11px;">(${feat.id})</span></div>
              <table class="data-table">
                <tbody>
          `;
          
          for (let i = 0; i < featAttrs.length; i += 2) {
            const a1 = featAttrs[i];
            const a2 = featAttrs[i+1];
            overlappingHTML += `
              <tr>
                <td class="label-cell">${a1.label}</td>
                <td class="value-cell">${a1.val}</td>
                ${a2 ? `
                  <td class="label-cell">${a2.label}</td>
                  <td class="value-cell">${a2.val}</td>
                ` : `
                  <td class="label-cell"></td>
                  <td class="value-cell"></td>
                `}
              </tr>
            `;
          }
          
          overlappingHTML += `
                </tbody>
              </table>
            </div>
          `;
        });
        
        overlappingHTML += `</div>`;
      });
    }

    let primaryRowsHTML = '';
    for (let i = 0; i < primaryAttrs.length; i += 2) {
      const a1 = primaryAttrs[i];
      const a2 = primaryAttrs[i+1];
      primaryRowsHTML += `
        <tr>
          <td class="label-cell">${a1.label}</td>
          <td class="value-cell">${a1.val}</td>
          ${a2 ? `
            <td class="label-cell">${a2.label}</td>
            <td class="value-cell">${a2.val}</td>
          ` : `
            <td class="label-cell"></td>
            <td class="value-cell"></td>
          `}
        </tr>
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>GIS Map Export - ${selectedProject.id}</title>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          @page {
            margin: 0;
            size: auto;
          }
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #fff;
          }
          #print-mini-map {
            width: 100%;
            height: 100%;
          }
        </style>
      </head>
      <body>
        <svg style="position: absolute; width: 0; height: 0;">
          <defs>
            <pattern id="redBuildingHatch" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="8" stroke="#dc2626" stroke-width="2" />
            </pattern>
          </defs>
        </svg>

        <div id="print-mini-map"></div>

        <script>
          window.onload = function() {
            try {
              const selectedProject = ${JSON.stringify({
                coordinates: selectedProject.coordinates,
                type: selectedProject.type,
                geom_type: selectedProject.geom_type,
                status: selectedProject.status,
                id: selectedProject.id,
                color: selectedProject.color
              })};
              
              const overlapping = ${JSON.stringify(overlapping.map(feat => ({
                coordinates: feat.coordinates,
                type: feat.type,
                geom_type: feat.geom_type,
                id: feat.id
              })))};
              
              const mapMode = "${mapMode}";

              const miniMap = L.map('print-mini-map', {
                zoomControl: false,
                attributionControl: false
              });

              let tileUrl = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
              if (mapMode === 'standard') {
                tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
              } else if (mapMode === 'terrain') {
                tileUrl = 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}';
              }
              const tiles = L.tileLayer(tileUrl);
              tiles.addTo(miniMap);

              const miniMapSvgRenderer = L.svg();
              miniMapSvgRenderer.addTo(miniMap);

              // 1. Draw overlapping features
              overlapping.forEach(feat => {
                if (!feat.coordinates || feat.coordinates.length === 0) return;
                const isBuilding = feat.type === 'BUILDING_INFO' || feat.type === 'building_info';
                
                let featColor = '#475569';
                if (feat.type === 'MBMC-VILLAGE-BOUNDARY') featColor = '#a855f7';
                else if (feat.type === 'MBMC-VILLAGES-SURVEY_No._BOUNDARY') featColor = '#64748b';
                else if (feat.type?.startsWith('MBMC-RESERVSTION')) featColor = '#06b6d4';
                else if (feat.type === 'MBMC-ROAD') featColor = '#f59e0b';
                else if (feat.type === 'MBMC-ROAD_CENTER_LINE') featColor = '#d97706';

                const geomType = feat.geom_type || 'Polygon';

                if (isBuilding) {
                  L.polygon(feat.coordinates, {
                    color: '#dc2626',
                    fillColor: 'url(#redBuildingHatch)',
                    fill: true,
                    fillOpacity: 0.9,
                    weight: 1.5,
                    renderer: miniMapSvgRenderer
                  }).addTo(miniMap);
                } else if (geomType.toLowerCase().includes('point')) {
                  const pt = typeof feat.coordinates[0] === 'number' ? feat.coordinates : feat.coordinates[0];
                  L.circleMarker(pt, { radius: 5, color: '#fff', fillColor: featColor, fillOpacity: 0.8, weight: 1.5, renderer: miniMapSvgRenderer }).addTo(miniMap);
                } else if (geomType.toLowerCase().includes('line') || geomType.toLowerCase().includes('string')) {
                  L.polyline(feat.coordinates, { color: featColor, weight: 3, opacity: 0.8, renderer: miniMapSvgRenderer }).addTo(miniMap);
                } else {
                  L.polygon(feat.coordinates, {
                    color: featColor,
                    fillColor: featColor,
                    fill: true,
                    fillOpacity: 0.25,
                    weight: 2,
                    renderer: miniMapSvgRenderer
                  }).addTo(miniMap);
                }
              });

              // 2. Draw selected project
              let mainLayer;
              if (selectedProject.coordinates && selectedProject.coordinates.length > 0) {
                const isReferenceLayer = selectedProject.type && (
                  selectedProject.type.startsWith('MBMC-') ||
                  selectedProject.type.startsWith('VVCM') ||
                  selectedProject.type === 'BUILDING_INFO' ||
                  selectedProject.type === 'building_info' ||
                  selectedProject.type === 'Road'
                );
                
                let color = '#1a73e8';
                const isProjectOrReservation = !isReferenceLayer || selectedProject.type === 'MBMC-RESERVSTION';
                if (isReferenceLayer && selectedProject.type !== 'MBMC-RESERVSTION') {
                  if (selectedProject.type === 'MBMC-VILLAGE-BOUNDARY') color = '#a855f7';
                  else if (selectedProject.type === 'MBMC-VILLAGES-SURVEY_No._BOUNDARY') color = '#64748b';
                  else if (selectedProject.type === 'MBMC-ROAD') color = '#f59e0b';
                  else if (selectedProject.type === 'MBMC-ROAD_CENTER_LINE') color = '#d97706';
                } else {
                  const st = selectedProject.status || '';
                  if (['Approved','Work Started','Ongoing','On Hold','Hold','Near Completion','Completed'].includes(st)) color = '#16a34a';
                  else if (st === 'Pending for Request') color = '#ea580c';
                  else if (st === 'Submitted') color = '#2563eb';
                  else if (st === 'Correction') color = '#e11d48';
                  else if (st === 'Draft') color = selectedProject.type === 'MBMC-RESERVSTION' ? '#00e5ff' : '#64748b';
                  else if (st === 'Rejected') color = '#dc2626';
                  else if (selectedProject.type?.startsWith('MBMC-RESERVSTION')) color = '#06b6d4';
                }

                const geomType = selectedProject.geom_type || 'Polygon';

                if (geomType.toLowerCase().includes('point')) {
                  const pt = typeof selectedProject.coordinates[0] === 'number' ? selectedProject.coordinates : selectedProject.coordinates[0];
                  mainLayer = L.circleMarker(pt, { radius: 8, color: '#fff', fillColor: color, fillOpacity: 0.9, weight: 2, renderer: miniMapSvgRenderer }).addTo(miniMap);
                } else if (geomType.toLowerCase().includes('line') || geomType.toLowerCase().includes('string')) {
                  mainLayer = L.polyline(selectedProject.coordinates, { color: color, weight: 4, opacity: 0.9, renderer: miniMapSvgRenderer }).addTo(miniMap);
                } else {
                  const isBuilding = selectedProject.type === 'BUILDING_INFO' || selectedProject.type === 'building_info';
                  mainLayer = L.polygon(selectedProject.coordinates, {
                    color: isBuilding ? '#dc2626' : color,
                    fillColor: isBuilding ? 'url(#redBuildingHatch)' : color,
                    fill: true,
                    fillOpacity: isBuilding ? 0.9 : 0.45,
                    weight: isBuilding ? 1.5 : 2.5,
                    renderer: miniMapSvgRenderer
                  }).addTo(miniMap);
                }
              }

              // Fit bounds on layout stable
              setTimeout(() => {
                miniMap.invalidateSize();
                if (mainLayer) {
                  if (mainLayer.getBounds) {
                    miniMap.fitBounds(mainLayer.getBounds(), { padding: [40, 40] });
                  } else if (mainLayer.getLatLng) {
                    miniMap.setView(mainLayer.getLatLng(), 18);
                  }
                }
              }, 200);

              // Print trigger
              let printed = false;
              const triggerPrint = () => {
                if (printed) return;
                printed = true;
                setTimeout(() => {
                  window.print();
                  window.close();
                }, 500);
              };

              tiles.on('load', triggerPrint);
              setTimeout(triggerPrint, 3500);

            } catch (err) {
              console.error(err);
              setTimeout(() => {
                window.print();
                window.close();
              }, 1000);
            }
          };
        </script>
      </body>
      </html>
    `;
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setUploadProgress(1)

    try {
      // Step 1: Upload file with progress tracking
      const res = await manualUpload(file, (pct) => {
        // Scale upload progress from 1% to 85% of the visual bar
        setUploadProgress(Math.max(1, Math.round(pct * 0.85)))
      })
      const jobId = res && res.job_id

      if (!jobId) {
        setUploadProgress(100)
        setTimeout(() => {
          alert(res.message || 'Upload successful')
          loadProjects()
          setUploadProgress(null)
        }, 500)
        setUploading(false)
        e.target.value = ''
        return
      }

      // Step 2: Poll background job until done
      let done = false
      while (!done) {
        await new Promise(r => setTimeout(r, 2500)) // poll every 2.5s
        const status = await pollUploadJob(jobId)
        const pct = status.status === 'queued' ? 90
          : status.status === 'processing' ? Math.min(98, 90 + (status.saved_count || 0) / 100)
          : status.status === 'done' ? 100
          : 100
        setUploadProgress(pct)

        if (status.status === 'done') {
          done = true
          setTimeout(() => {
            alert(`✅ Import complete! ${status.saved_count || 0} features imported.`)
            loadProjects()
            setUploadProgress(null)
          }, 500)
        } else if (status.status === 'error') {
          done = true
          alert('❌ Import failed: ' + (status.error || status.message))
          setUploadProgress(null)
        }
      }
    } catch (err) {
      setUploadProgress(null)
      alert(err.message)
    } finally {
      setUploading(false)
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

  // Smart detection: check type name OR actual QGIS attribute presence
  const _selAttrs = (() => {
    if (!selectedProject?.custom_attributes) return {};
    try { return typeof selectedProject.custom_attributes === 'string' ? JSON.parse(selectedProject.custom_attributes) : selectedProject.custom_attributes; } catch(e) { return {}; }
  })();
  const isMbmcReservation = 
    selectedProject?.type?.startsWith('MBMC-RESERVSTION') || 
    selectedProject?.project_type?.startsWith('MBMC-RESERVSTION') ||
    (_selAttrs['RESERVATIO'] !== undefined && _selAttrs['Reservation Number'] !== undefined);

  const handleExportAttributes = async () => {
    if (!selectedProject) return;
    const groups = getGroupedAttributes();
    
    // Resolve all values in parallel
    const rows = [];
    for (const group of groups) {
      for (const item of group.items) {
        let val = item.v;
        if (val === null || val === undefined || val === '') {
          val = 'N/A';
        } else {
          val = await checkAndResolveLinkStringAsync(String(val));
        }
        rows.push({
          category: group.title,
          field: item.l,
          value: val
        });
      }
    }
    
    let csvContent = "Category,Field,Value\n";
    rows.forEach(r => {
      const valEscaped = String(r.value).replace(/"/g, '""');
      csvContent += `"${r.category}","${r.field}","${valEscaped}"\n`;
    });
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Attributes_${selectedProject.name || selectedProject.id || 'export'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', background: '#f0f2f5' }}>
      {/* Hidden SVG patterns for Leaflet styling */}
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} version="1.1" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="redBuildingHatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#dc2626" strokeWidth="2.5" />
          </pattern>
        </defs>
      </svg>
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".zip,.geojson,.kml,.gpkg" onChange={handleUpload} />

      {/* New Entry Modal */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', width: '500px', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '20px', background: '#1a73e8', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>New GIS Entry</h3>
              <button onClick={() => { setShowForm(false); setDrawnCoordinates(null); drawnLayersRef.current.clearLayers(); setActiveMapTab('layers'); }} style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}>✕</button>
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
                <button type="button" onClick={() => { setShowForm(false); setDrawnCoordinates(null); drawnLayersRef.current.clearLayers(); setActiveMapTab('layers'); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ddd', background: 'white' }}>Cancel</button>
                <button type="submit" disabled={!drawnCoordinates} style={{ flex: 2, padding: '12px', borderRadius: '8px', border: 'none', background: drawnCoordinates ? '#1a73e8' : '#ccc', color: 'white', fontWeight: 'bold' }}>Save Feature</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Map Content Area */}
      <div style={{ flex: 1, position: 'relative', height: '100%' }}>

        {/* Unified Floating Map Control Panel */}
        {showLayers && (
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            bottom: '16px',
            width: '380px',
            zIndex: 1000,
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            borderRadius: '20px',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)',
            border: '1px solid rgba(226, 232, 240, 0.8)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%)', color: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🗺️</span>
                <span style={{ fontWeight: '800', fontSize: '15px', fontFamily: "'Outfit', sans-serif" }}>Municipal GIS Panel</span>
              </div>
              <button 
                onClick={() => setShowLayers(false)}
                title="Collapse Panel"
                style={{ 
                  background: 'rgba(255, 255, 255, 0.2)', 
                  border: 'none', 
                  color: 'white', 
                  cursor: 'pointer', 
                  fontSize: '14px', 
                  width: '28px', 
                  height: '28px', 
                  borderRadius: '6px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  transition: 'background 0.2s'
                }}
              >
                ◀
              </button>
            </div>

            {/* Search Input */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <div style={{ position: 'relative' }}>
                <input 
                  type="text" 
                  placeholder="Search road, ward, project, landmark..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '10px 14px 10px 38px', 
                    borderRadius: '12px', 
                    border: searchQuery ? '2px solid #1a73e8' : '1.5px solid #e2e8f0', 
                    fontSize: '13px', 
                    outline: 'none', 
                    background: searchQuery ? '#eff6ff' : 'white', 
                    color: '#1e293b',
                    transition: 'all 0.2s', 
                    boxSizing: 'border-box' 
                  }}
                />
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '15px' }}>🔍</span>
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')} 
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '14px', padding: '2px' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Tabs Navigation */}
            <div style={{ display: 'flex', gap: '6px', padding: '10px 16px', borderBottom: '1px solid #f1f5f9', background: 'white', overflowX: 'auto', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {[
                { id: 'layers', label: 'Layers', icon: '🗺️' },
                { id: 'filter', label: 'Filter', icon: '🔍' },
                { id: 'draw', label: 'Draw', icon: '✏️' },
                { id: 'upload', label: 'Upload', icon: '📤' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveMapTab(tab.id)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '20px',
                    border: 'none',
                    background: activeMapTab === tab.id ? '#1a73e8' : '#f1f5f9',
                    color: activeMapTab === tab.id ? 'white' : '#64748b',
                    fontWeight: '700',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s'
                  }}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                  {tab.id === 'filter' && activeFiltersCount > 0 && (
                    <span style={{ 
                      background: activeMapTab === 'filter' ? 'white' : '#ef4444', 
                      color: activeMapTab === 'filter' ? '#1a73e8' : 'white', 
                      borderRadius: '50%', 
                      width: '18px', 
                      height: '18px', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontSize: '10px', 
                      fontWeight: '800' 
                    }}>
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* TAB 1: Layers */}
              {activeMapTab === 'layers' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Layer Quick Actions */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <button onClick={handleFitAll} style={{ flex: 1, padding: '6px 8px', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: '8px', color: '#1a73e8', fontSize: '11px', cursor: 'pointer', fontWeight: '700', transition: 'all 0.2s' }}>🔍 Fit All</button>
                    <button onClick={() => {
                      const allOn = {};
                      dynamicProjectTypes.forEach(t => { allOn[t] = true; });
                      setLayerVisibility(allOn);
                    }} style={{ flex: 1, padding: '6px 8px', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '8px', color: '#16a34a', fontSize: '11px', cursor: 'pointer', fontWeight: '700', transition: 'all 0.2s' }}>✅ All On</button>
                    <button onClick={() => {
                      const allOff = {};
                      dynamicProjectTypes.forEach(t => { allOff[t] = false; });
                      setLayerVisibility(allOff);
                    }} style={{ flex: 1, padding: '6px 8px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '11px', cursor: 'pointer', fontWeight: '700', transition: 'all 0.2s' }}>❌ All Off</button>
                    <button onClick={() => {
                      localStorage.removeItem('gis_layer_vis');
                      const DEFAULT_ON = new Set(['MBMC-VILLAGE-BOUNDARY','MBMC-RESERVSTION-BOUNDARY','MBMC-RESERVSTION','MBMC-ROAD_CENTER_LINE','MBMC-ROAD','MBMC-VILLAGES-SURVEY_No._BOUNDARY','VVCM_BOUNDARY','VVCM-ALL-ROAD','VVCM_VILLAGE BOUNDARY','Road']);
                      const reset = {};
                      dynamicProjectTypes.forEach(t => { reset[t] = DEFAULT_ON.has(t); });
                      setLayerVisibility(reset);
                    }} style={{ flex: 1, padding: '6px 8px', background: '#f5f5f5', border: '1.5px solid #e5e5e5', borderRadius: '8px', color: '#666', fontSize: '11px', cursor: 'pointer', fontWeight: '700', transition: 'all 0.2s' }}>🔄 Reset</button>
                  </div>

                  {/* Layers List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {dynamicProjectTypes.map(type => {
                      const count = projectCounts[type] || 0;
                      const meta = layerMetaLookup[type] || LAYER_META[type] || { color: '#ccc' };
                      const displayLabel = type.replace(/_/g, ' ').replace(/-/g, ' - ');
                      const isVisible = isLayerVisible(type);
                      
                      return (
                        <div 
                          key={type} 
                          onClick={() => setLayerVisibility({ ...layerVisibility, [type]: !isVisible })}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            padding: '10px 12px', 
                            borderRadius: '10px', 
                            background: isVisible ? '#f0f6ff' : 'transparent', 
                            border: isVisible ? '1px solid #bfdbfe' : '1px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => { if (!isVisible) e.currentTarget.style.background = '#f8fafc'; }}
                          onMouseLeave={(e) => { if (!isVisible) e.currentTarget.style.background = 'transparent'; }}
                        >
                          {/* Styled circular checkbox (radio-button-like toggle) */}
                          <div style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            border: `2px solid ${isVisible ? meta.color : '#cbd5e1'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'white',
                            flexShrink: 0,
                            transition: 'all 0.2s'
                          }}>
                            {isVisible && (
                              <div style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                background: meta.color,
                                animation: 'scaleUp 0.15s ease-out'
                              }} />
                            )}
                          </div>
                          
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', lineHeight: '1.3' }}>{displayLabel}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                              <div style={{ width: '16px', height: '3px', background: meta.color, borderRadius: '2px' }} />
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>{count.toLocaleString()} features</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 2: Filter */}
              {activeMapTab === 'filter' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  
                  {/* Active filters header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>
                      {activeFiltersCount > 0 ? `📍 ${activeFiltersCount} active filters` : 'No active filters'}
                    </span>
                    {activeFiltersCount > 0 && (
                      <button 
                        onClick={clearAllFilters} 
                        style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#ef4444', fontSize: '11px', fontWeight: '700', padding: '4px 8px', cursor: 'pointer' }}
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {/* Reservation Name */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} ref={resNameDropdownRef}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Reservation Name</label>
                    <div style={{ position: 'relative' }}>
                      {/* Search Input Box */}
                      <input
                        type="text"
                        value={resNameSearchQuery}
                        onChange={e => {
                          setResNameSearchQuery(e.target.value);
                          setShowResNameDropdown(true);
                        }}
                        onFocus={() => setShowResNameDropdown(true)}
                        placeholder="Search and select reservation..."
                        style={{
                          width: '100%', 
                          padding: '9px 12px', 
                          paddingRight: (resNameSearchQuery || selectedResNames.length > 0) ? '36px' : '12px',
                          borderRadius: '10px',
                          border: (resNameSearchQuery || selectedResNames.length > 0) ? '2px solid #1a73e8' : '1.5px solid #e2e8f0',
                          fontSize: '13px', 
                          outline: 'none',
                          boxSizing: 'border-box',
                          background: (resNameSearchQuery || selectedResNames.length > 0) ? '#eff6ff' : 'white',
                          color: '#1e293b', 
                          transition: 'all 0.2s'
                        }}
                      />

                      {/* Dropdown popup */}
                      {showResNameDropdown && (
                        <div style={{
                          position: 'absolute',
                          top: '105%',
                          left: 0,
                          right: 0,
                          background: 'white',
                          border: '1.5px solid #e2e8f0',
                          borderRadius: '12px',
                          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
                          zIndex: 1050,
                          maxHeight: '450px',
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          boxSizing: 'border-box'
                        }}>
                          {filteredResNameDatalist.length === 0 ? (
                            <div style={{ padding: '12px', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>No matching reservation names found</div>
                          ) : (
                            filteredResNameDatalist.map(name => {
                              const isChecked = selectedResNames.includes(name);
                              return (
                                <div 
                                  key={name}
                                  onClick={() => {
                                    if (isChecked) {
                                      setSelectedResNames(prev => prev.filter(n => n !== name));
                                    } else {
                                      setSelectedResNames(prev => [...prev, name]);
                                    }
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '10px 12px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #f1f5f9',
                                    background: isChecked ? '#eff6ff' : 'white',
                                    fontSize: '12px',
                                    color: isChecked ? '#1a73e8' : '#1e293b',
                                    fontWeight: isChecked ? '600' : 'normal',
                                    transition: 'all 0.15s'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isChecked) e.currentTarget.style.background = '#f8fafc';
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isChecked) e.currentTarget.style.background = 'white';
                                  }}
                                >
                                  <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {}} // Controlled by outer div onClick
                                    style={{
                                      width: '14px',
                                      height: '14px',
                                      accentColor: '#1a73e8',
                                      cursor: 'pointer'
                                    }}
                                  />
                                  <span style={{ wordBreak: 'break-word', flex: 1 }}>{name}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      {/* Clear all button */}
                      {(resNameSearchQuery || selectedResNames.length > 0) && (
                        <button 
                          onClick={() => {
                            setSelectedResNames([]);
                            setResNameSearchQuery('');
                          }} 
                          style={{ 
                            position: 'absolute', 
                            right: '12px', 
                            top: '50%', 
                            transform: 'translateY(-50%)', 
                            background: '#cbd5e1', 
                            border: 'none', 
                            borderRadius: '50%',
                            cursor: 'pointer', 
                            color: '#475569', 
                            fontSize: '10px', 
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '18px',
                            height: '18px',
                            zIndex: 2
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Chips/tags rendering below input */}
                    {selectedResNames.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                        {selectedResNames.map(name => (
                          <span 
                            key={name}
                            onClick={() => setSelectedResNames(prev => prev.filter(n => n !== name))}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#1a73e8',
                              color: 'white',
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#1557b0'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#1a73e8'}
                          >
                            {name}
                            <span style={{ fontSize: '10px', fontWeight: 'bold', marginLeft: '2px' }}>✕</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Reservation Number */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} ref={resNumberDropdownRef}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Reservation Number</label>
                    <div style={{ position: 'relative' }}>
                      {/* Search Input Box */}
                      <input
                        type="text"
                        value={resNumberSearchQuery}
                        onChange={e => {
                          setResNumberSearchQuery(e.target.value);
                          setShowResNumberDropdown(true);
                        }}
                        onFocus={() => setShowResNumberDropdown(true)}
                        placeholder="Search and select reservation no..."
                        style={{
                          width: '100%', 
                          padding: '9px 12px', 
                          paddingRight: (resNumberSearchQuery || selectedResNumbers.length > 0) ? '36px' : '12px',
                          borderRadius: '10px',
                          border: (resNumberSearchQuery || selectedResNumbers.length > 0) ? '2px solid #1a73e8' : '1.5px solid #e2e8f0',
                          fontSize: '13px', 
                          outline: 'none',
                          boxSizing: 'border-box',
                          background: (resNumberSearchQuery || selectedResNumbers.length > 0) ? '#eff6ff' : 'white',
                          color: '#1e293b', 
                          transition: 'all 0.2s'
                        }}
                      />

                      {/* Dropdown popup */}
                      {showResNumberDropdown && (
                        <div style={{
                          position: 'absolute',
                          top: '105%',
                          left: 0,
                          right: 0,
                          background: 'white',
                          border: '1.5px solid #e2e8f0',
                          borderRadius: '12px',
                          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
                          zIndex: 1050,
                          maxHeight: '300px',
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          boxSizing: 'border-box'
                        }}>
                          {filteredResNumberDatalist.length === 0 ? (
                            <div style={{ padding: '12px', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>No matching reservation numbers found</div>
                          ) : (
                            filteredResNumberDatalist.map(num => {
                              const isChecked = selectedResNumbers.includes(num);
                              return (
                                <div 
                                  key={num}
                                  onClick={() => {
                                    if (isChecked) {
                                      setSelectedResNumbers(prev => prev.filter(n => n !== num));
                                    } else {
                                      setSelectedResNumbers(prev => [...prev, num]);
                                    }
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '10px 12px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #f1f5f9',
                                    background: isChecked ? '#eff6ff' : 'white',
                                    fontSize: '12px',
                                    color: isChecked ? '#1a73e8' : '#1e293b',
                                    fontWeight: isChecked ? '600' : 'normal',
                                    transition: 'all 0.15s'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isChecked) e.currentTarget.style.background = '#f8fafc';
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isChecked) e.currentTarget.style.background = 'white';
                                  }}
                                >
                                  <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {}} // Controlled by outer div onClick
                                    style={{
                                      width: '14px',
                                      height: '14px',
                                      accentColor: '#1a73e8',
                                      cursor: 'pointer'
                                    }}
                                  />
                                  <span style={{ wordBreak: 'break-word', flex: 1 }}>{num}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      {/* Clear all button */}
                      {(resNumberSearchQuery || selectedResNumbers.length > 0) && (
                        <button 
                          onClick={() => {
                            setSelectedResNumbers([]);
                            setResNumberSearchQuery('');
                          }} 
                          style={{ 
                            position: 'absolute', 
                            right: '12px', 
                            top: '50%', 
                            transform: 'translateY(-50%)', 
                            background: '#cbd5e1', 
                            border: 'none', 
                            borderRadius: '50%',
                            cursor: 'pointer', 
                            color: '#475569', 
                            fontSize: '10px', 
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '18px',
                            height: '18px',
                            zIndex: 2
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Chips/tags rendering below input */}
                    {selectedResNumbers.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                        {selectedResNumbers.map(num => (
                          <span 
                            key={num}
                            onClick={() => setSelectedResNumbers(prev => prev.filter(n => n !== num))}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#1a73e8',
                              color: 'white',
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#1557b0'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#1a73e8'}
                          >
                            {num}
                            <span style={{ fontSize: '10px', fontWeight: 'bold', marginLeft: '2px' }}>✕</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Survey Number */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} ref={surveyNoDropdownRef}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Survey Number</label>
                    <div style={{ position: 'relative' }}>
                      {/* Search Input Box */}
                      <input
                        type="text"
                        value={surveyNoSearchQuery}
                        onChange={e => {
                          setSurveyNoSearchQuery(e.target.value);
                          setShowSurveyNoDropdown(true);
                        }}
                        onFocus={() => setShowSurveyNoDropdown(true)}
                        placeholder="Search and select survey no..."
                        style={{
                          width: '100%', 
                          padding: '9px 12px', 
                          paddingRight: (surveyNoSearchQuery || selectedSurveyNos.length > 0) ? '36px' : '12px',
                          borderRadius: '10px',
                          border: (surveyNoSearchQuery || selectedSurveyNos.length > 0) ? '2px solid #1a73e8' : '1.5px solid #e2e8f0',
                          fontSize: '13px', 
                          outline: 'none',
                          boxSizing: 'border-box',
                          background: (surveyNoSearchQuery || selectedSurveyNos.length > 0) ? '#eff6ff' : 'white',
                          color: '#1e293b', 
                          transition: 'all 0.2s'
                        }}
                      />

                      {/* Dropdown popup */}
                      {showSurveyNoDropdown && (
                        <div style={{
                          position: 'absolute',
                          top: '105%',
                          left: 0,
                          right: 0,
                          background: 'white',
                          border: '1.5px solid #e2e8f0',
                          borderRadius: '12px',
                          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
                          zIndex: 1050,
                          maxHeight: '220px',
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          boxSizing: 'border-box'
                        }}>
                          {filteredSurveyNoDatalist.length === 0 ? (
                            <div style={{ padding: '12px', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>No matching survey numbers found</div>
                          ) : (
                            filteredSurveyNoDatalist.map(s => {
                              const isChecked = selectedSurveyNos.includes(s);
                              return (
                                <div 
                                  key={s}
                                  onClick={() => {
                                    if (isChecked) {
                                      setSelectedSurveyNos(prev => prev.filter(n => n !== s));
                                    } else {
                                      setSelectedSurveyNos(prev => [...prev, s]);
                                    }
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '10px 12px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #f1f5f9',
                                    background: isChecked ? '#eff6ff' : 'white',
                                    fontSize: '12px',
                                    color: isChecked ? '#1a73e8' : '#1e293b',
                                    fontWeight: isChecked ? '600' : 'normal',
                                    transition: 'all 0.15s'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isChecked) e.currentTarget.style.background = '#f8fafc';
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isChecked) e.currentTarget.style.background = 'white';
                                  }}
                                >
                                  <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {}} // Controlled by outer div onClick
                                    style={{
                                      width: '14px',
                                      height: '14px',
                                      accentColor: '#1a73e8',
                                      cursor: 'pointer'
                                    }}
                                  />
                                  <span style={{ wordBreak: 'break-word', flex: 1 }}>{s}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      {/* Clear all button */}
                      {(surveyNoSearchQuery || selectedSurveyNos.length > 0) && (
                        <button 
                          onClick={() => {
                            setSelectedSurveyNos([]);
                            setSurveyNoSearchQuery('');
                          }} 
                          style={{ 
                            position: 'absolute', 
                            right: '12px', 
                            top: '50%', 
                            transform: 'translateY(-50%)', 
                            background: '#cbd5e1', 
                            border: 'none', 
                            borderRadius: '50%',
                            cursor: 'pointer', 
                            color: '#475569', 
                            fontSize: '10px', 
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '18px',
                            height: '18px',
                            zIndex: 2
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Chips/tags rendering below input */}
                    {selectedSurveyNos.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                        {selectedSurveyNos.map(s => (
                          <span 
                            key={s}
                            onClick={() => setSelectedSurveyNos(prev => prev.filter(n => n !== s))}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#1a73e8',
                              color: 'white',
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#1557b0'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#1a73e8'}
                          >
                            {s}
                            <span style={{ fontSize: '10px', fontWeight: 'bold', marginLeft: '2px' }}>✕</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Village */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Village</label>
                    <select
                      value={filterVillage}
                      onChange={e => setFilterVillage(e.target.value)}
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: '10px',
                        border: filterVillage !== 'All' ? '2px solid #1a73e8' : '1.5px solid #e2e8f0',
                        fontSize: '13px', outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
                        background: filterVillage !== 'All' ? '#eff6ff' : 'white',
                        color: '#1e293b', transition: 'all 0.2s'
                      }}
                    >
                      {filterOptions.villages.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  {/* Land Acquire Status */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Land Acquired Status</label>
                    <select
                      value={filterLandAcquired}
                      onChange={e => setFilterLandAcquired(e.target.value)}
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: '10px',
                        border: filterLandAcquired !== 'All' ? '2px solid #1a73e8' : '1.5px solid #e2e8f0',
                        fontSize: '13px', outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
                        background: filterLandAcquired !== 'All' ? '#eff6ff' : 'white',
                        color: '#1e293b', transition: 'all 0.2s'
                      }}
                    >
                      {filterOptions.landStatuses.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  {/* 7/12 Gov / Private */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>7/12 Gov / Private</label>
                    <select
                      value={filterMbmc712}
                      onChange={e => setFilterMbmc712(e.target.value)}
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: '10px',
                        border: filterMbmc712 !== 'All' ? '2px solid #1a73e8' : '1.5px solid #e2e8f0',
                        fontSize: '13px', outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
                        background: filterMbmc712 !== 'All' ? '#eff6ff' : 'white',
                        color: '#1e293b', transition: 'all 0.2s'
                      }}
                    >
                      {filterOptions.mbmc712s.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  {/* Effected Area (CZMP) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Effected Area (CZMP 2019)</label>
                    <select
                      value={filterCzmp}
                      onChange={e => setFilterCzmp(e.target.value)}
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: '10px',
                        border: filterCzmp !== 'All' ? '2px solid #1a73e8' : '1.5px solid #e2e8f0',
                        fontSize: '13px', outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
                        background: filterCzmp !== 'All' ? '#eff6ff' : 'white',
                        color: '#1e293b', transition: 'all 0.2s'
                      }}
                    >
                      {filterOptions.czmps.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  {/* Encroachment Status */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Encroachment Status</label>
                    <select
                      value={filterEncroachment}
                      onChange={e => setFilterEncroachment(e.target.value)}
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: '10px',
                        border: filterEncroachment !== 'All' ? '2px solid #1a73e8' : '1.5px solid #e2e8f0',
                        fontSize: '13px', outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
                        background: filterEncroachment !== 'All' ? '#eff6ff' : 'white',
                        color: '#1e293b', transition: 'all 0.2s'
                      }}
                    >
                      {filterOptions.encroachments.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  {/* Filtered count + Export to Excel */}
                  {filteredCount > 0 && (
                    <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ textAlign: 'center', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                        📍 {filteredCount} features on map
                      </div>
                      <button
                        onClick={async () => {
                          const data = filteredDataRef.current;
                          if (!data || data.length === 0) return;

                          // Extract all unique custom attribute keys across all projects to ensure complete columns
                          const customKeysSet = new Set();
                          const parsedData = data.map(p => {
                            let attrs = {};
                            try {
                              attrs = typeof p.custom_attributes === 'string'
                                ? JSON.parse(p.custom_attributes)
                                : (p.custom_attributes || {});
                            } catch (e) {}
                            Object.keys(attrs).forEach(k => customKeysSet.add(k));
                            return { p, attrs };
                          });

                          const customKeys = Array.from(customKeysSet);
                          const headers = [
                            'GIS ID',
                            'Layer Type',
                            'Status',
                            'Ward',
                            ...customKeys
                          ];

                          // Resolve and verify links in parallel for all records and all fields
                          const rows = await Promise.all(parsedData.map(async (item) => {
                            const rowObj = {};
                            rowObj['GIS ID'] = item.p.id || '';
                            rowObj['Layer Type'] = item.p.type || '';
                            rowObj['Status'] = item.p.status || '';
                            rowObj['Ward'] = item.p.ward || '';
                            
                            await Promise.all(customKeys.map(async (k) => {
                              const val = item.attrs[k];
                              if (val === undefined || val === null) {
                                rowObj[k] = '';
                              } else {
                                rowObj[k] = await checkAndResolveLinkStringAsync(String(val));
                              }
                            }));
                            return rowObj;
                          }));

                          // Convert to CSV
                          const csvLines = [
                            headers.join(','),
                            ...rows.map(r => headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(','))
                          ];
                          const csvContent = csvLines.join('\n');
                          const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          const today = new Date().toISOString().slice(0,10);
                          a.download = `GIS_Filtered_Data_${today}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        style={{
                          width: '100%', padding: '11px', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: '8px',
                          background: 'linear-gradient(135deg, #16a34a, #15803d)',
                          color: 'white', border: 'none', borderRadius: '12px',
                          fontWeight: '700', fontSize: '14px', cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(22,163,74,0.35)',
                          transition: 'all 0.2s',
                        }}
                      >
                        📥 Export to Excel ({filteredCount})
                      </button>
                    </div>
                  )}

                </div>
              )}

              {/* TAB 3: Draw */}
              {activeMapTab === 'draw' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>
                    Click the button below to start drawing a polygon on the map. Click points on the map to define the boundary, and click the first point to close the shape.
                  </p>
                  <button 
                    onClick={handleDrawPolygon}
                    style={{
                      width: '100%', padding: '12px', background: 'linear-gradient(135deg, #1a73e8, #0d47a1)',
                      color: 'white', border: 'none', borderRadius: '12px',
                      fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(26,115,232,0.35)', transition: 'all 0.2s'
                    }}
                  >
                    ✏️ Start Drawing Polygon
                  </button>
                  {drawnCoordinates && (
                    <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '10px', padding: '12px', fontSize: '12px', color: '#334155', animation: 'scaleUp 0.15s ease-out' }}>
                      <div style={{ fontWeight: 'bold', color: '#1a73e8', marginBottom: '4px' }}>📍 Points Captured:</div>
                      <div>{drawnCoordinates.length} vertices ({drawnGeomType})</div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button 
                          onClick={() => { setShowForm(true); }}
                          style={{ flex: 1, padding: '6px 10px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}
                        >
                          Save Feature
                        </button>
                        <button 
                          onClick={() => { setDrawnCoordinates(null); drawnLayersRef.current.clearLayers(); }}
                          style={{ flex: 1, padding: '6px 10px', background: '#fef2f2', border: '1px solid #fca5a5', color: '#ef4444', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}
                        >
                          Clear Drawing
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: Upload */}
              {activeMapTab === 'upload' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>
                    Upload spatial layers to add features to the map. Supported formats: <b>GeoJSON, KML, Shapefile (.zip), GPKG</b>.
                  </p>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed #cbd5e1',
                      borderRadius: '14px',
                      padding: '24px 16px',
                      textAlign: 'center',
                      background: '#f8fafc',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1a73e8'; e.currentTarget.style.background = '#eff6ff'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
                  >
                    <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📤</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', display: 'block' }}>Choose spatial file</span>
                    <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>Drag & drop or click to browse</span>
                  </div>
                  {uploading && (
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: 'bold' }}>
                        <span>Parsing & importing features...</span>
                        <span>{uploadProgress || 0}%</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${uploadProgress || 0}%`, height: '100%', background: '#1a73e8', transition: 'width 0.2s' }}></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        )}

        {/* Collapsed Panel Toggle Button */}
        {!showLayers && !selectedProject && (
          <div 
            onClick={() => setShowLayers(true)} 
            title="Expand Panel"
            style={{ 
              position: 'absolute', 
              top: '16px', 
              left: '16px', 
              zIndex: 1000, 
              width: '44px', 
              height: '44px', 
              background: 'white', 
              borderRadius: '10px', 
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              fontSize: '18px', 
              fontWeight: 'bold',
              border: '1px solid #cbd5e1',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
          >
            ☰
          </div>
        )}

        {/* Map Switcher (Bottom Right) */}
        <div style={{ position: 'absolute', right: '20px', bottom: '140px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {['standard', 'satellite', 'terrain'].map(id => (
            <div 
              key={id} 
              onClick={() => setMapMode(id)} 
              title={id.charAt(0).toUpperCase() + id.slice(1)}
              style={{ 
                width: '45px', 
                height: '45px', 
                borderRadius: '8px', 
                border: mapMode === id ? '2.5px solid #1a73e8' : '1px solid #cbd5e1', 
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', 
                overflow: 'hidden',
                cursor: 'pointer',
                background: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
            >
              <img 
                src={id === 'standard' ? 'https://a.tile.openstreetmap.org/0/0/0.png' : `https://mt1.google.com/vt/lyrs=${id === 'satellite' ? 'y' : 'p'}&x=0&y=0&z=0`} 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
              />
            </div>
          ))}
        </div>

        {/* Right Controls */}
        <div style={{ position: 'absolute', right: '20px', bottom: '30px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
            <button onClick={() => mapInstanceRef.current?.zoomIn()} style={{ width: '45px', height: '45px', border: 'none', borderBottom: '1px solid #eee', cursor: 'pointer', fontSize: '20px', background: 'white', fontWeight: 'bold' }}>+</button>
            <button onClick={() => mapInstanceRef.current?.zoomOut()} style={{ width: '45px', height: '45px', border: 'none', cursor: 'pointer', fontSize: '20px', background: 'white', fontWeight: 'bold' }}>-</button>
          </div>
        </div>

        {/* Attribute Modal */}
        {selectedProject && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: '#f4f6fb',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: "'Inter', sans-serif"
          }}>
            
            {/* Top Page Header */}
            <div style={{
              height: '56px',
              background: 'white',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 24px',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button 
                  onClick={() => setSelectedProject(null)} 
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '18px',
                    cursor: 'pointer',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px',
                    borderRadius: '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  ←
                </button>
                {!showLayers && (
                  <button
                    onClick={() => setShowLayers(true)}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: '#475569',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                  >
                    ☰ Municipal GIS Panel
                  </button>
                )}
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>
                  Feature Record Details
                </h3>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  GIS ID: <strong style={{ color: '#0f172a' }}>{selectedProject.id}</strong>
                </span>
                <button 
                  onClick={() => setSelectedProject(null)} 
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  Close Details
                </button>
              </div>
            </div>

            {/* Scrollable Dashboard Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Header Card */}
              <div style={{
                background: 'white',
                borderRadius: '20px',
                border: '1px solid #e2e8f0',
                padding: '24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '70%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: '#0f172a', fontFamily: "'Outfit', sans-serif" }}>
                      {selectedProject.project_name || selectedProject.name || 'GIS Feature Record'}
                    </h2>
                    <span style={{
                      background: selectedProject.status === 'Completed' ? '#dcfce7' : selectedProject.status === 'Approved' ? '#eff6ff' : '#fef2f2',
                      color: selectedProject.status === 'Completed' ? '#15803d' : selectedProject.status === 'Approved' ? '#1a73e8' : '#ef4444',
                      padding: '4px 10px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: '800',
                      border: '1px solid currentColor'
                    }}>
                      {selectedProject.status || 'Draft'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                    A complete municipal GIS record linked with map location, attributes, project proposals, documents and approval history.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'nowrap' }}>
                  {/* Edit Record Toggle */}
                  {isEditing ? (
                    <button 
                      onClick={async () => {
                        try {
                          const data = { ...selectedProject };
                          
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

                           Object.keys(data).forEach(k => {
                             if (!STANDARD_KEYS.includes(k) && k !== 'section_mappings') {
                               customAttrs[k] = data[k];
                             }
                           });
                           if (data.section_mappings) {
                             customAttrs["section_mappings"] = data.section_mappings;
                           }

                           const resDb = await fetch('/api/method/frappe.client.set_value', {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': window.csrf_token || 'fetch' },
                             body: JSON.stringify({ doctype: 'GIS Project', name: selectedProject.id, fieldname: dbData })
                           }).then(r => r.json());

                           if (resDb.exc) throw new Error(resDb.exc_type || 'Failed to update database fields');

                           if (Object.keys(customAttrs).length > 0) {
                             const resCustom = await updateCustomAttributes(selectedProject.id, customAttrs);
                             if (resCustom && resCustom.id) {
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
                      style={{
                        padding: '10px 18px',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '12px',
                        boxShadow: '0 2px 6px rgba(16,185,129,0.3)',
                        transition: 'all 0.2s'
                      }}
                    >
                      💾 Save Changes
                    </button>
                  ) : (
                    <button 
                      onClick={() => setIsEditing(true)}
                      style={{
                        padding: '10px 18px',
                        background: '#ffffff',
                        color: '#1e293b',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '12px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s'
                      }}
                    >
                      📝 Edit Record
                    </button>
                  )}

                  {/* Workflow Actions */}
                  {['Draft', 'Correction'].includes(selectedProject.status) ? (
                    <>
                      <button 
                        onClick={() => setShowInitiatePopup(true)} 
                        style={{ 
                          padding: '10px 18px', 
                          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '10px', 
                          cursor: 'pointer', 
                          fontWeight: 'bold', 
                          fontSize: '12px', 
                          boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
                        }}
                      >
                        {selectedProject.status === 'Correction' ? '🚀 Resubmit Proposal' : '🚀 Initiate Proposal'}
                      </button>
                      <button 
                        onClick={() => setShowGenerateDemandPopup(true)} 
                        style={{ 
                          padding: '10px 18px', 
                          background: '#10b981', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '10px', 
                          cursor: 'pointer', 
                          fontWeight: 'bold', 
                          fontSize: '12px', 
                        }}
                      >
                        🧾 Generate Demand
                      </button>
                    </>
                  ) : (
                    <>
                      {['Submitted', 'On Hold', 'Ongoing', 'Work Started', 'Near Completion'].includes(selectedProject.status) && (
                        <button 
                          onClick={() => setShowStatusTimelinePopup(true)} 
                          style={{ 
                            padding: '10px 18px', 
                            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '10px', 
                            cursor: 'pointer', 
                            fontWeight: '700', 
                            fontSize: '12px', 
                            boxShadow: '0 4px 12px rgba(37,99,235,0.3)', 
                          }}
                        >
                          📦 Update Progress
                        </button>
                      )}
                      <button 
                        onClick={() => setShowGenerateDemandPopup(true)} 
                        style={{ 
                          padding: '10px 18px', 
                          background: '#10b981', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '10px', 
                          cursor: 'pointer', 
                          fontWeight: 'bold', 
                          fontSize: '12px', 
                        }}
                      >
                        🧾 Generate Demand
                      </button>
                    </>
                  )}

                  {/* Export Options */}
                  <button 
                    onClick={handleExportExcel}
                    style={{
                      padding: '10px 18px',
                      background: '#16a34a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(22,163,74,0.2)'
                    }}
                  >
                    📥 Export Excel
                  </button>
                  <button 
                    onClick={handleExportPDF}
                    style={{
                      padding: '10px 18px',
                      background: '#dc2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(220,38,38,0.2)'
                    }}
                  >
                    📄 Export PDF
                  </button>
                </div>
              </div>

              {/* Metrics / Top Row Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px'
              }}>
                {/* Mini Map Card */}
                <div style={{
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  gridColumn: 'span 2',
                  minHeight: '220px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                  position: 'relative'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Selected Feature Location</span>
                    <button 
                      onClick={() => setSelectedProject(null)} 
                      style={{ background: '#eff6ff', border: 'none', color: '#1a73e8', fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      🗺️ Full Map
                    </button>
                  </div>
                  <div id="details-mini-map" style={{ flex: 1, borderRadius: '10px', overflow: 'hidden', border: '1.5px solid #e2e8f0', zIndex: 1 }} />
                </div>

                {/* Feature ID Card */}
                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Feature ID</span>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '8px 0 4px' }}>{selectedProject.id}</div>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>{selectedProject.type || 'GIS Layer'}</span>
                </div>

                {/* Main Metric Card */}
                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                    {selectedProject.type?.includes('ROAD') ? 'Road Length' : 'Property Size'}
                  </span>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '8px 0 4px' }}>
                    {(() => {
                      if (selectedProject.type?.includes('ROAD')) {
                        return `${selectedProject.length || '1.8'} km`;
                      }
                      let attrs = {};
                      try {
                        attrs = typeof selectedProject.custom_attributes === 'string'
                          ? JSON.parse(selectedProject.custom_attributes)
                          : (selectedProject.custom_attributes || {});
                      } catch(e){}
                      const areaVal = attrs['AREA'] || attrs['AREA IN SQ'] || selectedProject.area;
                      if (areaVal && String(areaVal).trim() !== '' && String(areaVal).toLowerCase() !== 'n/a') {
                        const num = parseFloat(areaVal);
                        if (!isNaN(num)) {
                          return num.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' sq.m';
                        }
                        return areaVal;
                      }
                      return '—';
                    })()}
                  </div>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    {selectedProject.type?.includes('ROAD') ? (selectedProject.pave_type || 'Concrete') : 'Total Land Parcel'}
                  </span>
                </div>

                {/* Last Updated Card */}
                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Last Updated</span>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '8px 0 4px' }}>
                    {new Date(selectedProject.modified || Date.now()).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Updated by {selectedProject.owner?.split('@')[0] || 'JE Prakash Patil'}</span>
                </div>

                {/* Documents & Files Card */}
                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Linked Files</span>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '8px 0 4px' }}>
                    {(() => {
                      let attrs = {};
                      try { attrs = typeof selectedProject.custom_attributes === 'string' ? JSON.parse(selectedProject.custom_attributes) : (selectedProject.custom_attributes || {}); } catch(e){}
                      
                      const docPairs = [
                        { label: 'Document 7/12',             key: 'Document 7/12',            valKeys: ['Document 7/12', '7/12 Document', 'doc_712'],           linkKeys: ['7/12 LINK', '7/12 Link', 'link_712'] },
                        { label: 'Document 8A',               key: 'Document 8A',              valKeys: ['Document_8A', 'Document 8A', 'doc_8a'],               linkKeys: ['DOC_8A Link', '8A Link', 'link_8a'] },
                        { label: 'Form No. 6',                 key: 'Form No. 6',                valKeys: ['FORM NO6', 'Form No. 6', 'form_no6'],                  linkKeys: ['FN6 LINK', 'Form No. 6 Link', 'link_fn6'] },
                        { label: 'T.D.R. Certificate & Use',  key: 'T.D.R. Certificate & Use', valKeys: ['T.D.R.Certificate & Use', 'TDR Certificate', 'tdrc'],  linkKeys: ['T.D.R.C. LINK', 'TDR Certificate Document', 'link_tdrc'] },
                        { label: 'T.D.R.',                    key: 'T.D.R.',                   valKeys: ['T.D.R.', 'TDR Details', 'tdr'],                        linkKeys: ['T.D.R Link', 'TDR Link', 'link_tdr'] },
                        { label: 'Agreement',                 key: 'Agreement',                valKeys: ['Agreement', 'agreement'],                              linkKeys: ['Agreement Link', 'link_agreement'] },
                        { label: 'PR Document',               key: 'PR Document',              valKeys: ['PR_Document', 'PR Card', 'pr_document'],               linkKeys: ['PR Link', 'PR Card Link', 'link_pr'] },
                        { label: 'Tahsildar Letter',          key: 'Tahsildar Letter',         valKeys: ['Tahsildar Letter', 'tahsildar_letter'],                linkKeys: ['Tahsildar Letter Link', 'link_tahsildar'] },
                        { label: 'Local Map',                 key: 'Local Map',                valKeys: ['LOCAL MAP', 'Local Map', 'local_map'],                 linkKeys: ['LOCAL MAP LINK', 'Local Map Link', 'link_local_map'] },
                        { label: 'Stability Certificate',     key: 'Stability Certificate',    valKeys: ['Stability Certificate', 'stability_cert'],             linkKeys: ['Stability Certificate_Link', 'Stability Certificate Link', 'link_stability'] },
                        { label: 'FERFAR',                    key: 'FERFAR',                   valKeys: ['FERFAR', 'Ferfar', 'ferfar'],                          linkKeys: ['FERFAR_Link', 'Ferfar Link', 'link_ferfar'] },
                        { label: 'ULC',                       key: 'ULC',                      valKeys: ['ULC', 'ulc'],                                          linkKeys: ['ULC_Link', 'ULC Link', 'link_ulc'] }
                      ];

                      const resNo = selectedProject?.reservation_number || selectedProject?.reservationNo || attrs['Reservation Number'] || attrs['RESERVATIO'] || '';
                      const projectLinks = DOCUMENT_LINKS[resNo] || {};

                      const getFirstVal = (keys) => {
                        for (const k of keys) {
                          if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') return String(attrs[k]).trim();
                        }
                        return null;
                      };

                      const resolveLinks = (val) => {
                        if (!val) return [];
                        let list = [];
                        if (val.startsWith('/files/')) {
                          list = [val];
                        } else {
                          try {
                            if (val.startsWith('[') && val.endsWith(']')) {
                              const parsed = JSON.parse(val);
                              list = Array.isArray(parsed) ? parsed : [val];
                            }
                          } catch (e) {}
                          if (list.length === 0) {
                            if (val.includes(',') || val.includes('\n')) list = val.split(new RegExp('[,\\n]+')).map(s => s.trim());
                            else list = [val];
                          }
                        }
                        return list.filter(l => l && l !== 'No' && l !== 'NA' && !l.toLowerCase().endsWith('na.pdf') && !l.toLowerCase().endsWith('/na.pdf'));
                      };

                      let checklistCount = 0;
                      docPairs.forEach(doc => {
                        const linkVal = getFirstVal(doc.linkKeys);
                        let links = resolveLinks(linkVal);
                        if (links.length === 0) {
                          links = projectLinks[doc.key] || [];
                        }
                        const hasDoc = getFirstVal(doc.valKeys);
                        const isYes = links.length > 0 || (hasDoc && hasDoc.toLowerCase() !== 'na' && hasDoc.toLowerCase() !== 'no' && hasDoc.trim() !== '');
                        if (isYes) checklistCount++;
                      });

                      const photoCount = selectedProject.timeline?.reduce((acc, curr) => acc + (curr.images?.length || 0), 0) || 0;
                      const totalCount = checklistCount + photoCount;

                      return totalCount + (totalCount === 1 ? ' file' : ' files');
                    })()}
                  </div>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Drawings, estimates, photos</span>
                </div>
              </div>

              {/* Tab Navigation Row */}
              <div style={{
                display: 'flex',
                borderBottom: '2.5px solid #cbd5e1',
                gap: '8px',
                overflowX: 'auto',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}>
                {[
                  { id: 'overview', label: 'Overview' },
                  { id: 'technical', label: 'Technical Attributes' },
                  { id: 'documents', label: 'Photos/Documents' },
                  { id: 'workflow', label: 'Workflow History' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveDetailsTab(tab.id)}
                    style={{
                      padding: '14px 20px',
                      background: 'none',
                      border: 'none',
                      borderBottom: activeDetailsTab === tab.id ? '3.5px solid #1a73e8' : '3.5px solid transparent',
                      color: activeDetailsTab === tab.id ? '#1a73e8' : '#64748b',
                      fontWeight: '800',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      marginBottom: '-2.5px'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Details Content Panels */}
              <div style={{ flex: 1, minHeight: '300px' }}>
                
                {/* TAB 1: Overview */}
                {activeDetailsTab === 'overview' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 0.8fr', gap: '20px' }}>
                    {/* Left Column: Summary and Overlapping Features */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {/* Primary metadata card */}
                      <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                        <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#1a73e8', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                          📋 Summary details
                        </h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                          <tbody>
                            {(() => {
                              const attrs = (() => {
                                if (!selectedProject?.custom_attributes) return {};
                                try { return typeof selectedProject.custom_attributes === 'string' ? JSON.parse(selectedProject.custom_attributes) : selectedProject.custom_attributes; } catch(e) { return {}; }
                              })();
                              const oldHissa = attrs['Old Survey No_Hissa No'] || attrs['Old Survey No / Hissa No'] || '';
                              const newHissa = attrs['New Survey No_Hissa No'] || attrs['New Survey No / Hissa No'] || '';
                              const surveyNo  = attrs['SURVEY_No.'] || attrs['Survey No'] || '';
                              const rows = [
                                { l: 'Project Name', v: selectedProject.project_name || selectedProject.name || 'N/A' },
                                { l: 'GIS Layer Type', v: selectedProject.type || 'N/A' },
                                ...(oldHissa ? [{ l: 'Old Survey No / Hissa No', v: oldHissa }] : []),
                                ...(newHissa ? [{ l: 'New Survey No / Hissa No', v: newHissa }] : []),
                                ...(surveyNo  ? [{ l: 'Survey No', v: surveyNo }] : []),
                                { l: 'Ward Location', v: selectedProject.ward || 'N/A' },
                                { l: 'Maintenance Authority', v: selectedProject.authority || 'Roads Department' },
                                { l: 'Current Status', v: selectedProject.status || 'Draft' },
                                ...(selectedProject.description ? [{ l: 'Description of Proposal', v: selectedProject.description }] : []),
                                ...(selectedProject.budget ? [{ l: 'Estimated Cost', v: selectedProject.budget }] : []),
                                ...(attrs['Estimated Duration'] ? [{ l: 'Estimated Duration', v: attrs['Estimated Duration'] }] : []),
                                ...(selectedProject.start_date ? [{ l: 'Estimated Tentative Start Date', v: new Date(selectedProject.start_date).toLocaleDateString() }] : []),
                                { l: 'Asset Owner', v: selectedProject.owner || 'N/A' },
                                { l: 'Creation Date', v: new Date(selectedProject.creation || Date.now()).toLocaleDateString() }
                              ];
                              return rows.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                                  <td style={{ padding: '12px 8px', fontWeight: '700', color: '#64748b', width: '35%' }}>{item.l}</td>
                                  <td style={{ padding: '12px 8px', color: '#1e293b', fontWeight: '500' }}>{item.v}</td>
                                </tr>
                              ));
                            })()}

                          </tbody>
                        </table>
                      </div>

                      {/* Overlapping & Related Map Layers */}
                      {(() => {
                        const overlapping = findOverlappingFeatures(selectedProject, projects).filter(
                          feat => feat.type === 'BUILDING_INFO' || feat.type === 'building_info'
                        );
                        if (overlapping.length === 0) return null;

                        const layerNameMap = {
                          'BUILDING_INFO': '🏢 Building Information',
                          'building_info': '🏢 Building Information',
                          'MBMC-RESERVSTION': '🎯 Reservation Polygons',
                          'MBMC-RESERVSTION-BOUNDARY': '🟢 Reservation Boundaries',
                          'MBMC-ROAD': '🛣️ Municipal Roads',
                          'MBMC-ROAD_CENTER_LINE': '🔸 Road Center Lines',
                          'MBMC-VILLAGE-BOUNDARY': '🗺️ Village Boundaries',
                          'MBMC-VILLAGES-SURVEY_No._BOUNDARY': '📜 Survey Boundaries'
                        };
                        const grouped = {};
                        overlapping.forEach(item => {
                          const type = item.type || 'Other Layer';
                          if (!grouped[type]) grouped[type] = [];
                          grouped[type].push(item);
                        });

                        const getFeatureAttributes = (feat) => {
                          let attrs = {};
                          try { attrs = typeof feat.custom_attributes === 'string' ? JSON.parse(feat.custom_attributes) : (feat.custom_attributes || {}); } catch(e){}
                          const allAttrs = { ...feat, ...attrs };
                          const excludeKeys = ['coordinates', 'custom_attributes', 'stages', 'timeline', 'pdf_attachment', 'owner_doc', 'idx', 'amended_from', 'creation', 'modified', 'owner', 'modified_by', 'docstatus', 'allow_guest'];
                          const displayAttrs = [];
                          Object.entries(allAttrs).forEach(([k, v]) => {
                            if (excludeKeys.includes(k)) return;
                            if (v === null || v === undefined || String(v).trim() === '') return;
                            if (typeof v === 'object') return;
                            let label = k;
                            if (k.startsWith('attr_')) label = k.substring(5);
                            label = label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                            displayAttrs.push({ label, val: String(v) });
                          });
                          return displayAttrs;
                        };

                        return (
                          <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                            <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#1a73e8', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              🔗 Overlapping & Related Map Layers
                            </h4>
                            {overlapping.length === 0 ? (
                              <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>
                                No overlapping building, survey, or boundary layers detected for this location.
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {Object.entries(grouped).map(([layerType, items]) => {
                                  const groupTitle = layerNameMap[layerType] || layerType;
                                  return (
                                    <div key={layerType} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                      <div style={{ background: '#f8fafc', padding: '10px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: '800', fontSize: '13px', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>{groupTitle}</span>
                                        <span style={{ background: '#e2e8f0', color: '#475569', fontSize: '11px', padding: '2px 8px', borderRadius: '10px' }}>
                                          {items.length} {items.length === 1 ? 'feature' : 'features'}
                                        </span>
                                      </div>
                                      
                                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {items.map((feat, fIdx) => {
                                          let name = feat.project_name || feat.name || `Feature ${feat.id}`;
                                          let attrs = {};
                                          try { attrs = typeof feat.custom_attributes === 'string' ? JSON.parse(feat.custom_attributes) : (feat.custom_attributes || {}); } catch(e){}
                                          
                                          if (feat.type === 'BUILDING_INFO' || feat.type === 'building_info') {
                                            const bldgId = attrs['BUILDING I'] || attrs['Text'] || attrs['BUILDING N'] || '';
                                            if (bldgId) name = `Building ID: ${bldgId}`;
                                          } else if (feat.type === 'MBMC-VILLAGES-SURVEY_No._BOUNDARY') {
                                            const surveyNo = attrs['SURVEY_No.'] || '';
                                            if (surveyNo) name = `Survey No: ${surveyNo}`;
                                          } else if (feat.type === 'MBMC-RESERVSTION') {
                                            const resNo = attrs['RESERVATIO'] || attrs['Reservation Number'] || '';
                                            if (resNo) name = `Reservation: ${resNo}`;
                                          }
                                          
                                          const isExpanded = expandedRelatedFeatureId === feat.id;
                                          const featAttrs = getFeatureAttributes(feat);
                                          
                                          return (
                                            <div key={feat.id} style={{ borderBottom: fIdx < items.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                              <div 
                                                onClick={() => setExpandedRelatedFeatureId(isExpanded ? null : feat.id)}
                                                style={{ 
                                                  padding: '12px 16px', 
                                                  display: 'flex', 
                                                  justifyContent: 'space-between', 
                                                  alignItems: 'center', 
                                                  cursor: 'pointer',
                                                  background: isExpanded ? '#f8fafc' : 'white',
                                                  transition: 'background 0.2s'
                                                }}
                                              >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                                    {name}
                                                  </span>
                                                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                                    ({feat.id})
                                                  </span>
                                                </div>
                                                
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={e => e.stopPropagation()}>
                                                  <button
                                                    onClick={() => handleCenterRelated(feat)}
                                                    style={{
                                                      background: '#eff6ff',
                                                      border: '1px solid #bfdbfe',
                                                      color: '#1a73e8',
                                                      fontSize: '11px',
                                                      fontWeight: '800',
                                                      padding: '4px 10px',
                                                      borderRadius: '6px',
                                                      cursor: 'pointer',
                                                      display: 'flex',
                                                      alignItems: 'center',
                                                      gap: '4px'
                                                    }}
                                                  >
                                                    🔎 Center
                                                  </button>
                                                  <button
                                                    onClick={() => openProjectDetails(feat)}
                                                    style={{
                                                      background: '#f8fafc',
                                                      border: '1px solid #cbd5e1',
                                                      color: '#475569',
                                                      fontSize: '11px',
                                                      fontWeight: '800',
                                                      padding: '4px 10px',
                                                      borderRadius: '6px',
                                                      cursor: 'pointer'
                                                    }}
                                                  >
                                                    Open Details ➔
                                                  </button>
                                                  <span 
                                                    style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '12px', color: '#64748b', cursor: 'pointer', padding: '4px' }} 
                                                    onClick={() => setExpandedRelatedFeatureId(isExpanded ? null : feat.id)}
                                                  >
                                                    ▶
                                                  </span>
                                                </div>
                                              </div>
                                              
                                              {isExpanded && (
                                                <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                                                  {featAttrs.length === 0 ? (
                                                    <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>No additional attribute fields.</div>
                                                  ) : (
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                                                      {featAttrs.map((attr, aIdx) => (
                                                        <div key={aIdx} style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                                                          <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase' }}>{attr.label}</span>
                                                          <span style={{ fontSize: '12px', color: '#334155', fontWeight: '500', marginTop: '2px', wordBreak: 'break-word' }}>{attr.val}</span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Project journey progress timeline */}
                    <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                      <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#1a73e8', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                        📦 Project Milestone Journey
                      </h4>
                      
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
                        const logsByStep = {};
                        STEPS.forEach(s => { logsByStep[s] = []; });
                        timeline.forEach(t => { if (logsByStep[t.status]) logsByStep[t.status].push(t); });

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '10px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '24px', borderLeft: '2px solid #e2e8f0' }}>
                              {STEPS.map((step, idx) => {
                                const isDone = STEPS.indexOf(currentStatus) >= idx || currentStatus === step;
                                const isCurrent = currentStatus === step;
                                const stepColor = isDone ? STEP_COLORS[step] : '#94a3b8';
                                const stepLogs = logsByStep[step] || [];

                                return (
                                  <div key={step} style={{ position: 'relative', marginBottom: '8px' }}>
                                    {/* Circle bullet */}
                                    <div style={{
                                      position: 'absolute',
                                      left: '-34px',
                                      top: '2px',
                                      width: '18px',
                                      height: '18px',
                                      borderRadius: '50%',
                                      background: isDone ? stepColor : 'white',
                                      border: `2px solid ${stepColor}`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      zIndex: 2
                                    }}>
                                      {isDone && <span style={{ color: 'white', fontSize: '9px', fontWeight: 'bold' }}>✓</span>}
                                    </div>

                                    <div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: '700', color: isDone ? '#0f172a' : '#94a3b8' }}>
                                          {STEP_ICONS[step]} {STEP_LABELS[step]}
                                        </span>
                                        {isCurrent && (
                                          <span style={{ background: '#eff6ff', color: '#1a73e8', fontSize: '10px', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', border: '1px solid #bfdbfe' }}>Active Stage</span>
                                        )}
                                      </div>
                                      
                                      {stepLogs.length > 0 ? (
                                        <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', marginTop: '6px', border: '1px solid #e2e8f0' }}>
                                          {stepLogs.map((log, li) => (
                                            <div key={li} style={{ fontSize: '12px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#334155' }}>
                                                <span>{log.updated_by?.split('@')[0] || 'JE'}</span>
                                                <span>{new Date(log.date).toLocaleDateString()}</span>
                                              </div>
                                              <p style={{ margin: '2px 0 0 0', fontStyle: 'italic' }}>"{log.comment || 'No comment provided'}"</p>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontStyle: 'italic' }}>Pending milestone stage</div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* TAB 2: Technical Attributes */}
                {activeDetailsTab === 'technical' && (
                  <div style={{ flex: 1 }}>
                    {(() => {
                      const groups = getGroupedAttributes();
                      // Left group: technical details
                      const attributeItems = [];
                      groups.forEach(g => {
                        // Skip the entire Document Checklist group under Technical tab
                        if (g.title === '📄 Document Checklist') return;
                        
                        const filtered = g.items.filter(r => {
                          const cleanK = r.k.replace(/^attr_/, '').toLowerCase();
                          
                          // Exclude document link keys
                          if (cleanK.includes('link') || cleanK.includes('photo') || cleanK.includes('drawing') || cleanK.includes('document')) {
                            return false;
                          }
                          
                          // Exclude values that look like files
                          const valStr = String(r.v || '').toLowerCase();
                          if (valStr.startsWith('/files/') || valStr.endsWith('.pdf') || valStr.endsWith('.png') || valStr.endsWith('.jpg') || valStr.endsWith('.jpeg')) {
                            return false;
                          }

                          return !['ward', 'village', 'survey_no', 'mbmc_712', 'czmp', 'encroachment', 'tenant_name', 'profession', 'purpose_of_use', 'contact_information', 'rental_period', 'aadhar_number', 'gst_number', 'pan_card_number', 'rent_amount', 'renewal_date', 'gis_id', 'old survey no_hissa no_doc', 'reservation number_doc', 'new survey no_hissa no_doc'].includes(cleanK);
                        });
                        attributeItems.push(...filtered);
                      });

                      // Right group: documents
                      let attrs = {};
                      try { attrs = typeof selectedProject.custom_attributes === 'string' ? JSON.parse(selectedProject.custom_attributes) : (selectedProject.custom_attributes || {}); } catch(e){}
                      const docPairs = [
                        { label: 'Document 7/12',             valKeys: ['Document 7/12', '7/12 Document', 'doc_712'],           linkKeys: ['7/12 LINK', '7/12 Link', 'link_712'] },
                        { label: 'Document 8A',               valKeys: ['Document_8A', 'Document 8A', 'doc_8a'],               linkKeys: ['DOC_8A Link', '8A Link', 'link_8a'] },
                        { label: 'Form No. 6',                 valKeys: ['FORM NO6', 'Form No. 6', 'form_no6'],                  linkKeys: ['FN6 LINK', 'Form No. 6 Link', 'link_fn6'] },
                        { label: 'T.D.R. Certificate & Use',  valKeys: ['T.D.R.Certificate & Use', 'TDR Certificate', 'tdrc'],  linkKeys: ['T.D.R.C. LINK', 'TDR Certificate Document', 'link_tdrc'] },
                        { label: 'T.D.R.',                    valKeys: ['T.D.R.', 'TDR Details', 'tdr'],                        linkKeys: ['T.D.R Link', 'TDR Link', 'link_tdr'] },
                        { label: 'Agreement',                 valKeys: ['Agreement', 'agreement'],                              linkKeys: ['Agreement Link', 'link_agreement'] },
                        { label: 'PR Document',               valKeys: ['PR_Document', 'PR Card', 'pr_document'],               linkKeys: ['PR Link', 'PR Card Link', 'link_pr'] },
                        { label: 'Tahsildar Letter',          valKeys: ['Tahsildar Letter', 'tahsildar_letter'],                linkKeys: ['Tahsildar Letter Link', 'link_tahsildar'] },
                        { label: 'Local Map',                 valKeys: ['LOCAL MAP', 'Local Map', 'local_map'],                 linkKeys: ['LOCAL MAP LINK', 'Local Map Link', 'link_local_map'] },
                        { label: 'Stability Certificate',     valKeys: ['Stability Certificate', 'stability_cert'],             linkKeys: ['Stability Certificate_Link', 'Stability Certificate Link', 'link_stability'] },
                        { label: 'FERFAR',                    valKeys: ['FERFAR', 'Ferfar', 'ferfar'],                          linkKeys: ['FERFAR_Link', 'Ferfar Link', 'link_ferfar'] },
                        { label: 'ULC',                       valKeys: ['ULC', 'ulc'],                                          linkKeys: ['ULC_Link', 'ULC Link', 'link_ulc'] }
                      ];

                      const getFirstVal = (keys) => {
                        for (const k of keys) {
                          if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') {
                            return String(attrs[k]).trim();
                          }
                        }
                        return null;
                      };

                      const resolveLinks = (val) => {
                        if (!val) return [];
                        if (val.startsWith('/files/')) return [val];
                        try {
                          if (val.startsWith('[') && val.endsWith(']')) {
                            const parsed = JSON.parse(val);
                            return Array.isArray(parsed) ? parsed : [val];
                          }
                        } catch (e) {}
                        if (val.includes(',') || val.includes('\n')) {
                          return val.split(/[,\n]+/).map(s => s.trim()).filter(s => s.startsWith('/files/'));
                        }
                        return [];
                      };

                      const isValidDocUrl = (url) => {
                        if (!url) return false;
                        const lower = url.toLowerCase();
                        const bad = ['/na.pdf', '/na.png', '/na.jpg', '/none.pdf', '/null.pdf', '/n_a.pdf'];
                        return !bad.some(b => lower.endsWith(b));
                      };

                      const docPairsList = docPairs.map(p => {
                        const val = getFirstVal(p.valKeys);
                        const linkVal = getFirstVal(p.linkKeys);
                        const resolvedLinks = [
                          ...resolveLinks(linkVal),
                          ...resolveLinks(val)
                        ];
                        const uniqueLinks = Array.from(new Set(resolvedLinks)).filter(isValidDocUrl);
                        const url = uniqueLinks.length > 0 ? uniqueLinks[0] : null;
                        const fileName = url ? url.substring(url.lastIndexOf('/') + 1) : null;
                        return {
                          title: p.label,
                          fileName: fileName,
                          url: url
                        };
                      });

                      const pdfAttachments = (selectedProject.pdf_attachment || []).map(att => {
                        const url = att.url || att.file_url || '';
                        const fileName = att.file_name || url.substring(url.lastIndexOf('/') + 1) || 'Attached File';
                        return {
                          title: fileName.split('.').slice(0, -1).join('.') || 'Attached File',
                          fileName: fileName,
                          url: url
                        };
                      });

                      const checklistItems = [...docPairsList, ...pdfAttachments];

                      return (
                        <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column' }}>
                          <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#1a73e8', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                            ⚙️ Technical Attributes
                          </h4>
                          
                          <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(3, 1fr)', 
                            gap: '18px 20px', 
                            fontSize: '14px',
                            marginTop: '4px'
                          }}>
                            {attributeItems.map((r, ri) => (
                              <div key={ri} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                  {r.l}
                                </span>
                                <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: '700', wordBreak: 'break-word' }}>
                                  {renderFieldValue(r)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Add Field */}
                          {!isEditing && (
                            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => {
                                  setActiveAddFieldSection('technical_custom');
                                  setNewFieldLabel('');
                                  setNewFieldValue('');
                                }}
                                style={{ background: 'none', border: 'none', color: '#1a73e8', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}
                              >
                                ➕ Add Field
                              </button>
                            </div>
                          )}

                          {activeAddFieldSection === 'technical_custom' && (
                            <div style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <input placeholder="Field Name" value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                                <input placeholder="Value" value={newFieldValue} onChange={(e) => setNewFieldValue(e.target.value)} style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                              </div>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button 
                                  onClick={async () => {
                                    if (!newFieldLabel.trim()) return alert("Field name required");
                                    const customAttrs = {};
                                    Object.keys(selectedProject).forEach(k => {
                                      if (!STANDARD_KEYS.includes(k) && k !== 'section_mappings') {
                                        customAttrs[k] = selectedProject[k];
                                      }
                                    });
                                    customAttrs[newFieldLabel.trim()] = newFieldValue.trim();
                                    try {
                                      await updateCustomAttributes(selectedProject.id, customAttrs);
                                      setSelectedProject({ ...selectedProject, [newFieldLabel.trim()]: newFieldValue.trim() });
                                      setActiveAddFieldSection(null);
                                      loadProjects();
                                    } catch(e) { alert("Save failed: " + e.message); }
                                  }}
                                  style={{ padding: '4px 10px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                                >
                                  Save
                                </button>
                                <button onClick={() => setActiveAddFieldSection(null)} style={{ padding: '4px 10px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* TAB 3: Land / Ward Details - REMOVED */}

                {/* TAB: Photos/Documents */}
                {activeDetailsTab === 'documents' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      {/* Documents Section */}
                      <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', marginBottom: '16px' }}>
                          <h4 style={{ margin: 0, fontSize: '14px', color: '#1a73e8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                            📄 Document Checklist
                          </h4>
                          <div>
                            <input type="file" id="doc-upload-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={(e) => { if (e.target.files.length > 0) alert('Document uploaded successfully!'); }} />
                            <label htmlFor="doc-upload-input" style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '14px' }}>+</span> Upload Document
                            </label>
                          </div>
                        </div>
                        
                        {(() => {
                          let attrs = {};
                          try { attrs = typeof selectedProject.custom_attributes === 'string' ? JSON.parse(selectedProject.custom_attributes) : (selectedProject.custom_attributes || {}); } catch(e){}

                          const docPairs = [
                            { label: 'Document 7/12',             key: 'Document 7/12',            valKeys: ['Document 7/12', '7/12 Document', 'doc_712'],           linkKeys: ['7/12 LINK', '7/12 Link', 'link_712'] },
                            { label: 'Document 8A',               key: 'Document 8A',              valKeys: ['Document_8A', 'Document 8A', 'doc_8a'],               linkKeys: ['DOC_8A Link', '8A Link', 'link_8a'] },
                            { label: 'Form No. 6',                 key: 'Form No. 6',                valKeys: ['FORM NO6', 'Form No. 6', 'form_no6'],                  linkKeys: ['FN6 LINK', 'Form No. 6 Link', 'link_fn6'] },
                            { label: 'T.D.R. Certificate & Use',  key: 'T.D.R. Certificate & Use', valKeys: ['T.D.R.Certificate & Use', 'TDR Certificate', 'tdrc'],  linkKeys: ['T.D.R.C. LINK', 'TDR Certificate Document', 'link_tdrc'] },
                            { label: 'T.D.R.',                    key: 'T.D.R.',                   valKeys: ['T.D.R.', 'TDR Details', 'tdr'],                        linkKeys: ['T.D.R Link', 'TDR Link', 'link_tdr'] },
                            { label: 'Agreement',                 key: 'Agreement',                valKeys: ['Agreement', 'agreement'],                              linkKeys: ['Agreement Link', 'link_agreement'] },
                            { label: 'PR Document',               key: 'PR Document',              valKeys: ['PR_Document', 'PR Card', 'pr_document'],               linkKeys: ['PR Link', 'PR Card Link', 'link_pr'] },
                            { label: 'Tahsildar Letter',          key: 'Tahsildar Letter',         valKeys: ['Tahsildar Letter', 'tahsildar_letter'],                linkKeys: ['Tahsildar Letter Link', 'link_tahsildar'] },
                            { label: 'Local Map',                 key: 'Local Map',                valKeys: ['LOCAL MAP', 'Local Map', 'local_map'],                 linkKeys: ['LOCAL MAP LINK', 'Local Map Link', 'link_local_map'] },
                            { label: 'Stability Certificate',     key: 'Stability Certificate',    valKeys: ['Stability Certificate', 'stability_cert'],             linkKeys: ['Stability Certificate_Link', 'Stability Certificate Link', 'link_stability'] },
                            { label: 'FERFAR',                    key: 'FERFAR',                   valKeys: ['FERFAR', 'Ferfar', 'ferfar'],                          linkKeys: ['FERFAR_Link', 'Ferfar Link', 'link_ferfar'] },
                            { label: 'ULC',                       key: 'ULC',                      valKeys: ['ULC', 'ulc'],                                          linkKeys: ['ULC_Link', 'ULC Link', 'link_ulc'] }
                          ];

                          const resNo = selectedProject?.reservation_number || selectedProject?.reservationNo || attrs['Reservation Number'] || attrs['RESERVATIO'] || '';
                          const projectLinks = DOCUMENT_LINKS[resNo] || {};

                          const getFirstVal = (keys) => {
                            for (const k of keys) {
                              if (attrs[k] !== undefined && attrs[k] !== null && String(attrs[k]).trim() !== '') return String(attrs[k]).trim();
                            }
                            return null;
                          };

                          const resolveLinks = (val) => {
                            if (!val) return [];
                            let list = [];
                            if (val.startsWith('/files/')) {
                              list = [val];
                            } else {
                              try {
                                if (val.startsWith('[') && val.endsWith(']')) {
                                  const parsed = JSON.parse(val);
                                  list = Array.isArray(parsed) ? parsed : [val];
                                }
                              } catch (e) {}
                              if (list.length === 0) {
                                if (val.includes(',') || val.includes('\n')) list = val.split(new RegExp('[,\\n]+')).map(s => s.trim());
                                else list = [val];
                              }
                            }
                            // Filter out "No", "NA", and any invalid paths like "NA.pdf"
                            return list.filter(l => l && l !== 'No' && l !== 'NA' && !l.toLowerCase().endsWith('na.pdf') && !l.toLowerCase().endsWith('/na.pdf'));
                          };

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                              {docPairs.map((doc, idx) => {
                                // First check database custom_attributes
                                const linkVal = getFirstVal(doc.linkKeys);
                                let links = resolveLinks(linkVal);
                                
                                // Fallback to local folder scan if database has no links
                                if (links.length === 0) {
                                  links = projectLinks[doc.key] || [];
                                }
                                
                                const hasDoc = getFirstVal(doc.valKeys);
                                const isYes = links.length > 0 || (hasDoc && hasDoc.toLowerCase() !== 'na' && hasDoc.toLowerCase() !== 'no' && hasDoc.trim() !== '');

                                return (
                                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: idx < docPairs.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: isYes ? '#dcfce7' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isYes ? '#16a34a' : '#94a3b8', fontSize: '12px' }}>
                                        {isYes ? '✓' : '—'}
                                      </div>
                                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{doc.label}</span>
                                    </div>
                                    <div>
                                      {links.length > 0 ? (
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          {links.map((lnk, lidx) => (
                                            <button key={lidx} onClick={() => setPreviewFile({ url: lnk.startsWith('/') ? lnk : `/${lnk}`, name: `${doc.label} (${lidx + 1})` })} style={{ padding: '4px 10px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                                              View
                                            </button>
                                          ))}
                                        </div>
                                      ) : (
                                        <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>Pending</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Photos Section */}
                      <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', marginBottom: '16px' }}>
                          <h4 style={{ margin: 0, fontSize: '14px', color: '#1a73e8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                            📷 Site Photos Gallery
                          </h4>
                          <div>
                            <input type="file" id="photo-upload-input" multiple accept="image/*" style={{ display: 'none' }} onChange={(e) => { if (e.target.files.length > 0) alert('Photo uploaded successfully!'); }} />
                            <label htmlFor="photo-upload-input" style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '14px' }}>+</span> Upload Photo
                            </label>
                          </div>
                        </div>
                        
                        {(() => {
                          const timeline = selectedProject.timeline || [];
                          const imageFiles = [];
                          
                          // Timeline photos
                          timeline.forEach(t => {
                            if (t.images && t.images.length > 0) {
                              t.images.forEach(img => {
                                imageFiles.push({ url: img.startsWith('/') ? img : `/${img}`, date: t.date, desc: t.comment });
                              });
                            }
                          });
                          
                          // Folder photos
                          const resNo = selectedProject?.reservationNo || '';
                          const projectLinks = DOCUMENT_LINKS[resNo] || {};
                          const folderPhotos = projectLinks['Photos'] || [];
                          folderPhotos.forEach((img, idx) => {
                             imageFiles.push({ url: img, date: new Date().toISOString(), desc: `Site Photo ${idx+1}` });
                          });

                          return (
                            <div>
                              {imageFiles.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                                  {imageFiles.map((img, idx) => {
                                    const isPdf = img.url.toLowerCase().endsWith('.pdf');
                                    return (
                                    <div key={idx} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer' }} onClick={() => setPreviewFile({ url: img.url, name: img.desc || 'Site Photo' })}>
                                      <div style={{ height: '100px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {isPdf ? <span style={{fontSize:'32px'}}>📄</span> : <img src={img.url} alt="Site Photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                      </div>
                                      <div style={{ padding: '6px 10px' }}>
                                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>{new Date(img.date).toLocaleDateString()}</div>
                                        <div style={{ fontSize: '11px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{img.desc || 'Site Photo'}</div>
                                      </div>
                                    </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '13px' }}>
                                  📷 No site photos have been uploaded for this feature yet.
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      
                    </div>
                  </div>
                )}
{/* TAB 6: Workflow History */}
                {activeDetailsTab === 'workflow' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                      <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#1a73e8', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                        ⚙️ Approval Workflow logs & Comments
                      </h4>
                      
                      {(() => {
                        const timeline = selectedProject.timeline || [];
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {timeline.length > 0 ? (
                              timeline.map((log, idx) => (
                                <div key={idx} style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                                    <div>
                                      <strong style={{ color: '#1e293b' }}>{log.updated_by || 'JE'}</strong>
                                      <span style={{ color: '#64748b', marginLeft: '6px' }}>moved project to</span>
                                      <span style={{ background: '#e0e7ff', color: '#4f46e5', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', marginLeft: '6px' }}>{log.status}</span>
                                    </div>
                                    <span style={{ color: '#94a3b8' }}>{new Date(log.date).toLocaleDateString()}</span>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '13px', color: '#475569', fontStyle: 'italic' }}>
                                    "{log.comment || 'No comment added.'}"
                                  </p>
                                  
                                  {log.images && log.images.length > 0 && (
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                      {log.images.map((img, imgIdx) => (
                                        <div key={imgIdx} onClick={() => setPreviewFile({ url: img.startsWith('/') ? img : `/${img}`, name: `Attachment ${imgIdx + 1}` })} style={{ width: '48px', height: '48px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #cbd5e1', cursor: 'pointer' }}>
                                          <img src={img.startsWith('/') ? img : `/${img}`} alt="Timeline Attachment" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '13px', fontStyle: 'italic' }}>
                                No workflow steps recorded. Initiate a proposal to start the approval lifecycle.
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

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
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            padding: '20px'
          }}>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              width: '460px',
              maxHeight: '92%',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>

              {/* Header */}
              <div style={{
                padding: '20px 24px',
                background: 'linear-gradient(135deg, #059669, #10b981)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0
              }}>
                <div>
                  <div style={{ fontWeight: 850, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>🧾 Generate Demand</div>
                  <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '3px' }}>Create and issue a rental demand notice for this property</div>
                </div>
                <button
                  onClick={() => setShowGenerateDemandPopup(false)}
                  style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >✕</button>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '28px', display: 'flex', flexDirection: 'column', gap: '0' }}>

                {/* 3-Field Info Card */}
                <div style={{ background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>

                  {/* Area Name */}
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🏢</div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Area Name</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                          {selectedProject.project_name || selectedProject.name || 'N/A'}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, background: '#dbeafe', color: '#1d4ed8', padding: '3px 10px', borderRadius: '99px' }}>Property</span>
                  </div>

                  {/* Area Size */}
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>📐</div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Area Size</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                          {selectedProject.plot_area || selectedProject['Plot Area'] || 'N/A'}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#16a34a', padding: '3px 10px', borderRadius: '99px' }}>Plot Area</span>
                  </div>

                  {/* Yearly Rent */}
                  <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>💰</div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Yearly Rent</div>
                        <div style={{ fontSize: '20px', fontWeight: 900, color: '#059669', marginTop: '2px' }}>
                          {(() => {
                            const v = selectedProject.plot_area || selectedProject['Plot Area'];
                            if (v) { const n = parseFloat(String(v).replace(/[^\d.]/g, '')); if (!isNaN(n)) return `₹${(n * 200).toLocaleString('en-IN')}`; }
                            return selectedProject.yearly_rent || selectedProject['Yearly Rent'] || 'N/A';
                          })()}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, background: '#f0fdf4', color: '#059669', padding: '3px 10px', borderRadius: '99px', border: '1px solid #86efac' }}>Annual</span>
                  </div>

                </div>

              </div>

              {/* Footer */}
              <div style={{ padding: '16px 24px', borderTop: '1.5px solid #e2e8f0', display: 'flex', gap: '10px', background: '#f8fafc', flexShrink: 0, alignItems: 'center' }}>
                <button onClick={() => setShowGenerateDemandPopup(false)}
                  style={{ padding: '10px 20px', border: '1.5px solid #cbd5e1', background: 'white', color: '#475569', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                >Cancel</button>
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => {
                    setTenantName(selectedProject['Tenant Name'] || selectedProject.tenant_name || '');
                    setTenantProfession(selectedProject['Profession'] || selectedProject.profession || '');
                    setTenantPurposeOfUse(selectedProject['Purpose of Use'] || selectedProject.purpose_of_use || '');
                    setTenantContactInfo(selectedProject['Contact Information'] || selectedProject.contact_information || '');
                    setTenantRentalPeriod(selectedProject['Rental Period'] || selectedProject.rental_period || '');
                    setTenantAadharNo(selectedProject['Aadhar Number'] || selectedProject.aadhar_number || selectedProject.aadhar_no || '');
                    setTenantGstNo(selectedProject['GST Number'] || selectedProject.gst_number || selectedProject.gst_no || '');
                    setTenantPanCardNo(selectedProject['PAN Card Number'] || selectedProject.pan_card_number || selectedProject.pancard_no || '');
                    setTenantRentAmount(selectedProject['Rent Amount'] || selectedProject.rent_amount || '');
                    setTenantRenewalDate(selectedProject['Renewal Date'] || selectedProject.renewal_date || '');
                    let atts = []; const raw = selectedProject['Tenant Attachments'] || selectedProject.tenant_attachments;
                    if (raw) { if (Array.isArray(raw)) atts = raw; else { try { atts = JSON.parse(raw); } catch(e) { atts = []; } } }
                    setTenantAttachments(atts);
                    setShowGenerateDemandPopup(false); setShowTenantRegistrationPopup(true);
                  }}
                  style={{ padding: '10px 20px', background: '#eff6ff', color: '#1d4ed8', border: '1.5px solid #bfdbfe', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >👤 Tenant Registration</button>
                <button
                  onClick={() => {
                    const demandRef = `DMD-${selectedProject.id || 'PROP'}-2627`;
                    const propertyName = selectedProject.project_name || selectedProject.name || 'N/A';
                    const tenantNm = selectedProject['Tenant Name'] || selectedProject.tenant_name || 'Not Registered';
                    const plotArea = selectedProject.plot_area || selectedProject['Plot Area'] || 'N/A';
                    const plotAreaVal = selectedProject.plot_area || selectedProject['Plot Area'];
                    let totalAmt = '0';
                    if (plotAreaVal) { const cn = parseFloat(String(plotAreaVal).replace(/[^\d.]/g, '')); if (!isNaN(cn)) totalAmt = (cn * 200).toLocaleString('en-IN'); }
                    const printWin = window.open('', '_blank', 'width=820,height=700');
                    printWin.document.write(`<!DOCTYPE html><html><head><title>Demand Notice — ${demandRef}</title><style>body{font-family:Segoe UI,sans-serif;padding:40px;color:#1e293b}h1{font-size:22px;text-align:center;color:#059669;margin-bottom:4px}.subtitle{text-align:center;font-size:12px;color:#64748b;margin-bottom:30px}.ref-box{text-align:right;font-size:12px;color:#475569;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-bottom:20px}th{background:#f1f5f9;text-align:left;padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#475569}td{padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px}.total-row{background:#f0fdf4;font-weight:bold;font-size:15px}.footer-note{font-size:11px;color:#64748b;margin-top:30px;border-top:1px solid #e2e8f0;padding-top:10px}@media print{button{display:none}}</style></head><body><h1>🏛️ Mira Bhaindar Municipal Corporation</h1><div class="subtitle">Rental Demand Notice — Municipal GIS System</div><div class="ref-box">Demand Ref: <strong>${demandRef}</strong> | Date: ${new Date().toLocaleDateString('en-IN')}</div><table><tr><th>Field</th><th>Details</th></tr><tr><td>Property Name</td><td>${propertyName}</td></tr><tr><td>GIS ID</td><td>${selectedProject.id || 'N/A'}</td></tr><tr><td>Tenant Name</td><td>${tenantNm}</td></tr><tr><td>Plot Area</td><td>${plotArea}</td></tr><tr><td>Demand Period</td><td>2026-27</td></tr><tr><td>Ward / Location</td><td>${selectedProject.ward || selectedProject['Ward Location'] || 'N/A'}</td></tr><tr class="total-row"><td>Total Demand Amount</td><td>₹${totalAmt}</td></tr></table><div class="footer-note">This is a computer-generated demand notice. Please pay before the due date to avoid penalty charges.</div><br/><button onclick="window.print()">🖨️ Print Demand Notice</button></body></html>`);
                    printWin.document.close();
                    setShowGenerateDemandPopup(false);
                  }}
                  style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #059669, #10b981)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(16,185,129,0.35)' }}
                >🧾 Generate & Print</button>
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
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3100,
            padding: '20px'
          }}>
            <div style={{
              background: 'white',
              borderRadius: '16px',
              width: '840px',
              maxHeight: '92%',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Header */}
              <div style={{
                padding: '18px 24px',
                background: '#0284c7',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0
              }}>
                <span style={{ fontWeight: '850', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                  style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div style={{ 
                padding: '24px 28px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '18px', 
                background: 'white',
                overflowY: 'auto',
                flex: 1
              }}>
                
                {/* 3-column Grid for Form Inputs */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '16px 20px'
                }}>
                  
                  {/* Row 1 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Tenant Name</label>
                    <input 
                      type="text" 
                      placeholder="Enter Tenant Name"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      style={{ padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box', outline: 'none', fontWeight: 600 }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Profession</label>
                    <input 
                      type="text" 
                      placeholder="Enter Profession"
                      value={tenantProfession}
                      onChange={(e) => setTenantProfession(e.target.value)}
                      style={{ padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box', outline: 'none', fontWeight: 600 }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Purpose of Use</label>
                    <input 
                      type="text" 
                      placeholder="Enter Purpose of Use"
                      value={tenantPurposeOfUse}
                      onChange={(e) => setTenantPurposeOfUse(e.target.value)}
                      style={{ padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box', outline: 'none', fontWeight: 600 }}
                    />
                  </div>

                  {/* Row 2 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Contact Information</label>
                    <input 
                      type="text" 
                      placeholder="Enter Contact Info (Email / Phone)"
                      value={tenantContactInfo}
                      onChange={(e) => setTenantContactInfo(e.target.value)}
                      style={{ padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box', outline: 'none', fontWeight: 600 }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Rental Period</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 1 Year, 3 Years"
                      value={tenantRentalPeriod}
                      onChange={(e) => setTenantRentalPeriod(e.target.value)}
                      style={{ padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box', outline: 'none', fontWeight: 600 }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Aadhar Number</label>
                    <input 
                      type="text" 
                      placeholder="Enter 12-digit Aadhar Number"
                      value={tenantAadharNo}
                      onChange={(e) => setTenantAadharNo(e.target.value)}
                      style={{ padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box', outline: 'none', fontWeight: 600 }}
                    />
                  </div>

                  {/* Row 3 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>GST Number</label>
                    <input 
                      type="text" 
                      placeholder="Enter GST Number"
                      value={tenantGstNo}
                      onChange={(e) => setTenantGstNo(e.target.value)}
                      style={{ padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box', outline: 'none', fontWeight: 600 }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>PAN Card Number</label>
                    <input 
                      type="text" 
                      placeholder="Enter PAN Card Number"
                      value={tenantPanCardNo}
                      onChange={(e) => setTenantPanCardNo(e.target.value)}
                      style={{ padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box', outline: 'none', fontWeight: 600 }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Rent Amount</label>
                    <input 
                      type="text" 
                      placeholder="Enter Rent Amount"
                      value={tenantRentAmount}
                      onChange={(e) => setTenantRentAmount(e.target.value)}
                      style={{ padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box', outline: 'none', fontWeight: 600 }}
                    />
                  </div>

                </div>

                {/* Row 4: Renewal Date */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Renewal Date</label>
                  <input 
                    type="date" 
                    value={tenantRenewalDate}
                    onChange={(e) => setTenantRenewalDate(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box', outline: 'none', color: '#1e293b', fontWeight: 600 }}
                  />
                </div>

                {/* Tenant Attachments */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '6px' }}>
                  <label style={{ fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Tenant Attachments (Images/PDFs)</label>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1.5px dashed #cbd5e1',
                      background: '#f8fafc',
                      color: '#475569',
                      fontSize: '12px',
                      fontWeight: '700',
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

                  {tenantAttachments && tenantAttachments.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '6px' }}>
                      {tenantAttachments.map((att, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: '#334155' }}>
                          <a href={att.url} target="_blank" rel="noreferrer" style={{ color: '#1a73e8', textDecoration: 'none', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '380px' }}>
                            📄 {att.name || att.url.split('/').pop()}
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
                </div>

              </div>

              {/* Footer */}
              <div style={{ padding: '16px 24px', borderTop: '1.5px solid #e2e8f0', display: 'flex', gap: '12px', background: '#f8fafc', justifyContent: 'flex-end', flexShrink: 0 }}>
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
                  style={{ padding: '10px 22px', border: '1.5px solid #cbd5e1', background: 'white', color: '#475569', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
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
                  style={{ padding: '10px 22px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                >
                  Register
                </button>
              </div>
            </div>
          </div>
        )}


        {/* Initiate Popup Overlay */}
        {showInitiatePopup && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '1200px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)', padding: '24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '19px', fontWeight: '800' }}>🚀 Initiate Proposal</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>
                    Property ID: <span style={{ fontWeight: 'bold', color: '#60a5fa' }}>{selectedProject?.id || selectedProject?.name}</span>
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setShowInitiatePopup(false);
                    setProposalDescription('');
                    setProposalEstimatedCost('');
                    setProposalEstimatedDuration('');
                    setProposalTentativeStartDate('');
                    setInitiateComment('');
                    setInitiateAttachment(null);
                  }}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '34px', height: '34px', color: '#fff', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' }}
                >
                  ✕
                </button>
              </div>

              {/* Form Body */}
              <div style={{ padding: '36px 40px', display: 'flex', flexDirection: 'column', gap: '26px', maxHeight: '82vh', overflowY: 'auto' }}>
                
                <div>
                  <h4 style={{ margin: '0 0 18px 0', fontSize: '14px', color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '800' }}>Proposal Details</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>Description of Proposal *</label>
                      <textarea
                        placeholder="Detailed description of the proposed work..."
                        value={proposalDescription}
                        onChange={(e) => setProposalDescription(e.target.value)}
                        style={{ width: '100%', height: '240px', padding: '14px 18px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '15px', outline: 'none', resize: 'none', boxSizing: 'border-box', lineHeight: '1.6' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>Estimated Cost *</label>
                        <input
                          type="text"
                          placeholder="e.g. INR 5,00,000"
                          value={proposalEstimatedCost}
                          onChange={(e) => setProposalEstimatedCost(e.target.value)}
                          style={{ width: '100%', padding: '13px 18px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>Estimated Duration *</label>
                        <input
                          type="text"
                          placeholder="e.g. 6 Months"
                          value={proposalEstimatedDuration}
                          onChange={(e) => setProposalEstimatedDuration(e.target.value)}
                          style={{ width: '100%', padding: '13px 18px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>Estimated Tentative Start Date *</label>
                        <input
                          type="date"
                          value={proposalTentativeStartDate}
                          onChange={(e) => setProposalTentativeStartDate(e.target.value)}
                          style={{ width: '100%', padding: '12px 18px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>Approver</label>
                        <div style={{ padding: '13px 18px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', color: '#1e293b' }}>
                          Executive Engineer
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '24px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>Upload Proposal Document / Drawing</label>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setInitiateAttachment(e.target.files[0])}
                        style={{ fontSize: '14px', padding: '8px 0' }}
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Footer Actions */}
              <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '24px 40px', display: 'flex', justifyContent: 'flex-end', gap: '20px' }}>
                <button 
                  onClick={() => {
                    setShowInitiatePopup(false);
                    setProposalDescription('');
                    setProposalEstimatedCost('');
                    setProposalEstimatedDuration('');
                    setProposalTentativeStartDate('');
                    setInitiateComment('');
                    setInitiateAttachment(null);
                  }}
                  style={{ padding: '14px 36px', background: '#cbd5e1', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', transition: 'all 0.2s' }}
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    if (!proposalDescription.trim()) {
                      alert("Please enter a Description of Proposal");
                      return;
                    }
                    if (!proposalEstimatedCost.trim()) {
                      alert("Please enter Estimated Cost");
                      return;
                    }
                    if (!proposalEstimatedDuration.trim()) {
                      alert("Please enter Estimated Duration");
                      return;
                    }
                    if (!proposalTentativeStartDate) {
                      alert("Please select Estimated Tentative Start Date");
                      return;
                    }
                    try {
                      const res = await submitWorkOrder(
                        selectedProject.id, 
                        '',
                        initiateAttachment, 
                        "Executive Engineer",
                        proposalDescription,
                        proposalEstimatedCost,
                        proposalEstimatedDuration,
                        proposalTentativeStartDate
                      );
                      if (res && res.id) {
                        alert(`Initiated Proposal successfully! New ID: ${res.id}`);
                        setSelectedProject(null);
                        loadProjects();
                      }
                    } catch (e) {
                      alert('Failed to initiate: ' + e.message);
                    }
                    setShowInitiatePopup(false);
                    setProposalDescription('');
                    setProposalEstimatedCost('');
                    setProposalEstimatedDuration('');
                    setProposalTentativeStartDate('');
                    setInitiateComment('');
                    setInitiateAttachment(null);
                  }}
                  style={{ padding: '14px 40px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', transition: 'all 0.2s' }}
                >
                  Save
                </button>
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

        <div 
          ref={mapRef} 
          className={`zoom-${currentZoom} ${currentZoom < 15 ? 'hide-survey-labels' : ''} ${currentZoom < 16 ? 'hide-res-labels' : ''} ${currentZoom < 17 ? 'hide-building-labels' : ''}`} 
          style={{ height: '100%', width: '100%', zIndex: 1, visibility: selectedProject ? 'hidden' : 'visible' }} 
        />

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
