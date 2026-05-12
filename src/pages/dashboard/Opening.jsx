import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function Opening() {
  const { state, setOpening, groupByCategory } = useInventory();
  const { activeGodown } = useAuth();
  const groups = groupByCategory();

  const handleChange = (productId, value) => {
    const qty = parseInt(value) || 0;
    setOpening(activeGodown, productId, qty);
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
      <div className="px-4 py-3 font-semibold text-sm flex items-center justify-between" style={{ background: 'var(--teal)', color: '#f2ebd9' }}>
        <span>📋 Opening Stock</span>
        <span className="text-[10px] tracking-widest px-2 py-0.5 rounded-full bg-white/10 uppercase">{activeGodown}</span>
      </div>
      <div className="p-4">
        {state.products.length === 0 ? (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--muted)' }}>
            <div className="text-3xl mb-2">📦</div>
            Add products first.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groups).map(([cat, products]) => (
              <div key={cat}>
                <div className="text-[10px] font-bold uppercase tracking-widest pb-1.5 mb-2 border-b"
                  style={{ color: 'var(--teal3)', borderColor: 'var(--line)' }}
                >{cat}</div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
                  {products.map(p => (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--soft)' }}>
                      <span className="font-mono text-xs font-bold flex-1" style={{ color: 'var(--teal3)' }}>{p.code}</span>
                      <input
                        type="number"
                        min="0"
                        value={state.opening[activeGodown]?.[p.id] || ''}
                        onChange={e => handleChange(p.id, e.target.value)}
                        className="w-16 px-2 py-1 rounded text-xs text-center outline-none"
                        style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={() => toast.success('Opening stock saved')}
              className="px-5 py-2 rounded-lg text-sm font-bold text-white" style={{ background: 'var(--teal3)' }}
            >💾 Save Opening Stock</button>
          </div>
        )}
      </div>
    </div>
  );
}
