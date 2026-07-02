import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import { savePropertySurvey, fetchPropertySurveys, registerTenant, fetchRegisteredTenants, fetchAllRegisteredTenants } from '../api';
import RAW_DATA     from '../data/property_records_data.json';
import MBMC_STATS   from '../data/mbmc_stats.json';
import DETAIL_DATA  from '../data/property_detail_data.json';
import PAYMENT_DATA from '../data/payment_data.json';

// Build a quick lookup map: GIS_ID -> detail record
const DETAIL_MAP = {};
DETAIL_DATA.forEach(d => { DETAIL_MAP[d.id] = d; });

// ── Status mapping ────────────────────────────────────────────────────────
const getStatus = (p) => {
  const ls  = (p.landStatus   || '').toUpperCase();
  const enc = (p.encroachment || '').toUpperCase();
  if (ls  === 'ACQUIRED')            return 'Acquired';
  if (enc === 'ENCROACHMENT')        return 'Encroachment';
  if (ls  === 'PARTIALLY_ACQUIRED')  return 'Partial';
  return 'Not Acquired';
};

const STATUS_STYLE = {
  'Acquired':     { bg: '#dcfce7', color: '#166534' },
  'Not Acquired': { bg: '#fef9c3', color: '#854d0e' },
  'Encroachment': { bg: '#fee2e2', color: '#991b1b' },
  'Partial':      { bg: '#eff6ff', color: '#1e40af' },
};

const ALL_PROPERTIES = RAW_DATA.map(p => ({ ...p, status: getStatus(p) }));
const VILLAGES = ['All', ...Array.from(new Set(ALL_PROPERTIES.map(p => p.village).filter(Boolean))).sort()];
const STATUSES  = ['All', 'Acquired', 'Not Acquired', 'Encroachment', 'Partial'];
const PAGE_SIZE = 50;

