import re

file_path = '/Users/shyamkumarpandey/.gemini/antigravity/scratch/qgis_reservation/frappe-bench/apps/qgis/frontend/src/pages/PropertyRecords.jsx'

with open(file_path, 'r') as f:
    content = f.read()

# Change the current ReportsPage (the new one) to PropertyReportsPage
content = content.replace('export function ReportsPage() {', 'export function PropertyReportsPage() {')

# Change in PropertyRecords to use PropertyReportsPage
content = content.replace("if (subPage === 'reports') return <ReportsPage userInfo={userInfo} />;", "if (subPage === 'reports') return <PropertyReportsPage userInfo={userInfo} />;")

# The old ReportsPage code
old_reports_page = """export function ReportsPage() {
  const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
  const dBars  = [65, 80, 55, 90, 70, 85];
  const cBars  = [50, 60, 45, 75, 55, 70];
  const maxB   = 90;

  // ── Real data from MBMC files ──────────────────────────────────────────
  const total     = MBMC_STATS.total;                      // 2483
  const acquired  = MBMC_STATS.acquired;                   // 503
  const notAcq    = MBMC_STATS.notAcquired;                // 1980
  const encroach  = MBMC_STATS.encroachment;               // 480

  // Village-wise counts from actual CSV
  const villageEntries = Object.entries(MBMC_STATS.villages)   // { NAVGHAR:702, BHAYANDAR:458, … }
    .filter(([k]) => k)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxVillage = villageEntries[0]?.[1] || 1;

  // Reservation type breakdown (top 6)
  const resTypeEntries = Object.entries(MBMC_STATS.resTypes)
    .filter(([k]) => k)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const VCOLS = ['#1a73e8','#22c55e','#f59e0b','#8b5cf6','#f43f5e','#06b6d4','#84cc16','#fb923c'];

  const pendingSurvey = notAcq - encroach;
  const alerts = [
    { text: `Not Acquired — ${notAcq.toLocaleString()} reservations pending`, bg: '#fef9c3', c: '#854d0e' },
    { text: `Encroachment detected — ${encroach.toLocaleString()} records`, bg: '#fee2e2', c: '#991b1b' },
    { text: `Acquired successfully — ${acquired.toLocaleString()} reservations`, bg: '#dcfce7', c: '#166534' },
    { text: `Survey pending — ${pendingSurvey.toLocaleString()} properties`, bg: '#f1f5f9', c: '#475569' },
  ];

  const reports = ['Property status report', 'Tenant payment history', 'Yearly demand collection pending', 'Area wise property count', 'Ownership history report'];

  const handleExport = (reportName, format) => {
    let headers = [];
    let rows = [];
    let title = reportName;

    if (reportName === 'Property status report') {
      headers = ['GIS ID', 'Reservation No', 'Reservation Name', 'Village', 'Survey No', 'Status'];
      rows = ALL_PROPERTIES.map(p => [
        p.id,
        p.reservationNo || '',
        p.propertyName || '',
        p.village || '',
        p.surveyNo || '',
        p.status || ''
      ]);
    } else if (reportName === 'Tenant payment history') {
      headers = ['Invoice ID', 'GIS ID', 'Reservation Name', 'Village', 'Survey No', 'Year', 'Annual Amount', 'Paid Date', 'Txn ID', 'Status', 'Payment Mode'];
      rows = PAYMENT_DATA.map(p => [
        p.invoice_id,
        p.gis_id,
        p.reservation_name,
        p.village,
        p.survey_no,
        p.year,
        p.annual_amount,
        p.paid_date || '—',
        p.txn_id || '—',
        p.status,
        p.payment_mode || '—'
      ]);
    } else if (reportName === 'Yearly demand collection pending') {
      headers = ['Invoice ID', 'GIS ID', 'Reservation Name', 'Village', 'Survey No', 'Year', 'Annual Amount', 'Due Date', 'Status'];
      rows = PAYMENT_DATA.filter(p => p.status !== 'paid').map(p => [
        p.invoice_id,
        p.gis_id,
        p.reservation_name,
        p.village,
        p.survey_no,
        p.year,
        p.annual_amount,
        p.due_date,
        p.status
      ]);
    } else if (reportName === 'Area wise property count') {
      headers = ['Village', 'Total Properties', 'Acquired', 'Not Acquired', 'Encroachment', 'Partial'];
      const map = {};
      ALL_PROPERTIES.forEach(p => {
        const v = p.village || 'Unknown';
        if (!map[v]) map[v] = { total: 0, acquired: 0, notAcq: 0, encroach: 0, partial: 0 };
        map[v].total++;
        if (p.status === 'Acquired') map[v].acquired++;
        else if (p.status === 'Not Acquired') map[v].notAcq++;
        else if (p.status === 'Encroachment') map[v].encroach++;
        else if (p.status === 'Partial') map[v].partial++;
      });
      rows = Object.entries(map).map(([v, s]) => [
        v,
        s.total,
        s.acquired,
        s.notAcq,
        s.encroach,
        s.partial
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
        <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Standard Reports</h2>
        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Export system data in various formats.</p>
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
                <div style={{ fontSize: '12px', color: '#64748b' }}>Download the latest {r.toLowerCase()} containing all matching records in the system.</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                {['CSV'].map(f => (
                  <button
                    key={f}
                    onClick={() => handleExport(r, f)}
                    style={{ padding: '6px 14px', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#1a73e8' }}
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

start_idx = content.find("export function PropertyReportsPage(")

final_content = content[:start_idx] + old_reports_page + "\n\n" + content[start_idx:]

with open(file_path, 'w') as f:
    f.write(final_content)

print("Restored original ReportsPage and kept PropertyReportsPage")
