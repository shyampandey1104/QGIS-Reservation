import React, { useState, useEffect } from 'react';
import { fetchReportsData } from '../api';
import MBMC_STATS_STATIC from '../data/mbmc_stats.json';
import PAYMENT_DATA_STATIC from '../data/payment_data.json';
import RAW_DATA_STATIC from '../data/property_records_data.json';

export default function ReservationReports({ userInfo }) {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState({
    stats: {
      total: MBMC_STATS_STATIC.total || 2483,
      acquired: MBMC_STATS_STATIC.acquired || 503,
      notAcquired: MBMC_STATS_STATIC.notAcquired || 1980,
      encroachment: MBMC_STATS_STATIC.encroachment || 480,
      villages: MBMC_STATS_STATIC.villages || {},
      resTypes: MBMC_STATS_STATIC.resTypes || {}
    },
    projects: RAW_DATA_STATIC || [],
    payments: PAYMENT_DATA_STATIC || []
  });

  useEffect(() => {
    let active = true;
    fetchReportsData()
      .then(res => {
        if (active && res && res.stats) {
          const mergedStats = {
            total: res.stats.total || MBMC_STATS_STATIC.total,
            acquired: res.stats.acquired !== undefined ? res.stats.acquired : MBMC_STATS_STATIC.acquired,
            notAcquired: res.stats.notAcquired !== undefined ? res.stats.notAcquired : MBMC_STATS_STATIC.notAcquired,
            encroachment: res.stats.encroachment !== undefined ? res.stats.encroachment : MBMC_STATS_STATIC.encroachment,
            villages: (res.stats.villages && Object.keys(res.stats.villages).length > 0) ? res.stats.villages : MBMC_STATS_STATIC.villages,
            resTypes: (res.stats.resTypes && Object.keys(res.stats.resTypes).length > 0) ? res.stats.resTypes : MBMC_STATS_STATIC.resTypes
          };
          setReportData({
            stats: mergedStats,
            projects: (res.projects && res.projects.length > 0) ? res.projects : RAW_DATA_STATIC,
            payments: (res.payments && res.payments.length > 0) ? res.payments : PAYMENT_DATA_STATIC
          });
          setLoading(false);
        }
      })
      .catch(err => {
        console.error("Failed to fetch reports data:", err);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
  
  // Calculate Collection Trend from dynamic payments
  const monthMap = { '04':0, '05':1, '06':2, '07':3, '08':4, '09':5 };
  const dVals = [0, 0, 0, 0, 0, 0];
  const cVals = [0, 0, 0, 0, 0, 0];
  
  (reportData.payments || []).forEach(p => {
    if (!p.due_date) return;
    const parts = p.due_date.split('-');
    if (parts.length < 2) return;
    const m = parts[1]; // MM
    if (monthMap[m] !== undefined) {
      const idx = monthMap[m];
      const amt = parseFloat(p.annual_amount) || 0;
      dVals[idx] += amt;
      if (p.status === 'paid') {
        cVals[idx] += amt;
      }
    }
  });

  // Scale down to a max height of 100 for the SVG bars
  const maxVal = Math.max(...dVals, 1); // Avoid division by zero
  const dBars = dVals.map(v => (v / maxVal) * 100);
  const cBars = cVals.map(v => (v / maxVal) * 100);
  const maxB = 100;

  // Real data
  const total     = reportData.stats.total || 2483;
  const acquired  = reportData.stats.acquired || 503;
  const notAcq    = reportData.stats.notAcquired || 1980;
  const encroach  = reportData.stats.encroachment || 480;

  const sumValues = acquired + notAcq + encroach || 1;
  const acqP = (acquired / sumValues) * 100;
  const encP = (encroach / sumValues) * 100;
  const notAcqP = (notAcq / sumValues) * 100;
  const realAcqPct = total ? ((acquired / total) * 100).toFixed(1) : 0;
  const realEncPct = total ? ((encroach / total) * 100).toFixed(1) : 0;
  const realNotAcqPct = total ? ((notAcq / total) * 100).toFixed(1) : 0;


  const villageEntries = Object.entries(reportData.stats.villages || {})
    .filter(([k]) => k)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxVillage = villageEntries[0]?.[1] || 1;

  const resTypeEntries = Object.entries(reportData.stats.resTypes || {})
    .filter(([k]) => k)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const VCOLS = ['#1a73e8','#22c55e','#f59e0b','#8b5cf6','#f43f5e','#06b6d4','#84cc16','#fb923c'];

  const pendingSurvey = notAcq - encroach;
  const alerts = [
    { text: `Not Acquired — ${notAcq.toLocaleString()} reservations pending`, bg: '#fef3c7', c: '#92400e' },
    { text: `Encroachment detected — ${encroach.toLocaleString()} records`, bg: '#fee2e2', c: '#991b1b' },
    { text: `Acquired successfully — ${acquired.toLocaleString()} reservations`, bg: '#dcfce7', c: '#166534' },
    { text: `Survey pending — ${pendingSurvey.toLocaleString()} properties`, bg: '#f1f5f9', c: '#475569' },
  ];

  const handleExport = (reportName, format) => {
    let headers = [];
    let rows = [];

    if (reportName === 'Property status report' || reportName === 'All Reservations list') {
      headers = ['GIS ID', 'Reservation No', 'Reservation Name', 'Village', 'Survey No', 'Status', 'Area (sqm)', 'Ownership'];
      rows = (reportData.projects || []).map(p => [
        p.id || '',
        p.reservationNo || '',
        (p.propertyName || '').replace(/,/g, ' '),
        p.village || '',
        p.surveyNo || '',
        p.status || '',
        p.area || '',
        p.ownership || ''
      ]);
    } else if (reportName === 'Tenant payment history') {
      headers = ['Invoice ID', 'GIS ID', 'Reservation Name', 'Village', 'Survey No', 'Year', 'Annual Amount', 'Paid Date', 'Txn ID', 'Status', 'Payment Mode'];
      rows = (reportData.payments || []).map(p => [
        p.invoice_id,
        p.gis_id,
        (p.reservation_name || '').replace(/,/g, ' '),
        p.village,
        p.survey_no,
        p.year,
        p.annual_amount,
        p.paid_date || '-',
        p.txn_id || '-',
        p.status,
        p.payment_mode || '-'
      ]);
    } else if (reportName === 'Yearly demand collection pending') {
      headers = ['Invoice ID', 'GIS ID', 'Reservation Name', 'Village', 'Survey No', 'Year', 'Annual Amount', 'Due Date', 'Status'];
      rows = (reportData.payments || []).filter(p => p.status !== 'paid').map(p => [
        p.invoice_id,
        p.gis_id,
        (p.reservation_name || '').replace(/,/g, ' '),
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
      (reportData.projects || []).forEach(p => {
        const v = p.village || 'Unknown';
        if (!map[v]) map[v] = { total: 0, acquired: 0, notAcq: 0, encroach: 0, partial: 0 };
        map[v].total++;
        if (p.landStatus === 'Acquired') map[v].acquired++;
        else if (p.landStatus === 'Not Acquired') map[v].notAcq++;
        else if (p.landStatus === 'Encroachment') map[v].encroach++;
        else if (p.landStatus === 'Partial') map[v].partial++;
      });
      rows = Object.entries(map).map(([v, s]) => [v, s.total, s.acquired, s.notAcq, s.encroach, s.partial]);
    } else if (reportName === 'Ownership history report') {
      headers = ['GIS ID', 'Village', 'Survey No', 'Ownership', '7/12 Name', 'Status'];
      rows = (reportData.projects || []).map(p => [
        p.id || '',
        p.village || '',
        p.surveyNo || '',
        p.mbmc712 || '',
        (p.mbmc712 || '').replace(/,/g, ' '),
        p.status || ''
      ]);
    }

    if (format === 'Excel' || format === 'CSV') {
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${reportName.replace(/ /g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'PDF') {
      const tableRows = rows.map(r => `<tr>${r.map(c => `<td style="padding:8px; border:1px solid #ddd;">${c}</td>`).join('')}</tr>`).join('');
      const tableHeaders = `<tr>${headers.map(h => `<th style="padding:8px; border:1px solid #ddd; background:#f4f6f9; text-align:left;">${h}</th>`).join('')}</tr>`;
      
      const htmlContent = `
        <html>
          <head>
            <title>${reportName}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              h2 { text-align: center; color: #1e293b; }
              table { width: 100%; border-collapse: collapse; font-size: 12px; }
            </style>
          </head>
          <body>
            <h2>${reportName}</h2>
            <p style="text-align:center; color:#64748b; font-size:11px;">MBMC Municipal Corporation GIS Report - Generated ${new Date().toLocaleDateString()}</p>
            <table>
              <thead>${tableHeaders}</thead>
              <tbody>${tableRows}</tbody>
            </table>
            <script>
              window.onload = function() { window.print(); }
            </script>
          </body>
        </html>
      `;
      
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#f4f6f9', padding: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Analytics, Reports & Alerts</h2>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>Real-time data from MASTER EXCEL.csv - {total.toLocaleString()} MBMC reservation records</p>
        </div>
        <button style={{ padding: '8px 16px', background: '#eff6ff', color: '#1e3a8a', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Commissioner</button>
      </div>

      {/* Top 3 Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '24px' }}>
        
        {/* Land Acquisition Status */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '24px' }}>Land Acquisition Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ position: 'relative', width: '100px', height: '100px' }}>
              <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                {/* Not Acquired (Orange) - Background */}
                <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#f97316" strokeWidth="3" strokeDasharray="100 0"></circle>
                {/* Encroachment (Red) */}
                <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#ef4444" strokeWidth="3" strokeDasharray={`${acqP + encP} ${100 - (acqP + encP)}`}></circle>
                {/* Acquired (Green) */}
                <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#22c55e" strokeWidth="3" strokeDasharray={`${acqP} ${100 - acqP}`}></circle>
              </svg>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{Math.round(acqP)}%</span>
                <span style={{ fontSize: '9px', color: '#64748b', fontWeight: 600 }}>Acquired</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 700, color: '#16a34a' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></div>{realAcqPct}% Acquired
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 700, color: '#dc2626' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></div>{realEncPct}% Encroachment
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 700, color: '#d97706' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f97316' }}></div>{realNotAcqPct}% Not Acquired
              </div>
            </div>
          </div>
        </div>

        {/* Village-wise Property Count */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>Village-wise Property Count</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {villageEntries.map(([village, count], i) => (
              <div key={village} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '70px', fontSize: '11px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{village}</div>
                <div style={{ flex: 1, background: '#f1f5f9', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(count/maxVillage)*100}%`, height: '100%', background: VCOLS[i%VCOLS.length] }}></div>
                </div>
                <div style={{ width: '30px', textAlign: 'right', fontSize: '11px', fontWeight: 800, color: VCOLS[i%VCOLS.length] }}>{count}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts & Notifications */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>Alerts & Notifications</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {alerts.map((a, i) => (
              <div key={i} style={{ background: a.bg, color: a.c, padding: '12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600 }}>
                {a.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Reservation Types */}
      <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>Top Reservation Types (from MBMC Data)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {resTypeEntries.map(([type, count], i) => {
            const m = resTypeEntries[0]?.[1] || 1;
            return (
              <div key={type} style={{ border: '1px solid #f1f5f9', borderRadius: '8px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>{type}</div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: VCOLS[i%VCOLS.length] }}>{count}</div>
                </div>
                <div style={{ background: '#f1f5f9', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(count/m)*100}%`, height: '100%', background: VCOLS[i%VCOLS.length] }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reports Export */}
      <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>Reports Export</div>
        <div style={{ display: 'flex', gap: '16px', overflowX: 'auto' }}>
          {['Property status report', 'Tenant payment history', 'Yearly demand collection pending', 'Area wise property count', 'Ownership history report'].map((rep) => (
            <div key={rep} style={{ minWidth: '220px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', marginBottom: '16px', background: '#e0e7ff', display: 'inline-block', padding: '4px 8px', borderRadius: '4px' }}>{rep}</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleExport(rep, 'PDF')} style={{ flex: 1, padding: '6px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', fontWeight: 700, color: '#2563eb', cursor: 'pointer' }}>PDF</button>
                <button onClick={() => handleExport(rep, 'Excel')} style={{ flex: 1, padding: '6px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', fontWeight: 700, color: '#2563eb', cursor: 'pointer' }}>Excel</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Collection Trend */}
      <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Collection Trend</div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '11px', fontWeight: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#2563eb' }}></div>Demand</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#22c55e' }}></div>Collected</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '140px', paddingTop: '20px' }}>
          {months.map((m, i) => (
            <div key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '100px' }}>
                <div style={{ width: '12px', height: `${(dBars[i]/maxB)*100}%`, background: '#3b82f6', borderRadius: '2px 2px 0 0' }}></div>
                <div style={{ width: '12px', height: `${(cBars[i]/maxB)*100}%`, background: '#22c55e', borderRadius: '2px 2px 0 0' }}></div>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{m}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