// ══════════════════════════════════════════════════════════════════════════
// SUB PAGE: SURVEY  — Real MBMC data from MASTER EXCEL.csv
// ══════════════════════════════════════════════════════════════════════════
function SurveyPage({ userInfo, setSubPage }) {
  const [activeType, setActiveType] = useState('Corporation Owned & Rented');
  const [selVillage, setSelVillage] = useState('');
  const [selRecord, setSelRecord] = useState(null);

  // Form Fields states initialized to blank for completely empty forms
  const [propertyType, setPropertyType] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [plotArea, setPlotArea] = useState('');
  const [constructedArea, setConstructedArea] = useState('');
  const [carpetArea, setCarpetArea] = useState('');
  const [existingUsage, setExistingUsage] = useState('');
  const [address, setAddress] = useState('');
  const [geoLocation, setGeoLocation] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [contact, setContact] = useState('');
  const [rentalPeriod, setRentalPeriod] = useState('');
  const [documents, setDocuments] = useState('');

  // API Action message state
  const [actionMsg, setActionMsg] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Leaflet map hooks for drawing polyline/polygon boundary
  const surveyMapContainerRef = useRef(null);
  const surveyMapInstanceRef = useRef(null);
  const drawnItemsRef = useRef(null);

  useEffect(() => {
    if (!surveyMapContainerRef.current || surveyMapInstanceRef.current) return;

    // Centered at Mira-Bhayandar region
    const map = L.map(surveyMapContainerRef.current).setView([19.2905, 72.8631], 14);
    surveyMapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    drawnItemsRef.current = drawnItems;
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: false,
          shapeOptions: {
            color: '#1a73e8',
            fillOpacity: 0.3,
            weight: 3
          }
        },
        rectangle: false,
        circle: false,
        marker: false,
        polyline: false,
        circlemarker: false
      },
      edit: {
        featureGroup: drawnItems,
        remove: true
      }
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (e) => {
      const { layer } = e;
      drawnItems.clearLayers();
      drawnItems.addLayer(layer);
      
      const latlngs = layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
      setGeoLocation(JSON.stringify(latlngs));
    });

    map.on(L.Draw.Event.EDITED, (e) => {
      e.layers.eachLayer((layer) => {
        const latlngs = layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
        setGeoLocation(JSON.stringify(latlngs));
      });
    });

    map.on(L.Draw.Event.DELETED, () => {
      setGeoLocation('');
    });

    return () => {
      if (surveyMapInstanceRef.current) {
        surveyMapInstanceRef.current.remove();
        surveyMapInstanceRef.current = null;
      }
    };
  }, []);

  // Sync state changes back to map layers (e.g. if loaded/reset)
  useEffect(() => {
    const map = surveyMapInstanceRef.current;
    const drawnItems = drawnItemsRef.current;
    if (!map || !drawnItems) return;

    if (geoLocation) {
      try {
        const coords = typeof geoLocation === 'string' ? JSON.parse(geoLocation) : geoLocation;
        if (Array.isArray(coords) && coords.length > 0) {
          const existingLayers = drawnItems.getLayers();
          if (existingLayers.length === 0) {
            const polygon = L.polygon(coords, {
              color: '#1a73e8',
              fillOpacity: 0.3,
              weight: 3
            });
            drawnItems.addLayer(polygon);
            map.fitBounds(polygon.getBounds());
          }
        }
      } catch (e) {
        // Normal text coordinates fallback
      }
    } else {
      drawnItems.clearLayers();
    }
  }, [geoLocation]);

  // Real data from MBMC file
  const villages = MBMC_STATS.uniqueVillages;
  const samples = MBMC_STATS.sampleRecords;

  // Filter sample records by selected village
  const filteredSamples = selVillage
    ? MBMC_STATS.sampleRecords.filter(r => r.village === selVillage)
    : MBMC_STATS.sampleRecords;

  // When picker record is selected, auto-populate the form
  const handleRecordSelect = (rec) => {
    setSelRecord(rec);
    if (rec) {
      setPropertyId(rec.gisId || '');
      setAddress(`Survey ${rec.surveyNo || ''}, ${rec.village || ''}, Mira-Bhayandar`);
      if (rec.landStatus) {
        setPropertyType(rec.landStatus === 'ACQUIRED' ? 'Corporation Owned & Rented' : 'Owned but Not Rented');
      }
    } else {
      setAddress('');
      setPropertyType('Corporation Owned & Rented');
      setPlotArea('');
      setConstructedArea('');
      setCarpetArea('');
      setExistingUsage('');
      setGeoLocation('');
      setTenantName('');
      setContact('');
      setRentalPeriod('');
      setDocuments('');
    }
  };

  // Action helper to call savePropertySurvey API
  const handleSaveSurvey = async (statusType) => {
    setIsSaving(true);
    setActionMsg({ type: 'info', text: `Sending ${statusType} to backend...` });
    try {
      const data = {
        property_id: propertyId,
        category: activeType,
        property_type: propertyType,
        plot_area: plotArea,
        constructed_area: constructedArea,
        carpet_area: carpetArea,
        existing_usage: existingUsage,
        address: address,
        geo_location: geoLocation,
        tenant_name: tenantName,
        contact: contact,
        rental_period: rentalPeriod,
        documents: documents,
        status: statusType
      };

      const res = await savePropertySurvey(data);
      setActionMsg({
        type: 'success',
        text: `Success: ${res?.message?.message || `Property ${statusType.toLowerCase()} saved in DocType successfully!`}`
      });
      // Redirect back to list view after a short delay
      if (setSubPage) {
        setTimeout(() => setSubPage('records'), 2000);
      }
      setTimeout(() => setActionMsg(null), 5000);
    } catch (err) {
      console.error(err);
      setActionMsg({
        type: 'error',
        text: `Failed: ${err.message || 'API request failed'}`
      });
      setTimeout(() => setActionMsg(null), 6000);
    } finally {
      setIsSaving(false);
    }
  };

  // Dynamically mark checklist items as done when corresponding values are filled
  const checklist = [
    { label: 'Property Type',              done: !!propertyType.trim() },
    { label: 'Plot Area',                  done: !!plotArea.trim() },
    { label: 'Constructed Area',           done: !!constructedArea.trim() },
    { label: 'Carpet Area',                done: !!carpetArea.trim() },
    { label: 'Existing Usage',             done: !!existingUsage.trim() },
    { label: 'Address',                    done: !!address.trim() },
    { label: 'Geo Location',               done: !!geoLocation.trim() },
    { label: 'Tenant Name',                done: !!tenantName.trim() },
    { label: 'Contact',                    done: !!contact.trim() },
    { label: 'Rental Period',              done: !!rentalPeriod.trim() },
    { label: 'Documents',                  done: !!documents },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f4f6f9', position: 'relative' }}>
      {/* Action Notification Toast */}
      {actionMsg && (
        <div style={{
          position: 'absolute', top: '16px', right: '24px', zIndex: 9999,
          padding: '12px 20px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
          background: actionMsg.type === 'success' ? '#dcfce7' : actionMsg.type === 'error' ? '#fee2e2' : '#eff6ff',
          border: `1.5px solid ${actionMsg.type === 'success' ? '#86efac' : actionMsg.type === 'error' ? '#fca5a5' : '#bfdbfe'}`,
          color: actionMsg.type === 'success' ? '#166534' : actionMsg.type === 'error' ? '#991b1b' : '#1e40af',
          fontSize: '13px', fontWeight: 750, transition: 'all 0.3s ease'
        }}>
          <span>{actionMsg.type === 'success' ? '✅' : actionMsg.type === 'error' ? '❌' : 'ℹ️'}</span>
          <span>{actionMsg.text}</span>
        </div>
      )}

      {/* Top bar */}
      <div style={{ padding: '16px 24px', background: 'white', borderBottom: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Property Survey Capture</h2>
          <p style={{ margin: '4px 0 8px', fontSize: '12px', color: '#64748b' }}>Visit all properties and capture details · MBMC Reservation Data</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {['Corporation Owned & Rented', 'Owned but Not Rented'].map(t => (
              <button key={t} onClick={() => { setActiveType(t); setPropertyType(t); }} style={{ padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '12px', background: activeType === t ? '#1a73e8' : '#e2e8f0', color: activeType === t ? 'white' : '#475569' }}>{t}</button>
            ))}
            <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>📂 Source: MASTER EXCEL.csv · {MBMC_STATS.total.toLocaleString()} records</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
          <button
            onClick={() => {
              setPropertyType('Corporation Owned & Rented');
                      setPlotArea('');
              setConstructedArea('');
              setCarpetArea('');
              setExistingUsage('');
              setAddress('');
              setGeoLocation('');
              setTenantName('');
              setContact('');
              setRentalPeriod('');
              setDocuments('');
              setSelRecord(null);
              setActionMsg({ type: 'info', text: 'Ready to add new property. Form cleared!' });
              setTimeout(() => setActionMsg(null), 3000);
            }}
            style={{ padding: '9px 18px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }}
          >
            Clear Form
          </button>
          <button
            onClick={() => handleRecordSelect(null)}
            style={{ padding: '9px 18px', background: 'white', border: '1.5px solid #cbd5e1', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#1e293b' }}
          >
            Add Property
          </button>
          <button
            onClick={() => handleSaveSurvey('Submitted')}
            disabled={isSaving}
            style={{ padding: '9px 18px', background: 'linear-gradient(135deg, #1a73e8, #1d4ed8)', color: 'white', border: 'none', borderRadius: '9px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '13px', boxShadow: '0 2px 8px rgba(26,115,232,0.3)' }}
          >
            {isSaving ? 'Saving...' : 'Save Property'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', gap: '18px', alignItems: 'flex-start' }}>

        {/* Left: Checklist */}
        <div style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Checklist */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Survey Checklist</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {checklist.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', background: item.done ? '#f0fdf4' : '#f8fafc' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: item.done ? '#22c55e' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {item.done && <span style={{ color: 'white', fontSize: '11px', fontWeight: 900 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: item.done ? '#166534' : '#94a3b8' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Forms */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Property Information */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Property Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase' }}>Property Type</label>
                <select value={propertyType} onChange={e => setPropertyType(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white', cursor: 'pointer' }}
                >
                  <option value="">Select Property Type</option>
                  <option value="Commercial Shop">Commercial Shop</option>
                  <option value="Residential Flat">Residential Flat</option>
                  <option value="Open Land">Open Land</option>
                  <option value="Commercial Office">Commercial Office</option>
                  <option value="Industrial Shed">Industrial Shed</option>
                  <option value="Residential Bungalow">Residential Bungalow</option>
                  <option value="Corporation Owned & Rented">Corporation Owned & Rented</option>
                  <option value="Owned but Not Rented">Owned but Not Rented</option>
                  <option value="Test Property">Test Property</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase' }}>Plot Area</label>
                <input type="text" value={plotArea} onChange={e => setPlotArea(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white' }}
                  placeholder="Enter plot area"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase' }}>Constructed Area</label>
                <input type="text" value={constructedArea} onChange={e => setConstructedArea(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white' }}
                  placeholder="Enter constructed area"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase' }}>Carpet Area</label>
                <input type="text" value={carpetArea} onChange={e => setCarpetArea(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white' }}
                  placeholder="Enter carpet area"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase' }}>Existing Usage</label>
                <select value={existingUsage} onChange={e => setExistingUsage(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white', cursor: 'pointer' }}>
                  <option value="">Select Existing Usage</option>
                  <option value="Commercial Shop">Commercial Shop</option>
                  <option value="Residential">Residential</option>
                  <option value="Godown / Warehouse">Godown / Warehouse</option>
                  <option value="Grocery Store">Grocery Store</option>
                  <option value="Medical Clinic">Medical Clinic</option>
                  <option value="Small Manufacturing Unit">Small Manufacturing Unit</option>
                  <option value="Pharmacy">Pharmacy</option>
                  <option value="Restaurant / Food Stall">Restaurant / Food Stall</option>
                  <option value="Office">Office</option>
                  <option value="Vacant / Unused">Vacant / Unused</option>
                  <option value="School / Educational">School / Educational</option>
                  <option value="Bank / ATM">Bank / ATM</option>
                  <option value="Gym / Fitness Center">Gym / Fitness Center</option>
                  <option value="Disputed / Encroached">Disputed / Encroached</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase' }}>Address</label>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white' }}
                  placeholder="Enter address"
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase' }}>Geo Location (Draw Property Boundary on Map)</label>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                  <div style={{ flex: 1, padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', background: '#f8fafc', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>📍</span>
                    <span>
                      {geoLocation ? (() => {
                        try {
                          const pts = JSON.parse(geoLocation);
                          return `Boundary drawn successfully with ${pts.length} coordinates.`;
                        } catch(e) {
                          return `Coordinates: ${geoLocation}`;
                        }
                      })() : "No location drawn yet. Use the Polygon drawing tool on the map to define the property."}
                    </span>
                  </div>
                  {geoLocation && (
                    <button
                      type="button"
                      onClick={() => {
                        setGeoLocation('');
                        if (drawnItemsRef.current) {
                          drawnItemsRef.current.clearLayers();
                        }
                      }}
                      style={{ padding: '8px 14px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      🗑️ Clear boundary
                    </button>
                  )}
                </div>
                <div 
                  ref={surveyMapContainerRef} 
                  style={{ 
                    height: '280px', 
                    width: '100%', 
                    borderRadius: '10px', 
                    border: '1.5px solid #cbd5e1', 
                    overflow: 'hidden', 
                    zIndex: 1, 
                    position: 'relative' 
                  }} 
                />
              </div>

            </div>
          </div>

          {/* Property User Details */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Property User Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase' }}>Tenant Name</label>
                <input type="text" value={tenantName} onChange={e => setTenantName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white' }}
                  placeholder="Enter tenant name"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase' }}>Contact</label>
                <input type="text" value={contact} onChange={e => setContact(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white' }}
                  placeholder="Enter contact number"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase' }}>Rental Period</label>
                <input type="text" value={rentalPeriod} onChange={e => setRentalPeriod(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white' }}
                  placeholder="Enter rental period (e.g., 01 Apr 2026 - 31 Mar 2027)"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase' }}>Documents</label>
                <input type="file" onChange={e => setDocuments(e.target.files[0]?.name || '')}
                  style={{ width: '100%', padding: '6px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white', cursor: 'pointer' }}
                />
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SUB PAGE: BILLING
// ══════════════════════════════════════════════════════════════════════════
function BillingPage() {
  const bills = [
    { id: 'BILL-2026-082', propId: 'PROP-0082', occupant: 'Shree Medical', status: 'Paid',    demand: 120000 },
    { id: 'BILL-2026-103', propId: 'PROP-0145', occupant: 'Raj Traders',   status: 'Pending', demand: 84000  },
    { id: 'BILL-2026-128', propId: 'PROP-0268', occupant: 'Vacant Shop',   status: 'No Bill', demand: 0      },
    { id: 'BILL-2026-149', propId: 'PROP-0309', occupant: 'Sai Foods',     status: 'Partial', demand: 42000  },
  ];
  const BS = { Paid: { bg: '#dcfce7', c: '#166534' }, Pending: { bg: '#fef9c3', c: '#854d0e' }, 'No Bill': { bg: '#f1f5f9', c: '#64748b' }, Partial: { bg: '#eff6ff', c: '#1e40af' } };
  const fmtCr = n => `INR ${(n / 10000000).toFixed(1)} Cr`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f4f6f9' }}>
      {/* Header */}
      <div style={{ padding: '18px 28px', background: 'white', borderBottom: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Bill Generation & Payment Collection</h2>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>Generate yearly demand bills, collect payments online, track pending dues and payment history.</p>
        </div>
        <button style={{ padding: '9px 20px', background: 'linear-gradient(135deg, #1a73e8, #1d4ed8)', color: 'white', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(26,115,232,0.3)', flexShrink: 0 }}>
          Generate Yearly Demand
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* 3 cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          {/* Demand Generation */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>Demand Generation</div>
            {[{ l: 'Financial Year', v: '2026-27' }, { l: 'Billing Type', v: 'Yearly Demand Bill' }].map(f => (
              <div key={f.l} style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{f.l}</div>
                <div style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#1e293b', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{f.v}</span><span style={{ color: '#94a3b8', fontSize: '10px' }}>▾</span>
                </div>
              </div>
            ))}
          </div>

          {/* Payment Gateway */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>Payment Gateway</div>
            <div style={{ background: '#dcfce7', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 700, color: '#166534', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '8px' }}>●</span> Online Payments Enabled
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5, marginBottom: '14px' }}>UPI, Cards, Net Banking and receipt generation for tenant payments.</div>
            <button style={{ padding: '8px 16px', border: '1.5px solid #e2e8f0', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>Configure Gateway</button>
          </div>

          {/* Collection Snapshot */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>Collection Snapshot</div>
            {[
              { l: 'Demand',    v: fmtCr(84000000),  c: '#1e293b' },
              { l: 'Collected', v: fmtCr(59000000),  c: '#059669' },
              { l: 'Pending',   v: fmtCr(25000000),  c: '#f59e0b' },
            ].map(r => (
              <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>{r.l}</span>
                <span style={{ fontSize: '13px', fontWeight: 800, color: r.c }}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bills table */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Property Records</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Bill ID', 'Property ID', 'Occupant', 'Status', 'Demand'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontWeight: 800, color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bills.map((b, i) => {
                const bs = BS[b.status] || { bg: '#f1f5f9', c: '#64748b' };
                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1a73e8' }}>{b.id}</td>
                    <td style={{ padding: '12px 16px', color: '#475569', fontWeight: 600 }}>{b.propId}</td>
                    <td style={{ padding: '12px 16px', color: '#1e293b', fontWeight: 600 }}>{b.occupant}</td>
                    <td style={{ padding: '12px 16px' }}><span style={{ background: bs.bg, color: bs.c, fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '99px' }}>{b.status}</span></td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>INR {b.demand.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Payment Actions */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>Payment Actions</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {['Send Payment Link', 'Download Bill PDF', 'Record Offline Payment', 'Refund Deposit', 'Apply Penalty'].map((a, i) => (
              <button key={a} style={{ padding: '9px 18px', background: i === 0 ? 'linear-gradient(135deg, #1a73e8, #1d4ed8)' : 'white', color: i === 0 ? 'white' : '#1e293b', border: i === 0 ? 'none' : '1.5px solid #e2e8f0', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', boxShadow: i === 0 ? '0 2px 8px rgba(26,115,232,0.2)' : 'none' }}>{a}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SUB PAGE: REPORTS — Real MBMC data from MASTER EXCEL.csv
// ══════════════════════════════════════════════════════════════════════════
export function ReportsPage({ userInfo }) {
  const [surveys, setSurveys] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      // Load surveys
      try {
        const resSurveys = await fetchPropertySurveys();
        if (resSurveys && resSurveys.data) {
          setSurveys(resSurveys.data);
        }
      } catch (err) {
        console.error("Reports surveys API error:", err);
      }
      
      // Load tenants
      try {
        const resTenants = await fetchAllRegisteredTenants();
        if (resTenants) {
          setTenants(resTenants);
        }
      } catch (err) {
        console.error("Reports tenants API error:", err);
      }
      
      setLoading(false);
    };
    loadData();
  }, []);

  // Compute metrics from backend surveys
  const total = surveys.length;
  const rented = surveys.filter(s => s.category === 'Corporation Owned & Rented' || s.property_type === 'Corporation Owned & Rented').length;
  const notRented = surveys.filter(s => s.category === 'Owned but Not Rented' || s.property_type === 'Owned but Not Rented').length;
  const draft = surveys.filter(s => s.status === 'Draft').length;
  
  // Calculate area stats
  let totalPlot = 0;
  let totalCarpet = 0;
  let usageMap = {};
  
  surveys.forEach(s => {
    totalPlot += parseFloat(s.plot_area) || 0;
    totalCarpet += parseFloat(s.carpet_area) || 0;
    
    const usage = s.existing_usage || 'Unknown';
    usageMap[usage] = (usageMap[usage] || 0) + 1;
  });

  const usageEntries = Object.entries(usageMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  
  const alerts = [
    { text: `Rented Properties — ${rented} active tenants found`, bg: '#dcfce7', c: '#166534' },
    { text: `Vacant Properties — ${notRented} records without tenants`, bg: '#fef9c3', c: '#854d0e' },
    { text: `Draft Surveys — ${draft} surveys pending submission`, bg: '#fee2e2', c: '#991b1b' },
  ];

  const VCOLS = ['#1a73e8','#22c55e','#f59e0b','#8b5cf6','#f43f5e','#06b6d4'];

  const totalVal = total || 1;
  const pctRented = (rented / totalVal) * 100;
  const pctVacant = (notRented / totalVal) * 100;
  const pctDraft = (draft / totalVal) * 100;
  const pctOther = Math.max(0, 100 - pctRented - pctVacant - pctDraft);

  const circumference = 251.2;
  const strokeRented = (pctRented / 100) * circumference;
  const strokeVacant = (pctVacant / 100) * circumference;
  const strokeDraft = (pctDraft / 100) * circumference;
  const strokeOther = (pctOther / 100) * circumference;

  const offsetRented = 0;
  const offsetVacant = strokeRented;
  const offsetDraft = strokeRented + strokeVacant;
  const offsetOther = strokeRented + strokeVacant + strokeDraft;

  const handleExport = (reportName, format) => {
    let headers = [];
    let rows = [];

    if (reportName === 'All Property Surveys') {
      headers = ['Property ID', 'Type', 'Plot Area', 'Carpet Area', 'Usage', 'Tenant', 'Status'];
      rows = surveys.map(p => [
        p.name,
        p.property_type || '',
        p.plot_area || '',
        p.carpet_area || '',
        p.existing_usage || '',
        p.tenant_name || 'Vacant',
        p.status || ''
      ]);
    } else if (reportName === 'All Registered Tenants') {
      headers = ['Tenant ID', 'Tenant Name', 'Profession', 'Purpose of Use', 'Contact Information', 'Rental Period', 'Aadhar Number', 'GST Number', 'PAN Number', 'Rent Amount', 'Renewal Date', 'Property ID', 'Status'];
      rows = tenants.map(t => [
        t.name,
        t.tenant_name || '',
        t.profession || '',
        t.purpose_of_use || '',
        t.contact_information || '',
        t.rental_period || '',
        t.aadhar_number || '',
        t.gst_number || '',
        t.pan_card_number || '',
        t.rent_amount || '0',
        t.renewal_date || '',
        t.property_id || '',
        t.status || ''
      ]);
    } else if (reportName === 'Usage Breakdown') {
      headers = ['Usage Type', 'Count'];
      rows = usageEntries.map(e => [e[0], e[1]]);
    }

    if (format === 'CSV') {
      const csvContent = [
        headers.join(','), 
        ...rows.map(r => r.map(val => '"' + String(val).replace(/"/g, '""') + '"').join(','))
      ].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${reportName.replace(/ /g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f4f6f9' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', background: 'white', borderBottom: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Dynamic Survey Reports</h2>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>Real-time aggregated data from backend Property Surveys</p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        
        {loading ? (
           <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '14px', fontWeight: 600 }}>⏳ Loading Reports...</div>
        ) : (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { l: 'Total Surveys', v: total, c: '#0f172a', bg: 'white', ic: '📝' },
            { l: 'Total Plot Area', v: `${totalPlot.toFixed(1)} sqft`, c: '#1a73e8', bg: 'white', ic: '📐' },
            { l: 'Rented', v: rented, c: '#059669', bg: 'white', ic: '✅' },
            { l: 'Vacant', v: notRented, c: '#d97706', bg: 'white', ic: '⚠️' }
          ].map((s, i) => (
            <div key={i} style={{ background: s.bg, padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', borderLeft: `4px solid ${s.c}`, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{s.l}</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: s.c }}>{s.v}</div>
              </div>
              <div style={{ fontSize: '24px', background: s.c + '12', width: '42px', height: '42px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.ic}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          {/* Usage Breakdown */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Top Property Usage</span>
                <button onClick={() => handleExport('Usage Breakdown', 'CSV')} style={{ padding: '4px 10px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>Export CSV</button>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', minHeight: '110px' }}>
                {usageEntries.map(([usage, count], i) => {
                  const max = usageEntries[0]?.[1] || 1;
                  const h = (count / max) * 110;
                  return (
                    <div key={usage} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flex: '1 1 50px', minWidth: '55px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a' }}>{count}</div>
                      <div style={{ width: '28px', height: '110px', background: '#f1f5f9', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${h}px`, background: VCOLS[i%VCOLS.length], borderRadius: '4px' }}></div>
                      </div>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', textAlign: 'center', lineHeight: '1.2', height: '24px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={usage}>{usage}</div>
                    </div>
                  );
                })}
                {usageEntries.length === 0 && <div style={{ fontSize: '12px', color: '#64748b', width: '100%', textAlign: 'center' }}>No usage data available</div>}
              </div>
            </div>
          </div>

          {/* New Occupancy Donut Chart Card */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>Survey Occupancy</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {/* SVG Donut Chart */}
                <div style={{ position: 'relative', width: '110px', height: '110px', flexShrink: 0 }}>
                  <svg width="110" height="110" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                    {/* Background Circle */}
                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="10" />
                    {/* Segment Rented (Green) */}
                    {strokeRented > 0 && (
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="transparent"
                        stroke="#10b981"
                        strokeWidth="10"
                        strokeDasharray={`${strokeRented} ${circumference}`}
                        strokeDashoffset={-offsetRented}
                        strokeLinecap="round"
                      />
                    )}
                    {/* Segment Vacant (Orange) */}
                    {strokeVacant > 0 && (
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="transparent"
                        stroke="#f59e0b"
                        strokeWidth="10"
                        strokeDasharray={`${strokeVacant} ${circumference}`}
                        strokeDashoffset={-offsetVacant}
                        strokeLinecap="round"
                      />
                    )}
                    {/* Segment Draft (Slate) */}
                    {strokeDraft > 0 && (
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="transparent"
                        stroke="#64748b"
                        strokeWidth="10"
                        strokeDasharray={`${strokeDraft} ${circumference}`}
                        strokeDashoffset={-offsetDraft}
                        strokeLinecap="round"
                      />
                    )}
                    {/* Center Text */}
                    <circle cx="50" cy="50" r="30" fill="white" />
                  </svg>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{total}</span>
                    <span style={{ fontSize: '8px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginTop: '2px' }}>Surveys</span>
                  </div>
                </div>

                {/* Legend list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                  {[
                    { label: 'Rented', count: rented, pct: pctRented, color: '#10b981' },
                    { label: 'Vacant', count: notRented, pct: pctVacant, color: '#f59e0b' },
                    { label: 'Draft', count: draft, pct: pctDraft, color: '#64748b' }
                  ].map(leg => (
                    <div key={leg.label} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: leg.color, display: 'inline-block' }}></span>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{leg.label}</span>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#0f172a', marginLeft: '14px' }}>
                        {leg.count} ({leg.pct.toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Survey Insights */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>Survey Insights</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {alerts.map((a, i) => (
                  <div key={i} style={{ background: a.bg, color: a.c, padding: '10px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', border: `1px solid ${a.c}20` }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: a.c, flexShrink: 0 }}></div>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Data Exports */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Available Exports</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <tbody>
              {['All Property Surveys', 'All Registered Tenants'].map((rep, i) => (
                <tr key={rep} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '16px 20px', fontWeight: 600, color: '#1e293b' }}>{rep}</td>
                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                    <button onClick={() => handleExport(rep, 'CSV')} style={{ padding: '6px 16px', background: '#eff6ff', color: '#1d4ed8', border: 'none', borderRadius: '20px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>Download CSV</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        </>
        )}
      </div>
    </div>
  );
}
function RecordsPage({ userInfo, onView, setSubPage }) {
  const [search,     setSearch]    = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [page,       setPage]      = useState(1);
  const [surveys,    setSurveys]   = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [propTypeFilter, setPropTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [minPlotArea, setMinPlotArea] = useState('');
  const [maxPlotArea, setMaxPlotArea] = useState('');
  const [occupantFilter, setOccupantFilter] = useState('All');
  const PAGE_SIZE = 10;

  useEffect(() => {
    const loadSurveys = async () => {
      try {
        setLoading(true);
        const res = await fetchPropertySurveys();
        if (res && res.data) {
          setSurveys(res.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadSurveys();
  }, []);

  const total    = surveys.length;
  const rented   = surveys.filter(s => s.category === 'Corporation Owned & Rented' || s.property_type === 'Corporation Owned & Rented').length;
  const notRented = surveys.filter(s => s.category === 'Owned but Not Rented' || s.property_type === 'Owned but Not Rented').length;
  const pending  = surveys.filter(s => s.status === 'Draft' || s.status === 'Pending').length;
  
  // Dynamic Demand vs Collection Calculations
  let calcDemand = 0;
  let calcCollected = 0;
  
  surveys.forEach(s => {
    const isCorpOwned = s.category === 'Corporation Owned & Rented' || s.property_type === 'Corporation Owned & Rented';
    if (isCorpOwned) {
      const demand = (parseFloat(s.carpet_area) || 1200) * 1000; // Mock: INR 1000 per sqft carpet area
      calcDemand += demand;
      if (s.status !== 'Draft' && s.status !== 'Pending') {
        calcCollected += demand;
      }
    }
  });

  const demandTotal = calcDemand;
  const colTotal = calcCollected;

  const stats = [
    { label: 'Total Properties', value: total,      color: '#64748b', bg: '#f8fafc', icon: '🏢' },
    { label: 'Rented',           value: rented,     color: '#059669', bg: '#ecfdf5', icon: '✅' },
    { label: 'Not Rented',       value: notRented,  color: '#d97706', bg: '#fffbeb', icon: '⚠️' },
    { label: 'Pending Survey',   value: pending,    color: '#dc2626', bg: '#fef2f2', icon: '📝' },
    { label: 'Yearly Demand',    value: `INR ${(demandTotal/10000000).toFixed(1)} Cr`, color: '#7c3aed', bg: '#f5f3ff', icon: '💰' },
    { label: 'Collection',       value: `INR ${(colTotal/10000000).toFixed(1)} Cr`,    color: '#059669', bg: '#ecfdf5', icon: '📈' },
  ];

  const types = ['All', 'Corporation Owned & Rented', 'Owned but Not Rented'];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return surveys.filter(p => {
      const pid = p.property_id || p.name || '';
      const tName = p.tenant_name || '';
      const address = p.address || '';
      const usage = p.existing_usage || '';
      
      const mQ = !q || 
        pid.toLowerCase().includes(q) || 
        tName.toLowerCase().includes(q) ||
        address.toLowerCase().includes(q) ||
        usage.toLowerCase().includes(q);
      
      const mT = typeFilter === 'All' || p.category === typeFilter;
      
      const propType = p.property_type || '';
      const mPropType = propTypeFilter === 'All' || propType === propTypeFilter;

      const pStatus = p.status || 'Draft';
      const mStatus = statusFilter === 'All' || pStatus === statusFilter;

      const occ = p.tenant_name || 'Vacant';
      const isRented = occ !== 'Vacant' && occ.trim() !== '';
      const mOccupant = occupantFilter === 'All' || 
        (occupantFilter === 'Rented' && isRented) ||
        (occupantFilter === 'Vacant' && !isRented);

      const plotArea = parseFloat(p.plot_area) || 0;
      const minA = minPlotArea ? parseFloat(minPlotArea) : null;
      const maxA = maxPlotArea ? parseFloat(maxPlotArea) : null;
      const mMinArea = minA === null || plotArea >= minA;
      const mMaxArea = maxA === null || plotArea <= maxA;

      return mQ && mT && mPropType && mStatus && mOccupant && mMinArea && mMaxArea;
    });
  }, [search, typeFilter, propTypeFilter, statusFilter, occupantFilter, minPlotArea, maxPlotArea, surveys]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hf = fn => { fn(); setPage(1); };

  const chartDemand = demandTotal;
  const chartCollected = colTotal;
  const chartPending = chartDemand - chartCollected;

  const occTotal = total || 100;
  const occRented = total > 0 ? rented : 55;
  const occVacant = total > 0 ? notRented : 31;
  const pctRented = Math.round((occRented / occTotal) * 100);
  const pctVacant = Math.round((occVacant / occTotal) * 100);
  const pctOther = 100 - pctRented - pctVacant;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f4f6f9' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        {/* Title row */}
        <div style={{ padding: '16px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Property Records Management</h1>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b', maxWidth: '500px' }}>
              Maintain digital records for corporation owned properties, rented properties, vacant properties, tenant history, billing and collection.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexShrink: 0 }}>
            <input 
              type="text" 
              placeholder="Search property, tenant, bill..." 
              value={search}
              onChange={e => hf(() => setSearch(e.target.value))}
              style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '99px', fontSize: '12px', width: '220px', outline: 'none' }}
            />
            <div style={{ background: '#fef3c7', color: '#d97706', fontWeight: 800, fontSize: '12px', padding: '6px 10px', borderRadius: '8px' }}>12</div>
            <div style={{ background: '#eff6ff', color: '#1d4ed8', fontWeight: 800, fontSize: '12px', padding: '6px 12px', borderRadius: '8px' }}>Property Officer</div>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'flex', gap: '12px', padding: '16px 24px', overflowX: 'auto' }}>
          {stats.map((s, i) => (
            <div key={i} style={{ flex: 1, minWidth: '130px', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>{s.icon}</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', lineHeight: 1.1 }}>{s.label.split(' ').map((l,j)=><div key={j}>{l}</div>)}</div>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button onClick={() => setSubPage && setSubPage('survey')} style={{ padding: '8px 18px', background: 'white', color: '#1e293b', border: '1.5px solid #cbd5e1', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}>Start Survey</button>
            <button onClick={() => setSubPage && setSubPage('survey')} style={{ padding: '8px 18px', background: 'linear-gradient(135deg, #1a73e8, #1d4ed8)', color: 'white', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', boxShadow: '0 2px 8px rgba(26,115,232,0.25)' }}>Add Property</button>
          </div>

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Geo Distribution */}
            <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>Property Geo Distribution</div>
              <div style={{ height: '220px', background: '#e0f2fe', borderRadius: '10px', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'absolute', top: '10px', left: '10px', fontSize: '11px', fontWeight: 700, color: '#0369a1' }}>VVCMC Property Map</div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', padding: '20px' }}>
                  {[1,2,3,4,5,6,7].map(i => (
                    <div key={i} style={{ width: '60px', height: '40px', background: i%2===0?'#bae6fd':'#fde68a', borderRadius: '6px', opacity: 0.8 }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Demand vs Collection */}
            <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '24px' }}>Demand vs Collection</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {[
                  { l: 'Demand',    v: chartDemand,    c: '#1a73e8' },
                  { l: 'Collected', v: chartCollected, c: '#22c55e' },
                  { l: 'Pending',   v: chartPending,   c: '#f59e0b' },
                ].map(bar => (
                  <div key={bar.l}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', width: '80px' }}>{bar.l}</span>
                      <div style={{ flex: 1, height: '14px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden', margin: '0 16px' }}>
                        <div style={{ height: '100%', width: `${(bar.v / chartDemand) * 100}%`, background: bar.c, borderRadius: '99px' }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', width: '70px', textAlign: 'right' }}>INR {(bar.v / 10000000).toFixed(1)} Cr</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: 'auto', paddingTop: '20px' }}>
                <span style={{ color: '#475569', fontSize: '11px', fontWeight: 700 }}>Occupancy</span>
                <span style={{ background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px' }}>{pctRented}% Rented</span>
                <span style={{ background: '#fef3c7', color: '#b45309', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px' }}>{pctVacant}% Vacant</span>
                <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px' }}>{pctOther}% Other</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Property Records</span>
            </div>

            {/* Filter Bar */}
            <div style={{
              background: '#f8fafc',
              padding: '12px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '12px',
              alignItems: 'center'
            }}>
              {/* Filter 1: Category */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Category</label>
                <select value={typeFilter} onChange={e => hf(() => setTypeFilter(e.target.value))}
                  style={{ width: '100%', padding: '6px 10px', border: '1.5px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', outline: 'none', background: 'white', cursor: 'pointer' }}>
                  {types.map(s => <option key={s} value={s}>{s === 'All' ? 'All Categories' : s}</option>)}
                </select>
              </div>

              {/* Filter 2: Property Type */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Property Type</label>
                <select value={propTypeFilter} onChange={e => hf(() => setPropTypeFilter(e.target.value))}
                  style={{ width: '100%', padding: '6px 10px', border: '1.5px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', outline: 'none', background: 'white', cursor: 'pointer' }}>
                  <option value="All">All Types</option>
                  <option value="Commercial Shop">Commercial Shop</option>
                  <option value="Residential Flat">Residential Flat</option>
                  <option value="Open Land">Open Land</option>
                  <option value="Commercial Office">Commercial Office</option>
                  <option value="Industrial Shed">Industrial Shed</option>
                  <option value="Residential Bungalow">Residential Bungalow</option>
                  <option value="Test Property">Test Property</option>
                </select>
              </div>

              {/* Filter 3: Occupancy Status */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Occupant Status</label>
                <select value={occupantFilter} onChange={e => hf(() => setOccupantFilter(e.target.value))}
                  style={{ width: '100%', padding: '6px 10px', border: '1.5px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', outline: 'none', background: 'white', cursor: 'pointer' }}>
                  <option value="All">All Statuses</option>
                  <option value="Rented">Rented (Active)</option>
                  <option value="Vacant">Vacant</option>
                </select>
              </div>

              {/* Filter 4: Survey Status */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Survey Status</label>
                <select value={statusFilter} onChange={e => hf(() => setStatusFilter(e.target.value))}
                  style={{ width: '100%', padding: '6px 10px', border: '1.5px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', outline: 'none', background: 'white', cursor: 'pointer' }}>
                  <option value="All">All</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Draft">Draft</option>
                </select>
              </div>

              {/* Filter 5: Min Plot Area */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Min Plot Area (sqft)</label>
                <input type="number" placeholder="Min Area" value={minPlotArea} onChange={e => hf(() => setMinPlotArea(e.target.value))}
                  style={{ width: '100%', padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', outline: 'none', background: 'white' }} />
              </div>

              {/* Filter 6: Max Plot Area */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Max Plot Area (sqft)</label>
                <input type="number" placeholder="Max Area" value={maxPlotArea} onChange={e => hf(() => setMaxPlotArea(e.target.value))}
                  style={{ width: '100%', padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', outline: 'none', background: 'white' }} />
              </div>

              {/* Reset Button */}
              <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
                <button
                  onClick={() => hf(() => {
                    setTypeFilter('All');
                    setPropTypeFilter('All');
                    setOccupantFilter('All');
                    setStatusFilter('All');
                    setMinPlotArea('');
                    setMaxPlotArea('');
                    setSearch('');
                  })}
                  style={{
                    width: '100%',
                    padding: '6px 12px',
                    background: 'white',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '6px',
                    color: '#64748b',
                    fontWeight: 700,
                    fontSize: '11px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.color = '#334155'; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#64748b'; }}
                >
                  🧹 Clear Filters
                </button>
              </div>
            </div>
            
            <div style={{ overflowX: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['Property ID', 'Type', 'Plot Area', 'Const. Area', 'Carpet Area', 'Usage', 'Occupant', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '11px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>⏳ Loading Property Surveys...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>🔍 No records found. Create a Survey to see it here.</td></tr>
                  ) : paginated.map((p, i) => {
                    const pid = p.property_id || p.name;
                    const type = p.property_type || '—';
                    const plotA = p.plot_area ? `${p.plot_area} sq.ft` : '—';
                    const constA = p.constructed_area ? `${p.constructed_area} sq.ft` : '—';
                    const carpetA = p.carpet_area ? `${p.carpet_area} sq.ft` : '—';
                    const usage = p.existing_usage || '—';
                    const occ = p.tenant_name || 'Vacant';
                    let status = 'Vacant';
                    if (occ !== 'Vacant') status = 'Active';
                    if (p.status === 'Draft' || p.status === 'Pending') status = 'Due';

                    return (
                      <tr key={pid} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                        onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1a73e8', whiteSpace: 'nowrap' }}>{pid}</td>
                        <td style={{ padding: '12px 16px', color: '#475569', fontWeight: 500, whiteSpace: 'nowrap' }}>{type}</td>
                        <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>{plotA}</td>
                        <td style={{ padding: '12px 16px', color: '#475569', fontWeight: 500, whiteSpace: 'nowrap' }}>{constA}</td>
                        <td style={{ padding: '12px 16px', color: '#475569', fontWeight: 500, whiteSpace: 'nowrap' }}>{carpetA}</td>
                        <td style={{ padding: '12px 16px', color: '#334155', fontWeight: 500, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{usage}</td>
                        <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>{occ}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ background: status === 'Active' ? '#dcfce7' : status === 'Vacant' ? '#f1f5f9' : '#fef3c7', color: status === 'Active' ? '#16a34a' : status === 'Vacant' ? '#475569' : '#d97706', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>{status}</span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button onClick={() => onView(p)} style={{ background: '#eff6ff', color: '#1d4ed8', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', whiteSpace: 'nowrap' }}>
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Showing {((page - 1) * PAGE_SIZE) + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} entries</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ padding: '6px 12px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '6px', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1, fontSize: '12px', fontWeight: 600 }}>Prev</button>
                  <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} style={{ padding: '6px 12px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '6px', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1, fontSize: '12px', fontWeight: 600 }}>Next</button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PROPERTY MASTER DETAIL PAGE  (Figma: Property Master Detail)
// ══════════════════════════════════════════════════════════════════════════
function PropertyDetail({ record, onBack }) {
  if (!record) return null;
  const r = record;
  const propId = r.id || r.name;
  const ss = STATUS_STYLE[r.status] || STATUS_STYLE['Not Acquired'];
  const isGovt = r.mbmc712 === 'GOVT';
  const [activeDoc, setActiveDoc] = useState(null);
  const [uploadedDocs, setUploadedDocs] = useState({});   // label -> { file, url, name }
  const [uploadingLabel, setUploadingLabel] = useState(null); // which label is uploading
  const [uploadError, setUploadError] = useState(null);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef(null);

  const handleUploadClick = () => {
    const labels = docList.map(d => d.label);
    if (!selectedLabel) {
      setSelectedLabel(labels[0] || '');
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedLabel) return;
    setUploadingLabel(selectedLabel);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('is_private', '0');
      formData.append('doctype', 'GIS Project');
      formData.append('fieldname', 'custom_doc_upload');
      const res = await fetch('/api/method/upload_file', {
        method: 'POST',
        headers: { 'X-Frappe-CSRF-Token': 'fetch' },
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      const url = data.message?.file_url || data.message?.url || null;
      if (!url) throw new Error('Upload failed — no URL returned');
      setUploadedDocs(prev => ({
        ...prev,
        [selectedLabel]: { url, name: file.name }
      }));
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploadingLabel(null);
      e.target.value = '';
    }
  };

  // Always start empty — loaded exclusively from backend
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    const fetchTenants = async () => {
      if (!propId) { setHistoryLoading(false); return; }
      setHistoryLoading(true);
      try {
        // call() in api.js already unwraps data.message, so res IS the array directly
        const res = await fetchRegisteredTenants(propId);
        const tenants = Array.isArray(res) ? res : (res && Array.isArray(res.message) ? res.message : []);
        const backendTenants = tenants.map(t => ({
          year: t.rental_period || '—',
          name: t.tenant_name,
          profession: t.profession || '',
          purpose: t.purpose_of_use || '',
          contact: t.contact_information || '',
          aadhar: t.aadhar_number || '',
          gst: t.gst_number || '',
          pan: t.pan_card_number || '',
          renewal: t.renewal_date || '',
          status: t.status || 'Active',
          amount: t.rent_amount ? `INR ${t.rent_amount}/month` : '—',
          attachments: t.attachments ? JSON.parse(t.attachments) : [],
          isBackend: true
        }));
        setHistoryList(backendTenants);
      } catch (err) {
        console.error("Error fetching registered tenants:", err);
        setHistoryList([]);
      } finally {
        setHistoryLoading(false);
      }
    };
    fetchTenants();
  }, [propId]);

  const [showRegModal, setShowRegModal] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newProfession, setNewProfession] = useState('');
  const [newPurposeOfUse, setNewPurposeOfUse] = useState('');
  const [newContactInfo, setNewContactInfo] = useState('');
  const [newRentalPeriod, setNewRentalPeriod] = useState('');
  const [newAadhar, setNewAadhar] = useState('');
  const [newGst, setNewGst] = useState('');
  const [newPanCard, setNewPanCard] = useState('');
  const [newRentAmount, setNewRentAmount] = useState('');
  const [newRenewalDate, setNewRenewalDate] = useState('');
  const [newAttachments, setNewAttachments] = useState([]); // Array of { name, url }
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const hasTenant = !historyLoading && historyList.length > 0;

  // Documents from DOCUMENT.csv
  const docList = (r.documents && r.documents.length > 0)
    ? r.documents
    : [
        { label: 'Property Survey Form', file: '' },
        { label: 'Tenant Agreement',     file: '' },
        { label: 'Aadhaar / PAN / GST',  file: '' },
        { label: 'Geo Tagged Photos',    file: '' },
        { label: 'Yearly Demand Bills',  file: '' },
      ];

  const uploadedDocsList = docList.filter(doc => {
    const uploaded = uploadedDocs[doc.label];
    return !!(uploaded || doc.file);
  });

  const CoreField = ({ label, value }) => (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{value || '—'}</div>
    </div>
  );

  const handleMultipleFilesChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploadingFiles(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('is_private', '0');
        formData.append('doctype', 'GIS Project');
        formData.append('fieldname', 'custom_doc_upload');
        const res = await fetch('/api/method/upload_file', {
          method: 'POST',
          headers: { 'X-Frappe-CSRF-Token': 'fetch' },
          credentials: 'include',
          body: formData,
        });
        const data = await res.json();
        const url = data.message?.file_url || data.message?.url || null;
        if (url) {
          uploaded.push({ name: file.name, url });
        }
      }
      setNewAttachments(prev => [...prev, ...uploaded]);
    } catch (err) {
      console.error(err);
      setToastMsg({ type: 'error', text: 'Some file uploads failed' });
      setTimeout(() => setToastMsg(null), 4000);
    } finally {
      setIsUploadingFiles(false);
    }
  };

  const handleRegisterTenantSubmit = async (statusType) => {
    if (!newTenantName.trim()) {
      setToastMsg({ type: 'error', text: 'Tenant Name is required' });
      setTimeout(() => setToastMsg(null), 4000);
      return;
    }

    setIsSaving(true);
    setToastMsg({ type: 'info', text: `Saving tenant registration...` });

    try {
      const data = {
        tenant_name: newTenantName,
        profession: newProfession,
        purpose_of_use: newPurposeOfUse,
        contact_information: newContactInfo,
        rental_period: newRentalPeriod,
        aadhar_number: newAadhar,
        gst_number: newGst,
        pan_card_number: newPanCard,
        rent_amount: newRentAmount,
        renewal_date: newRenewalDate,
        property_id: propId,
        status: statusType === 'Draft' ? 'Draft' : 'Active',
        attachments: JSON.stringify(newAttachments)
      };

      const res = await registerTenant(data);
      if (res.exc) {
        throw new Error(res.exc_type || 'Server error saving tenant');
      }

      const newRecord = {
        year: newRentalPeriod || '2026-27',
        name: newTenantName,
        status: statusType === 'Draft' ? 'Draft' : 'Active',
        amount: newRentAmount ? `INR ${newRentAmount}/month` : 'INR 10,000/month',
        attachments: newAttachments
      };

      setHistoryList(prev => [
        newRecord,
        ...prev.filter(t => t.name !== 'No tenant registered')
      ]);

      // Map newAttachments to uploadedDocs
      const newDocs = { ...uploadedDocs };
      newAttachments.forEach(att => {
        const nameLower = att.name.toLowerCase();
        let matchedLabel = null;
        if (nameLower.includes('survey') || nameLower.includes('form')) {
          matchedLabel = 'Property Survey Form';
        } else if (nameLower.includes('agreement') || nameLower.includes('rent')) {
          matchedLabel = 'Tenant Agreement';
        } else if (nameLower.includes('aadhar') || nameLower.includes('pan') || nameLower.includes('gst')) {
          matchedLabel = 'Aadhaar / PAN / GST';
        } else if (nameLower.includes('photo') || nameLower.includes('image') || nameLower.includes('img') || nameLower.includes('pic') || nameLower.includes('jpg') || nameLower.includes('png')) {
          matchedLabel = 'Geo Tagged Photos';
        } else if (nameLower.includes('bill') || nameLower.includes('demand')) {
          matchedLabel = 'Yearly Demand Bills';
        }

        if (matchedLabel) {
          newDocs[matchedLabel] = { url: att.url, name: att.name };
        } else {
          const labels = ['Property Survey Form', 'Tenant Agreement', 'Aadhaar / PAN / GST', 'Geo Tagged Photos', 'Yearly Demand Bills'];
          const emptyLabel = labels.find(l => !newDocs[l]);
          if (emptyLabel) {
            newDocs[emptyLabel] = { url: att.url, name: att.name };
          }
        }
      });
      setUploadedDocs(newDocs);

      setToastMsg({
        type: 'success',
        text: statusType === 'Draft'
          ? `Tenant registration draft saved successfully!`
          : `Tenant '${newTenantName}' registered successfully under status Active!`
      });
      setTimeout(() => setToastMsg(null), 4000);
      setShowRegModal(false);
    } catch (err) {
      console.error(err);
      setToastMsg({ type: 'error', text: `Failed to register tenant: ${err.message}` });
      setTimeout(() => setToastMsg(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f4f6f9', position: 'relative' }}>

      {/* ── Action Notification Toast ────────────────────────────────────── */}
      {toastMsg && (
        <div style={{
          position: 'absolute', top: '16px', right: '24px', zIndex: 99999,
          padding: '12px 20px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
          background: toastMsg.type === 'success' ? '#dcfce7' : '#fee2e2',
          border: `1.5px solid ${toastMsg.type === 'success' ? '#86efac' : '#fca5a5'}`,
          color: toastMsg.type === 'success' ? '#166534' : '#991b1b',
          fontSize: '13px', fontWeight: 750, transition: 'all 0.3s ease'
        }}>
          <span>{toastMsg.type === 'success' ? '✅' : '❌'}</span>
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* ── New Tenant Registration Modal ────────────────────────────────── */}
      {showRegModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '16px', width: '760px', maxHeight: '92%', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ padding: '24px 28px', borderBottom: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>New Tenant Registration</h3>
                <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'block' }}>Register tenant, rental duration, deposit, rent, renewal, documents and non-payment conditions.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', padding: '6px 14px', borderRadius: '20px' }}>Linked Property: {propId}</span>
                <button onClick={() => setShowRegModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#475569', fontSize: '12px' }}>✕</button>
              </div>
            </div>

            {/* Modal Form Body */}
            <div style={{ flex: 1, overflow: 'auto', padding: '28px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
              
              {/* Tenant Basic Details */}
              <div>
                <h4 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 850, color: '#0f172a' }}>Tenant Basic Details</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
                  {/* Custom Figma input wrappers with right-aligned 'v' matching figma screenshot */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 750, color: '#64748b', textTransform: 'none' }}>Tenant Name</span>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                      <input type="text" placeholder="Enter Tenant Name" value={newTenantName} onChange={e => setNewTenantName(e.target.value)} style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', fontWeight: 600, color: '#1e293b' }} />
                      <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, pointerEvents: 'none', marginLeft: '6px' }}>v</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 750, color: '#64748b', textTransform: 'none' }}>Profession</span>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                      <input type="text" placeholder="Enter Profession" value={newProfession} onChange={e => setNewProfession(e.target.value)} style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', fontWeight: 600, color: '#1e293b' }} />
                      <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, pointerEvents: 'none', marginLeft: '6px' }}>v</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 750, color: '#64748b', textTransform: 'none' }}>Purpose of Use</span>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                      <input type="text" placeholder="Enter Purpose of Use" value={newPurposeOfUse} onChange={e => setNewPurposeOfUse(e.target.value)} style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', fontWeight: 600, color: '#1e293b' }} />
                      <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, pointerEvents: 'none', marginLeft: '6px' }}>v</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 750, color: '#64748b', textTransform: 'none' }}>Contact Information</span>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                      <input type="text" placeholder="Enter Contact Info (Email / Phone)" value={newContactInfo} onChange={e => setNewContactInfo(e.target.value)} style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', fontWeight: 600, color: '#1e293b' }} />
                      <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, pointerEvents: 'none', marginLeft: '6px' }}>v</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rental & Payment Terms */}
              <div>
                <h4 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 855, color: '#0f172a' }}>Rental &amp; Payment Terms</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px 20px' }}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 750, color: '#64748b' }}>Rental Period</span>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                      <input type="text" placeholder="e.g. 1 Year, 3 Years" value={newRentalPeriod} onChange={e => setNewRentalPeriod(e.target.value)} style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', fontWeight: 600, color: '#1e293b' }} />
                      <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, pointerEvents: 'none', marginLeft: '6px' }}>v</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 750, color: '#64748b' }}>Aadhar Number</span>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                      <input type="text" placeholder="Enter 12-digit Aadhar" value={newAadhar} onChange={e => setNewAadhar(e.target.value)} style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', fontWeight: 600, color: '#1e293b' }} />
                      <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, pointerEvents: 'none', marginLeft: '6px' }}>v</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 750, color: '#64748b' }}>GST Number</span>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                      <input type="text" placeholder="Enter GST Number" value={newGst} onChange={e => setNewGst(e.target.value)} style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', fontWeight: 600, color: '#1e293b' }} />
                      <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, pointerEvents: 'none', marginLeft: '6px' }}>v</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 750, color: '#64748b' }}>PAN Card Number</span>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                      <input type="text" placeholder="Enter PAN Card" value={newPanCard} onChange={e => setNewPanCard(e.target.value)} style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', fontWeight: 600, color: '#1e293b' }} />
                      <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, pointerEvents: 'none', marginLeft: '6px' }}>v</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 750, color: '#64748b' }}>Rent Amount</span>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                      <input type="text" placeholder="Enter Rent Amount" value={newRentAmount} onChange={e => setNewRentAmount(e.target.value)} style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', fontWeight: 600, color: '#1e293b' }} />
                      <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, pointerEvents: 'none', marginLeft: '6px' }}>v</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 750, color: '#64748b' }}>Renewal Date</span>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                      <input type="text" placeholder="dd/mm/yyyy" value={newRenewalDate} onChange={e => setNewRenewalDate(e.target.value)} style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', fontWeight: 600, color: '#1e293b' }} />
                      <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, pointerEvents: 'none', marginLeft: '6px' }}>v</span>
                    </div>
                  </div>

                </div>
              </div>

              {/* Documents & Conditions */}
              <div>
                <h4 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 855, color: '#0f172a' }}>Documents &amp; Conditions</h4>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  {[
                    { label: 'Agreement', active: !!newRentalPeriod.trim() },
                    { label: 'Aadhaar', active: !!newAadhar.trim() },
                    { label: 'PAN', active: !!newPanCard.trim() },
                    { label: 'GST', active: !!newGst.trim() },
                    { label: 'Deposit Receipt', active: !!newRentAmount.trim() }
                  ].map(doc => (
                    <span
                      key={doc.label}
                      style={{
                        padding: '6px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                        background: doc.active ? '#dcfce7' : '#f1f5f9',
                        border: `1.5px solid ${doc.active ? '#86efac' : '#cbd5e1'}`,
                        color: doc.active ? '#166534' : '#475569',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {doc.label}
                    </span>
                  ))}
                </div>
                
                {/* File Attachment interface */}
                <div style={{ marginTop: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#64748b', marginBottom: '6px' }}>Tenant Attachments (Images/PDFs)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <label style={{ padding: '8px 18px', background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      📁 Choose Files
                      <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={handleMultipleFilesChange} />
                    </label>
                    {isUploadingFiles && <span style={{ fontSize: '11px', color: '#1a73e8', fontWeight: 700 }}>⏳ Uploading files…</span>}
                  </div>
                  {newAttachments.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px', background: '#f8fafc', borderRadius: '8px', padding: '10px 14px', border: '1px solid #e2e8f0' }}>
                      {newAttachments.map((f, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                          <span style={{ color: '#475569', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '380px' }}>📄 {f.name}</span>
                          <a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#1a73e8', fontWeight: 700, textDecoration: 'none' }}>View</a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', marginTop: '14px' }}>
                  Penalty rule: automated alert and penalty in case of non-payment.
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1.5px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
              <button onClick={() => setShowRegModal(false)} style={{ padding: '10px 22px', background: 'white', border: '1.5px solid #cbd5e1', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#475569' }}>Cancel</button>
              <button onClick={() => handleRegisterTenantSubmit('Draft')} style={{ padding: '10px 22px', background: 'white', border: '1.5px solid #cbd5e1', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#475569' }}>Save Draft</button>
              <button onClick={() => handleRegisterTenantSubmit('Register')} style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #1a73e8, #1d4ed8)', color: 'white', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', boxShadow: '0 2px 8px rgba(26,115,232,0.3)' }}>Register Tenant</button>
            </div>
          </div>
        </div>
      )}


      {/* ── Document Viewer Modal ────────────────────────────────────────── */}
      {activeDoc && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '40px' }}>
          <div style={{ background: 'white', borderRadius: '16px', width: '90%', height: '90%', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{activeDoc.label}</h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>{activeDoc.file}</span>
              </div>
              <button onClick={() => setActiveDoc(null)} style={{ padding: '6px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}>✕ Close</button>
            </div>
            {/* Modal iframe */}
            <div style={{ flex: 1, background: '#f1f5f9' }}>
              <iframe
                src={`/files/${activeDoc.file}`}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title={activeDoc.label}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={onBack} style={{ padding: '7px 14px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', color: '#475569', display: 'flex', alignItems: 'center', gap: '5px' }}>← Back</button>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Property Master Detail</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#f1f5f9', borderRadius: '8px', padding: '5px 12px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>Search property, tenant, bill…</div>
          <div style={{ background: '#eff6ff', color: '#1e40af', fontSize: '12px', fontWeight: 700, padding: '6px 14px', borderRadius: '8px' }}>Property Officer</div>
        </div>
      </div>

      {/* ── Scrollable Body ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>


        {/* Property Title Card */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                {r.property_id || r.name} — {r.property_type || 'Corporation Property'}
              </h1>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#64748b' }}>
                Complete digital property record with ownership history, tenant record, area details, documents, photo and geo location.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ background: '#f0fdf4', color: '#15803d', fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', border: `1px solid #bbf7d0` }}>
                  Corporation Owned
                </span>
                <span style={{ background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', border: `1px solid #bbf7d0` }}>
                  {r.tenant_name && r.tenant_name !== 'Vacant' ? 'Rent Active' : 'Vacant'}
                </span>
                <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', border: `1px solid #cbd5e1` }}>
                  {r.status || 'Draft'}
                </span>
              </div>
            </div>
            <button style={{ padding: '9px 20px', background: 'linear-gradient(135deg,#1a73e8,#1d4ed8)', color: 'white', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', boxShadow: '0 2px 8px rgba(26,115,232,0.25)', whiteSpace: 'nowrap', flexShrink: 0 }}>✏️ Edit Record</button>
          </div>
        </div>

        {/* Row 1: Geo Map + Core Details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

          {/* Geo Location & Photo */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>Geo Location & Photo</div>
            {/* Live Leaflet Map */}
            <PropertyGeoMap record={r} />
            <div style={{ display: 'flex', gap: '8px' }}>
              {['📷 Photo 1', '📷 Photo 2', '📍 Map Pin'].map(btn => (
                <button key={btn} style={{ flex: 1, padding: '7px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>{btn}</button>
              ))}
            </div>
          </div>

          {/* Core Property Details */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>Core Property Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <CoreField label='Plot Area'        value='2,450 sq.ft' />
              <CoreField label='Constructed Area' value='1,120 sq.ft' />
              <CoreField label='Carpet Area'      value='980 sq.ft'   />
            </div>
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
              <CoreField label='Property Type'  value='Commercial' />
              <CoreField label='Ward'           value={r.village ? `Ward — ${r.village}` : 'Ward 08'} />
              <CoreField label='Address'        value={`Survey ${r.surveyNo}, ${r.village}`} />
              <CoreField label='Current Usage'  value='Medical store' />
              <CoreField label='Status'         value={r.status} />
              <CoreField label='Last Updated'   value='25 Jun 2025' />
            </div>
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <CoreField label='GIS ID'         value={propId} />
              <CoreField label='Survey No.'     value={r.surveyNo} />
              <CoreField label='Reservation No.' value={r.reservationNo || '—'} />
              <CoreField label='MBMC 7/12'      value={r.mbmc712} />
              <CoreField label='Land Status'    value={(r.landStatus || '').replace(/_/g, ' ')} />
              <CoreField label='CZMP 2019'      value={r.czmp !== 'NA' ? r.czmp : 'Not Affected'} />
            </div>
          </div>
        </div>

        {/* Row 2: Tenant History + Documents */}
        <div style={{ display: 'grid', gridTemplateColumns: hasTenant && uploadedDocsList.length > 0 ? '1fr 1fr' : '1fr', gap: '16px' }}>

          {/* Tenant / User History */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>Tenant / User History</div>
            {historyLoading ? (
              <div style={{ padding: '32px 10px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                <div style={{ display: 'inline-block', width: '20px', height: '20px', border: '2px solid #e2e8f0', borderTopColor: '#1a73e8', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '8px' }} />
                <div>Loading tenant records...</div>
              </div>
            ) : historyList.length === 0 ? (
              <div style={{ padding: '24px 10px', textAlign: 'center', color: '#64748b', fontSize: '12px', fontWeight: 600 }}>
                📭 No tenant history found. Click below to register the first tenant.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '700px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1' }}>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>Tenant Name</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>Profession</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>Purpose</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>Contact</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>Aadhar</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>GST / PAN</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>Period</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>Rent/Month</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>Renewal</th>
                      <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>Files</th>
                      <th style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyList.map((t, idx) => {
                      const isActive = t.status === 'Active';
                      const isDraft = t.status === 'Draft';
                      const badgeColor = isActive
                        ? { bg: '#dcfce7', c: '#15803d' }
                        : isDraft
                        ? { bg: '#fee2e2', c: '#b91c1c' }
                        : { bg: '#f1f5f9', c: '#475569' };
                      const cell = { padding: '10px 12px', fontSize: '11px', color: '#475569', fontWeight: 500, whiteSpace: 'nowrap' };
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                          onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                        >
                          {/* Tenant Name */}
                          <td style={{ ...cell, fontWeight: 700, color: '#0f172a' }}>{t.name || '—'}</td>

                          {/* Profession */}
                          <td style={cell}>{t.profession || <span style={{ color: '#cbd5e1' }}>—</span>}</td>

                          {/* Purpose */}
                          <td style={cell}>{t.purpose || <span style={{ color: '#cbd5e1' }}>—</span>}</td>

                          {/* Contact */}
                          <td style={cell}>{t.contact || <span style={{ color: '#cbd5e1' }}>—</span>}</td>

                          {/* Aadhar */}
                          <td style={{ ...cell, fontFamily: 'monospace', letterSpacing: '1px' }}>
                            {t.aadhar ? (
                              <span style={{ background: '#f0fdf4', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>{t.aadhar}</span>
                            ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                          </td>

                          {/* GST / PAN */}
                          <td style={{ ...cell, fontSize: '10px' }}>
                            {t.gst && <div style={{ background: '#eff6ff', color: '#1d4ed8', padding: '1px 5px', borderRadius: '3px', marginBottom: '2px', display: 'inline-block' }}>GST: {t.gst}</div>}
                            {t.pan && <div style={{ background: '#fef9c3', color: '#854d0e', padding: '1px 5px', borderRadius: '3px', display: 'inline-block' }}>PAN: {t.pan}</div>}
                            {!t.gst && !t.pan && <span style={{ color: '#cbd5e1' }}>—</span>}
                          </td>

                          {/* Period */}
                          <td style={cell}>{t.year || '—'}</td>

                          {/* Rent */}
                          <td style={{ ...cell, fontWeight: 700, color: '#0f172a' }}>{t.amount}</td>

                          {/* Renewal */}
                          <td style={cell}>{t.renewal || <span style={{ color: '#cbd5e1' }}>—</span>}</td>

                          {/* Files */}
                          <td style={{ ...cell, textAlign: 'center' }}>
                            {t.attachments && t.attachments.length > 0 ? (
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                                {t.attachments.filter(att => /\.(jpg|jpeg|png|gif)$/i.test(att.name)).map((att, attIdx) => (
                                  <a key={attIdx} href={att.url} target="_blank" rel="noreferrer" title={`View: ${att.name}`}>
                                    <img src={att.url} alt={att.name}
                                      style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #cbd5e1', cursor: 'pointer', transition: 'transform 0.15s' }}
                                      onMouseOver={e => e.currentTarget.style.transform = 'scale(1.2)'}
                                      onMouseOut={e => e.currentTarget.style.transform = 'scale(1.0)'}
                                    />
                                  </a>
                                ))}
                                {t.attachments.filter(att => !/\.(jpg|jpeg|png|gif)$/i.test(att.name)).map((att, attIdx) => (
                                  <a key={attIdx} href={att.url} target="_blank" rel="noreferrer"
                                    style={{ fontSize: '14px', textDecoration: 'none' }} title={`View: ${att.name}`}>
                                    📄
                                  </a>
                                ))}
                              </div>
                            ) : <span style={{ color: '#94a3b8', fontSize: '10px', fontStyle: 'italic' }}>None</span>}
                          </td>

                          {/* Status */}
                          <td style={{ ...cell, textAlign: 'right' }}>
                            <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: badgeColor.bg, color: badgeColor.c }}>
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <button
              onClick={() => {
                setNewTenantName('');
                setNewProfession('');
                setNewPurposeOfUse('');
                setNewContactInfo('');
                setNewRentalPeriod('');
                setNewAadhar('');
                setNewGst('');
                setNewPanCard('');
                setNewRentAmount('');
                setNewRenewalDate('');
                setNewAttachments([]);
                setShowRegModal(true);
              }}
              style={{ padding: '9px 20px', background: 'linear-gradient(135deg,#1a73e8,#1d4ed8)', color: 'white', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', boxShadow: '0 2px 8px rgba(26,115,232,0.25)' }}
            >
              + Register New Tenant
            </button>
          </div>

          {/* Documents & Ownership History */}
          {hasTenant && uploadedDocsList.length > 0 && (
            <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>Documents &amp; Ownership History</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>

                {uploadedDocsList.map((doc, i) => {
                  const uploaded = uploadedDocs[doc.label];
                  const hasFile = uploaded || doc.file;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', gap: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          📄 {doc.label}
                        </span>
                        {uploaded && (
                          <span style={{ fontSize: '10px', color: '#60a5fa', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✅ {uploaded.name}</span>
                        )}
                      </div>
                      <button
                        onClick={() => setActiveDoc({ label: doc.label, file: uploaded?.url || doc.file })}
                        style={{ padding: '4px 12px', background: '#eff6ff', color: '#1a73e8', border: '1.5px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}
                      >
                        View
                      </button>
                    </div>
                  );
                })}

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// PropertyGeoMap - Pinned Leaflet map for Property Master Detail
function PropertyGeoMap({ record }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  // Village -> approx center lat/lng for MBMC area
  const VILLAGE_CENTERS = {
    'Rai':       [19.2820, 72.8700],
    'Kashigaon': [19.2950, 72.8750],
    'Bhayander': [19.3080, 72.8580],
    'Navghar':   [19.2710, 72.8640],
    'Uttan':     [19.3200, 72.8520],
    'Dongri':    [19.2580, 72.8680],
  };

  // Seeded pseudo-random jitter per property ID so position is stable
  const seededRand = (seed) => { const x = Math.sin(seed + 7) * 10000; return x - Math.floor(x); };

  const getCoords = (r) => {
    const base = VILLAGE_CENTERS[r.village] || [19.2813, 72.8697];
    // Use char codes of id to get stable jitter within ~500m
    const seededId = r.id || r.name || '';
    let seed = 0;
    for (let i = 0; i < seededId.length; i++) seed += (seededId.charCodeAt(i) * (i + 1));
    const lat = base[0] + (seededRand(seed) - 0.5) * 0.006;
    const lng = base[1] + (seededRand(seed + 13) - 0.5) * 0.008;
    return [lat, lng];
  };

  const statusColor = (r) => {
    const ls = (r.landStatus || '').toUpperCase();
    const enc = (r.encroachment || '').toUpperCase();
    if (ls === 'ACQUIRED') return '#16a34a';
    if (enc === 'ENCROACHMENT') return '#dc2626';
    if (ls === 'PARTIALLY_ACQUIRED') return '#7c3aed';
    return '#d97706';
  };

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const coords = getCoords(record);
    const color = statusColor(record);

    const map = L.map(mapRef.current, {
      center: coords,
      zoom: 16,
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false,
    });
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    // Pulse circle for the property location
    L.circleMarker(coords, {
      radius: 14, fillColor: color, color: '#fff', weight: 3,
      opacity: 0.6, fillOpacity: 0.15,
    }).addTo(map);

    // Inner solid pin
    L.circleMarker(coords, {
      radius: 7, fillColor: color, color: '#fff', weight: 2,
      opacity: 1, fillOpacity: 0.95,
    }).bindPopup(
      '<div style="font-family:sans-serif;min-width:160px">' +
      '<div style="font-weight:800;font-size:12px;color:#0f172a;margin-bottom:4px">' + (record.id || '') + '</div>' +
      '<div style="font-size:11px;color:#475569"><b>Survey:</b> ' + (record.surveyNo || 'N/A') + '</div>' +
      '<div style="font-size:11px;color:#475569"><b>Village:</b> ' + (record.village || 'N/A') + '</div>' +
      '<div style="font-size:11px;color:#475569"><b>Property:</b> ' + (record.propertyName || 'N/A') + '</div>' +
      '<div style="margin-top:5px"><span style="background:' + color + '22;color:' + color + ';font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">' + (record.status || '') + '</span></div>' +
      '</div>',
      { maxWidth: 200 }
    ).addTo(map).openPopup();

    return () => { map.remove(); mapInstanceRef.current = null; };
  }, [record]);

  return (
    <div ref={mapRef} style={{ height: '175px', borderRadius: '10px', overflow: 'hidden', border: '1.5px solid #e2e8f0', marginBottom: '12px' }} />
  );
}

// GeoDistributionMap - Mini Leaflet map
function GeoDistributionMap({ records }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const CENTER = [19.2813, 72.8697];
    const map = L.map(mapRef.current, {
      center: CENTER, zoom: 13,
      zoomControl: true, attributionControl: false, scrollWheelZoom: false,
    });
    mapInstanceRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    const statusColor = (p) => {
      const ls = (p.landStatus || '').toUpperCase();
      const enc = (p.encroachment || '').toUpperCase();
      if (ls === 'ACQUIRED') return '#16a34a';
      if (enc === 'ENCROACHMENT') return '#dc2626';
      if (ls === 'PARTIALLY_ACQUIRED') return '#7c3aed';
      return '#d97706';
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

    records.slice(0, 250).forEach((p, i) => {
      const bounds = VILLAGE_BOUNDS[p.village] || VILLAGE_BOUNDS.default;
      const lat = bounds.lat[0] + seededRand(i * 3 + 1) * (bounds.lat[1] - bounds.lat[0]);
      const lng = bounds.lng[0] + seededRand(i * 3 + 2) * (bounds.lng[1] - bounds.lng[0]);
      const color = statusColor(p);
      const label = getStatus(p);
      L.circleMarker([lat, lng], {
        radius: 5, fillColor: color, color: '#fff', weight: 1, opacity: 0.9, fillOpacity: 0.85,
      }).bindPopup(
        '<div style="font-family:sans-serif;min-width:160px">' +
        '<div style="font-weight:800;font-size:12px;color:#0f172a;margin-bottom:4px">' + p.id + '</div>' +
        '<div style="font-size:11px;color:#475569"><b>Survey:</b> ' + (p.surveyNo || 'N/A') + '</div>' +
        '<div style="font-size:11px;color:#475569"><b>Property:</b> ' + (p.propertyName || 'N/A') + '</div>' +
        '<div style="font-size:11px;color:#475569"><b>Village:</b> ' + (p.village || 'N/A') + '</div>' +
        '<div style="margin-top:5px"><span style="background:' + color + '22;color:' + color + ';font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">' + label + '</span></div>' +
        '</div>', { maxWidth: 200 }
      ).addTo(map);
    });

    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div');
      div.style.cssText = 'background:white;padding:6px 10px;border-radius:8px;font-family:sans-serif;font-size:10px;box-shadow:0 2px 8px rgba(0,0,0,0.15);line-height:1.8';
      div.innerHTML = [['#16a34a','Acquired'],['#d97706','Not Acquired'],['#dc2626','Encroachment'],['#7c3aed','Partial']]
        .map(([c,l]) => '<div style="display:flex;align-items:center;gap:5px"><span style="width:9px;height:9px;background:' + c + ';border-radius:50%;display:inline-block"></span><span style="color:#475569;font-weight:600">' + l + '</span></div>')
        .join('');
      return div;
    };
    legend.addTo(map);

    return () => { map.remove(); mapInstanceRef.current = null; };
  }, [records]);

  return (
    <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>🗺️ Property Geo Distribution</div>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '99px' }}>
          MBMC Area · {records.length} Properties
        </span>
      </div>
      <div ref={mapRef} style={{ height: '190px', borderRadius: '10px', overflow: 'hidden', border: '1.5px solid #e2e8f0', flex: 1 }} />
      <div style={{ display: 'flex', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
        {[['#16a34a','Acquired'],['#d97706','Not Acquired'],['#dc2626','Encroachment'],['#7c3aed','Partial']].map(([c,l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '8px', height: '8px', background: c, borderRadius: '50%' }} />
            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ROOT EXPORT
// ══════════════════════════════════════════════════════════════════════════
export default function PropertyRecords({ userInfo, subPage = 'records', setSubPage }) {
  const [viewDetail, setViewDetail] = useState(null);

  // Property detail view (full page, shown over records list)
  if (viewDetail) {
    const detailRec = typeof viewDetail === 'object' ? viewDetail : (DETAIL_MAP[viewDetail] || ALL_PROPERTIES.find(p => p.id === viewDetail));
    return <PropertyDetail record={detailRec} onBack={() => setViewDetail(null)} />;
  }

  if (subPage === 'survey')  return <SurveyPage  userInfo={userInfo} setSubPage={setSubPage} />;
  if (subPage === 'billing') return <BillingPage userInfo={userInfo} />;
  if (subPage === 'reports') return <ReportsPage userInfo={userInfo} />;
  return <RecordsPage userInfo={userInfo} onView={(id) => setViewDetail(id)} setSubPage={setSubPage} />;
}
