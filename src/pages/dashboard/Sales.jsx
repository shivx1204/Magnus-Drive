import { useState, useMemo, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { formatDate } from '../../lib/dateUtils';
import BarcodeScanner from '../../components/BarcodeScanner';
import BillPreviewModal from '../../components/BillPreviewModal';
import CategoryAccordion from '../../components/CategoryAccordion';

export default function Sales({ prefill, thirdPartySelection }) {
  const { state, addSale, removeSale, updateSale, consumeThirdPartyStock, groupByCategory, allPartyNames } = useInventory();
  const { activeGodown, isManager, isAdmin } = useAuth();
  const [view, setView] = useState('entry'); // 'entry' | 'register'
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [bill, setBill] = useState('');
  const [party, setParty] = useState('');
  const [type, setType] = useState('Normal');
  const [remark, setRemark] = useState('');
  const [scrapProvided, setScrapProvided] = useState(false);
  const [entryGodown, setEntryGodown] = useState(activeGodown);
  const [quantities, setQuantities] = useState({});
  const [scrapQuantities, setScrapQuantities] = useState({});
  // Register filters
  const [regSmart, setRegSmart] = useState('');
  const [regType, setRegType] = useState('all');
  const [regProduct, setRegProduct] = useState('');
  const [regFrom, setRegFrom] = useState('');
  const [regTo, setRegTo] = useState('');
  const [regRemark, setRegRemark] = useState('');
  const [selected, setSelected] = useState({});
  const [serialNumbers, setSerialNumbers] = useState({});
  const [scanningFor, setScanningFor] = useState(null);
  const [useThirdParty, setUseThirdParty] = useState(false);
  const [lockedThirdPartyParty, setLockedThirdPartyParty] = useState('');
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [previewEntry, setPreviewEntry] = useState(null);
  const [unbilledStep, setUnbilledStep] = useState(1);

  useEffect(() => {
    if (!prefill?.type) return;
    setType(prefill.type);
    // optional nicety: ensure bill is blank for fresh entry
    setBill('');
  }, [prefill?.nonce]);

  useEffect(() => {
    if (!thirdPartySelection?.party) return;
    setUseThirdParty(true);
    setLockedThirdPartyParty(thirdPartySelection.party);
    // Don't lock the customer field — allow a different buyer
    setType('Normal');
  }, [thirdPartySelection?.nonce]);

  useEffect(() => {
    if (activeGodown !== 'All Godowns') {
      setEntryGodown(activeGodown);
    }
  }, [activeGodown]);

  const groups = groupByCategory();
  const parties = allPartyNames();
  const pmap = useMemo(() => { const m = {}; state.products.forEach(p => m[p.id] = p); return m; }, [state.products]);

  const generatedUnbRef = useMemo(() => {
    if (type !== 'Unbilled') return '';
    const d = date ? new Date(date) : new Date();
    const ddMMyy = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`;
    const gc = entryGodown.includes('1') ? 'VS' : 'VR';
    const todayCount = state.sales.filter((s) => s.type === 'Unbilled' && s.godown === entryGodown && s.date === date).length;
    return `UNB-${ddMMyy}-${gc}-${String(todayCount + 1).padStart(3, '0')}`;
  }, [type, date, entryGodown, state.sales]);

  const thirdPartyPendingQty = useMemo(() => {
    if (!lockedThirdPartyParty) return 0;
    return (state.thirdPartyEntries || [])
      .filter((e) => e.party === lockedThirdPartyParty && (e.status || 'pending') === 'pending')
      .reduce((sum, e) => sum + Object.values(e.items || {}).reduce((a, b) => a + (b || 0), 0), 0);
  }, [state.thirdPartyEntries, lockedThirdPartyParty]);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!date) { toast.error('Select a date'); return; }
    if (!party.trim()) { toast.error('Enter party name'); return; }
    const items = {};
    Object.entries(quantities).forEach(([id, qty]) => { if (qty > 0) items[id] = qty; });
    
    const scrapItems = {};
    if (scrapProvided) {
      Object.entries(scrapQuantities).forEach(([id, qty]) => { if (qty > 0) scrapItems[id] = qty; });
    }

    const isSerialCompulsory = type === 'Unbilled'; // Service serials are optional

    if (!Object.keys(items).length) { toast.error('Enter at least one quantity'); return; }

    const serialNumbersByProduct = {};
    for (const [pid, qty] of Object.entries(items)) {
      const serials = (serialNumbers[pid] || []).map(s => s.trim()).filter(Boolean);
      if (isSerialCompulsory && serials.length !== qty) {
        const code = pmap[pid]?.code || pid;
        toast.error(`Serial count mismatch for ${code}. Need exactly ${qty}, got ${serials.length}.`);
        return;
      }
      const dupes = serials.filter((s, i) => serials.indexOf(s) !== i);
      if (dupes.length > 0) {
        toast.error(`Duplicate serial(s) for ${pmap[pid]?.code || pid}: ${dupes.join(', ')}`);
        return;
      }
      if (serials.length > 0) {
        serialNumbersByProduct[pid] = isSerialCompulsory ? serials : serials.slice(0, qty);
      }
    }

    const finalBill = (type === 'Unbilled' && !bill.trim()) ? generatedUnbRef : bill.trim();
    if (useThirdParty && !lockedThirdPartyParty) {
      toast.error('Select a party tile from Third Party Stock tab first');
      return;
    }

    let baseRemark = useThirdParty
      ? `${remark.trim() ? remark.trim() + ' | ' : ''}[TP Source: ${lockedThirdPartyParty}]`
      : remark.trim();

    const serialsText = Object.entries(serialNumbersByProduct)
      .map(([pid, sList]) => `[${pmap[pid]?.code || pid}: ${sList.join(', ')}]`)
      .join(' ');
      
    const saleRemark = serialsText ? `${baseRemark ? baseRemark + ' | ' : ''}Serials: ${serialsText}` : baseRemark;

    const newSale = addSale({ godown: entryGodown, date, bill: finalBill, party: party.trim(), type, remark: saleRemark, scrapProvided, items, scrapItems, thirdPartySource: useThirdParty ? lockedThirdPartyParty : undefined });
    if (useThirdParty) {
      try {
        consumeThirdPartyStock({ party: lockedThirdPartyParty, items, saleId: newSale.id, customerParty: party.trim() });
      } catch (err) {
        removeSale(newSale.id);
        toast.error(err?.message || 'Failed to consume third-party stock');
        return;
      }
    }
    toast.success(`✓ Sale added to ${entryGodown}${useThirdParty ? ` (Third Party settled from ${lockedThirdPartyParty})` : ''}`);
    setQuantities({}); setScrapQuantities({}); setParty(''); setScrapProvided(false); setRemark('');
    setBill(''); setSerialNumbers({});
    if (type === 'Unbilled') setType('Normal');
    setUnbilledStep(1);
  };



  const visibleSales = useMemo(() => {
    const smart = regSmart.trim().toLowerCase();
    const prodQ = regProduct.trim().toLowerCase();
    const remQ = regRemark.trim().toLowerCase();

    const matchesProduct = (s) => {
      if (!prodQ) return true;
      return Object.keys(s.items || {}).some((id) => {
        const code = (pmap[id]?.code || '').toLowerCase();
        const name = (pmap[id]?.name || '').toLowerCase();
        return code.includes(prodQ) || name.includes(prodQ);
      });
    };

    const matchesSmart = (s) => {
      if (!smart) return true;
      const billText = (s.bill || '').toLowerCase();
      const partyText = (s.party || '').toLowerCase();
      const typeText = (s.type || '').toLowerCase();
      const dateText = (s.date || '').toLowerCase();
      const remarkText = (s.remark || '').toLowerCase();
      const productsText = Object.keys(s.items || {})
        .map((id) => (pmap[id]?.code || id))
        .join(' ')
        .toLowerCase();
      return (
        billText.includes(smart) ||
        partyText.includes(smart) ||
        typeText.includes(smart) ||
        dateText.includes(smart) ||
        remarkText.includes(smart) ||
        productsText.includes(smart)
      );
    };

    return state.sales
      .filter((s) => activeGodown === 'All Godowns' || s.godown === activeGodown)
      .filter((s) => (regType === 'all' ? true : (s.type || 'Normal') === regType))
      .filter((s) => (!regFrom ? true : s.date >= regFrom))
      .filter((s) => (!regTo ? true : s.date <= regTo))
      .filter((s) => (!remQ ? true : (s.remark || '').toLowerCase().includes(remQ)))
      .filter(matchesProduct)
      .filter(matchesSmart)
      .slice()
      .reverse();
  }, [state.sales, activeGodown, regSmart, regType, regProduct, regFrom, regTo, regRemark, pmap]);

  const selectedIds = useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([id]) => id), [selected]);
  const allSelected = visibleSales.length > 0 && visibleSales.every((s) => selected[s.id]);

  const toggleSelectAll = (val) => {
    const next = {};
    visibleSales.forEach((s) => { next[s.id] = val; });
    setSelected(next);
  };

  const deleteSelected = () => {
    if (!isAdmin) return;
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} sale entr${selectedIds.length === 1 ? 'y' : 'ies'}?`)) return;
    selectedIds.forEach((id) => removeSale(id));
    setSelected({});
    toast.success('Deleted selected sales');
  };

  const startEdit = (s) => {
    if (!canEditEntry(s)) return;
    setEditId(s.id);
    setEditData({ date: s.date, bill: s.bill || '', party: s.party, remark: s.remark || '', type: s.type || 'Normal' });
  };

  const saveEdit = () => {
    updateSale(editId, editData);
    setEditId(null);
    toast.success('Sale updated');
  };

  const today = new Date().toISOString().slice(0, 10);
  // Admins can edit any bill; others can only edit same-day bills
  const canEditEntry = (entry) => isAdmin || entry.date === today;

  return (
    <div className="space-y-5">
      {scanningFor && (
        <BarcodeScanner
          products={[]} // empty array so it doesn't try to match with products list
          onScan={({ rawCode }) => {
            const { pid, index } = scanningFor;
            const currentSerials = serialNumbers[pid] || [];
            const serials = Array.from({ length: quantities[pid] || 0 }, (_, i) => currentSerials[i] || '');
            serials[index] = rawCode;
            setSerialNumbers({ ...serialNumbers, [pid]: serials });
            setScanningFor(null);
            toast.success(`Scanned: ${rawCode}`);
          }}
          onClose={() => setScanningFor(null)}
        />
      )}
      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView('entry')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${view === 'entry' ? 'text-white' : ''}`}
          style={{ background: view === 'entry' ? 'var(--teal3)' : 'var(--soft)', color: view === 'entry' ? '#fff' : 'var(--ink)' }}
        >
          🧾 New Entry
        </button>
        <button
          type="button"
          onClick={() => setView('register')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${view === 'register' ? 'text-white' : ''}`}
          style={{ background: view === 'register' ? 'var(--teal3)' : 'var(--soft)', color: view === 'register' ? '#fff' : 'var(--ink)' }}
        >
          📒 Register
        </button>
      </div>

      {view === 'entry' ? (
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--teal)', color: '#f2ebd9' }}>
          <span className="font-semibold text-sm">💰 New Sale</span>
        </div>
        <form onSubmit={handleAdd} className="p-4 space-y-4">
          {/* STEP 1: Metadata (Hidden in Step 2 of Unbilled) */}
          {!(type === 'Unbilled' && unbilledStep === 2) && (
            <div className="animate-fadeIn space-y-4 mb-6">
              <div className="rounded-lg border p-3 flex flex-wrap items-center gap-3" style={{ borderColor: useThirdParty ? 'var(--teal3)' : 'var(--line)', background: useThirdParty ? 'rgba(62,157,126,0.06)' : 'var(--soft)' }}>
                <label className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--ink)' }}>
                  <input
                    type="checkbox"
                    checked={useThirdParty}
                    disabled={!lockedThirdPartyParty}
                    onChange={(e) => setUseThirdParty(e.target.checked)}
                  />
                  Use Third Party Stock
                </label>
                <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  Source party: <b style={{ color: 'var(--teal3)' }}>{lockedThirdPartyParty || 'Not selected from tiles yet'}</b>
                </span>
                {lockedThirdPartyParty && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--sale-bg)', color: 'var(--ink)' }}>
                    Pending qty: {thirdPartyPendingQty}
                  </span>
                )}
                {useThirdParty && (
                  <span className="text-[10px] ml-auto" style={{ color: 'var(--muted)' }}>
                    💡 Customer (sold-to) can be different from source party
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Bill No.</label>
              <input value={bill} onChange={e => setBill(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                placeholder={type === 'Unbilled' ? '(optional) auto ref will be used' : 'Bill number'}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{useThirdParty ? 'Customer (Sold To) *' : 'Party *'}</label>
              <input value={party} onChange={e => setParty(e.target.value)} list="sal-parties"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                placeholder={useThirdParty ? 'Customer who received the product' : 'Customer name'} />
              <datalist id="sal-parties">{allPartyNames().map(p => <option key={p} value={p} />)}</datalist>
            </div>
            {isManager && (
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Godown</label>
              <select value={entryGodown} onChange={e => setEntryGodown(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none font-bold"
                style={{ background: 'var(--soft)', color: 'var(--teal3)', border: '1px solid var(--line)' }}>
                <option value="1 Vasai">1 Vasai</option>
                <option value="2 Virar">2 Virar</option>
              </select>
            </div>
            )}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Remarks</label>
              <input value={remark} onChange={e => setRemark(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} placeholder="Optional remark..." />
            </div>
            
            {/* Restored Sale Type Selector */}
            <div className="w-full mt-2 mb-1">
              <label className="block text-[10px] font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Sale Type</label>
              <div className="flex flex-wrap gap-2">
                {['Normal', 'Pro-rata', 'Service', 'Scheme', 'Unbilled'].map(t => (
                  <button type="button" key={t} onClick={() => setType(t)}
                    disabled={useThirdParty && t === 'Unbilled'}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex-shrink-0
                      ${type === t 
                        ? 'shadow-sm' 
                        : 'hover:opacity-80'
                      }`}
                    style={{ 
                      background: type === t ? (t === 'Unbilled' ? '#f59e0b' : 'var(--teal3)') : 'transparent',
                      color: type === t ? '#fff' : 'var(--muted)',
                      border: `1px solid ${type === t ? (t === 'Unbilled' ? '#f59e0b' : 'var(--teal3)') : 'var(--line)'}`
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {useThirdParty && (
                <div className="mt-1 text-[10px]" style={{ color: 'var(--muted)' }}>
                  Third-party consumption is tile-locked by selected party and cannot be used with Unbilled type.
                </div>
              )}
            </div>

            {type === 'Unbilled' && (
              <div className="w-full p-3 rounded-lg border border-amber-200 bg-amber-50/50 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-medium text-amber-800">
                  This will be saved in Sales Register as <b>Unbilled</b>. If Bill No. is blank, the auto ref will be used.
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-amber-600">Auto Ref:</span>
                  <span className="font-mono text-xs font-bold bg-amber-200 text-amber-900 px-2 py-1 rounded shadow-sm">{generatedUnbRef}</span>
                </div>
              </div>
            )}
            
            <div className="w-48 ml-auto flex items-end justify-end">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg transition-colors hover:bg-black/5" style={{ color: 'var(--ink)' }}>
                <input type="checkbox" checked={scrapProvided} onChange={e => {
                  setScrapProvided(e.target.checked);
                  if (!e.target.checked) setScrapQuantities({});
                }} className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent)' }} />
                <span className="text-xs font-bold whitespace-nowrap">Scrap Material Provided?</span>
              </label>
            </div>
          </div>
          </div>
          )}

          {/* NEXT BUTTON FOR UNBILLED STEP 1 — sticky on mobile */}
          {type === 'Unbilled' && unbilledStep === 1 && (
            <>
              {/* Spacer so content doesn't hide behind the sticky button on mobile */}
              <div className="h-24 md:hidden" />
              {/* Desktop: inline at bottom of form */}
              <div className="hidden md:flex justify-end mt-4 animate-fadeIn">
                <button
                  type="button"
                  onClick={() => setUnbilledStep(2)}
                  className="px-6 py-3 rounded-full text-sm font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                >
                  Next: Select Products <span className="text-lg leading-none">➔</span>
                </button>
              </div>
              {/* Mobile: fixed above bottom nav bar */}
              <div className="fixed bottom-[72px] left-0 right-0 z-50 px-4 pb-3 md:hidden animate-fadeIn">
                <button
                  type="button"
                  onClick={() => setUnbilledStep(2)}
                  className="w-full py-4 rounded-2xl text-base font-bold text-white shadow-2xl active:scale-95 transition-transform flex items-center justify-center gap-3"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 8px 32px rgba(245,158,11,0.45)' }}
                >
                  Next: Select Products <span className="text-xl leading-none">➔</span>
                </button>
              </div>
            </>
          )}

          {/* STEP 2: Products & Serials (Hidden in Step 1 of Unbilled) */}
          {!(type === 'Unbilled' && unbilledStep === 1) && (
            <div className="animate-fadeIn space-y-6">
              {type === 'Unbilled' && unbilledStep === 2 && (
                <div className="flex items-center justify-end mb-2">
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest bg-amber-100 px-3 py-1 rounded-full border border-amber-200">Step 2: Products</span>
                </div>
              )}

          <CategoryAccordion
            groups={groups}
            accentColor="var(--teal3)"
            enableSearch
            searchPlaceholder="Search product code/name..."
            renderCard={(p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all"
                style={{
                  background: quantities[p.id] > 0 ? 'rgba(62,157,126,0.1)' : 'var(--soft)',
                  border: quantities[p.id] > 0 ? '1px solid var(--teal3)' : '1px solid transparent',
                }}
              >
                <span className="font-mono text-[10px] font-bold flex-1" style={{ color: 'var(--teal3)' }}>{p.code}</span>
                <input
                  type="number"
                  min="0"
                  value={quantities[p.id] || ''}
                  onChange={(e) => setQuantities({ ...quantities, [p.id]: parseInt(e.target.value) || 0 })}
                  className="w-14 px-1.5 py-1 rounded text-xs text-center outline-none"
                  style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                  placeholder="0"
                />
              </div>
            )}
          />

          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--muted)' }}>
              Serial Numbers
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: type === 'Unbilled' ? '#f59e0b' : 'var(--line)', color: type === 'Unbilled' ? '#fff' : 'var(--muted)' }}>
                {type === 'Unbilled' ? 'COMPULSORY' : 'OPTIONAL'}
              </span>
            </div>
            {Object.entries(quantities).filter(([, qty]) => qty > 0).length === 0 ? (
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Add product quantity first.</div>
            ) : (
              <div className="space-y-3">
                {Object.entries(quantities).filter(([, qty]) => qty > 0).map(([pid, qty]) => {
                  const currentSerials = serialNumbers[pid] || [];
                  const serials = Array.from({ length: qty }, (_, i) => currentSerials[i] || '');
                  const filledCount = serials.filter(s => s.trim()).length;

                  const updateSerial = (index, value) => {
                    const updated = [...serials];
                    updated[index] = value;
                    setSerialNumbers({ ...serialNumbers, [pid]: updated });
                  };

                  return (
                    <div key={pid} className="p-3 rounded-xl border" style={{ borderColor: filledCount === qty ? 'var(--teal3)' : 'var(--line)', background: 'var(--soft)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold" style={{ color: 'var(--ink)' }}>
                          {pmap[pid]?.code || pid}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${filledCount === qty ? 'text-white' : ''}`}
                            style={{ background: filledCount === qty ? 'var(--teal3)' : 'var(--line)', color: filledCount === qty ? '#fff' : 'var(--muted)' }}>
                            {filledCount}/{qty} filled
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {serials.map((val, i) => (
                          <div key={i} className="relative flex gap-1 items-center">
                            <div className="relative flex-1">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold" style={{ color: 'var(--muted)' }}>#{i + 1}</span>
                              <input
                                value={val}
                                onChange={(e) => updateSerial(i, e.target.value)}
                                className="w-full pl-8 pr-2 py-2 rounded-lg text-xs outline-none transition-all"
                                style={{
                                  background: 'var(--paper)',
                                  color: 'var(--ink)',
                                  border: val.trim() ? '1.5px solid var(--teal3)' : '1px solid var(--line)',
                                }}
                                placeholder={`Serial ${i + 1}`}
                                autoComplete="off"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setScanningFor({ pid, index: i })}
                              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-transform hover:-translate-y-0.5 active:translate-y-0"
                              style={{ background: '#f59e0b', color: '#fff' }}
                              title="Scan Barcode"
                            >
                              📷
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {scrapProvided && (
            <div className="mt-4 p-4 rounded-xl border border-dashed" style={{ borderColor: 'var(--accent)', background: 'var(--sale-bg)' }}>
              <div className="flex justify-between items-center mb-4">
                 <h4 className="font-bold text-xs uppercase tracking-widest flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                   ♻️ Scrap Items Received
                 </h4>
                 <button type="button" onClick={() => setScrapQuantities({...quantities})} className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5" style={{ background: 'var(--accent)' }}>
                   Copy from Sale
                 </button>
              </div>

              <CategoryAccordion
                groups={groups}
                accentColor="var(--muted)"
                enableSearch
                searchPlaceholder="Search scrap product..."
                renderCard={(p) => (
                  <div key={`s_${p.id}`} className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors" style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
                    <span className="font-mono text-[10px] font-bold flex-1" style={{ color: 'var(--ink)' }}>{p.code}</span>
                    <input
                      type="number"
                      min="0"
                      value={scrapQuantities[p.id] || ''}
                      onChange={(e) => setScrapQuantities({ ...scrapQuantities, [p.id]: parseInt(e.target.value) || 0 })}
                      className="w-14 px-1.5 py-1 rounded text-xs text-center outline-none"
                      style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                      placeholder="0"
                    />
                  </div>
                )}
              />
            </div>
          )}

          <div className="flex flex-col-reverse md:flex-row items-stretch md:items-center gap-3 mt-4">
            {type === 'Unbilled' && unbilledStep === 2 && (
              <button
                type="button"
                onClick={() => setUnbilledStep(1)}
                className="flex-1 md:flex-none px-5 py-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
                style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
              >
                ← Back to Details
              </button>
            )}
            <button type="submit" className="flex-1 md:flex-none px-5 py-3 rounded-lg text-sm font-bold text-white" style={{ background: 'var(--teal3)' }}>✓ Add Sale</button>
          </div>
            </div>
          )}
        </form>
      </div>

      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
          <div className="px-4 py-3 font-semibold text-sm flex justify-between items-center gap-3" style={{ background: 'var(--teal)', color: '#f2ebd9' }}>
            <span>📋 Sales Register</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded shadow-sm">{activeGodown} ({visibleSales.length})</span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="text-[10px] px-2 py-1 rounded font-bold text-white"
                  style={{ background: selectedIds.length ? 'var(--danger)' : 'var(--line)', opacity: selectedIds.length ? 1 : 0.5 }}
                  disabled={!selectedIds.length}
                >
                  Delete Selected
                </button>
              )}
            </div>
          </div>

          <div className="p-3 border-b flex flex-col gap-2" style={{ background: 'var(--soft)', borderColor: 'var(--line)' }}>
            <div className="filter-bar">
              <div className="flex-1 min-w-[180px] flex items-center rounded-lg overflow-hidden border px-3" style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}>
                <span className="text-sm mr-2 opacity-50">🔍</span>
                <input value={regSmart} onChange={(e) => setRegSmart(e.target.value)} placeholder="Smart search..." className="w-full py-2 outline-none text-xs bg-transparent" />
              </div>
              <select value={regType} onChange={(e) => setRegType(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-bold outline-none flex-shrink-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                <option value="all">All Types</option>
                {['Normal', 'Pro-rata', 'Service', 'Scheme', 'Unbilled'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={regProduct} onChange={(e) => setRegProduct(e.target.value)} placeholder="Product..." className="px-3 py-2 rounded-lg text-xs outline-none min-w-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', width: '100px', flex: '1 1 80px' }} />
              <input type="date" value={regFrom} onChange={(e) => setRegFrom(e.target.value)} className="px-2 py-2 rounded-lg text-xs outline-none flex-shrink-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', maxWidth: '140px' }} />
              <input type="date" value={regTo} onChange={(e) => setRegTo(e.target.value)} className="px-2 py-2 rounded-lg text-xs outline-none flex-shrink-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', maxWidth: '140px' }} />
              <input value={regRemark} onChange={(e) => setRegRemark(e.target.value)} placeholder="Remarks..." className="px-3 py-2 rounded-lg text-xs outline-none min-w-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', width: '100px', flex: '1 1 80px' }} />
              <button type="button" onClick={() => { setRegSmart(''); setRegType('all'); setRegProduct(''); setRegFrom(''); setRegTo(''); setRegRemark(''); setSelected({}); }}
                className="text-[10px] px-3 py-2 rounded-lg font-bold flex-shrink-0"
                style={{ background: 'var(--paper)', color: 'var(--muted)', border: '1px solid var(--line)' }}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="w-full text-xs" style={{ minWidth: '600px' }}>
              <thead>
                <tr style={{ background: 'var(--teal)' }}>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: '#f2ebd9' }}>
                    <input type="checkbox" checked={allSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
                  </th>
                  {['#', 'Date', 'Bill', 'Party', 'Type', 'Items', 'Total', 'Remarks', 'Action'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: '#f2ebd9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleSales.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8" style={{ color: 'var(--muted)' }}>No sales found for {activeGodown}.</td></tr>
                ) : (
                  visibleSales.map((s, i) => {
                    const total = Object.values(s.items).reduce((a, b) => a + b, 0);
                    const isEditing = editId === s.id;
                    return (
                      <tr key={s.id} className="border-b transition-colors" style={{ borderColor: 'var(--line)' }}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!!selected[s.id]}
                            onChange={(e) => setSelected((prev) => ({ ...prev, [s.id]: e.target.checked }))}
                          />
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{i + 1}</td>
                        {isEditing ? (
                          <>
                            <td className="px-2 py-1"><input type="date" value={editData.date} onChange={e => setEditData({ ...editData, date: e.target.value })} className="w-full p-1 text-xs rounded outline-none" style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} /></td>
                            <td className="px-2 py-1"><input value={editData.bill} onChange={e => setEditData({ ...editData, bill: e.target.value })} className="w-20 p-1 text-xs rounded outline-none" style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} /></td>
                            <td className="px-2 py-1"><input value={editData.party} onChange={e => setEditData({ ...editData, party: e.target.value })} className="w-24 p-1 text-xs rounded outline-none" style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} /></td>
                            <td className="px-2 py-1">
                              <select value={editData.type} onChange={e => setEditData({ ...editData, type: e.target.value })} className="p-1 text-xs rounded outline-none" style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                                <option>Normal</option><option>Pro-rata</option><option>Service</option><option>Scheme</option><option>Unbilled</option>
                              </select>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{formatDate(s.date)}</td>
                            <td className="px-3 py-2 font-mono" style={{ color: 'var(--ink)' }}>{s.bill || '—'}</td>
                            <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{s.party}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--sale-bg)', color: 'var(--ink)' }}>{s.type}</span>
                              {s.scrapProvided && <span className="ml-1 text-[10px]" title="Scrap Material Provided">♻️</span>}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--ink)' }}>
                          {Object.entries(s.items).map(([id, qty]) => `${pmap[id]?.code || id}: ${qty}`).join(', ')}
                        </td>
                        <td className="px-3 py-2 font-bold" style={{ color: 'var(--ink)' }}>{total}</td>
                        <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--ink)' }}>
                          {isEditing ? (
                            <input value={editData.remark} onChange={e => setEditData({ ...editData, remark: e.target.value })} className="w-24 p-1 text-xs rounded outline-none" style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
                          ) : (s.remark || '—')}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 items-center">
                            {isEditing ? (
                              <>
                                <button onClick={saveEdit} className="text-[10px] px-2 py-1 rounded font-bold text-white" style={{ background: 'var(--success)' }}>Save</button>
                                <button onClick={() => setEditId(null)} className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--line)', color: 'var(--ink)' }}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => setPreviewEntry(s)} className="text-[10px] px-2 py-0.5 rounded opacity-60 hover:opacity-100 transition-opacity" style={{ color: 'var(--teal3)' }} title="Preview">👁</button>
                                {canEditEntry(s) && <button onClick={() => startEdit(s)} className="text-[10px] px-2 py-0.5 rounded opacity-60 hover:opacity-100 transition-opacity" style={{ color: 'var(--info)' }} title="Edit">✏️</button>}
                                {isAdmin && <button onClick={() => { removeSale(s.id); toast.success('Removed'); }}
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
      )}

      {previewEntry && (
        <BillPreviewModal
          entry={previewEntry}
          module="Sale"
          products={pmap}
          onClose={() => setPreviewEntry(null)}
        />
      )}
    </div>
  );
}
