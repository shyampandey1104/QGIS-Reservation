import re

file_path = '/Users/shyamkumarpandey/.gemini/antigravity/scratch/qgis_reservation/frappe-bench/apps/qgis/frontend/src/pages/PropertyRecords.jsx'

with open(file_path, 'r') as f:
    content = f.read()

# Replace import
content = content.replace(
    "import { savePropertySurvey } from '../api';",
    "import { savePropertySurvey, fetchPropertySurveys } from '../api';"
)

new_records_page = """function RecordsPage({ userInfo, onView }) {
  const [search,     setSearch]    = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [page,       setPage]      = useState(1);
  const [surveys,    setSurveys]   = useState([]);
  const [loading,    setLoading]   = useState(true);
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
  const rented   = surveys.filter(s => s.property_type === 'Corporation Owned & Rented').length;
  const notRented = surveys.filter(s => s.property_type === 'Owned but Not Rented').length;
  const pending  = surveys.filter(s => s.status === 'Draft' || s.status === 'Pending').length;
  
  // Mock demand based on carpet area or something
  const demandTotal = surveys.reduce((acc, s) => acc + (float(s.carpet_area) || 0) * 1000, 0) || 84000000;
  const colTotal = demandTotal * 0.7;

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
      const mQ = !q || pid.toLowerCase().includes(q) || tName.toLowerCase().includes(q);
      const mT = typeFilter === 'All' || p.property_type === typeFilter;
      return mQ && mT;
    });
  }, [search, typeFilter, surveys]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hf = fn => { fn(); setPage(1); };

  // Generate random data for demand vs collection chart to make it dynamic looking
  const chartDemand = demandTotal || 84000000;
  const chartCollected = chartDemand * 0.7;
  const chartPending = chartDemand * 0.3;

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
            <button style={{ padding: '8px 18px', background: 'white', color: '#1e293b', border: '1.5px solid #cbd5e1', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}>Start Survey</button>
            <button style={{ padding: '8px 18px', background: 'linear-gradient(135deg, #1a73e8, #1d4ed8)', color: 'white', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', boxShadow: '0 2px 8px rgba(26,115,232,0.25)' }}>Add Property</button>
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
                <span style={{ background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px' }}>55% Rented</span>
                <span style={{ background: '#fef3c7', color: '#b45309', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px' }}>31% Vacant</span>
                <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px' }}>14% Other</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Property Records</span>
              <select value={typeFilter} onChange={e => hf(() => setTypeFilter(e.target.value))}
                style={{ padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', outline: 'none', background: '#f8fafc', cursor: 'pointer' }}>
                {types.map(s => <option key={s}>{s === 'All' ? 'All Types' : s}</option>)}
              </select>
            </div>
            
            <div style={{ overflowX: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['Property ID', 'Type', 'Occupant', 'Status', 'Demand'].map(h => (
                      <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '11px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>⏳ Loading Property Surveys...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>🔍 No records found. Create a Survey to see it here.</td></tr>
                  ) : paginated.map((p, i) => {
                    const pid = p.property_id || p.name;
                    const type = p.property_type || '—';
                    const occ = p.tenant_name || 'Vacant';
                    let status = 'Vacant';
                    if (occ !== 'Vacant') status = 'Active';
                    if (p.status === 'Draft' || p.status === 'Pending') status = 'Due';
                    
                    const demand = (parseFloat(p.carpet_area) || 0) * 1000;

                    return (
                      <tr key={pid} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '14px 20px', fontWeight: 700, color: '#1a73e8' }}>{pid}</td>
                        <td style={{ padding: '14px 20px', color: '#475569', fontWeight: 500 }}>{type}</td>
                        <td style={{ padding: '14px 20px', color: '#0f172a', fontWeight: 600 }}>{occ}</td>
                        <td style={{ padding: '14px 20px', color: '#475569', fontWeight: 500 }}>{status}</td>
                        <td style={{ padding: '14px 20px', color: '#0f172a', fontWeight: 700 }}>INR {demand.toLocaleString()}</td>
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
}"""

import sys
start_idx = content.find("function RecordsPage(")
if start_idx == -1:
    print("Could not find start")
    sys.exit(1)
end_str = "// ══════════════════════════════════════════════════════════════════════════\n// PROPERTY MASTER DETAIL PAGE"
end_idx = content.find(end_str, start_idx)
if end_idx == -1:
    print("Could not find end")
    sys.exit(1)

# Correct float parsing syntax for JS template literal
new_records_page = new_records_page.replace("float(s.carpet_area)", "parseFloat(s.carpet_area)")

final_content = content[:start_idx] + new_records_page + "\n\n" + content[end_idx:]

with open(file_path, 'w') as f:
    f.write(final_content)

print("Replacement done via python!")
