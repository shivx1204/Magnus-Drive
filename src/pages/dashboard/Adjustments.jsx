import { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import BillPreviewModal from '../../components/BillPreviewModal';
import toast from 'react-hot-toast';
import { formatDate } from '../../lib/dateUtils';

export default function Adjustments() {
  const { state, addAdjustment, removeAdjustment } = useInventory();
  const { user, isAdmin, isManager, activeGodown } = useAuth();
  const pmap = useMemo(() => { const m = {}; state.products.forEach(p => m[p.id] = p); return m; }, [state.products]);
  const [previewEntry, setPreviewEntry] = useState(null);
  
  const [mode, setMode] = useState('negative'); // 'negative' | 'positive'
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [type, setType] = useState('Damage');
  const [reason, setReason] = useState('');
  const [items, setItems] = useState({});
  const [search, setSearch] = useState('');

  const theme = useMemo(() => {
    const negative = mode === 'negative';
    return negative
      ? {
          headerBg: '#e4573d',
          headerText: '#fff',
          panelBg: '#ffebee',
          panelText: '#c62828',
          panelBorder: '#ffcdd2',
          qtyColor: 'var(--danger)',
          actionBtnBg: '#d32f2f',
          actionBtnLabel: '⚠ Log Loss',
          title: '📉 Log Stock Adjustment (Negative)',
          noticeVerb: 'subtracted',
          softCard: '#fafafa',
          historyAccent: '#d32f2f',
        }
      : {
          headerBg: '#2e7d32',
          headerText: '#fff',
          panelBg: '#e8f5e9',
          panelText: '#1b5e20',
          panelBorder: '#c8e6c9',
          qtyColor: '#2e7d32',
          actionBtnBg: '#2e7d32',
          actionBtnLabel: '✅ Log Addition',
          title: '📈 Log Stock Adjustment (Positive)',
          noticeVerb: 'added',
          softCard: '#f7fff7',
          historyAccent: '#2e7d32',
        };
  }, [mode]);

  const typeOptions = mode === 'negative'
    ? ['Damage', 'Stolen', 'Transit Loss', 'Expired', 'Scrap', 'Other']
    : ['Restock', 'Found Stock', 'Correction', 'Return Received', 'Other'];

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
    
    addAdjustment({
      date,
      godown: activeGodown,
      type: mode === 'positive' ? `ADD:${type}` : type,
      reason,
      items: activeItems
    });
    
    toast.success(mode === 'positive' ? 'Stock addition logged successfully!' : 'Adjustment logged successfully!');
    setItems({});
    setReason('');
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

  const activeAdjustments = useMemo(() => {
    return state.adjustments.filter(a => a.godown === activeGodown).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [state.adjustments, activeGodown]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Entry Form */}
        <div className="lg:col-span-2 rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)', maxHeight: 'calc(100vh - 120px)' }}>
          <div className="px-4 py-3 font-semibold text-sm flex items-center justify-between gap-3" style={{ background: theme.headerBg, color: theme.headerText }}>
            <span>{theme.title}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setMode('negative'); setType('Damage'); setItems({}); }}
                className="px-3 py-1 rounded-md text-[11px] font-bold"
                style={{
                  background: mode === 'negative' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.25)',
                }}
              >
                Negative
              </button>
              <button
                type="button"
                onClick={() => { setMode('positive'); setType('Restock'); setItems({}); }}
                className="px-3 py-1 rounded-md text-[11px] font-bold"
                style={{
                  background: mode === 'positive' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.25)',
                }}
              >
                Positive
              </button>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="p-4 flex flex-col flex-1 overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Type</label>
                <select value={type} onChange={e => setType(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--soft)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                  {typeOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--soft)', border: '1px solid var(--line)', color: 'var(--ink)' }} />
              </div>
              <div className="col-span-2 lg:col-span-3">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Reason / Remark</label>
                <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Describe the incident..." required className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--soft)', border: '1px solid var(--line)', color: 'var(--ink)' }} />
              </div>
            </div>

            <div className="p-3 mb-4 rounded-lg text-xs" style={{ background: theme.panelBg, color: theme.panelText, border: `1px solid ${theme.panelBorder}` }}>
              <strong>Notice:</strong> Items added here will be <strong>{theme.noticeVerb}</strong> in the Final Stock calculation for {activeGodown}.
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
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-black/5" style={{ background: qty > 0 ? theme.panelBg : 'transparent' }}>
                      <div>
                        <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{p.code}</div>
                        <div className="text-[10px]" style={{ color: 'var(--muted)' }}>{p.category}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => updateItem(p.id, -1)} disabled={qty === 0} className="w-7 h-7 rounded-full flex items-center justify-center text-lg font-bold disabled:opacity-30" style={{ background: 'var(--soft)', color: 'var(--ink)' }}>-</button>
                        <span className="w-8 text-center font-bold" style={{ color: theme.qtyColor }}>{qty}</span>
                        <button type="button" onClick={() => updateItem(p.id, 1)} className="w-7 h-7 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-md relative overflow-hidden group" style={{ background: theme.headerBg }}>
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
              <div style={{ color: 'var(--muted)' }}>
                Total Items to {mode === 'negative' ? 'Deduct' : 'Add'}:{' '}
                <b style={{ color: theme.qtyColor }}>{Object.values(items).reduce((a,b)=>a+b, 0)}</b>
              </div>
              <button type="submit" className="px-6 py-2 rounded-lg font-bold text-white shadow-md transition-all hover:-translate-y-0.5" style={{ background: theme.actionBtnBg }}>
                {theme.actionBtnLabel}
              </button>
            </div>
          </form>
        </div>

        {/* History */}
        <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)', maxHeight: 'calc(100vh - 120px)' }}>
           <div className="px-4 py-3 font-semibold text-sm border-b" style={{ background: theme.panelBg, color: theme.panelText, borderColor: 'var(--line)' }}>Adjustment History</div>
           <div className="flex-1 overflow-y-auto p-4 space-y-3">
             {activeAdjustments.length === 0 ? (
               <div className="text-center py-8 text-xs font-semibold" style={{ color: 'var(--muted)' }}>No recent adjustments.</div>
             ) : activeAdjustments.map((a, i) => {
               const total = Object.values(a.items).reduce((c, b) => c + b, 0);
               const isPositive = (a.type || '').startsWith('ADD:');
               const shownType = isPositive ? a.type.replace(/^ADD:/, '') : a.type;
               return (
                 <div key={a.id} className="p-3 rounded-lg border flex flex-col gap-2" style={{ borderColor: isPositive ? '#c8e6c9' : '#ffcdd2', background: isPositive ? '#f7fff7' : theme.softCard }}>
                   <div className="flex justify-between items-start">
                     <div>
                       <div className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{formatDate(a.date)}</div>
                       <div className="text-[10px] uppercase font-bold" style={{ color: isPositive ? '#2e7d32' : '#d32f2f' }}>
                         {shownType}
                       </div>
                       {a.reason && <div className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>Reason: {a.reason}</div>}
                     </div>
                     <div className="flex gap-1">
                       <button onClick={() => setPreviewEntry({...a, remark: a.reason})} className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--soft)', color: 'var(--teal3)' }} title="Preview">👁</button>
                       <button onClick={() => { if(confirm('Delete adjustment?')) removeAdjustment(a.id); }} disabled={!isAdmin} className="text-[10px] px-2 py-1 rounded disabled:opacity-30" style={{ background: 'var(--soft)', color: 'var(--danger)' }}>🗑</button>
                     </div>
                   </div>
                   <div className="text-[10px]" style={{ color: 'var(--ink)' }}>
                     {Object.entries(a.items).map(([id, qty]) => {
                       const p = state.products.find(x => x.id === id);
                       return p ? `${p.code}: ${isPositive ? '+' : '-'}${qty}` : '';
                     }).join(', ')}
                   </div>
                   <div className="text-[10px] font-bold text-right pt-2 border-t" style={{ borderColor: 'var(--line)', color: isPositive ? '#2e7d32' : '#d32f2f' }}>
                     {isPositive ? `Total Added: +${total}` : `Total Lost: -${total}`}
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
          module="Adjustment"
          products={pmap}
          onClose={() => setPreviewEntry(null)}
        />
      )}
    </div>
  );
}
