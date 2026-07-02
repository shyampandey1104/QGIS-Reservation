import React, { useState, useEffect, useMemo } from 'react';
import RAW_PAYMENTS from '../data/payment_data.json';

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  paid:         { label: 'Paid',          bg: '#dcfce7', color: '#15803d', border: '#86efac', icon: '✅' },
  pending:      { label: 'Pending',       bg: '#fffbeb', color: '#b45309', border: '#fde68a', icon: '⏳' },
  about_to_due: { label: 'About to Due',  bg: '#fef3c7', color: '#d97706', border: '#fcd34d', icon: '🔔' },
  expired:      { label: 'Overdue',       bg: '#fef2f2', color: '#dc2626', border: '#fecaca', icon: '🚫' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const fmtL = (n) => n >= 10000000 ? `₹${(n/10000000).toFixed(2)}Cr` : n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : fmt(n);

function showToast(msg, type, setToast) {
  setToast({ msg, type });
  setTimeout(() => setToast(null), 3000);
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PaymentHistory() {
  const [activeTab, setActiveTab]         = useState('all');
  const [searchQuery, setSearchQuery]     = useState('');
  const [selectedYear, setSelectedYear]   = useState('all');
  const [selectedVillage, setSelectedVillage] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [payMethod, setPayMethod]         = useState('UPI');
  const [refNo, setRefNo]                 = useState('');
  const [toast, setToast]                 = useState(null);
  const [payments, setPayments]           = useState(RAW_PAYMENTS);
  const [page, setPage]                   = useState(1);
  const PER_PAGE = 15;

  // ── Unique filter values ───────────────────────────────────────────────────
  const villages = useMemo(() => ['all', ...Array.from(new Set(RAW_PAYMENTS.map(p => p.village).filter(Boolean))).sort()], []);
  const years    = useMemo(() => ['all', ...Array.from(new Set(RAW_PAYMENTS.map(p => String(p.year)))).sort().reverse()], []);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total     = payments.reduce((s, p) => s + p.annual_amount, 0);
    const collected = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.annual_amount, 0);
    const pending   = payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.annual_amount, 0);
    const due_soon  = payments.filter(p => p.status === 'about_to_due').reduce((s, p) => s + p.annual_amount, 0);
    const expired   = payments.filter(p => p.status === 'expired').reduce((s, p) => s + p.annual_amount, 0);
    return { total, collected, pending, due_soon, expired, rate: total > 0 ? Math.round((collected/total)*100) : 0 };
  }, [payments]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return payments.filter(p => {
      if (activeTab !== 'all' && p.status !== activeTab) return false;
      if (selectedYear !== 'all' && String(p.year) !== selectedYear) return false;
      if (selectedVillage !== 'all' && p.village !== selectedVillage) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          p.invoice_id?.toLowerCase().includes(q) ||
          p.reservation_no?.toLowerCase().includes(q) ||
          p.reservation_name?.toLowerCase().includes(q) ||
          p.village?.toLowerCase().includes(q) ||
          p.survey_no?.toLowerCase().includes(q) ||
          p.gis_id?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [payments, activeTab, searchQuery, selectedYear, selectedVillage]);

  const paginated = useMemo(() => filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  // Reset page on filter change
  useEffect(() => setPage(1), [activeTab, searchQuery, selectedYear, selectedVillage]);

  // ── Handle collect payment ─────────────────────────────────────────────────
  function handleCollect(e) {
    e.preventDefault();
    if (!refNo.trim()) return;
    setPayments(prev => prev.map(p =>
      p.invoice_id === selectedPayment.invoice_id
        ? { ...p, status: 'paid', payment_mode: payMethod, txn_id: refNo, paid_date: new Date().toLocaleDateString('en-IN') }
        : p
    ));
    showToast(`✅ Payment collected for ${selectedPayment.invoice_id}`, 'success', setToast);
    setSelectedPayment(null);
    setRefNo('');
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  function exportCSV() {
    const cols = ['Invoice ID','Reservation No','Reservation Name','Village','Survey No','Year','Amount','Due Date','Status','Paid Date','Txn ID'];
    const rows = filtered.map(p => [
      p.invoice_id, p.reservation_no, p.reservation_name, p.village, p.survey_no,
      p.year, p.annual_amount, p.due_date, p.status, p.paid_date, p.txn_id
    ]);
    const csv = [cols, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `MBMC_Payment_${activeTab}_${selectedYear}.csv`;
    a.click();
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#f0f4f8' }}>

      {/* ── Toast ─────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '24px', zIndex: 9999,
          background: toast.type === 'success' ? '#15803d' : '#dc2626',
          color: 'white', borderRadius: '10px', padding: '12px 20px',
          fontWeight: 700, fontSize: '13px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          animation: 'slideIn 0.3s ease',
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Header Banner ────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f2044 0%, #1e3a5f 50%, #163372 100%)',
        padding: '28px 32px 44px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: '-40px', top: '-40px', width: '220px', height: '220px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', left: '42%', bottom: '-60px', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(37,99,235,0.12)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '6px' }}>
            💳 MBMC — PAYMENT MANAGEMENT
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 900, color: 'white', margin: '0 0 4px', letterSpacing: '-0.5px' }}>
            Payment History
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '13px', margin: 0 }}>
            {RAW_PAYMENTS.length.toLocaleString()} records · {villages.length - 1} villages · Source: MASTER EXCEL.csv (MBMC 2023)
          </p>
        </div>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────────────── */}
      <div style={{ padding: '0 32px', marginTop: '-24px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          {[
            { label: 'Total Collected', value: fmtL(stats.collected), sub: `${stats.rate}% collection rate`, gradient: 'linear-gradient(135deg,#16a34a,#15803d)', icon: '✅' },
            { label: 'Pending', value: fmtL(stats.pending), sub: `${payments.filter(p=>p.status==='pending').length} invoices`, gradient: 'linear-gradient(135deg,#d97706,#b45309)', icon: '⏳' },
            { label: 'About to Due', value: fmtL(stats.due_soon), sub: `${payments.filter(p=>p.status==='about_to_due').length} invoices`, gradient: 'linear-gradient(135deg,#f59e0b,#d97706)', icon: '🔔' },
            { label: 'Overdue', value: fmtL(stats.expired), sub: `${payments.filter(p=>p.status==='expired').length} invoices`, gradient: 'linear-gradient(135deg,#dc2626,#b91c1c)', icon: '🚫' },
            { label: 'Total Demand', value: fmtL(stats.total), sub: `All ${payments.length} invoices`, gradient: 'linear-gradient(135deg,#2563eb,#1d4ed8)', icon: '📋' },
          ].map(card => (
            <div key={card.label} style={{
              background: card.gradient, borderRadius: '14px', padding: '18px 20px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.12)', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', right: '-12px', top: '-12px', width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>{card.icon} {card.label}</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>{card.value}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', marginTop: '4px', fontWeight: 600 }}>{card.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters + Search ──────────────────────────────────────────── */}
      <div style={{ padding: '0 32px 16px' }}>
        <div style={{ background: 'white', borderRadius: '14px', padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e8edf2', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Search */}
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px' }}>🔍</span>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search Invoice, Reservation No, Village, Survey No..."
              style={{ width: '100%', paddingLeft: '34px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Year filter */}
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, color: '#374151', background: 'white', cursor: 'pointer' }}>
            {years.map(y => <option key={y} value={y}>{y === 'all' ? 'All Years' : y}</option>)}
          </select>

          {/* Village filter */}
          <select value={selectedVillage} onChange={e => setSelectedVillage(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, color: '#374151', background: 'white', cursor: 'pointer' }}>
            {villages.map(v => <option key={v} value={v}>{v === 'all' ? 'All Villages' : v}</option>)}
          </select>

          {/* Export */}
          <button onClick={exportCSV} style={{ padding: '8px 16px', borderRadius: '8px', background: '#0f172a', color: 'white', border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            📤 Export CSV
          </button>
        </div>
      </div>

      {/* ── Status Tabs ───────────────────────────────────────────────── */}
      <div style={{ padding: '0 32px 16px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { key: 'all',         label: `All (${payments.length})`,                                         color: '#64748b' },
            { key: 'paid',        label: `✅ Paid (${payments.filter(p=>p.status==='paid').length})`,        color: '#15803d' },
            { key: 'pending',     label: `⏳ Pending (${payments.filter(p=>p.status==='pending').length})`,  color: '#b45309' },
            { key: 'about_to_due',label: `🔔 About to Due (${payments.filter(p=>p.status==='about_to_due').length})`, color: '#d97706' },
            { key: 'expired',     label: `🚫 Overdue (${payments.filter(p=>p.status==='expired').length})`,  color: '#dc2626' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '12px',
              background: activeTab === tab.key ? tab.color : '#f1f5f9',
              color: activeTab === tab.key ? 'white' : '#64748b',
              transition: 'all 0.2s',
            }}>
              {tab.label}
            </button>
          ))}

          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#94a3b8', fontWeight: 600, alignSelf: 'center' }}>
            Showing {filtered.length} records
          </span>
        </div>
      </div>

      {/* ── Payment Table ─────────────────────────────────────────────── */}
      <div style={{ padding: '0 32px 32px' }}>
        <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e8edf2', overflow: 'hidden' }}>

          {/* Table Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 100px 160px 110px 90px 80px 110px 100px 140px', padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e8edf2', fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', gap: '8px' }}>
            <span>Invoice ID</span>
            <span>Res. No</span>
            <span>Property Name</span>
            <span>Village</span>
            <span>Year</span>
            <span>Area m²</span>
            <span>Amount</span>
            <span>Due Date</span>
            <span>Status</span>
          </div>

          {/* Rows */}
          {paginated.length === 0 && (
            <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
              No records found
            </div>
          )}
          {paginated.map((p, i) => {
            const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending;
            return (
              <div key={p.invoice_id} style={{
                display: 'grid', gridTemplateColumns: '120px 100px 160px 110px 90px 80px 110px 100px 140px',
                padding: '13px 20px', borderBottom: i < paginated.length - 1 ? '1px solid #f8fafc' : 'none',
                alignItems: 'center', gap: '8px', transition: 'background 0.15s', cursor: 'default',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>{p.invoice_id}</span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>RES-{p.reservation_no}</span>
                <span style={{ fontSize: '12px', color: '#374151', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.reservation_name}>{p.reservation_name}</span>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>📍 {p.village}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>{p.year}</span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>{p.area_sqm.toLocaleString()}</span>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{fmt(p.annual_amount)}</span>
                <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{p.due_date}</span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '20px', fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, whiteSpace: 'nowrap' }}>
                    {sc.icon} {sc.label}
                  </span>
                  {p.status !== 'paid' && (
                    <button onClick={() => setSelectedPayment(p)} style={{
                      fontSize: '10px', padding: '3px 8px', borderRadius: '6px',
                      background: '#2563eb', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer',
                    }}>
                      Collect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: page === 1 ? '#f8fafc' : 'white', color: page === 1 ? '#cbd5e1' : '#374151', cursor: page === 1 ? 'default' : 'pointer', fontWeight: 700, fontSize: '12px' }}>
              ← Prev
            </button>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, padding: '6px 12px' }}>
              Page {page} of {totalPages} ({filtered.length} records)
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: page === totalPages ? '#f8fafc' : 'white', color: page === totalPages ? '#cbd5e1' : '#374151', cursor: page === totalPages ? 'default' : 'pointer', fontWeight: 700, fontSize: '12px' }}>
              Next →
            </button>
          </div>
        )}
      </div>

      {/* ── Collect Payment Modal ─────────────────────────────────────── */}
      {selectedPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>💰 Collect Payment</h2>
            <p style={{ margin: '0 0 20px', fontSize: '12px', color: '#94a3b8' }}>Invoice: <b style={{ color: '#2563eb' }}>{selectedPayment.invoice_id}</b></p>

            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '14px', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                ['Reservation', `RES-${selectedPayment.reservation_no}`],
                ['Property', selectedPayment.reservation_name],
                ['Village', selectedPayment.village],
                ['Survey No', selectedPayment.survey_no],
                ['Year', selectedPayment.year],
                ['Amount', fmt(selectedPayment.annual_amount)],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{v}</div>
                </div>
              ))}
            </div>

            <form onSubmit={handleCollect} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', display: 'block' }}>Payment Mode</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white' }}>
                  {['UPI', 'NEFT', 'RTGS', 'Cheque', 'Cash', 'Online Portal'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', display: 'block' }}>Transaction / Reference No *</label>
                <input required value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="e.g. TXN123456 / CHQ No." style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button type="button" onClick={() => setSelectedPayment(null)} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" style={{ flex: 2, padding: '11px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}>
                  ✅ Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
