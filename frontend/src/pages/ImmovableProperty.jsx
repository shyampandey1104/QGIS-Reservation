import React, { useState, useEffect } from 'react';
import { fetchProjects, checkFilesExist } from '../api';
import RAW_PAYMENTS from '../data/payment_data.json';
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

// ── Modal Tabs ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'primary',   label: '📋 Primary Details' },
  { key: 'documents', label: '🔗 Linked Documents & Files' },
  { key: 'payments',  label: '💵 Payment History' },
];

function Row({ label, value }) {
  if (value && typeof value === 'object') value = JSON.stringify(value);
  const resolvedLinks = resolveLinks(value);
  
  const [activeLinks, setActiveLinks] = useState([]);
  const [checking, setChecking] = useState(true);

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
  }, [value]);

  const isLinkField = resolvedLinks.length > 0;

  return (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '11px 14px', fontWeight: 700, color: '#475569', width: '40%', verticalAlign: 'top', fontSize: '13px', whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ padding: '11px 14px', color: '#0f172a', wordBreak: 'break-word', fontSize: '13px', fontWeight: 500 }}>
        {isLinkField ? (
          checking ? (
            <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>🔍 Checking...</span>
          ) : activeLinks.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {activeLinks.map((link, lIdx) => {
                const filename = link.split('/').pop();
                return (
                  <a key={lIdx} href={link} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '5px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, textDecoration: 'none', border: '1px solid #bfdbfe' }}>
                    📄 {filename}
                  </a>
                );
              })}
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>File not on disk</span>
          )
        ) : (
          value || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>N/A</span>
        )}
      </td>
    </tr>
  );
}

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
      border: `1px solid ${showInactive ? '#e2e8f0' : '#bfdbfe'}`,
      borderRadius: '10px', padding: '14px',
      background: showInactive ? '#fafafa' : 'white',
      display: 'flex', flexDirection: 'column', gap: '6px',
      transition: 'box-shadow 0.2s',
      boxShadow: showInactive ? 'none' : '0 2px 8px rgba(37,99,235,0.08)',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: showInactive ? '#94a3b8' : '#1e40af', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
        {item.label}
      </div>
      <div style={{ fontSize: '12px', color: showInactive ? '#94a3b8' : '#0f172a', fontWeight: showInactive ? 400 : 600, wordBreak: 'break-all' }}>
        {showInactive ? '— Not Available' : item.val}
      </div>
      {isDocumentCard && (
        checking ? (
          <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', marginTop: '4px' }}>🔍 Checking...</div>
        ) : activeLinks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
            {activeLinks.map((link, lIdx) => {
              const filename = link.split('/').pop();
              return (
                <a key={lIdx} href={link} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#2563eb', color: 'white', padding: '7px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>
                  📄 {filename}
                </a>
              );
            })}
          </div>
        ) : isNA ? (
          <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px' }}>⚠ Not available</div>
        ) : (
          <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', marginTop: '4px' }}>File not on disk</div>
        )
      )}
    </div>
  );
};

