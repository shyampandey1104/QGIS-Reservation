import re

file_path = '/Users/shyamkumarpandey/.gemini/antigravity/scratch/qgis_reservation/frappe-bench/apps/qgis/frontend/src/pages/PropertyRecords.jsx'

with open(file_path, 'r') as f:
    content = f.read()

start_idx = content.find("export function ReportsPage(")
if start_idx == -1:
    print("Could not find start")
    exit(1)
end_str = "function RecordsPage("
end_idx = content.find(end_str, start_idx)
if end_idx == -1:
    print("Could not find end")
    exit(1)

new_reports_page = """export function ReportsPage() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const total = surveys.length;
  const rented = surveys.filter(s => s.property_type === 'Corporation Owned & Rented').length;
  const notRented = surveys.filter(s => s.property_type === 'Owned but Not Rented').length;
  const pending = surveys.filter(s => s.status === 'Draft' || s.status === 'Pending').length;
  const completed = surveys.filter(s => s.status !== 'Draft' && s.status !== 'Pending').length;

  const alerts = [
    { text: `Rented Properties — ${rented} properties recorded`, bg: '#dcfce7', c: '#166534' },
    { text: `Not Rented Properties — ${notRented} records`, bg: '#fef9c3', c: '#854d0e' },
    { text: `Pending/Draft Surveys — ${pending} surveys to finalize`, bg: '#fee2e2', c: '#991b1b' },
    { text: `Completed Surveys — ${completed} properties`, bg: '#f1f5f9', c: '#475569' },
  ];

  const reports = ['Property Status Report', 'Property Type Breakdown', 'Pending Surveys Report'];

  const handleExport = (reportName, format) => {
    if (surveys.length === 0) {
      alert("No data available to export.");
      return;
    }
    
    let headers = [];
    let rows = [];
    let title = reportName;

    if (reportName === 'Property Status Report') {
      headers = ['Property ID', 'Property Type', 'Occupant/Tenant', 'Address', 'Status', 'Carpet Area'];
      rows = surveys.map(p => [
        p.property_id || p.name || '',
        p.property_type || '',
        p.tenant_name || 'Vacant',
        p.address || '',
        p.status || '',
        p.carpet_area || ''
      ]);
    } else if (reportName === 'Property Type Breakdown') {
      headers = ['Property Type', 'Total Properties', 'Pending', 'Completed'];
      const map = {
        'Corporation Owned & Rented': { total: 0, pending: 0, completed: 0 },
        'Owned but Not Rented': { total: 0, pending: 0, completed: 0 }
      };
      surveys.forEach(p => {
        const type = p.property_type || 'Unknown';
        if (!map[type]) map[type] = { total: 0, pending: 0, completed: 0 };
        map[type].total++;
        if (p.status === 'Draft' || p.status === 'Pending') map[type].pending++;
        else map[type].completed++;
      });
      rows = Object.entries(map).map(([type, stats]) => [
        type, stats.total, stats.pending, stats.completed
      ]);
    } else if (reportName === 'Pending Surveys Report') {
      headers = ['Property ID', 'Property Type', 'Address', 'Status', 'Contact Info'];
      rows = surveys.filter(s => s.status === 'Draft' || s.status === 'Pending').map(p => [
        p.property_id || p.name || '',
        p.property_type || '',
        p.address || '',
        p.status || '',
        p.contact || ''
      ]);
    }

    if (format === 'CSV' || format === 'Excel') {
      const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${title.replace(/ /g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div style={{ padding: '24px', background: '#f4f6f9', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Dynamic Survey Reports</h2>
        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Generate real-time reports from Property Survey data.</p>
      </div>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '24px' }}>
        {alerts.map((a, i) => (
          <div key={i} style={{ flex: '1 1 200px', background: a.bg, color: a.c, padding: '12px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, border: `1px solid ${a.c}22` }}>
            {a.text}
          </div>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Available Reports</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1px', background: '#f1f5f9' }}>
          {reports.map((r, i) => (
            <div key={i} style={{ background: 'white', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>{r}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Download the latest {r.toLowerCase()} containing real-time data from Property Surveys.</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                {['CSV'].map(f => (
                  <button
                    key={f}
                    onClick={() => handleExport(r, f)}
                    disabled={loading}
                    style={{ padding: '6px 14px', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 700, color: '#1a73e8', opacity: loading ? 0.5 : 1 }}
                  >
                    Download {f}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
"""

final_content = content[:start_idx] + new_reports_page + "\n\n" + content[end_idx:]

with open(file_path, 'w') as f:
    f.write(final_content)

print("ReportsPage replacement done via python!")
