import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../lib/dateUtils';

// Toggle component
const Toggle = ({ checked, onChange, label, dotColor }) => (
  <label className="flex items-center gap-1.5 text-[10px] font-medium cursor-pointer select-none" style={{ color: 'var(--ink)' }}>
    <div className="relative w-7 h-4 rounded-full transition-colors" style={{ background: checked ? 'var(--teal3)' : 'var(--line)' }}
      onClick={() => onChange(!checked)}>
      <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all"
        style={{ left: checked ? '14px' : '2px' }} />
    </div>
    {dotColor && <span className="w-2.5 h-2.5 rounded-full" style={{ background: dotColor, border: '1px solid var(--line)' }} />}
    {label}
  </label>
);

export default function Statement() {
  const { state, setPhysical, setCrm, groupByCategory } = useInventory();
  const { activeGodown, isAdmin, isManager } = useAuth();

  const [statementGodown, setStatementGodown] = useState(activeGodown);

  useEffect(() => {
    // eslint-disable-next-line
    setStatementGodown(activeGodown);
  }, [activeGodown]);

  // ── Filter toggles ──
  const [showOpening, setShowOpening] = useState(true);
  const [showSales, setShowSales] = useState(true);
  const [showPurchases, setShowPurchases] = useState(true);
  const [showDcwrIn, setShowDcwrIn] = useState(true);
  const [showTransfers, setShowTransfers] = useState(true);
  const [showAdjustments, setShowAdjustments] = useState(true);
  const [showThirdParty, setShowThirdParty] = useState(true);
  const [showFinal, setShowFinal] = useState(true);
  const [showPhysical, setShowPhysical] = useState(true);
  const [showCrm, setShowCrm] = useState(true);
  const [showDiff, setShowDiff] = useState(true);
  const [nonZeroOnly, setNonZeroOnly] = useState(false);
  const [highlightDisc, setHighlightDisc] = useState(false);

  // ── Advanced filters ──
  const [filterCat, setFilterCat] = useState('all');
  const [filterParty, setFilterParty] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const categories = useMemo(() =>
    [...new Set(state.products.map(p => p.category))].sort(),
    [state.products]
  );

  // ── Filter products ──
  const filteredProducts = useMemo(() => {
    let prods = state.products;
    if (filterCat !== 'all') prods = prods.filter(p => p.category === filterCat);
    return prods;
  }, [state.products, filterCat]);

  // ── Filter transactions by date & party ──
  const filteredSales = useMemo(() =>
    state.sales.filter(s => {
      if (statementGodown !== 'All Godowns' && s.godown !== statementGodown) return false;
      if (s.type === 'DCWR') return false;
      if (filterDateFrom && s.date < filterDateFrom) return false;
      if (filterDateTo && s.date > filterDateTo) return false;
      if (filterParty && !(s.party || '').toUpperCase().includes(filterParty.toUpperCase())) return false;
      return true;
    }),
    [state.sales, filterDateFrom, filterDateTo, filterParty, statementGodown]
  );

  const filteredPurchases = useMemo(() =>
    state.purchases.filter(p => {
      if (statementGodown !== 'All Godowns' && p.godown !== statementGodown) return false;
      if (p.type === 'DCWR') return false;
      if (filterDateFrom && p.date < filterDateFrom) return false;
      if (filterDateTo && p.date > filterDateTo) return false;
      if (filterParty && !(p.party || p.supplier || '').toUpperCase().includes(filterParty.toUpperCase())) return false;
      return true;
    }),
    [state.purchases, filterDateFrom, filterDateTo, filterParty, statementGodown]
  );

  // ── Quantity helpers ──
  const getGodownSum = useCallback((dataSource, id) => {
    if (statementGodown === 'All Godowns') {
      return Object.values(dataSource).reduce((s, g) => s + (g[id] || 0), 0);
    }
    return dataSource[statementGodown]?.[id] || 0;
  }, [statementGodown]);

  const openQ = useCallback((id) => getGodownSum(state.opening, id), [state.opening, getGodownSum]);
  const physQ = useCallback((id) => getGodownSum(state.physical, id), [state.physical, getGodownSum]);
  const crmQ = useCallback((id) => getGodownSum(state.crm, id), [state.crm, getGodownSum]);

  const totalPur = useCallback((id) => filteredPurchases.reduce((s, p) => s + (p.items[id] || 0), 0), [filteredPurchases]);
  const totalSal = useCallback((id) => filteredSales.reduce((s, sal) => s + (sal.items[id] || 0), 0), [filteredSales]);
  
  const totalDcwrInQ = useCallback((id) => state.dcwrIn.filter(r => statementGodown === 'All Godowns' || r.godown === statementGodown).reduce((s, r) => s + (r.items[id] || 0), 0), [state.dcwrIn, statementGodown]);
  const totalTransfersInQ = useCallback((id) => state.transfers.filter(t => statementGodown === 'All Godowns' || t.toGodown === statementGodown).reduce((s, t) => s + (t.items[id] || 0), 0), [state.transfers, statementGodown]);
  const totalTransfersOutQ = useCallback((id) => state.transfers.filter(t => statementGodown === 'All Godowns' || t.fromGodown === statementGodown).reduce((s, t) => s + (t.items[id] || 0), 0), [state.transfers, statementGodown]);
  const totalAdjustmentsNegativeQ = useCallback((id) => (
    state.adjustments
      .filter(a => (statementGodown === 'All Godowns' || a.godown === statementGodown) && !(a.type || '').startsWith('ADD:'))
      .reduce((s, a) => s + (a.items[id] || 0), 0)
  ), [state.adjustments, statementGodown]);
  const totalAdjustmentsPositiveQ = useCallback((id) => (
    state.adjustments
      .filter(a => (statementGodown === 'All Godowns' || a.godown === statementGodown) && (a.type || '').startsWith('ADD:'))
      .reduce((s, a) => s + (a.items[id] || 0), 0)
  ), [state.adjustments, statementGodown]);
  const totalAdjustmentsQ = useCallback((id) => (
    state.adjustments
      .filter(a => statementGodown === 'All Godowns' || a.godown === statementGodown)
      .reduce((s, a) => {
        const qty = a.items[id] || 0;
        // Positive adjustments are stored as type "ADD:*" and should add stock.
        const signed = (a.type || '').startsWith('ADD:') ? -qty : qty;
        return s + signed;
      }, 0)
  ), [state.adjustments, statementGodown]);

  // ── Third Party Stock helpers ──
  const thirdPartyByParty = useMemo(() => {
    const byParty = {};
    (state.thirdPartyEntries || []).forEach(e => {
      if ((e.status || 'pending') !== 'pending') return;
      const key = (e.party || '').trim();
      if (!key) return;
      if (!byParty[key]) byParty[key] = {};
      Object.entries(e.items || {}).forEach(([pid, qty]) => {
        const consumed = e.consumedItems?.[pid] || 0;
        const remaining = Math.max(0, (qty || 0) - consumed);
        if (remaining > 0) byParty[key][pid] = (byParty[key][pid] || 0) + remaining;
      });
    });
    return byParty;
  }, [state.thirdPartyEntries]);

  const thirdPartyParties = useMemo(() => Object.keys(thirdPartyByParty).sort(), [thirdPartyByParty]);

  const totalThirdPartyQ = useCallback((id) => {
    return Object.values(thirdPartyByParty).reduce((sum, items) => sum + (items[id] || 0), 0);
  }, [thirdPartyByParty]);

  const thirdPartyPartyQ = useCallback((partyName, id) => {
    return thirdPartyByParty[partyName]?.[id] || 0;
  }, [thirdPartyByParty]);

  // ── Third Party consumed as Adjustment Sales ──
  const tpConsumedSales = useMemo(() => {
    return state.sales.filter(s => s.thirdPartySource);
  }, [state.sales]);

  const totalTPConsumedQ = useCallback((id) => {
    return tpConsumedSales.reduce((sum, s) => sum + (s.items?.[id] || 0), 0);
  }, [tpConsumedSales]);

  // ── TP Outward: pending TP entry items that left your warehouse ──
  // These are items given to third parties but not yet settled via an adjustment bill.
  // When consumed (adjustment bill), they disappear here and a normal sale takes over.
  const totalTPOutwardQ = useCallback((id) => {
    return (state.thirdPartyEntries || [])
      .filter(e => (e.status || 'pending') === 'pending')
      .reduce((sum, e) => sum + (e.items?.[id] || 0), 0);
  }, [state.thirdPartyEntries]);

  const finalQ = useCallback((id) => openQ(id) + totalPur(id) + totalDcwrInQ(id) + totalTransfersInQ(id) - totalSal(id) - totalTransfersOutQ(id) - totalAdjustmentsQ(id) - totalTPOutwardQ(id),
    [openQ, totalPur, totalDcwrInQ, totalTransfersInQ, totalSal, totalTransfersOutQ, totalAdjustmentsQ, totalTPOutwardQ]);
  const diffPhys = useCallback((id) => finalQ(id) - physQ(id), [finalQ, physQ]);
  const diffCrm = useCallback((id) => finalQ(id) - crmQ(id), [finalQ, crmQ]);

  // ── Products to display ──
  const products = useMemo(() => {
    if (!nonZeroOnly) return filteredProducts;
    return filteredProducts.filter(p => {
      const id = p.id;
      return openQ(id) || totalPur(id) || totalSal(id) || totalDcwrInQ(id) || physQ(id) || crmQ(id) || totalTransfersInQ(id) || totalTransfersOutQ(id) || totalAdjustmentsQ(id) || totalTPOutwardQ(id) || totalThirdPartyQ(id);
    });
  }, [filteredProducts, nonZeroOnly, openQ, totalPur, totalSal, totalDcwrInQ, physQ, crmQ, totalTransfersInQ, totalTransfersOutQ, totalAdjustmentsQ, totalTPOutwardQ, totalThirdPartyQ]);

  // ── Summary stats ──
  const sumQ = useCallback((fn) => products.reduce((s, p) => s + fn(p.id), 0), [products]);

  const stats = useMemo(() => ({
    products: products.length,
    opening: sumQ(openQ),
    sales: sumQ(totalSal),
    purchases: sumQ(totalPur),
    final: sumQ(finalQ),
    diffPhysTotal: sumQ(diffPhys),
    discrepCount: products.filter(p => diffPhys(p.id) !== 0).length,
  }), [products, sumQ, openQ, totalSal, totalPur, finalQ, diffPhys]);

  const resetFilters = () => {
    setShowOpening(true); setShowSales(true); setShowPurchases(true);
    setShowDcwrIn(true); setShowTransfers(true); setShowAdjustments(true); setShowFinal(true); setShowPhysical(true);
    setShowCrm(true); setShowDiff(true); setNonZeroOnly(false);
    setHighlightDisc(false); setFilterCat('all'); setFilterParty('');
    setFilterDateFrom(''); setFilterDateTo('');
  };

  const cellVal = (v, disc = false) => {
    const style = highlightDisc && disc ? { background: '#ffebee', color: '#c62828', fontWeight: 700 } : {};
    return <td className="text-center px-2 py-1.5" style={{ ...style, color: 'var(--ink)' }}>{!v || v === 0 ? '—' : v}</td>;
  };

  const finalCellVal = (v, minStock) => {
    const isLow = minStock > 0 && v < minStock;
    const style = isLow ? { color: 'var(--danger)', fontWeight: 800, background: 'rgba(255,0,0,0.1)' } : { color: 'var(--ink)' };
    return <td className="text-center px-2 py-1.5" style={style}>
      {!v || v === 0 ? '—' : v}
      {isLow && <span className="ml-1" title={`Low stock! Min is ${minStock}`}>⚠️</span>}
    </td>;
  };

  const diffCell = (v) => {
    const style = highlightDisc && v !== 0 ? { background: '#ffcdd2', fontWeight: 800 } : {};
    return (
      <td className="text-center px-2 py-1.5" style={{
        ...style,
        color: v < 0 ? 'var(--danger)' : v > 0 ? 'var(--success)' : 'var(--muted)',
        fontWeight: v !== 0 ? 700 : 400,
      }}>
        {v === 0 ? '—' : v > 0 ? `+${v}` : v}
      </td>
    );
  };



  if (!state.products.length) {
    return (
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
        <div className="px-4 py-3 font-semibold text-sm" style={{ background: 'var(--teal)', color: '#f2ebd9' }}>📊 Inventory Statement</div>
        <div className="p-8 text-center" style={{ color: 'var(--muted)' }}>
          <div className="text-3xl mb-2">📊</div>Add products first.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
        <div className="px-4 py-3 font-semibold text-sm flex items-center justify-between" style={{ background: 'var(--teal)', color: '#f2ebd9' }}>
          <span>📊 Statement of Inventory</span>
          <span className="text-[10px] tracking-widest px-2 py-0.5 rounded-full bg-white/10 uppercase">{activeGodown}</span>
        </div>

        <div className="p-4 space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
            {[
              { val: stats.products, label: 'Products' },
              { val: stats.opening, label: 'Opening Total' },
              { val: stats.sales, label: 'Total Sales', accent: true },
              { val: stats.purchases, label: 'Total Purchase' },
              { val: stats.final, label: 'Final Stock' },
              { val: stats.diffPhysTotal === 0 ? '✓' : (stats.diffPhysTotal > 0 ? '+' : '') + stats.diffPhysTotal, label: 'Δ Physical', warn: stats.diffPhysTotal !== 0 },
              { val: stats.discrepCount, label: 'Discrepancies', warn: stats.discrepCount > 0 },
            ].map((s, i) => (
              <div key={i} className="rounded-lg px-3 py-2 text-center" style={{
                background: s.warn ? 'var(--diff-bg)' : s.accent ? 'var(--sale-bg)' : 'var(--soft)',
                border: '1px solid var(--line)',
              }}>
                <div className="text-lg font-bold" style={{ color: s.warn ? 'var(--danger)' : s.accent ? 'var(--accent)' : 'var(--ink)' }}>{s.val}</div>
                <div className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: 'var(--muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filter Toolbar */}
          <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--soft)', border: '1px solid var(--line)' }}>
            {/* Row 1: Section toggles */}
            <div className="flex flex-wrap gap-3">
              <Toggle checked={showOpening} onChange={setShowOpening} label="Opening" dotColor="var(--open-bg)" />
              <Toggle checked={showSales} onChange={setShowSales} label="Sales" dotColor="var(--sale-bg)" />
              <Toggle checked={showPurchases} onChange={setShowPurchases} label="Purchases" dotColor="var(--pur-bg)" />
              <Toggle checked={showDcwrIn} onChange={setShowDcwrIn} label="DCWR IN" dotColor="#f5f0ff" />
              <Toggle checked={showTransfers} onChange={setShowTransfers} label="Transfers" dotColor="#e3f2fd" />
              <Toggle checked={showAdjustments} onChange={setShowAdjustments} label="Adjustments" dotColor="#ffebee" />
              <Toggle checked={showThirdParty} onChange={setShowThirdParty} label="Third Party" dotColor="#f3e8ff" />
              <Toggle checked={showFinal} onChange={setShowFinal} label="Final" dotColor="var(--final-bg)" />
              <Toggle checked={showPhysical} onChange={setShowPhysical} label="Physical" dotColor="var(--phys-bg)" />
              <Toggle checked={showCrm} onChange={setShowCrm} label="CRM" dotColor="var(--crm-bg)" />
              <Toggle checked={showDiff} onChange={setShowDiff} label="Difference" dotColor="var(--diff-bg)" />
            </div>
            {/* Row 2: Advanced */}
            <div className="flex flex-wrap items-center gap-3 pt-1 border-t" style={{ borderColor: 'var(--line)' }}>
              <div className="flex items-center gap-1">
                <label className="text-[10px] font-semibold" style={{ color: 'var(--muted)' }}>Category:</label>
                <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                  className="px-2 py-1 rounded text-[10px] outline-none"
                  style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                  <option value="all">All Categories</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[10px] font-semibold" style={{ color: 'var(--muted)' }}>Party:</label>
                <input value={filterParty} onChange={e => setFilterParty(e.target.value)} placeholder="Search party..."
                  className="px-2 py-1 rounded text-[10px] outline-none w-28"
                  style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[10px] font-semibold" style={{ color: 'var(--muted)' }}>From:</label>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                  className="px-2 py-1 rounded text-[10px] outline-none"
                  style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[10px] font-semibold" style={{ color: 'var(--muted)' }}>To:</label>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                  className="px-2 py-1 rounded text-[10px] outline-none"
                  style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
              </div>
              <Toggle checked={nonZeroOnly} onChange={setNonZeroOnly} label="Non-zero only" />
              <Toggle checked={highlightDisc} onChange={setHighlightDisc} label="🔴 Highlight discrepancies" />
              <button onClick={resetFilters} className="text-[10px] px-2 py-1 rounded"
                style={{ background: 'var(--paper)', color: 'var(--muted)', border: '1px solid var(--line)' }}>↺ Reset</button>
              
              <div className="ml-auto flex items-center gap-2">
                {isAdmin || isManager ? (
                  <select value={statementGodown} onChange={e => setStatementGodown(e.target.value)}
                    className="px-3 py-1 rounded text-[10px] font-bold outline-none cursor-pointer"
                    style={{ background: 'var(--soft)', color: 'var(--teal3)', border: '1px solid var(--line)' }}>
                    <option value="1 Vasai">1 Vasai</option>
                    <option value="2 Virar">2 Virar</option>
                    <option value="All Godowns">🌍 All Combined</option>
                  </select>
                ) : null}
                <button onClick={() => {
                const table = document.querySelector('.statement-table');
                if (!table) return;
                let csv = [];
                const rows = table.querySelectorAll('tr');
                for (let i = 0; i < rows.length; i++) {
                  let row = [], cols = rows[i].querySelectorAll('td, th');
                  for (let j = 0; j < cols.length; j++) {
                    let data = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, ' ').replace(/"/g, '""');
                    data = data.replace('⚠️', '').trim();
                    if (data === '—') data = '0';
                    row.push('"' + data + '"');
                  }
                  csv.push(row.join(','));
                }
                const csvString = csv.join('\n');
                const blob = new Blob(['\ufeff' + csvString], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", `Inventory_Statement_${statementGodown}_${new Date().toLocaleDateString()}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }} 
              className="text-[10px] px-3 py-1 rounded font-bold shadow-sm transition-all"
              style={{ background: '#217346', color: '#fff' }}>
                📥 Export CSV
              </button>
              </div>
            </div>
          </div>

          {/* Statement Table */}
          <div className="table-responsive" style={{ maxHeight: '70vh' }}>
            <table className="statement-table border-collapse" style={{ minWidth: `${products.length * 70 + 200}px` }}>
              <thead>
                <tr style={{ background: 'var(--teal)' }}>
                  <th className="px-3 py-2 text-left font-semibold text-white/90 sticky left-0 z-10" style={{ background: 'var(--teal)', minWidth: 160 }}>Description</th>
                  {products.map(p => (
                    <th key={p.id} className="px-2 py-2 text-center font-semibold text-white/90 whitespace-nowrap" title={p.category}>
                      {p.code}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-bold text-white" style={{ background: 'var(--teal)' }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening */}
                {showOpening && (
                  <tr style={{ background: 'var(--open-bg)' }}>
                    <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'var(--open-bg)', color: 'var(--ink)' }}>Opening Stock</td>
                    {products.map(p => cellVal(openQ(p.id)))}
                    <td className="px-3 py-1.5 text-center font-bold" style={{ color: 'var(--ink)' }}>{sumQ(openQ) || '—'}</td>
                  </tr>
                )}

                {/* Sales rows – grouped by date */}
                {showSales && filteredSales.length > 0 && (() => {
                  // Build ordered map: date -> bills[]
                  const salesByDate = filteredSales.reduce((acc, s) => {
                    (acc[s.date] = acc[s.date] || []).push(s);
                    return acc;
                  }, {});
                  const sortedDates = Object.keys(salesByDate).sort();
                  return (
                    <>
                      <tr><td colSpan={products.length + 2} className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider"
                        style={{ background: 'var(--line)', color: 'var(--muted)' }}>
                        ⬇ OUTWARD SALES ({filteredSales.length})
                      </td></tr>
                      {sortedDates.map(date => {
                        const bills = salesByDate[date];
                        const dateTotalQty = bills.reduce((sum, s) => sum + Object.values(s.items).reduce((a, b) => a + b, 0), 0);
                        const dateProductTotals = {};
                        bills.forEach(s => {
                          products.forEach(p => {
                            dateProductTotals[p.id] = (dateProductTotals[p.id] || 0) + (s.items[p.id] || 0);
                          });
                        });
                        return (
                          <React.Fragment key={date}>
                            {/* Date header sub-row */}
                            <tr style={{ background: 'rgba(var(--sale-rgb, 255,235,230), 0.55)', borderTop: '2px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
                              <td className="px-3 py-1 sticky left-0 z-5 font-bold text-[11px]"
                                style={{ background: 'var(--sale-bg)', color: 'var(--accent)', letterSpacing: '0.04em', borderLeft: '4px solid var(--accent)' }}>
                                📅 {formatDate(date)}
                                <span className="ml-2 text-[9px] font-normal" style={{ color: 'var(--muted)' }}>
                                  ({bills.length} {bills.length === 1 ? 'bill' : 'bills'})
                                </span>
                              </td>
                              {products.map(p => (
                                <td key={p.id} className="text-center px-2 py-1 text-[9px] font-semibold" style={{ color: 'var(--muted)' }}>
                                  {dateProductTotals[p.id] ? dateProductTotals[p.id] : ''}
                                </td>
                              ))}
                              <td className="px-3 py-1 text-center text-[9px] font-semibold" style={{ color: 'var(--muted)' }}>
                                {dateTotalQty || ''}
                              </td>
                            </tr>
                            {/* Bills under this date */}
                            {bills.map((s, i) => {
                              const rt = Object.values(s.items).reduce((a, b) => a + b, 0);
                              return (
                                <tr key={s.id} style={{ background: 'var(--sale-bg)' }}>
                                  <td className="pl-6 pr-3 py-1 sticky left-0 z-5" style={{ background: 'var(--sale-bg)', color: 'var(--ink)' }}>
                                    <span className="text-[9px]" style={{ color: 'var(--muted)' }}>
                                      {s.bill || `#${i + 1}`} · <b>{s.type}</b>
                                    </span><br />
                                    {s.party.length > 32 ? s.party.slice(0, 30) + '…' : s.party}
                                  </td>
                                  {products.map(p => cellVal(s.items[p.id] || 0))}
                                  <td className="px-3 py-1 text-center font-bold" style={{ color: 'var(--ink)' }}>{rt || '—'}</td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </>
                  );
                })()}
                {showSales && (
                  <>
                    <tr style={{ background: 'var(--sale-bg)', fontWeight: 700 }}>
                      <td className="px-3 py-1.5 font-bold sticky left-0 z-5" style={{ background: 'var(--sale-bg)', color: 'var(--ink)' }}>Total Sales</td>
                      {products.map(p => cellVal(totalSal(p.id)))}
                      <td className="px-3 py-1.5 text-center font-bold" style={{ color: 'var(--ink)' }}>{sumQ(totalSal) || '—'}</td>
                    </tr>
                    {/* TP Consumed Subcategory */}
                    {sumQ(totalTPConsumedQ) > 0 && (
                      <tr style={{ background: 'rgba(255,107,107,0.05)' }}>
                        <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'rgba(255,107,107,0.05)', color: 'var(--ink)' }}>
                          ↳ Adjustment Sales<br />
                          <span className="text-[9px] font-normal" style={{ color: 'var(--muted)' }}>Sales that settled third-party stock (included in Total Sales)</span>
                        </td>
                        {products.map(p => cellVal(totalTPConsumedQ(p.id)))}
                        <td className="px-3 py-1.5 text-center font-bold" style={{ color: 'var(--ink)' }}>{sumQ(totalTPConsumedQ) || '—'}</td>
                      </tr>
                    )}
                    {/* TP Outward — stock sent to third parties (pending entries) */}
                    {sumQ(totalTPOutwardQ) > 0 && (
                      <tr style={{ background: 'rgba(168, 85, 247, 0.06)', borderLeft: '4px solid #a855f7' }}>
                        <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'rgba(168, 85, 247, 0.06)', color: 'var(--ink)' }}>
                          <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold mr-1.5 align-middle" style={{ background: '#a855f7', color: '#fff' }}>TP</span>
                          Third Party Outward<br />
                          <span className="text-[9px] font-normal" style={{ color: 'var(--muted)' }}>Stock given to third parties (pending settlement)</span>
                        </td>
                        {products.map(p => cellVal(totalTPOutwardQ(p.id)))}
                        <td className="px-3 py-1.5 text-center font-bold text-white" style={{ background: '#a855f7' }}>{sumQ(totalTPOutwardQ) || '—'}</td>
                      </tr>
                    )}
                  </>
                )}

                {/* Purchase rows – grouped by date */}
                {showPurchases && filteredPurchases.length > 0 && (() => {
                  const purByDate = filteredPurchases.reduce((acc, p) => {
                    (acc[p.date] = acc[p.date] || []).push(p);
                    return acc;
                  }, {});
                  const sortedDates = Object.keys(purByDate).sort();
                  return (
                    <>
                      <tr><td colSpan={products.length + 2} className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider"
                        style={{ background: 'var(--line)', color: 'var(--muted)' }}>
                        ⬆ INWARD PURCHASES ({filteredPurchases.length})
                      </td></tr>
                      {sortedDates.map(date => {
                        const bills = purByDate[date];
                        const dateTotalQty = bills.reduce((sum, pur) => sum + Object.values(pur.items).reduce((a, b) => a + b, 0), 0);
                        const dateProductTotals = {};
                        bills.forEach(pur => {
                          products.forEach(p => {
                            dateProductTotals[p.id] = (dateProductTotals[p.id] || 0) + (pur.items[p.id] || 0);
                          });
                        });
                        return (
                          <React.Fragment key={date}>
                            {/* Date header sub-row */}
                            <tr style={{ background: 'var(--pur-bg)', borderTop: '2px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
                              <td className="px-3 py-1 sticky left-0 z-5 font-bold text-[11px]"
                                style={{ background: 'var(--pur-bg)', color: 'var(--success)', letterSpacing: '0.04em', borderLeft: '4px solid var(--success)' }}>
                                📅 {formatDate(date)}
                                <span className="ml-2 text-[9px] font-normal" style={{ color: 'var(--muted)' }}>
                                  ({bills.length} {bills.length === 1 ? 'bill' : 'bills'})
                                </span>
                              </td>
                              {products.map(p => (
                                <td key={p.id} className="text-center px-2 py-1 text-[9px] font-semibold" style={{ color: 'var(--muted)' }}>
                                  {dateProductTotals[p.id] ? dateProductTotals[p.id] : ''}
                                </td>
                              ))}
                              <td className="px-3 py-1 text-center text-[9px] font-semibold" style={{ color: 'var(--muted)' }}>
                                {dateTotalQty || ''}
                              </td>
                            </tr>
                            {/* Bills under this date */}
                            {bills.map((pur, i) => {
                              const rt = Object.values(pur.items).reduce((a, b) => a + b, 0);
                              return (
                                <tr key={pur.id} style={{ background: 'var(--pur-bg)' }}>
                                  <td className="pl-6 pr-3 py-1 sticky left-0 z-5" style={{ background: 'var(--pur-bg)', color: 'var(--ink)' }}>
                                    <span className="text-[9px]" style={{ color: 'var(--muted)' }}>
                                      {pur.bill || `#${i + 1}`} · <b>{pur.type}</b>
                                    </span><br />
                                    {(pur.party || '').length > 32 ? pur.party.slice(0, 30) + '…' : pur.party}
                                  </td>
                                  {products.map(p => cellVal(pur.items[p.id] || 0))}
                                  <td className="px-3 py-1 text-center font-bold" style={{ color: 'var(--ink)' }}>{rt || '—'}</td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </>
                  );
                })()}
                {showPurchases && (
                  <tr style={{ background: 'var(--pur-bg)', fontWeight: 700 }}>
                    <td className="px-3 py-1.5 font-bold sticky left-0 z-5" style={{ background: 'var(--pur-bg)', color: 'var(--ink)' }}>Total Purchase</td>
                    {products.map(p => cellVal(totalPur(p.id)))}
                    <td className="px-3 py-1.5 text-center font-bold" style={{ color: 'var(--ink)' }}>{sumQ(totalPur) || '—'}</td>
                  </tr>
                )}

                {/* DCWR IN */}
                {showDcwrIn && state.dcwrIn.length > 0 && (
                  <tr style={{ background: 'var(--row-dcwr)', borderLeft: '4px solid var(--dcwr)' }}>
                    <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'var(--row-dcwr)', color: 'var(--ink)' }}>
                      DCWR IN (replacements received)<br />
                      <span className="text-[9px] font-normal" style={{ color: 'var(--muted)' }}>Adds to stock — customer replacements</span>
                    </td>
                    {products.map(p => cellVal(totalDcwrInQ(p.id)))}
                    <td className="px-3 py-1.5 text-center font-bold text-white" style={{ background: 'var(--dcwr)' }}>{sumQ(totalDcwrInQ) || '—'}</td>
                  </tr>
                )}

                {/* Transfers */}
                {showTransfers && (
                  <>
                    <tr style={{ background: 'var(--row-t-in)', borderLeft: '4px solid #2196f3' }}>
                      <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'var(--row-t-in)', color: 'var(--ink)' }}>
                        Transfers IN<br />
                        <span className="text-[9px] font-normal" style={{ color: 'var(--muted)' }}>Adds to stock — received from other godown</span>
                      </td>
                      {products.map(p => cellVal(totalTransfersInQ(p.id)))}
                      <td className="px-3 py-1.5 text-center font-bold text-white" style={{ background: '#2196f3' }}>{sumQ(totalTransfersInQ) || '—'}</td>
                    </tr>
                    <tr style={{ background: 'var(--row-t-out)', borderLeft: '4px solid #ff9800' }}>
                      <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'var(--row-t-out)', color: 'var(--ink)' }}>
                        Transfers OUT<br />
                        <span className="text-[9px] font-normal" style={{ color: 'var(--muted)' }}>Subtracts from stock — sent to other godown</span>
                      </td>
                      {products.map(p => cellVal(totalTransfersOutQ(p.id)))}
                      <td className="px-3 py-1.5 text-center font-bold text-white" style={{ background: '#ff9800' }}>{sumQ(totalTransfersOutQ) || '—'}</td>
                    </tr>
                  </>
                )}

                {/* Adjustments */}
                {showAdjustments && (
                  <>
                    <tr style={{ background: 'var(--row-adj)', borderLeft: '4px solid #f44336' }}>
                      <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'var(--row-adj)', color: 'var(--ink)' }}>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold mr-1.5 align-middle" style={{ background: '#f44336', color: '#fff' }}>NEG</span>
                        Adjustments (Negative)<br />
                        <span className="text-[9px] font-normal" style={{ color: 'var(--muted)' }}>Subtracts from stock</span>
                      </td>
                      {products.map(p => cellVal(totalAdjustmentsNegativeQ(p.id)))}
                      <td className="px-3 py-1.5 text-center font-bold text-white" style={{ background: '#f44336' }}>{sumQ(totalAdjustmentsNegativeQ) || '—'}</td>
                    </tr>
                    <tr style={{ background: 'var(--row-adj)', borderLeft: '4px solid #f44336' }}>
                      <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'var(--row-adj)', color: 'var(--ink)' }}>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold mr-1.5 align-middle" style={{ background: '#43a047', color: '#fff' }}>POS</span>
                        Adjustments (Positive)<br />
                        <span className="text-[9px] font-normal" style={{ color: 'var(--muted)' }}>Adds to stock</span>
                      </td>
                      {products.map(p => cellVal(totalAdjustmentsPositiveQ(p.id)))}
                      <td className="px-3 py-1.5 text-center font-bold text-white" style={{ background: '#f44336' }}>{sumQ(totalAdjustmentsPositiveQ) || '—'}</td>
                    </tr>
                    <tr style={{ background: 'var(--row-adj)', borderLeft: '4px solid #f44336' }}>
                      <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'var(--row-adj)', color: 'var(--ink)' }}>
                        Net Adjustments<br />
                        <span className="text-[9px] font-normal" style={{ color: 'var(--muted)' }}>Negative - Positive (used in final stock)</span>
                      </td>
                      {products.map(p => diffCell(-totalAdjustmentsQ(p.id)))}
                      {diffCell(-sumQ(totalAdjustmentsQ))}
                    </tr>
                  </>
                )}

                {/* Third Party Stock */}
                {showThirdParty && (
                  <>
                    <tr><td colSpan={products.length + 2} className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{ background: 'var(--line)', color: 'var(--muted)' }}>
                    🏷️ THIRD PARTY STOCK ({thirdPartyParties.length} {thirdPartyParties.length === 1 ? 'party' : 'parties'})
                  </td></tr>
                  {thirdPartyParties.length > 0 ? (
                    <>
                      {thirdPartyParties.map(partyName => (
                        <tr key={`tp-${partyName}`} style={{ background: 'rgba(168, 85, 247, 0.04)', borderLeft: '4px solid #a855f7' }}>
                          <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'rgba(168, 85, 247, 0.04)', color: 'var(--ink)' }}>
                            <span className="text-[10px]" style={{ color: '#a855f7' }}>🏷️</span> {partyName}<br />
                            <span className="text-[9px] font-normal" style={{ color: 'var(--muted)' }}>Pending third-party stock</span>
                          </td>
                          {products.map(p => cellVal(thirdPartyPartyQ(partyName, p.id)))}
                          <td className="px-3 py-1.5 text-center font-bold" style={{ color: '#a855f7' }}>
                            {Object.values(thirdPartyByParty[partyName] || {}).reduce((a, b) => a + b, 0) || '—'}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: 'rgba(168, 85, 247, 0.08)', fontWeight: 700, borderLeft: '4px solid #a855f7' }}>
                        <td className="px-3 py-1.5 font-bold sticky left-0 z-5" style={{ background: 'rgba(168, 85, 247, 0.08)', color: 'var(--ink)' }}>
                          Total Third Party Stock<br />
                          <span className="text-[9px] font-normal" style={{ color: 'var(--muted)' }}>Stock held by third parties (not in your possession)</span>
                        </td>
                        {products.map(p => cellVal(totalThirdPartyQ(p.id)))}
                        <td className="px-3 py-1.5 text-center font-bold text-white" style={{ background: '#a855f7' }}>{sumQ(totalThirdPartyQ) || '—'}</td>
                      </tr>
                    </>
                  ) : (
                    <tr style={{ background: 'rgba(168, 85, 247, 0.03)' }}>
                      <td colSpan={products.length + 2} className="px-3 py-3 text-center text-xs" style={{ color: 'var(--muted)' }}>
                        No pending third-party stock entries.
                      </td>
                    </tr>
                  )}

                  {/* Third Party consumed as Adjustment Sales */}
                  {tpConsumedSales.length > 0 && (
                    <tr style={{ background: 'rgba(168, 85, 247, 0.06)', borderLeft: '4px solid #7c3aed' }}>
                      <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'rgba(168, 85, 247, 0.06)', color: 'var(--ink)' }}>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold mr-1.5 align-middle" style={{ background: '#7c3aed', color: '#fff' }}>ADJ</span>
                        Adjustment Sales (Third Party)<br />
                        <span className="text-[9px] font-normal" style={{ color: 'var(--muted)' }}>Sold from third-party stock ({tpConsumedSales.length} bills)</span>
                      </td>
                      {products.map(p => cellVal(totalTPConsumedQ(p.id)))}
                      <td className="px-3 py-1.5 text-center font-bold text-white" style={{ background: '#7c3aed' }}>{sumQ(totalTPConsumedQ) || '—'}</td>
                    </tr>
                  )}
                </>
                )}

                {/* Final */}
                {showFinal && (
                  <tr style={{ background: 'var(--final-bg)', fontWeight: 700 }}>
                    <td className="px-3 py-1.5 font-bold sticky left-0 z-5" style={{ background: 'var(--final-bg)', color: 'var(--ink)' }}>
                      Final Total<br />
                      <span className="text-[9px] font-normal" style={{ color: 'var(--muted)' }}>Open + Pur + D_IN + T_IN − Sal − T_OUT − Adj − TP_OUT</span>
                    </td>
                    {products.map(p => finalCellVal(finalQ(p.id), p.min_stock))}
                    <td className="px-3 py-1.5 text-center font-bold" style={{ color: 'var(--ink)' }}>{sumQ(finalQ) || '—'}</td>
                  </tr>
                )}

                {/* Physical */}
                {showPhysical && (
                  <tr style={{ background: 'var(--phys-bg)' }}>
                    <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'var(--phys-bg)', color: 'var(--ink)' }}>
                      Physical Stock<br />
                      <span className="text-[9px] font-normal" style={{ color: 'var(--muted)' }}>Enter actual count ↓</span>
                    </td>
                    {products.map(p => (
                      <td key={p.id} className="text-center px-2 py-1.5">
                        <input type="number" min="0" value={physQ(p.id) || ''}
                          onChange={e => setPhysical(activeGodown, p.id, parseInt(e.target.value) || 0)}
                          className="w-12 px-1 py-0.5 rounded text-[10px] text-center outline-none"
                          style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                          placeholder="0" />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-center font-bold" style={{ color: 'var(--ink)' }}>{sumQ(physQ) || '—'}</td>
                  </tr>
                )}

                {/* CRM */}
                {showCrm && (
                  <tr style={{ background: 'var(--crm-bg)' }}>
                    <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'var(--crm-bg)', color: 'var(--ink)' }}>
                      CRM Stock<br />
                      <span className="text-[9px] font-normal" style={{ color: 'var(--muted)' }}>CRM system count ↓</span>
                    </td>
                    {products.map(p => (
                      <td key={p.id} className="text-center px-2 py-1.5">
                        <input type="number" min="0" value={crmQ(p.id) || ''}
                          onChange={e => setCrm(activeGodown, p.id, parseInt(e.target.value) || 0)}
                          className="w-12 px-1 py-0.5 rounded text-[10px] text-center outline-none"
                          style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                          placeholder="0" />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-center font-bold" style={{ color: 'var(--ink)' }}>{sumQ(crmQ) || '—'}</td>
                  </tr>
                )}

                {/* Differences */}
                {showDiff && (
                  <>
                    <tr style={{ background: 'var(--diff-bg)' }}>
                      <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'var(--diff-bg)', color: 'var(--ink)' }}>Diff (Final − Physical)</td>
                      {products.map(p => diffCell(diffPhys(p.id)))}
                      {diffCell(sumQ(diffPhys))}
                    </tr>
                    <tr style={{ background: 'var(--diff-bg)', opacity: 0.85 }}>
                      <td className="px-3 py-1.5 font-semibold sticky left-0 z-5" style={{ background: 'var(--diff-bg)', color: 'var(--ink)' }}>Diff (Final − CRM)</td>
                      {products.map(p => diffCell(diffCrm(p.id)))}
                      {diffCell(sumQ(diffCrm))}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
