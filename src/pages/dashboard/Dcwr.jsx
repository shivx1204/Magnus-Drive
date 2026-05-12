import { useState, useMemo, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import CategoryAccordion from '../../components/CategoryAccordion';
import BillPreviewModal from '../../components/BillPreviewModal';
import toast from 'react-hot-toast';
import { formatDate } from '../../lib/dateUtils';

export default function Dcwr() {
  const {
    state, addDcwrOut, removeDcwrOut, updateDcwrOut, addDcwrIn, removeDcwrIn, updateDcwrIn,
    dcwrOutstanding, groupByCategory,
  } = useInventory();
  const { activeGodown, isAdmin } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  // Admins can edit any bill; others can only edit same-day bills
  const canEditEntry = (entry) => isAdmin || (entry && entry.date === today);

  // ── DCWR OUT form ──
  const [outDate, setOutDate] = useState(new Date().toISOString().slice(0, 10));
  const [outChallan, setOutChallan] = useState('');
  const [outParty, setOutParty] = useState('Amara Raja Pvt Ltd');
  const [outRemark, setOutRemark] = useState('');
  const [outQty, setOutQty] = useState({});
  const [outGodown, setOutGodown] = useState(activeGodown);

  // ── DCWR IN form ──
  const [inDate, setInDate] = useState(new Date().toISOString().slice(0, 10));
  const [inRef, setInRef] = useState('');
  const [inRemark, setInRemark] = useState('');
  const [inQty, setInQty] = useState({});
  const [inGodown, setInGodown] = useState(activeGodown);

  useEffect(() => {
    setOutGodown(activeGodown);
    setInGodown(activeGodown);
  }, [activeGodown]);

  // ── View state ──
  const [view, setView] = useState('entry'); // 'entry' | 'tracker'
  const [outSearch, setOutSearch] = useState('');
  const [outSearchRef, setOutSearchRef] = useState('');
  const [outProduct, setOutProduct] = useState('');
  const [outFrom, setOutFrom] = useState('');
  const [outTo, setOutTo] = useState('');
  const [outRemarkFilter, setOutRemarkFilter] = useState('');
  const [selectedOut, setSelectedOut] = useState({});

  const [inSearch, setInSearch] = useState('');
  const [inSearchRef, setInSearchRef] = useState('');
  const [inProduct, setInProduct] = useState('');
  const [inFrom, setInFrom] = useState('');
  const [inTo, setInTo] = useState('');
  const [inRemarkFilter, setInRemarkFilter] = useState('');
  const [selectedIn, setSelectedIn] = useState({});

  const [editOutId, setEditOutId] = useState(null);
  const [editOutData, setEditOutData] = useState({});
  const [editInId, setEditInId] = useState(null);
  const [editInData, setEditInData] = useState({});
  const [previewEntry, setPreviewEntry] = useState(null);
  const [previewModule, setPreviewModule] = useState('');

  const groups = groupByCategory();
  const pmap = useMemo(() => {
    const m = {}; state.products.forEach(p => m[p.id] = p); return m;
  }, [state.products]);

  const visibleOuts = useMemo(() => {
    return state.dcwrOut
      .filter(d => d.godown === activeGodown)
      .reverse();
  }, [state.dcwrOut, activeGodown]);

  const visibleIns = useMemo(() => {
    return state.dcwrIn
      .filter(d => d.godown === activeGodown)
      .reverse();
  }, [state.dcwrIn, activeGodown]);

  const outMap = useMemo(() => {
    const m = {}; visibleOuts.forEach(d => m[d.id] = d); return m;
  }, [visibleOuts]);

  // Outstanding items for the selected DCWR OUT challan
  const outstanding = useMemo(() => {
    if (!inRef) return {};
    return dcwrOutstanding(inRef);
  }, [inRef, state.dcwrIn, state.dcwrOut, dcwrOutstanding]);

  // ── Handlers ──
  const handleAddOut = (e) => {
    e.preventDefault();
    if (!outDate) { toast.error('Select a date'); return; }
    if (!outParty.trim()) { toast.error('Enter party name'); return; }
    const items = {};
    Object.entries(outQty).forEach(([id, qty]) => { if (qty > 0) items[id] = qty; });
    if (!Object.keys(items).length) { toast.error('Enter at least one quantity'); return; }
    addDcwrOut({ godown: outGodown, date: outDate, challan: outChallan.trim(), party: outParty.trim(), remark: outRemark.trim(), items });
    toast.success('✓ DCWR OUT entry added');
    setOutQty({}); setOutChallan(''); setOutRemark('');
  };

  const handleAddIn = (e) => {
    e.preventDefault();
    if (!inDate) { toast.error('Select a date'); return; }
    if (!inRef) { toast.error('Select a DCWR challan'); return; }
    const items = {};
    Object.entries(inQty).forEach(([id, qty]) => { if (qty > 0) items[id] = qty; });
    if (!Object.keys(items).length) { toast.error('Enter at least one quantity received'); return; }
    addDcwrIn({ godown: inGodown, refOutId: inRef, date: inDate, remark: inRemark.trim(), items });
    toast.success('✓ DCWR IN receipt recorded');
    setInQty({}); setInRemark(''); setInRef('');
  };

  const filteredOut = useMemo(() => {
    const q = outSearch.toLowerCase();
    const prodQ = outProduct.toLowerCase();
    const remQ = outRemarkFilter.toLowerCase();
    return visibleOuts.filter(d =>
      (!outSearchRef || d.challan?.toLowerCase().includes(outSearchRef.toLowerCase())) &&
      (!outFrom || d.date >= outFrom) &&
      (!outTo || d.date <= outTo) &&
      (!remQ || d.remark?.toLowerCase().includes(remQ)) &&
      (!prodQ || Object.keys(d.items || {}).some((id) => {
        const code = (pmap[id]?.code || '').toLowerCase();
        const name = (pmap[id]?.name || '').toLowerCase();
        return code.includes(prodQ) || name.includes(prodQ);
      })) &&
      (!q || d.date?.includes(q) || d.challan?.toLowerCase().includes(q) ||
      d.party?.toLowerCase().includes(q) || d.remark?.toLowerCase().includes(q))
    );
  }, [visibleOuts, outSearch, outSearchRef, outProduct, outFrom, outTo, outRemarkFilter, pmap]);

  const filteredIn = useMemo(() => {
    const q = inSearch.toLowerCase();
    const prodQ = inProduct.toLowerCase();
    const remQ = inRemarkFilter.toLowerCase();
    return visibleIns.filter(r => {
      const out = outMap[r.refOutId];
      return (
        (!inSearchRef || (out?.challan || '').toLowerCase().includes(inSearchRef.toLowerCase())) &&
        (!inFrom || r.date >= inFrom) &&
        (!inTo || r.date <= inTo) &&
        (!remQ || (r.remark || '').toLowerCase().includes(remQ)) &&
        (!prodQ || Object.keys(r.items || {}).some((id) => {
          const code = (pmap[id]?.code || '').toLowerCase();
          const name = (pmap[id]?.name || '').toLowerCase();
          return code.includes(prodQ) || name.includes(prodQ);
        })) &&
        (!q || r.date?.includes(q) || r.remark?.toLowerCase().includes(q) ||
          (out && (out.challan?.toLowerCase().includes(q) || out.party?.toLowerCase().includes(q))))
      );
    });
  }, [visibleIns, inSearch, inSearchRef, inProduct, inFrom, inTo, inRemarkFilter, outMap, pmap]);

  const selectedOutIds = useMemo(() => Object.entries(selectedOut).filter(([, v]) => v).map(([id]) => id), [selectedOut]);
  const selectedInIds = useMemo(() => Object.entries(selectedIn).filter(([, v]) => v).map(([id]) => id), [selectedIn]);
  const outAllSelected = filteredOut.length > 0 && filteredOut.every((d) => selectedOut[d.id]);
  const inAllSelected = filteredIn.length > 0 && filteredIn.every((d) => selectedIn[d.id]);

  const deleteSelectedOut = () => {
    if (!isAdmin || !selectedOutIds.length) return;
    if (!window.confirm(`Delete ${selectedOutIds.length} DCWR OUT entr${selectedOutIds.length === 1 ? 'y' : 'ies'}?`)) return;
    selectedOutIds.forEach((id) => removeDcwrOut(id));
    setSelectedOut({});
    toast.success('Deleted selected DCWR OUT entries');
  };

  const deleteSelectedIn = () => {
    if (!isAdmin || !selectedInIds.length) return;
    if (!window.confirm(`Delete ${selectedInIds.length} DCWR IN entr${selectedInIds.length === 1 ? 'y' : 'ies'}?`)) return;
    selectedInIds.forEach((id) => removeDcwrIn(id));
    setSelectedIn({});
    toast.success('Deleted selected DCWR IN entries');
  };

  const startEditOut = (d) => {
    setEditOutId(d.id);
    setEditOutData({ date: d.date, challan: d.challan || '', party: d.party, remark: d.remark || '' });
  };
  const saveEditOut = () => {
    updateDcwrOut(editOutId, editOutData);
    setEditOutId(null);
    toast.success('DCWR OUT updated');
  };
  const startEditIn = (r) => {
    setEditInId(r.id);
    setEditInData({ date: r.date, remark: r.remark || '' });
  };
  const saveEditIn = () => {
    updateDcwrIn(editInId, editInData);
    setEditInId(null);
    toast.success('DCWR IN updated');
  };
  const openPreview = (entry, module) => {
    setPreviewEntry(entry);
    setPreviewModule(module);
  };

  return (
    <div className="space-y-5">
      {/* View Toggle */}
      <div className="flex gap-2">
        <button onClick={() => setView('entry')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${view === 'entry' ? 'text-white' : ''}`}
          style={{ background: view === 'entry' ? 'var(--dcwr)' : 'var(--soft)', color: view === 'entry' ? '#fff' : 'var(--ink)' }}
        >📝 Entry Sheet</button>
        <button onClick={() => setView('tracker')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${view === 'tracker' ? 'text-white' : ''}`}
          style={{ background: view === 'tracker' ? 'var(--dcwr)' : 'var(--soft)', color: view === 'tracker' ? '#fff' : 'var(--ink)' }}
        >📊 Tracker Dashboard</button>
      </div>

      {view === 'entry' ? (
        <>
          {/* Info Box */}
          <div className="rounded-lg px-4 py-3 text-xs" style={{ background: 'var(--soft)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
            <strong>DCWR — Delivery Challan With Replacement</strong><br />
            Standalone mini-system — decoupled from Sales & Purchase. Log <strong>DCWR OUT</strong> when goods leave, <strong>DCWR IN</strong> when replacements arrive.
          </div>

          {/* ══ DCWR IN ══ */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
            <div className="px-4 py-3 font-semibold text-sm" style={{ background: '#4a235a', color: '#fff' }}>
              ↙ DCWR IN — Goods Received Back
            </div>
            <form onSubmit={handleAddIn} className="p-4 space-y-4">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Receipt Date *</label>
                  <input type="date" value={inDate} onChange={e => setInDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
                </div>
                <div className="flex-[2] min-w-[200px]">
                  <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Against DCWR Challan *</label>
                  <select value={inRef} onChange={e => { setInRef(e.target.value); setInQty({}); }}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                    <option value="">-- Select DCWR OUT challan --</option>
                    {visibleOuts.map(d => {
                      const ost = dcwrOutstanding(d.id);
                      const total = Object.values(ost).reduce((a, b) => a + b, 0);
                      return (
                        <option key={d.id} value={d.id}>
                          {formatDate(d.date)} | {d.challan || 'no challan'} | {d.party}{total > 0 ? ` (${total} pcs pending)` : ' ✓ done'}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Remark</label>
                  <input value={inRemark} onChange={e => setInRemark(e.target.value)} placeholder="Optional remark"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
                </div>
                <div className="flex-[0.5] min-w-[120px]">
                  <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Godown</label>
                  <select value={inGodown} onChange={e => setInGodown(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none font-bold"
                    style={{ background: 'var(--soft)', color: 'var(--teal3)', border: '1px solid var(--line)' }}>
                    <option value="1 Vasai">1 Vasai</option>
                    <option value="2 Virar">2 Virar</option>
                  </select>
                </div>
              </div>

              {/* Outstanding Grid */}
              {inRef && (
                Object.keys(outstanding).length === 0 ? (
                  <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>✓ All items fully received for this challan.</p>
                ) : (
                  <div>
                    <div className="text-xs font-semibold mb-2" style={{ color: 'var(--dcwr)' }}>Outstanding quantities to receive:</div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-1.5">
                      {Object.entries(outstanding).map(([id, pendingQty]) => {
                        const p = pmap[id]; if (!p) return null;
                        return (
                          <div key={id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--soft)' }}>
                            <span className="font-mono text-[10px] font-bold flex-1" style={{ color: 'var(--dcwr)' }}>{p.code}</span>
                            <span className="text-[9px]" style={{ color: 'var(--danger)' }}>max {pendingQty}</span>
                            <input type="number" min="0" max={pendingQty} value={inQty[id] || ''}
                              onChange={e => setInQty({ ...inQty, [id]: parseInt(e.target.value) || 0 })}
                              className="w-14 px-1.5 py-1 rounded text-xs text-center outline-none"
                              style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                              placeholder="0" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}

              <button type="submit" className="px-5 py-2 rounded-lg text-sm font-bold text-white" style={{ background: 'var(--dcwr)' }}>
                ↙ Record DCWR IN Receipt
              </button>
            </form>
          </div>

          {/* ══ DCWR OUT ══ */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
            <div className="px-4 py-3 font-semibold text-sm" style={{ background: 'var(--dcwr)', color: '#fff' }}>
              ↗ DCWR OUT — Goods Sent Out
            </div>
            <form onSubmit={handleAddOut} className="p-4 space-y-4">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Date *</label>
                  <input type="date" value={outDate} onChange={e => setOutDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Challan No.</label>
                  <input value={outChallan} onChange={e => setOutChallan(e.target.value)} placeholder="e.g. DC-001"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
                </div>
                <div className="flex-[2] min-w-[200px]">
                  <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Party / Sent To *</label>
                  <input value={outParty} onChange={e => setOutParty(e.target.value)} placeholder="Party name"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="flex-[3] min-w-[200px]">
                  <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Remark (optional)</label>
                  <input value={outRemark} onChange={e => setOutRemark(e.target.value)} placeholder="Lorry no., batch, note…"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Godown</label>
                  <select value={outGodown} onChange={e => setOutGodown(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none font-bold"
                    style={{ background: 'var(--soft)', color: 'var(--teal3)', border: '1px solid var(--line)' }}>
                    <option value="1 Vasai">1 Vasai</option>
                    <option value="2 Virar">2 Virar</option>
                  </select>
                </div>
              </div>

              {/* Quantity Grid */}
              <CategoryAccordion
                groups={groups}
                accentColor="var(--dcwr)"
                enableSearch
                searchPlaceholder="Search product code/name..."
                renderCard={(p) => (
                  <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--soft)' }}>
                    <span className="font-mono text-[10px] font-bold flex-1" style={{ color: 'var(--dcwr)' }}>{p.code}</span>
                    <input
                      type="number"
                      min="0"
                      value={outQty[p.id] || ''}
                      onChange={(e) => setOutQty({ ...outQty, [p.id]: parseInt(e.target.value) || 0 })}
                      className="w-14 px-1.5 py-1 rounded text-xs text-center outline-none"
                      style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                      placeholder="0"
                    />
                  </div>
                )}
              />

              <button type="submit" className="px-5 py-2 rounded-lg text-sm font-bold text-white" style={{ background: 'var(--dcwr)' }}>
                ↗ Add DCWR OUT Entry
              </button>
            </form>
          </div>

          {/* ══ DCWR IN Register ══ */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#4a235a', color: '#fff' }}>
              <span className="font-semibold text-sm">DCWR IN Register ({filteredIn.length})</span>
              {isAdmin && (
                <button type="button" onClick={deleteSelectedIn}
                  className="text-[10px] px-2 py-1 rounded font-bold text-white"
                  style={{ background: selectedInIds.length ? 'var(--danger)' : 'var(--line)', opacity: selectedInIds.length ? 1 : 0.5 }}
                  disabled={!selectedInIds.length}>
                  Delete Selected
                </button>
              )}
            </div>
            
            <div className="p-3 border-b flex flex-col gap-2" style={{ background: 'var(--soft)', borderColor: 'var(--line)' }}>
              <div className="flex-1 flex items-center rounded-lg overflow-hidden border px-3" style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}>
                <span className="text-sm mr-2 opacity-50">🔍</span>
                <input type="text" placeholder="Smart search (challan/party/date/remark/product)..." value={inSearch} onChange={e => setInSearch(e.target.value)} className="w-full py-2 outline-none text-xs bg-transparent" />
              </div>
              <div className="filter-bar">
                <input type="text" placeholder="Challan..." value={inSearchRef} onChange={e => setInSearchRef(e.target.value)} className="px-3 py-2 rounded-lg text-xs outline-none min-w-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', flex: '1 1 80px' }} />
                <input type="text" placeholder="Product..." value={inProduct} onChange={e => setInProduct(e.target.value)} className="px-3 py-2 rounded-lg text-xs outline-none min-w-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', flex: '1 1 80px' }} />
                <input type="date" value={inFrom} onChange={e => setInFrom(e.target.value)} className="px-2 py-2 rounded-lg text-xs outline-none flex-shrink-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', maxWidth: '140px' }} />
                <input type="date" value={inTo} onChange={e => setInTo(e.target.value)} className="px-2 py-2 rounded-lg text-xs outline-none flex-shrink-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', maxWidth: '140px' }} />
                <input type="text" placeholder="Remarks..." value={inRemarkFilter} onChange={e => setInRemarkFilter(e.target.value)} className="px-3 py-2 rounded-lg text-xs outline-none min-w-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', flex: '1 1 80px' }} />
                <button type="button" onClick={() => { setInSearch(''); setInSearchRef(''); setInProduct(''); setInFrom(''); setInTo(''); setInRemarkFilter(''); setSelectedIn({}); }}
                  className="text-[10px] px-3 py-2 rounded-lg font-bold flex-shrink-0"
                  style={{ background: 'var(--paper)', color: 'var(--muted)', border: '1px solid var(--line)' }}>
                  Reset
                </button>
              </div>
            </div>
            <div className="table-responsive">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: '#4a235a' }}>
                    <th className="px-3 py-2 text-left font-semibold text-white/90">
                      <input type="checkbox" checked={inAllSelected} onChange={(e) => {
                        const next = {};
                        filteredIn.forEach((r) => { next[r.id] = e.target.checked; });
                        setSelectedIn(next);
                      }} />
                    </th>
                    {['Date', 'Against Challan', 'Party', 'Remark', 'Items Received', 'Action'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-white/90">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredIn.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--muted)' }}>No DCWR IN receipts match your filters.</td></tr>
                  ) : (
                    filteredIn.map(r => {
                      const out = outMap[r.refOutId];
                      const isEditing = editInId === r.id;
                      return (
                        <tr key={r.id} className="border-b" style={{ borderColor: 'var(--line)', background: 'rgba(106,0,128,.04)' }}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={!!selectedIn[r.id]} onChange={(e) => setSelectedIn((prev) => ({ ...prev, [r.id]: e.target.checked }))} />
                          </td>
                          {isEditing ? (
                            <>
                              <td className="px-2 py-1"><input type="date" value={editInData.date} onChange={e => setEditInData({ ...editInData, date: e.target.value })} className="w-full p-1 text-xs rounded outline-none" style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} /></td>
                              <td className="px-3 py-2 font-mono" style={{ color: 'var(--ink)' }}>{out ? (out.challan || '(no challan)') : '—'}</td>
                              <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{out ? out.party : '—'}</td>
                              <td className="px-2 py-1"><input value={editInData.remark} onChange={e => setEditInData({ ...editInData, remark: e.target.value })} className="w-24 p-1 text-xs rounded outline-none" style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} /></td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{formatDate(r.date)}</td>
                              <td className="px-3 py-2 font-mono" style={{ color: 'var(--ink)' }}>{out ? (out.challan || '(no challan)') : '—'}</td>
                              <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{out ? out.party : '—'}</td>
                              <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{r.remark || '—'}</td>
                            </>
                          )}
                          <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--ink)' }}>
                            {Object.entries(r.items).map(([id, qty]) => `${pmap[id]?.code || id}: ${qty}`).join(', ')}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1 items-center">
                              {isEditing ? (
                                <>
                                  <button onClick={saveEditIn} className="text-[10px] px-2 py-1 rounded font-bold text-white" style={{ background: 'var(--success)' }}>Save</button>
                                  <button onClick={() => setEditInId(null)} className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--line)', color: 'var(--ink)' }}>Cancel</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => openPreview({...r, party: out?.party, bill: out?.challan, godown: r.godown}, 'DCWR IN')} className="text-[10px] px-2 py-0.5 rounded opacity-60 hover:opacity-100 transition-opacity" style={{ color: 'var(--teal3)' }} title="Preview">👁</button>
                                  {canEditEntry(r) && <button onClick={() => startEditIn(r)} className="text-[10px] px-2 py-0.5 rounded opacity-60 hover:opacity-100" style={{ color: 'var(--info)' }}>✏️</button>}
                                  {isAdmin && <button onClick={() => { removeDcwrIn(r.id); toast.success('Removed'); }}
                                    className="text-xs px-2 py-0.5 rounded font-bold text-white" style={{ background: 'var(--danger)' }}>✕</button>}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* ══ TRACKER VIEW ══ */
        <>
          <div className="rounded-lg px-4 py-3 text-xs" style={{ background: 'var(--soft)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
            <strong>DCWR Tracker — Status Dashboard</strong><br />
            Live view of all open Delivery Challans and their status.
          </div>

          {/* Open Challans */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
            <div className="px-4 py-3 font-semibold text-sm" style={{ background: 'var(--dcwr)', color: '#fff' }}>
              Open DCWR Challans ({activeGodown})
            </div>
            <div className="p-4 space-y-4">
              {visibleOuts.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--muted)' }}>
                  <div className="text-3xl mb-2">🔄</div>No DCWR challans for {activeGodown}.
                </div>
              ) : (
                visibleOuts.map(d => {
                  const ost = dcwrOutstanding(d.id);
                  const totalSent = Object.values(d.items).reduce((a, b) => a + b, 0);
                  const totalOut = Object.values(ost).reduce((a, b) => a + b, 0);
                  const received = totalSent - totalOut;
                  const pct = totalSent ? Math.round((received / totalSent) * 100) : 0;
                  const allDone = totalOut === 0;

                  return (
                    <div key={d.id} className="rounded-xl overflow-hidden border-l-4" style={{
                      background: 'var(--soft)',
                      borderLeftColor: allDone ? 'var(--success)' : 'var(--dcwr)',
                    }}>
                      {/* Header */}
                      <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                            📋 {d.challan || '(no challan)'} — {d.party}
                          </div>
                          <div className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>
                            Date: {formatDate(d.date)} &nbsp;|&nbsp; Sent: <b>{totalSent}</b> &nbsp;|&nbsp; Back: <b>{received}</b> &nbsp;|&nbsp;
                            Outstanding: <b style={{ color: allDone ? 'var(--success)' : 'var(--danger)' }}>{totalOut}</b>
                          </div>
                        </div>
                        {allDone
                          ? <span className="px-3 py-1 rounded-full text-[10px] font-bold" style={{ background: 'var(--final-bg)', color: 'var(--success)' }}>✓ COMPLETE</span>
                          : <span className="px-3 py-1 rounded-full text-[10px] font-bold" style={{ background: 'var(--pur-bg)', color: 'var(--dcwr)' }}>OPEN</span>
                        }
                      </div>

                      {/* Progress Bar */}
                      <div className="mx-4 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                        <div className="h-full rounded-full transition-all" style={{
                          width: `${pct}%`,
                          background: allDone ? 'var(--success)' : 'var(--dcwr)',
                        }} />
                      </div>
                      <div className="px-4 text-[10px] mt-0.5 mb-2" style={{ color: 'var(--muted)' }}>{pct}% received back</div>

                      {/* Product Breakdown */}
                      <div className="px-4 pb-3">
                        <div className="grid grid-cols-5 text-[9px] font-bold uppercase tracking-wider px-2 py-1.5 rounded-t-lg"
                          style={{ background: 'var(--line)', color: 'var(--muted)' }}>
                          <div>Product</div><div>Sent</div><div>Received</div><div>Outstanding</div><div>Status</div>
                        </div>
                        {Object.entries(d.items).map(([id, sentQty]) => {
                          const p = pmap[id];
                          const recvQty = sentQty - (ost[id] || 0);
                          const outQty = ost[id] || 0;
                          return (
                            <div key={id} className="grid grid-cols-5 text-xs px-2 py-1.5 border-b" style={{ borderColor: 'var(--line)' }}>
                              <div className="font-mono font-bold" style={{ color: 'var(--dcwr)' }}>{p ? p.code : id}</div>
                              <div style={{ color: 'var(--ink)' }}>{sentQty}</div>
                              <div style={{ color: 'var(--success)' }}>{recvQty}</div>
                              <div style={{ color: outQty > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: outQty > 0 ? 700 : 400 }}>
                                {outQty || '—'}
                              </div>
                              <div>
                                {outQty === 0
                                  ? <span style={{ color: 'var(--success)' }}>✓ Done</span>
                                  : <span style={{ color: 'var(--danger)' }}>Pending</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* DCWR IN History */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
            <div className="px-4 py-3 font-semibold text-sm" style={{ background: 'var(--dcwr)', color: '#fff' }}>
              DCWR IN Receipt History
            </div>
            <div className="table-responsive">
              <table className="w-full text-xs" style={{ minWidth: '560px' }}>
                <thead>
                  <tr style={{ background: 'var(--dcwr)' }}>
                    {['Date', 'Against Challan', 'Party', 'Remark', 'Items Received', 'Action'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-white/90">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.dcwrIn.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--muted)' }}>No receipts yet.</td></tr>
                  ) : (
                    [...state.dcwrIn].reverse().map(r => {
                      const out = outMap[r.refOutId];
                      return (
                        <tr key={r.id} className="border-b" style={{ borderColor: 'var(--line)' }}>
                          <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{formatDate(r.date)}</td>
                          <td className="px-3 py-2 font-mono" style={{ color: 'var(--ink)' }}>{out ? (out.challan || '(no challan)') : '—'}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{out ? out.party : '—'}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{r.remark || '—'}</td>
                          <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--ink)' }}>
                            {Object.entries(r.items).map(([id, qty]) => `${pmap[id]?.code || id}: ${qty}`).join(', ')}
                          </td>
                          <td className="px-3 py-2">
                            {isAdmin && <button onClick={() => { removeDcwrIn(r.id); toast.success('Removed'); }}
                              className="text-xs px-2 py-0.5 rounded font-bold text-white" style={{ background: 'var(--danger)' }}>✕</button>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {previewEntry && (
        <BillPreviewModal
          entry={previewEntry}
          module={previewModule}
          products={pmap}
          onClose={() => { setPreviewEntry(null); setPreviewModule(''); }}
        />
      )}
    </div>
  );
}
