import { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import BillPreviewModal from '../../components/BillPreviewModal';
import toast from 'react-hot-toast';
import { formatDate } from '../../lib/dateUtils';

export default function Transfers() {
  const { state, addTransfer, removeTransfer } = useInventory();
  const { isAdmin, isManager, activeGodown } = useAuth();
  const pmap = useMemo(() => { const m = {}; state.products.forEach(p => m[p.id] = p); return m; }, [state.products]);
  const [previewEntry, setPreviewEntry] = useState(null);
  
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [fromGodown, setFromGodown] = useState(activeGodown);
  const [toGodown, setToGodown] = useState(activeGodown === '1 Vasai' ? '2 Virar' : '1 Vasai');
  const [refNo, setRefNo] = useState('');
  const [remark, setRemark] = useState('');
  const [items, setItems] = useState({});
  const [search, setSearch] = useState('');

  const filteredProducts = useMemo(() => {
    if (!search) return state.products;
    const q = search.toLowerCase();
    return state.products.filter(p => p.code.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
  }, [state.products, search]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const activeItems = {};
    for (const [id, qty] of Object.entries(items)) {
      if (qty > 0) activeItems[id] = qty;
    }
    if (Object.keys(activeItems).length === 0) {
      toast.error('Add at least one item');
      return;
    }
    if (fromGodown === toGodown) {
      toast.error('Source and Destination godowns must be different');
      return;
    }
    
    addTransfer({
      date,
      fromGodown,
      toGodown,
      refNo,
      remark,
      items: activeItems
    });
    
    toast.success('Transfer logged globally!');
    setItems({});
    setRefNo('');
    setRemark('');
  };

  const updateItem = (id, change) => {
    setItems(prev => {
      const cur = prev[id] || 0;
      const next = Math.max(0, cur + change);
      if (next === 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  };

  const activeTransfers = useMemo(() => {
    return state.transfers.filter(t => t.fromGodown === activeGodown || t.toGodown === activeGodown).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [state.transfers, activeGodown]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Entry Form */}
        <div className="lg:col-span-2 rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)', maxHeight: 'calc(100vh - 120px)' }}>
          <div className="px-4 py-3 font-semibold text-sm" style={{ background: 'var(--teal)', color: '#fff' }}>🚚 Initiate Godown Transfer</div>
          <form onSubmit={handleSubmit} className="p-4 flex flex-col flex-1 overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>From</label>
                <select value={fromGodown} onChange={e => setFromGodown(e.target.value)} disabled={!isManager} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--soft)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                  <option value="1 Vasai">1 Vasai</option>
                  <option value="2 Virar">2 Virar</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>To</label>
                <select value={toGodown} onChange={e => setToGodown(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--soft)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                  <option value="1 Vasai">1 Vasai</option>
                  <option value="2 Virar">2 Virar</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--soft)', border: '1px solid var(--line)', color: 'var(--ink)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Ref No. (Optional)</label>
                <input type="text" value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="Vehicle / E-way" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--soft)', border: '1px solid var(--line)', color: 'var(--ink)' }} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Remark</label>
                <input type="text" value={remark} onChange={e => setRemark(e.target.value)} placeholder="Condition, driver info..." className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--soft)', border: '1px solid var(--line)', color: 'var(--ink)' }} />
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 border rounded-lg overflow-hidden" style={{ borderColor: 'var(--line)' }}>
              <div className="px-3 py-2 border-b flex gap-2 items-center" style={{ background: 'var(--soft)', borderColor: 'var(--line)' }}>
                <span className="text-lg">🔍</span>
                <input type="text" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-transparent outline-none text-sm" style={{ color: 'var(--ink)' }} />
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredProducts.map(p => {
                  const qty = items[p.id] || 0;
                  return (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-black/5" style={{ background: qty > 0 ? 'var(--sale-bg)' : 'transparent' }}>
                      <div>
                        <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{p.code}</div>
                        <div className="text-[10px]" style={{ color: 'var(--muted)' }}>{p.category}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => updateItem(p.id, -1)} disabled={qty === 0} className="w-7 h-7 rounded-full flex items-center justify-center text-lg font-bold disabled:opacity-30" style={{ background: 'var(--soft)', color: 'var(--ink)' }}>-</button>
                        <span className="w-8 text-center font-bold" style={{ color: 'var(--ink)' }}>{qty}</span>
                        <button type="button" onClick={() => updateItem(p.id, 1)} className="w-7 h-7 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-md relative overflow-hidden group" style={{ background: 'var(--accent)' }}>
                          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform"></div>
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 flex justify-between items-center text-sm">
              <div style={{ color: 'var(--muted)' }}>Total Items: <b style={{ color: 'var(--ink)' }}>{Object.values(items).reduce((a,b)=>a+b, 0)}</b></div>
              <button type="submit" className="px-6 py-2 rounded-lg font-bold text-white shadow-md transition-all hover:-translate-y-0.5" style={{ background: '#2196f3' }}>🚀 Dispatch Transfer</button>
            </div>
          </form>
        </div>

        {/* History */}
        <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)', maxHeight: 'calc(100vh - 120px)' }}>
           <div className="px-4 py-3 font-semibold text-sm border-b" style={{ background: '#e3f2fd', color: '#0d47a1', borderColor: 'var(--line)' }}>Recent Movements ({activeGodown})</div>
           <div className="flex-1 overflow-y-auto p-4 space-y-3">
             {activeTransfers.length === 0 ? (
               <div className="text-center py-8 text-xs font-semibold" style={{ color: 'var(--muted)' }}>No transfers found.</div>
             ) : activeTransfers.map((t) => {
               const total = Object.values(t.items).reduce((a, b) => a + b, 0);
               const isOut = t.fromGodown === activeGodown;
               return (
                 <div key={t.id} className="p-3 rounded-lg border flex flex-col gap-2" style={{ borderColor: 'var(--line)', background: isOut ? '#fff3e0' : '#e3f2fd' }}>
                   <div className="flex justify-between items-start">
                     <div>
                       <div className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{formatDate(t.date)}</div>
                       <div className="text-[10px] uppercase font-bold" style={{ color: isOut ? '#e65100' : '#0d47a1' }}>
                         {isOut ? `OUT ➔ ${t.toGodown}` : `IN ⬅ ${t.fromGodown}`}
                       </div>
                       {t.refNo && <div className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>Ref: {t.refNo}</div>}
                     </div>
                     <div className="flex gap-1">
                       <button onClick={() => setPreviewEntry({...t, godown: `${t.fromGodown} → ${t.toGodown}`})} className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--soft)', color: 'var(--teal3)' }} title="Preview">👁</button>
                       <button onClick={() => { if(confirm('Delete transfer?')) removeTransfer(t.id); }} disabled={!isAdmin} className="text-[10px] px-2 py-1 rounded disabled:opacity-30" style={{ background: 'var(--soft)', color: 'var(--danger)' }}>🗑</button>
                     </div>
                   </div>
                   <div className="text-[10px]" style={{ color: 'var(--ink)' }}>
                     {Object.entries(t.items).map(([id, qty]) => {
                       const p = state.products.find(x => x.id === id);
                       return p ? `${p.code}: ${qty}` : '';
                     }).join(', ')}
                   </div>
                   <div className="text-[10px] font-bold text-right pt-2 border-t" style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}>
                     Total: {total}
                   </div>
                 </div>
               );
             })}
           </div>
        </div>

      </div>

      {previewEntry && (
        <BillPreviewModal
          entry={previewEntry}
          module="Transfer"
          products={pmap}
          onClose={() => setPreviewEntry(null)}
        />
      )}
    </div>
  );
}
