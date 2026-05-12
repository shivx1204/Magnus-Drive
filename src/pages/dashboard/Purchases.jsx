import { useState, useMemo, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import CategoryAccordion from '../../components/CategoryAccordion';
import BillPreviewModal from '../../components/BillPreviewModal';
import toast from 'react-hot-toast';
import { formatDate } from '../../lib/dateUtils';

export default function Purchases() {
  const { state, addPurchase, removePurchase, updatePurchase, groupByCategory, allPartyNames } = useInventory();
  const { activeGodown, isManager, isAdmin } = useAuth();
  const [view, setView] = useState('entry'); // 'entry' | 'register'
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [bill, setBill] = useState('');
  const [party, setParty] = useState('');
  const [type, setType] = useState('Normal');
  const [remark, setRemark] = useState('');
  const [entryGodown, setEntryGodown] = useState(activeGodown);
  const [quantities, setQuantities] = useState({});
  // Register filters
  const [regSmart, setRegSmart] = useState('');
  const [regType, setRegType] = useState('all');
  const [regProduct, setRegProduct] = useState('');
  const [regFrom, setRegFrom] = useState('');
  const [regTo, setRegTo] = useState('');
  const [regRemark, setRegRemark] = useState('');
  const [selected, setSelected] = useState({});
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [previewEntry, setPreviewEntry] = useState(null);

  useEffect(() => {
    if (activeGodown !== 'All Godowns') {
      setEntryGodown(activeGodown);
    }
  }, [activeGodown]);

  const groups = groupByCategory();
  const parties = allPartyNames();
  const pmap = useMemo(() => {
    const m = {}; state.products.forEach(p => m[p.id] = p); return m;
  }, [state.products]);

  const filteredPurchases = useMemo(() => {
    const smart = regSmart.trim().toLowerCase();
    const prodQ = regProduct.trim().toLowerCase();
    const remQ = regRemark.trim().toLowerCase();

    const matchesProduct = (p) => {
      if (!prodQ) return true;
      return Object.keys(p.items || {}).some((id) => {
        const code = (pmap[id]?.code || '').toLowerCase();
        const name = (pmap[id]?.name || '').toLowerCase();
        return code.includes(prodQ) || name.includes(prodQ);
      });
    };

    const matchesSmart = (p) => {
      if (!smart) return true;
      const billText = (p.bill || '').toLowerCase();
      const partyText = (p.party || '').toLowerCase();
      const typeText = (p.type || '').toLowerCase();
      const dateText = (p.date || '').toLowerCase();
      const remarkText = (p.remark || '').toLowerCase();
      const productsText = Object.keys(p.items || {})
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

    return state.purchases
      .filter((p) => activeGodown === 'All Godowns' || p.godown === activeGodown)
      .filter((p) => (regType === 'all' ? true : (p.type || 'Normal') === regType))
      .filter((p) => (!regFrom ? true : p.date >= regFrom))
      .filter((p) => (!regTo ? true : p.date <= regTo))
      .filter((p) => (!remQ ? true : (p.remark || '').toLowerCase().includes(remQ)))
      .filter(matchesProduct)
      .filter(matchesSmart)
      .slice()
      .reverse();
  }, [state.purchases, activeGodown, regSmart, regType, regProduct, regFrom, regTo, regRemark, pmap]);

  const selectedIds = useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([id]) => id), [selected]);
  const allSelected = filteredPurchases.length > 0 && filteredPurchases.every((p) => selected[p.id]);

  const toggleSelectAll = (val) => {
    const next = {};
    filteredPurchases.forEach((p) => { next[p.id] = val; });
    setSelected(next);
  };

  const deleteSelected = () => {
    if (!isAdmin) return;
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} purchase entr${selectedIds.length === 1 ? 'y' : 'ies'}?`)) return;
    selectedIds.forEach((id) => removePurchase(id));
    setSelected({});
    toast.success('Deleted selected purchases');
  };

  const handleAdd = (e) => {
    e.preventDefault();
    if (!date) { toast.error('Select a date'); return; }
    if (!party.trim()) { toast.error('Enter party name'); return; }
    const items = {};
    Object.entries(quantities).forEach(([id, qty]) => { if (qty > 0) items[id] = qty; });
    if (!Object.keys(items).length) { toast.error('Enter at least one quantity'); return; }
    addPurchase({ godown: entryGodown, date, bill: bill.trim(), party: party.trim(), type, remark: remark.trim(), items });
    toast.success('✓ Purchase added');
    setQuantities({}); setParty(''); setRemark('');
  };

  const startEdit = (p) => {
    if (!canEditEntry(p)) return;
    setEditId(p.id);
    setEditData({ date: p.date, bill: p.bill || '', party: p.party, remark: p.remark || '', type: p.type || 'Normal' });
  };

  const saveEdit = () => {
    updatePurchase(editId, editData);
    setEditId(null);
    toast.success('Purchase updated');
  };

  const today = new Date().toISOString().slice(0, 10);
  // Admins can edit any bill; others can only edit same-day bills
  const canEditEntry = (entry) => isAdmin || entry.date === today;

  return (
    <div className="space-y-5">
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
          <div className="px-4 py-3 font-semibold text-sm" style={{ background: 'var(--teal)', color: '#f2ebd9' }}>🛒 New Purchase</div>
          <form onSubmit={handleAdd} className="p-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Bill No.</label>
              <input value={bill} onChange={e => setBill(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                placeholder="Bill number"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Party *</label>
              <input value={party} onChange={e => setParty(e.target.value)} list="pur-parties"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                placeholder="Supplier name"
              />
              <datalist id="pur-parties">{parties.map(p => <option key={p} value={p} />)}</datalist>
            </div>
            {isManager && (
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Godown *</label>
              <select value={entryGodown} onChange={e => setEntryGodown(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none font-bold"
                style={{ background: 'var(--soft)', color: 'var(--teal3)', border: '1px solid var(--line)' }}
              >
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
            
            {/* Restored Purchase Type Selector */}
            <div className="w-full mt-2 mb-1">
              <label className="block text-[10px] font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Purchase Type</label>
              <div className="flex gap-2">
                {['Normal', 'Pro-rata', 'Service', 'Scheme'].map(t => (
                  <button type="button" key={t} onClick={() => setType(t)}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all
                      ${type === t 
                        ? 'shadow-sm' 
                        : 'hover:opacity-80'
                      }`}
                    style={{ 
                      background: type === t ? 'var(--teal3)' : 'transparent', 
                      color: type === t ? '#fff' : 'var(--muted)',
                      border: `1px solid ${type === t ? 'var(--teal3)' : 'var(--line)'}`
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <CategoryAccordion
            groups={groups}
            accentColor="var(--teal3)"
            enableSearch
            searchPlaceholder="Search product code/name..."
            renderCard={(p) => (
              <div key={p.id} className="flex flex-col gap-1.5 px-2 py-2 rounded-lg" style={{ background: 'var(--soft)' }}>
                <span className="font-mono text-[10px] font-bold break-all leading-tight" style={{ color: 'var(--teal3)' }}>{p.code}</span>
                <input type="number" min="0" value={quantities[p.id] || ''}
                  onChange={e => setQuantities({ ...quantities, [p.id]: parseInt(e.target.value) || 0 })}
                  className="w-full px-1.5 py-1 rounded text-xs text-center outline-none"
                  style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                  placeholder="0"
                />
              </div>
            )}
          />

          <button type="submit" className="px-5 py-2 rounded-lg text-sm font-bold text-white" style={{ background: 'var(--teal3)' }}>✓ Add Purchase</button>
          </form>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
          <div className="px-4 py-3 font-semibold text-sm flex justify-between items-center gap-3" style={{ background: 'var(--teal)', color: '#f2ebd9' }}>
            <span>📋 Purchase Register</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded shadow-sm">{activeGodown} ({filteredPurchases.length})</span>
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

          {/* Register filters */}
          <div className="p-3 border-b flex flex-col gap-2" style={{ background: 'var(--soft)', borderColor: 'var(--line)' }}>
            <div className="filter-bar">
              <div className="flex-1 min-w-[180px] flex items-center rounded-lg overflow-hidden border px-3" style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}>
                <span className="text-sm mr-2 opacity-50">🔍</span>
                <input value={regSmart} onChange={(e) => setRegSmart(e.target.value)} placeholder="Smart search..." className="w-full py-2 outline-none text-xs bg-transparent" />
              </div>
              <select value={regType} onChange={(e) => setRegType(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-bold outline-none flex-shrink-0" style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                <option value="all">All Types</option>
                {['Normal', 'Pro-rata', 'Service', 'Scheme'].map((t) => <option key={t} value={t}>{t}</option>)}
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
            <table className="w-full text-xs" style={{ minWidth: '560px' }}>
            <thead>
              <tr style={{ background: 'var(--teal)' }}>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: '#f2ebd9' }}>
                  <input type="checkbox" checked={allSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
                </th>
                {['#', 'Date', 'Bill', 'Party', 'Type', 'Items', 'Remarks', 'Action'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: '#f2ebd9' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--muted)' }}>No purchases match your search in {activeGodown}.</td></tr>
              ) : (
                filteredPurchases.map((pur, i) => {
                  const isEditing = editId === pur.id;
                  return (
                    <tr key={pur.id} className="border-b transition-colors hover:bg-black/5" style={{ borderColor: 'var(--line)' }}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={!!selected[pur.id]}
                          onChange={(e) => setSelected((prev) => ({ ...prev, [pur.id]: e.target.checked }))}
                        />
                      </td>
                      <td className="px-3 py-2 font-bold" style={{ color: 'var(--ink)' }}>{filteredPurchases.length - i}</td>
                      {isEditing ? (
                        <>
                          <td className="px-2 py-1"><input type="date" value={editData.date} onChange={e => setEditData({ ...editData, date: e.target.value })} className="w-full p-1 text-xs border rounded" /></td>
                          <td className="px-2 py-1"><input value={editData.bill} onChange={e => setEditData({ ...editData, bill: e.target.value })} className="w-20 p-1 text-xs border rounded" /></td>
                          <td className="px-2 py-1"><input value={editData.party} onChange={e => setEditData({ ...editData, party: e.target.value })} className="w-24 p-1 text-xs border rounded" /></td>
                          <td className="px-2 py-1">
                            <select value={editData.type} onChange={e => setEditData({ ...editData, type: e.target.value })} className="p-1 text-xs border rounded">
                              <option>Normal</option><option>Pro-rata</option><option>Service</option><option>Scheme</option>
                            </select>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{formatDate(pur.date)}</td>
                          <td className="px-3 py-2 font-mono" style={{ color: 'var(--ink)' }}>{pur.bill || '—'}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{pur.party}</td>
                          <td className="px-3 py-2">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--pur-bg)', color: 'var(--ink)' }}>{pur.type}</span>
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--ink)' }}>
                        {Object.entries(pur.items).map(([id, qty]) => `${pmap[id]?.code || id}: ${qty}`).join(', ')}
                      </td>
                      <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--ink)' }}>
                        {isEditing ? (
                          <input value={editData.remark} onChange={e => setEditData({ ...editData, remark: e.target.value })} className="w-24 p-1 text-xs border rounded" />
                        ) : (
                          pur.remark || '—'
                        )}
                      </td>
                      <td className="px-3 py-2 flex gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={saveEdit} className="text-[10px] px-2 py-1 rounded font-bold text-white bg-emerald-500">Save</button>
                            <button onClick={() => setEditId(null)} className="text-[10px] px-2 py-1 rounded bg-gray-200">Cancel</button>
                          </>
                        ) : (
                          <>
                            {canEditEntry(pur) && <button onClick={() => startEdit(pur)} className="text-[10px] px-2 py-0.5 rounded text-blue-600 hover:bg-blue-50">✏️</button>}
                            <button onClick={() => setPreviewEntry(pur)} className="text-[10px] px-2 py-0.5 rounded opacity-60 hover:opacity-100 transition-opacity" style={{ color: 'var(--teal3)' }} title="Preview">👁</button>
                            {isAdmin && <button onClick={() => { if (window.confirm('Delete purchase?')) removePurchase(pur.id); }} className="text-xs px-2 py-0.5 rounded font-bold text-white bg-red-500 hover:bg-red-600">✕</button>}
                          </>
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

      {previewEntry && (
        <BillPreviewModal
          entry={previewEntry}
          module="Purchase"
          products={pmap}
          onClose={() => setPreviewEntry(null)}
        />
      )}
    </div>
  );
}
