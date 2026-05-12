import { useMemo, useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import toast from 'react-hot-toast';
import { formatDate } from '../../lib/dateUtils';
import CategoryAccordion from '../../components/CategoryAccordion';

const THIRD_PARTY_GODOWN = 'Third Party Godown';

export default function ThirdPartyStock({ selectedParty, onUseInSales, isAdmin }) {
  const { state, addThirdPartyEntry, removeThirdPartyEntry, updateThirdPartyEntry, groupByCategory, allPartyNames } = useInventory();
  const [activeSection, setActiveSection] = useState('active');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [bill, setBill] = useState('');
  const [party, setParty] = useState('');
  const [serialNumbers, setSerialNumbers] = useState({});  // { pid: ['serial1', 'serial2', ...] }
  const [remark, setRemark] = useState('');
  const [quantities, setQuantities] = useState({});

  const [smart, setSmart] = useState('');
  const [regProduct, setRegProduct] = useState('');
  const [regFrom, setRegFrom] = useState('');
  const [regTo, setRegTo] = useState('');
  const [regRemark, setRegRemark] = useState('');

  const groups = groupByCategory();
  const parties = allPartyNames();
  const pmap = useMemo(() => {
    const map = {};
    state.products.forEach((p) => { map[p.id] = p; });
    return map;
  }, [state.products]);

  const pendingByParty = useMemo(() => {
    const out = {};
    (state.thirdPartyEntries || []).forEach((e) => {
      const key = (e.party || '').trim();
      if (!key) return;
      if (!out[key]) out[key] = { name: key, bills: 0, pendingBills: 0, totalBilled: 0, totalConsumed: 0, products: {} };
      out[key].bills += 1;
      const isPending = (e.status || 'pending') === 'pending';
      if (isPending) out[key].pendingBills += 1;
      Object.entries(e.items || {}).forEach(([pid, qty]) => {
        const consumed = e.consumedItems?.[pid] || 0;
        if (!out[key].products[pid]) out[key].products[pid] = { billed: 0, consumed: 0 };
        out[key].products[pid].billed += (qty || 0);
        out[key].products[pid].consumed += consumed;
        out[key].totalBilled += (qty || 0);
        out[key].totalConsumed += consumed;
      });
    });
    return Object.values(out)
      .filter(p => p.pendingBills > 0)
      .sort((a, b) => b.pendingBills - a.pendingBills || a.name.localeCompare(b.name));
  }, [state.thirdPartyEntries]);

  const pendingQtyBySelectedParty = useMemo(() => {
    if (!selectedParty) return 0;
    return (state.thirdPartyEntries || [])
      .filter((e) => e.party === selectedParty && (e.status || 'pending') === 'pending')
      .reduce((sum, e) => sum + Object.values(e.items || {}).reduce((a, b) => a + (b || 0), 0), 0);
  }, [state.thirdPartyEntries, selectedParty]);

  const visibleEntries = useMemo(() => {
    const q = smart.trim().toLowerCase();
    const pQ = regProduct.trim().toLowerCase();
    const rQ = regRemark.trim().toLowerCase();
    return (state.thirdPartyEntries || [])
      .filter((e) => (!regFrom ? true : e.date >= regFrom))
      .filter((e) => (!regTo ? true : e.date <= regTo))
      .filter((e) => (!rQ ? true : (e.remark || '').toLowerCase().includes(rQ)))
      .filter((e) => {
        if (!pQ) return true;
        return Object.keys(e.items || {}).some((id) => (pmap[id]?.code || '').toLowerCase().includes(pQ));
      })
      .filter((e) => {
        if (!q) return true;
        const productText = Object.keys(e.items || {}).map((id) => pmap[id]?.code || id).join(' ').toLowerCase();
        return (
          (e.bill || '').toLowerCase().includes(q) ||
          (e.party || '').toLowerCase().includes(q) ||
          (e.date || '').toLowerCase().includes(q) ||
          (e.remark || '').toLowerCase().includes(q) ||
          (e.type || '').toLowerCase().includes(q) ||
          productText.includes(q)
        );
      })
      .slice()
      .reverse();
  }, [state.thirdPartyEntries, smart, regProduct, regFrom, regTo, regRemark, pmap]);

  const submit = (e) => {
    e.preventDefault();
    if (!date) { toast.error('Select date'); return; }
    if (!party.trim()) { toast.error('Enter party'); return; }

    const items = {};
    Object.entries(quantities).forEach(([id, qty]) => {
      if (qty > 0) items[id] = qty;
    });
    if (!Object.keys(items).length) { toast.error('Enter at least one quantity'); return; }

    const serialNumbersByProduct = {};
    for (const [pid, qty] of Object.entries(items)) {
      const serials = (serialNumbers[pid] || []).map(s => s.trim()).filter(Boolean);
      if (serials.length !== qty) {
        const code = pmap[pid]?.code || pid;
        toast.error(`Serial count mismatch for ${code}. Need exactly ${qty}, got ${serials.length}.`);
        return;
      }
      // Check for duplicates within this product
      const dupes = serials.filter((s, i) => serials.indexOf(s) !== i);
      if (dupes.length > 0) {
        toast.error(`Duplicate serial(s) for ${pmap[pid]?.code || pid}: ${dupes.join(', ')}`);
        return;
      }
      serialNumbersByProduct[pid] = serials;
    }

    addThirdPartyEntry({
      godown: THIRD_PARTY_GODOWN,
      date,
      bill: bill.trim(),
      party: party.trim(),
      type: 'Adjustment',
      serialNumbersByProduct,
      remark: remark.trim(),
      items,
      status: 'pending',
    });
    toast.success('Third-party entry added');
    setBill('');
    setParty('');
    setSerialNumbers({});
    setRemark('');
    setQuantities({});
  };

  return (
    <div className="space-y-5">
      {/* Section Selectors */}
      <div className="flex flex-wrap gap-3 mb-6 bg-[var(--paper)] p-3 rounded-xl border border-[var(--line)] shadow-sm">
        <button 
          onClick={() => setActiveSection('active')} 
          className={`px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all duration-200 ${activeSection === 'active' ? 'bg-[var(--teal3)] text-white shadow-lg shadow-[var(--teal3)]/20 scale-[1.02]' : 'bg-[var(--soft)] text-[var(--muted)] border border-[var(--line)] hover:bg-[var(--line)]'}`}
        >
          <span>📦</span> Active Stock with parties
        </button>
        <button 
          onClick={() => setActiveSection('new')} 
          className={`px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all duration-200 ${activeSection === 'new' ? 'bg-[#6a828a] text-white shadow-lg shadow-[#6a828a]/20 scale-[1.02]' : 'bg-[var(--soft)] text-[var(--muted)] border border-[var(--line)] hover:bg-[var(--line)]'}`}
        >
          <span>📄</span> New Entry
        </button>
        <button 
          onClick={() => setActiveSection('register')} 
          className={`px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all duration-200 ${activeSection === 'register' ? 'bg-[#212936] text-[#ffd54f] border border-[#ffd54f]/30 shadow-lg scale-[1.02]' : 'bg-[var(--soft)] text-[var(--muted)] border border-[var(--line)] hover:bg-[var(--line)]'}`}
        >
          <span>📒</span> Register
        </button>
      </div>

      {activeSection === 'active' && (
      <div className="rounded-xl overflow-hidden animate-[fadeIn_.2s]" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
        <div className="px-4 py-3 font-semibold text-sm flex items-center justify-between" style={{ background: 'var(--teal)', color: '#f2ebd9' }}>
          <span>📦 Active Stock with parties</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-white/10">{THIRD_PARTY_GODOWN}</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pendingByParty.map((tile) => {
              const isSelected = selectedParty === tile.name;
              const remaining = tile.totalBilled - tile.totalConsumed;
              const progressPct = tile.totalBilled > 0 ? Math.round((tile.totalConsumed / tile.totalBilled) * 100) : 0;
              const productEntries = Object.entries(tile.products)
                .map(([pid, data]) => ({ code: pmap[pid]?.code || pid, remaining: data.billed - data.consumed, billed: data.billed, consumed: data.consumed }))
                .filter(p => p.remaining > 0)
                .sort((a, b) => a.code.localeCompare(b.code));

              return (
                <button
                  key={tile.name}
                  type="button"
                  onClick={() => onUseInSales?.(tile.name)}
                  className="p-4 rounded-xl border text-left transition-all hover:-translate-y-1 hover:shadow-lg"
                  style={{
                    borderColor: isSelected ? 'var(--teal3)' : 'var(--line)',
                    background: isSelected ? 'rgba(62,157,126,0.08)' : 'var(--soft)',
                    boxShadow: isSelected ? '0 0 0 2px var(--teal3)' : 'none',
                  }}
                >
                  {/* Header: Party name + Bills count */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{tile.name}</div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-2" style={{ background: 'var(--line)', color: 'var(--muted)' }}>
                      {tile.pendingBills} {tile.pendingBills === 1 ? 'bill' : 'bills'}
                    </span>
                  </div>

                  {/* Progress bar: Remaining in kitty */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span style={{ color: 'var(--muted)' }}>In Kitty</span>
                      <span className="font-bold" style={{ color: remaining > 0 ? 'var(--teal3)' : 'var(--success)' }}>
                        {remaining} remaining
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${100 - progressPct}%`,
                          background: progressPct >= 80 ? 'var(--danger)' : progressPct >= 50 ? '#f59e0b' : 'var(--teal3)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Billed vs Adjusted stats */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-[10px]" style={{ color: 'var(--muted)' }}>
                      Billed: <b style={{ color: 'var(--ink)' }}>{tile.totalBilled}</b>
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--muted)' }}>
                      Adjusted: <b style={{ color: tile.totalConsumed > 0 ? '#a855f7' : 'var(--ink)' }}>{tile.totalConsumed}</b>
                    </div>
                  </div>

                  {/* Product codes with remaining */}
                  {productEntries.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {productEntries.slice(0, 6).map(p => (
                        <span key={p.code} className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--paper)', color: 'var(--teal3)', border: '1px solid var(--line)' }}>
                          {p.code} ×{p.remaining}
                        </span>
                      ))}
                      {productEntries.length > 6 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: 'var(--muted)' }}>+{productEntries.length - 6} more</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
            {pendingByParty.length === 0 && (
              <div className="col-span-full text-xs py-6 text-center rounded-lg border" style={{ color: 'var(--muted)', borderColor: 'var(--line)', background: 'var(--soft)' }}>
                No pending third-party entries yet.
              </div>
            )}
          </div>
          {!!selectedParty && (
            <div className="mt-3 text-xs rounded-lg px-3 py-2 border" style={{ background: 'var(--sale-bg)', borderColor: 'var(--line)', color: 'var(--ink)' }}>
              Selected party: <b>{selectedParty}</b> (Pending qty: {pendingQtyBySelectedParty}) - Sales can consume only this party's third-party stock.
            </div>
          )}
        </div>
      </div>
      )}

      {activeSection === 'new' && (
      <div className="rounded-xl overflow-hidden animate-[fadeIn_.2s]" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
        <div className="px-4 py-3 font-semibold text-sm" style={{ background: 'var(--teal)', color: '#f2ebd9' }}>📄 New Entry</div>
        <form onSubmit={submit} className="p-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Date *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Bill No.</label>
              <input value={bill} onChange={(e) => setBill(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Party *</label>
              <input value={party} onChange={(e) => setParty(e.target.value)} list="tp-parties" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} placeholder="Party name" />
              <datalist id="tp-parties">{parties.map((p) => <option key={p} value={p} />)}</datalist>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Type</label>
              <input value="Adjustment" readOnly className="w-full px-3 py-2 rounded-lg text-sm outline-none font-bold" style={{ background: 'var(--soft)', color: 'var(--teal3)', border: '1px solid var(--line)' }} />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Remarks</label>
              <input value={remark} onChange={(e) => setRemark(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
            </div>
          </div>

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
                  onChange={(e) => setQuantities({ ...quantities, [p.id]: parseInt(e.target.value, 10) || 0 })}
                  className="w-14 px-1.5 py-1 rounded text-xs text-center outline-none"
                  style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                  placeholder="0"
                />
              </div>
            )}
          />

          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Serial Numbers (one per unit)</div>
            {Object.entries(quantities).filter(([, qty]) => qty > 0).length === 0 ? (
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Add product quantity first.</div>
            ) : (
              <div className="space-y-3">
                {Object.entries(quantities).filter(([, qty]) => qty > 0).map(([pid, qty]) => {
                  const currentSerials = serialNumbers[pid] || [];
                  // Ensure the array length matches qty
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
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {serials.map((val, i) => (
                          <div key={i} className="relative">
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
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button type="submit" className="px-5 py-2 rounded-lg text-sm font-bold text-white" style={{ background: 'var(--teal3)' }}>+ Add Third Party Entry</button>
        </form>
      </div>
      )}

      {activeSection === 'register' && (
      <div className="rounded-xl overflow-hidden animate-[fadeIn_.2s]" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
        <div className="px-4 py-3 font-semibold text-sm flex justify-between items-center gap-3" style={{ background: 'var(--teal)', color: '#f2ebd9' }}>
          <span>📒 Tracker / Register</span>
          <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded shadow-sm">{visibleEntries.length} entries</span>
        </div>
        <div className="p-3 border-b flex flex-col gap-2" style={{ background: 'var(--soft)', borderColor: 'var(--line)' }}>
          <div className="filter-bar">
            <div className="flex-1 min-w-[180px] flex items-center rounded-lg overflow-hidden border px-3" style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}>
              <span className="text-sm mr-2 opacity-50">🔍</span>
              <input value={smart} onChange={(e) => setSmart(e.target.value)} placeholder="Smart search..." className="w-full py-2 outline-none text-xs bg-transparent" />
            </div>
            <input value={regProduct} onChange={(e) => setRegProduct(e.target.value)} placeholder="Product..." className="px-3 py-2 rounded-lg text-xs outline-none min-w-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', flex: '1 1 80px' }} />
            <input type="date" value={regFrom} onChange={(e) => setRegFrom(e.target.value)} className="px-2 py-2 rounded-lg text-xs outline-none flex-shrink-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', maxWidth: '140px' }} />
            <input type="date" value={regTo} onChange={(e) => setRegTo(e.target.value)} className="px-2 py-2 rounded-lg text-xs outline-none flex-shrink-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', maxWidth: '140px' }} />
            <input value={regRemark} onChange={(e) => setRegRemark(e.target.value)} placeholder="Remarks..." className="px-3 py-2 rounded-lg text-xs outline-none min-w-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', flex: '1 1 80px' }} />
            <button type="button" onClick={() => { setSmart(''); setRegProduct(''); setRegFrom(''); setRegTo(''); setRegRemark(''); }} className="text-[10px] px-3 py-2 rounded-lg font-bold flex-shrink-0" style={{ background: 'var(--paper)', color: 'var(--muted)', border: '1px solid var(--line)' }}>
              Reset
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="w-full text-xs" style={{ minWidth: '700px' }}>
            <thead>
              <tr style={{ background: 'var(--teal)' }}>
                {['#', 'Date', 'Bill', 'Party', 'Type', 'Godown', 'Items', 'Serial Numbers', 'Status', 'Remarks', 'Action'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: '#f2ebd9' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEntries.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8" style={{ color: 'var(--muted)' }}>No entries found.</td></tr>
              ) : (
                visibleEntries.map((e, i) => {
                  const serialSummary = Object.entries(e.serialNumbersByProduct || {}).map(([pid, list]) => `${pmap[pid]?.code || pid}: ${(list || []).length}`).join(', ');
                  return (
                    <tr key={e.id} className="border-b transition-colors" style={{ borderColor: 'var(--line)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{i + 1}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{formatDate(e.date)}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: 'var(--ink)' }}>{e.bill || '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{e.party}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{e.type || 'Adjustment'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{e.godown || THIRD_PARTY_GODOWN}</td>
                      <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--ink)' }}>{Object.entries(e.items || {}).map(([id, qty]) => `${pmap[id]?.code || id}: ${qty}`).join(', ') || '—'}</td>
                      <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--ink)' }}>{serialSummary || '—'}</td>
                      <td className="px-3 py-2">
                        <select
                          value={e.status || 'pending'}
                          onChange={(ev) => updateThirdPartyEntry(e.id, { status: ev.target.value })}
                          className="px-2 py-1 rounded text-[10px] outline-none"
                          style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }}
                        >
                          <option value="pending">pending</option>
                          <option value="closed">closed</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--ink)' }}>{e.remark || '—'}</td>
                      <td className="px-3 py-2">
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => { if (confirm('Delete entry?')) removeThirdPartyEntry(e.id); }}
                            className="text-xs px-2 py-0.5 rounded font-bold text-white"
                            style={{ background: 'var(--danger)' }}
                          >
                            ✕
                          </button>
                        )}
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
    </div>
  );
}