function ModalDetail({ project, onClose }) {
  const [activeTab, setActiveTab] = useState('primary');

  // ── Separate attrs into basic, docs, and details ──────────────────────────
  const attrs = project.customAttrs || {};

  const BASIC_KEYS = [
    'Reservation ID', 'GIS ID', 'Old Survey No_Hissa No', 'New Survey No_Hissa No',
    'Reservation Number', 'RESERVATIO', 'Reservation Name', 'BUILDING N',
    'Village Name', 'VILLAGE_NA', 'DRC NO', 'LAND ACQUIRED STATUS', 'MBMC 7_12',
    '2019_FORMAT_CZMP_AFFECTED_AREA', 'ENCROACHMENT_STATUS',
    'ENCROACHMENT_PHOTOS', 'COMMENT', 'AREA (SQM)', 'Plot Area',
    'WIDTH (SQM', 'LENGTH (SQ', 'BUILDING I', 'Text',
  ];

  const docEntries = Object.entries(attrs).filter(([k, v]) =>
    typeof v === 'string' && (v.startsWith('/files/') || v.includes('\\') || v.includes('.pdf'))
  );

  const detailEntries = Object.entries(attrs).filter(([k, v]) => {
    const isDoc = typeof v === 'string' && (v.startsWith('/files/') || v.includes('\\') || v.includes('.pdf'));
    const isBasic = BASIC_KEYS.includes(k);
    const isSystem = ['id', 'name', 'road_name', 'road_no', 'ward', 'project_name', 'project_type', 'status', 'description', 'custom_attributes', 'coordinates', 'geom_type', 'type', 'budget', 'area', 'parsedPropertyName', 'parsedSurveyNo', 'parsedAddress', 'parsedSize', 'parsedStatus', 'ownershipStatus', 'customAttrs', 'tenant_name'].includes(k);
    return !isDoc && !isBasic && !isSystem;
  });

  // Payment records for this property
  const resNo = String(attrs['Reservation Number'] || attrs['RESERVATIO'] || '').replace(/[^0-9A-Za-z]/g, '');
  const propPayments = RAW_PAYMENTS.filter(p =>
    String(p.reservation_no).replace(/[^0-9A-Za-z]/g, '') === resNo ||
    p.gis_id === project.id
  );

  const STATUS_PAY = {
    paid:         { label: 'Paid',         bg: '#dcfce7', color: '#15803d' },
    pending:      { label: 'Pending',      bg: '#fffbeb', color: '#b45309' },
    about_to_due: { label: 'About to Due', bg: '#fef3c7', color: '#d97706' },
    expired:      { label: 'Overdue',      bg: '#fef2f2', color: '#dc2626' },
  };

  const title = project.parsedPropertyName || project.name || 'Property Details';
  const subtitle = `Res ${project.parsedSurveyNo} · ${project.parsedPropertyName} (${project.id || ''})`;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15,23,42,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'white', width: '100%', maxWidth: '1200px',
        maxHeight: '96vh', borderRadius: '16px', display: 'flex',
        flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
      }}>

        {/* ── Modal Header ─────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a5f, #163372)',
          padding: '18px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>
              🏛️ Attribute Details
            </div>
            <h3 style={{ margin: 0, color: 'white', fontSize: '18px', fontWeight: 900, letterSpacing: '-0.3px' }}>{title}</h3>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: '3px', fontFamily: 'monospace' }}>{subtitle}</div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', width: '34px', height: '34px', cursor: 'pointer',
            color: 'white', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>✕</button>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e8edf2', background: 'white', padding: '0 24px' }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: '13px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: 700,
              color: activeTab === tab.key ? '#2563eb' : '#64748b',
              borderBottom: activeTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: '-2px', transition: 'all 0.2s', whiteSpace: 'nowrap',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab Content ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#f4f6f9', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* ── PRIMARY DETAILS tab ──────────────────────────────── */}
          {activeTab === 'primary' && (
            <>
              {/* MBMC Reservation Attributes */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '14px 20px', background: '#fffbeb', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px' }}>📌</span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    {project.type?.includes('RESERV') ? 'MBMC Reservation Attributes' : 'Basic Fields'}
                  </span>
                </div>
                {/* 2-column grid table — Photo 1 style */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['Reservation ID',            attrs['GIS ID'] || project.id],
                      ['Old Survey No / Hissa No',  attrs['Old Survey No_Hissa No']],
                      ['New Survey No / Hissa No',  attrs['New Survey No_Hissa No']],
                      ['Reservation Number',         attrs['Reservation Number'] || attrs['RESERVATIO']],
                      ['DRC No.',                    attrs['DRC NO']],
                      ['Reservation Name',           attrs['Reservation Name'] || attrs['BUILDING N'] || project.parsedPropertyName],
                      ['Village Name',               project.parsedAddress],
                      ['Land Acquired Status',       attrs['LAND ACQUIRED STATUS'] || project.parsedStatus],
                      ['MBMC 7/12',                  attrs['MBMC 7_12']],
                      ['CZMP Affected Area (2019)',   attrs['2019_FORMAT_CZMP_AFFECTED_AREA']],
                      ['Encroachment Status',        attrs['ENCROACHMENT_STATUS']],
                      ['Encroachment Photo',         attrs['ENCROACHMENT_PHOTOS']],
                      ['Comment',                    attrs['COMMENT']],
                    ].reduce((rows, item, idx) => {
                      if (idx % 2 === 0) rows.push([item]);
                      else rows[rows.length - 1].push(item);
                      return rows;
                    }, []).map((pair, ri) => (
                      <tr key={ri} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {pair.map(([label, val], ci) => {
                          const displayVal = val && typeof val === 'object' ? JSON.stringify(val) : val;
                          const isFile = typeof displayVal === 'string' && (displayVal.startsWith('/files/') || displayVal.includes('.pdf'));
                          return (
                            <React.Fragment key={ci}>
                              <td style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', width: '22%', fontSize: '13px', background: '#fafafa', verticalAlign: 'top', borderRight: '1px solid #f1f5f9' }}>
                                {label}
                              </td>
                              <td style={{ padding: '12px 16px', color: '#0f172a', fontSize: '13px', fontWeight: 600, width: '28%', borderRight: ci === 0 ? '1px solid #e8edf2' : 'none', verticalAlign: 'top' }}>
                                {isFile
                                  ? <a href={displayVal} target="_blank" rel="noopener noreferrer"
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, textDecoration: 'none', border: '1px solid #bfdbfe' }}>
                                      📄 Open File
                                    </a>
                                  : (displayVal || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>N/A</span>)
                                }
                              </td>
                            </React.Fragment>
                          );
                        })}
                        {pair.length === 1 && (
                          <>
                            <td style={{ background: '#fafafa', borderRight: '1px solid #f1f5f9' }} />
                            <td />
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* + Add Field button */}
                <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', textAlign: 'right' }}>
                  <button style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                    + Add Field
                  </button>
                </div>
              </div>

              {/* Additional detail attributes (non-basic, non-doc) */}
              {detailEntries.length > 0 && (
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ padding: '14px 20px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📐</span>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Additional Attributes</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <tbody>
                      {detailEntries.slice(0, 20).map(([key, val], idx) => {
                        const displayVal = val && typeof val === 'object' ? JSON.stringify(val) : val;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 ? '#fafafa' : 'white' }}>
                            <td style={{ padding: '10px 16px', fontWeight: 700, color: '#475569', width: '35%' }}>{key}</td>
                            <td style={{ padding: '10px 16px', color: '#0f172a', fontWeight: 500 }}>
                              {displayVal || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>N/A</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── DOCUMENTS tab ────────────────────────────────────── */}
          {activeTab === 'documents' && (() => {
            const cards = getDocumentCards(attrs);

            return (
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '14px 20px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🔗</span>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Linked Documents & Files</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', padding: '20px' }}>
                  {cards.map((item, idx) => (
                    <DocumentCard key={idx} item={item} />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── PAYMENT HISTORY tab ──────────────────────────────── */}
          {activeTab === 'payments' && (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ padding: '14px 20px', background: '#fdf4ff', borderBottom: '1px solid #e9d5ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>💵</span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Payment History</span>
                </div>
                {propPayments.length > 0 && (
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>{propPayments.length} records</span>
                )}
              </div>
              {propPayments.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px', fontStyle: 'italic' }}>
                  No payment records found for this property.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead style={{ background: '#f8fafc' }}>
                      <tr>
                        {['Invoice No.', 'Year', 'Due Date', 'Paid Date', 'Amount', 'Mode', 'Status'].map(h => (
                          <th key={h} style={{ padding: '12px 14px', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700, whiteSpace: 'nowrap', textAlign: h === 'Amount' ? 'right' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {propPayments.map((pay, idx) => {
                        const sc = STATUS_PAY[pay.status] || STATUS_PAY.pending;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 ? '#fafafa' : 'white' }}>
                            <td style={{ padding: '11px 14px', fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>{pay.invoice_id}</td>
                            <td style={{ padding: '11px 14px', color: '#475569' }}>{pay.year}</td>
                            <td style={{ padding: '11px 14px', color: '#475569' }}>{pay.due_date}</td>
                            <td style={{ padding: '11px 14px', color: '#475569' }}>{pay.paid_date || '—'}</td>
                            <td style={{ padding: '11px 14px', color: '#0f172a', fontWeight: 700, textAlign: 'right' }}>
                              ₹{pay.annual_amount.toLocaleString('en-IN')}
                            </td>
                            <td style={{ padding: '11px 14px', color: '#64748b' }}>{pay.payment_mode || '—'}</td>
                            <td style={{ padding: '11px 14px' }}>
                              <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: sc.bg, color: sc.color }}>
                                {sc.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── Footer action buttons ─────────────────────────────────── */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e8edf2', background: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              🗑 Delete
            </button>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              ✏️ Edit
            </button>
            <button 
              onClick={async () => {
                const attrs = selectedProject.customAttrs || {};
                
                // Map standard properties
                const baseRows = [
                  ['Attribute Name', 'Value'],
                  ['Property ID', selectedProject.id || ''],
                  ['Property Name', selectedProject.parsedPropertyName || ''],
                  ['Survey No', selectedProject.parsedSurveyNo || ''],
                  ['Address/Village', selectedProject.parsedAddress || ''],
                  ['Acquisition Status', selectedProject.parsedStatus || ''],
                  ['Ownership Status', selectedProject.ownershipStatus || ''],
                  ['Size (SQM)', selectedProject.parsedSize || ''],
                  ['Ward', selectedProject.ward || ''],
                ];
                
                // Resolve custom attribute values in parallel
                const customPairs = Object.entries(attrs);
                const resolvedCustomPairs = await Promise.all(customPairs.map(async ([k, v]) => {
                  let val = typeof v === 'object' ? JSON.stringify(v) : String(v);
                  val = await checkAndResolveLinkStringAsync(val);
                  return [k, val];
                }));
                
                const rows = [
                  ...baseRows,
                  ...resolvedCustomPairs
                ];
                
                const propPayments = RAW_PAYMENTS.filter(pay => pay.gis_id === selectedProject.id);
                if (propPayments.length > 0) {
                  rows.push([]);
                  rows.push(['--- PAYMENT HISTORY ---']);
                  rows.push(['Due Date', 'Paid Date', 'Paid Amount', 'Penalty', 'Status']);
                  propPayments.forEach(p => {
                    rows.push([p.due_date || '', p.paid_date || '', p.paid_amount || '', p.penalty || '', p.status || '']);
                  });
                }

                const csvContent = rows.map(r => r.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
                const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Property_${selectedProject.id || 'Details'}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              style={{ padding: '8px 16px', borderRadius: '8px', background: '#2563eb', color: 'white', border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
            >
              📤 Export to Excel
            </button>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', background: '#0f172a', color: 'white', border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ImmovableProperty Component ─────────────────────────────────────────
const ImmovableProperty = ({ userInfo }) => {
  const [projects, setProjects]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchProjects();

      // village lookup from MBMC-RESERVSTION features
      const villageMap = {};
      (data || []).forEach(p => {
        if (p.type === 'MBMC-RESERVSTION') {
          try {
            const attrs = p.custom_attributes ? (typeof p.custom_attributes === 'string' ? JSON.parse(p.custom_attributes) : p.custom_attributes) : {};
            const resNum = attrs['Reservation Number'] || attrs['RESERVATIO'] || '';
            const village = attrs['Village Name'] || attrs['VILLAGE_NA'] || '';
            if (resNum && village) villageMap[String(resNum).split('_')[0].trim()] = village;
          } catch(e){}
        }
      });

      const properties = (data || [])
        .filter(p => ['MBMC-RESERVSTION', 'BUILDING_INFO', 'building_info', 'VVCM_OFFICE_BUILDING'].includes(p.type))
        .map(p => {
          let attrs = {};
          if (p.custom_attributes) {
            try { attrs = typeof p.custom_attributes === 'string' ? JSON.parse(p.custom_attributes) : p.custom_attributes; } catch(e){}
          }
          const propertyName = attrs['Reservation Name'] || attrs['BUILDING N'] || p.name || 'N/A';
          const surveyNo     = attrs['Old Survey No_Hissa No'] || attrs['RESERVATIO'] || p.road_no || 'N/A';
          let address        = attrs['Village Name'] || attrs['VILLAGE_NA'] || '';
          if (!address && (p.type === 'BUILDING_INFO' || p.type === 'building_info')) {
            const resNum = attrs['RESERVATIO'] || attrs['Reservation Number'] || '';
            if (resNum) address = villageMap[String(resNum).split('_')[0].trim()] || '';
          }
          if (!address && p.ward && p.ward !== 'Manual Upload') address = p.ward;
          if (!address) address = 'N/A';
          const size = attrs['Plot Area'] || attrs['AREA (SQM)'] || p.area || 'N/A';
          const status = attrs['LAND ACQUIRED STATUS'] || p.status || 'N/A';
          const isAcquired = status.toUpperCase().includes('ACQUIRED') && !status.toUpperCase().includes('NOT');
          const hasTenant = !!(attrs['Tenant Name'] || p.tenant_name);
          let ownershipStatus = 'Not Owned';
          if (['BUILDING_INFO','building_info','VVCM_OFFICE_BUILDING'].includes(p.type)) ownershipStatus = 'Owned but not rented';
          else if (isAcquired) ownershipStatus = hasTenant ? 'Owned & Rented' : 'Owned but not rented';
          return { ...p, customAttrs: attrs, parsedPropertyName: propertyName, parsedSurveyNo: surveyNo, parsedAddress: address, parsedSize: size, parsedStatus: status, ownershipStatus };
        });
      setProjects(properties);
    } catch(e) {
      console.error('Failed to fetch immovable properties', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>🏢 Immovable Properties</h2>
          <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>{projects.length} Records</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                {['Survey No.','Property Name','Address','Size','Status','Ownership / Rented','Action'].map(h => (
                  <th key={h} style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading properties...</td></tr>
              ) : projects.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No immovable properties found.</td></tr>
              ) : (
                projects.map((p, i) => (
                  <tr key={p.id || i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#f8fafc' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#f8fafc'}
                  >
                    <td style={{ padding: '12px 20px', color: '#0f172a', fontWeight: 500 }}>{p.parsedSurveyNo}</td>
                    <td style={{ padding: '12px 20px', color: '#0f172a', fontWeight: 600 }}>{p.parsedPropertyName}</td>
                    <td style={{ padding: '12px 20px', color: '#475569' }}>{p.parsedAddress}</td>
                    <td style={{ padding: '12px 20px', color: '#475569' }}>{p.parsedSize}</td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: p.parsedStatus.includes('NOT') ? '#fee2e2' : '#dcfce7', color: p.parsedStatus.includes('NOT') ? '#991b1b' : '#166534' }}>
                        {p.parsedStatus.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: p.ownershipStatus.includes('Rented') ? '#dbeafe' : p.ownershipStatus.includes('Owned') ? '#fef3c7' : '#f1f5f9', color: p.ownershipStatus.includes('Rented') ? '#1e40af' : p.ownershipStatus.includes('Owned') ? '#92400e' : '#475569' }}>
                        {p.ownershipStatus}
                      </span>
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                      <button onClick={() => setSelectedProject(p)} style={{ background: '#1a73e8', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                        👁 View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProject && <ModalDetail project={selectedProject} onClose={() => setSelectedProject(null)} />}
    </div>
  );
};

export default ImmovableProperty;
