import re

file_path = '/Users/shyamkumarpandey/.gemini/antigravity/scratch/qgis_reservation/frappe-bench/apps/qgis/frontend/src/pages/PropertyRecords.jsx'

with open(file_path, 'r') as f:
    content = f.read()

with open('/tmp/found_code.js', 'r') as f:
    jsx_content = f.read()

# Add the missing parts
missing_parts = """
        {/* Reports Export */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>Reports Export</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {['Property status report', 'Tenant payment history', 'Yearly demand collection pending', 'Area wise property count', 'Ownership history report'].map((report, i) => (
              <div key={i} style={{ flex: '1 1 180px', padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1.5px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>{report}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={{ padding: '4px 10px', fontSize: '10px', fontWeight: 700, color: '#1e40af', background: 'white', border: '1.5px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer' }}>PDF</button>
                  <button onClick={() => handleExport(report, 'CSV')} style={{ padding: '4px 10px', fontSize: '10px', fontWeight: 700, color: '#166534', background: 'white', border: '1.5px solid #bbf7d0', borderRadius: '6px', cursor: 'pointer' }}>Excel</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Collection Trend */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Collection Trend</div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#64748b' }}><span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#3b82f6' }} /> Demand</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#64748b' }}><span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#22c55e' }} /> Collected</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '140px', padding: '0 10px' }}>
            {months.map((m, i) => (
              <div key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '100px' }}>
                  <div style={{ width: '12px', height: `${(dBars[i] / maxB) * 100}%`, background: '#3b82f6', borderRadius: '3px' }} />
                  <div style={{ width: '12px', height: `${(cBars[i] / maxB) * 100}%`, background: '#22c55e', borderRadius: '3px' }} />
                </div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>{m}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
"""

new_reports_page = """export function ReportsPage({ userInfo }) {
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

""" + jsx_content + missing_parts + "\n}\n"

start_idx = content.find("export function ReportsPage({ userInfo }) {")
end_idx = content.find("export function PropertyReportsPage(", start_idx)

final_content = content[:start_idx] + new_reports_page + "\n\n" + content[end_idx:]

with open(file_path, 'w') as f:
    f.write(final_content)

print("Injected Analytics, Reports & Alerts dashboard perfectly!")
