import { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import CategoryAccordion from '../../components/CategoryAccordion';
import toast from 'react-hot-toast';

export default function Products() {
  const { state, addProduct, removeProduct, updateProduct, groupByCategory, categoryOrder, setCategoryOrder } = useInventory();
  const { isManager } = useAuth();
  const [code, setCode] = useState('');
  const [reorderMode, setReorderMode] = useState(false);
  const [orderedCategories, setOrderedCategories] = useState([]);
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [minStock, setMinStock] = useState('');
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});

  const categories = useMemo(() => {
    const cats = new Set(state.products.map(p => p.category).filter(Boolean));
    return [...cats].sort();
  }, [state.products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return state.products.filter(p =>
      !q || p.code?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)
    );
  }, [state.products, search]);

  // Use the shared groupByCategory which respects order_index, then filter for search
  const grouped = useMemo(() => {
    const allGrouped = groupByCategory(); // already sorted by order_index then alphabetically
    if (!search) return allGrouped;
    // When searching, filter within the already-sorted structure
    const q = search.toLowerCase();
    const result = {};
    Object.entries(allGrouped).forEach(([cat, prods]) => {
      const f = prods.filter(p =>
        p.code?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q) || cat.toLowerCase().includes(q)
      );
      if (f.length) result[cat] = f;
    });
    return result;
  }, [state.products, search, groupByCategory]);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!code.trim()) { toast.error('Enter product code'); return; }
    if (state.products.find(p => p.code === code.trim().toUpperCase())) {
      toast.error('Product code already exists'); return;
    }
    addProduct({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      category: category.trim() || 'Uncategorized',
      min_stock: parseInt(minStock) || 0,
      order_index: state.products.length,
    });
    toast.success(`✓ ${code.toUpperCase()} added`);
    setCode(''); setName(''); setMinStock('');
  };

  const handleRemove = (id) => {
    const p = state.products.find(x => x.id === id);
    if (window.confirm(`Delete ${p?.code}?`)) {
      removeProduct(id);
      toast.success('Product removed');
    }
  };

  const startEdit = (p) => {
    setEditId(p.id);
    setEditData({ code: p.code, name: p.name || '', category: p.category || '', min_stock: p.min_stock || 0, order_index: p.order_index || 0 });
  };

  const saveEdit = () => {
    updateProduct(editId, editData);
    setEditId(null);
    toast.success('Product updated');
  };

  const toggleReorder = () => {
    if (!reorderMode) {
      const allCats = Object.keys(groupByCategory());
      const startOrder = [
        ...categoryOrder.filter((c) => allCats.includes(c)),
        ...allCats.filter((c) => !categoryOrder.includes(c)),
      ];
      setOrderedCategories(startOrder);
      setReorderMode(true);
      return;
    }
    setCategoryOrder(orderedCategories);
    setReorderMode(false);
    toast.success('Category order saved');
  };

  const handleDragStart = (e, index) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    const newItems = [...orderedCategories];
    const draggedItem = newItems.splice(draggedIdx, 1)[0];
    newItems.splice(index, 0, draggedItem);
    setDraggedIdx(index);
    setOrderedCategories(newItems);
  };

  return (
    <div className="space-y-6">
      {/* Add Product Card */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--paper)' }}>
        <div className="font-headline text-lg font-bold mb-4" style={{ color: 'var(--teal3)' }}>
          + Add Product
        </div>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Code *</label>
            <input value={code} onChange={e => setCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
              placeholder="e.g. BL-BLO60"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
              placeholder="Product name"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Category</label>
            <input value={category} onChange={e => setCategory(e.target.value)} list="cat-list"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
              placeholder="e.g. BLO, PRO"
            />
            <datalist id="cat-list">
              {categories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="w-[100px]">
            <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Min Stock</label>
            <input type="number" min="0" value={minStock} onChange={e => setMinStock(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
              placeholder="0"
            />
          </div>
          <button type="submit" className="px-6 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, var(--teal3), var(--dcwr))' }}
          >
            + Add
          </button>
        </form>
      </div>

      {/* Product List */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--paper)' }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <span className="font-headline text-xl font-bold" style={{ color: 'var(--ink)' }}>Products ({state.products.length})</span>
          <div className="flex gap-2 items-center w-full md:w-auto">
            {isManager && (
              <button onClick={toggleReorder} className="px-4 py-2 rounded-full text-xs font-bold transition-all text-white border" style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}>
                {reorderMode ? 'Save Categories' : '↕ Reorder Categories'}
              </button>
            )}
            {!reorderMode && (
              <div className="relative flex-1 md:w-64">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50 text-sm">🔍</span>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-full text-sm outline-none transition-all"
                  style={{ background: 'var(--soft)', color: 'var(--ink)', border: 'none' }}
                  placeholder="Search products..."
                />
              </div>
            )}
          </div>
        </div>
        <div className="pt-2">
          {reorderMode ? (
            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                Drag and drop to reorder whole categories
              </div>
              {orderedCategories.map((cat, index) => (
                <div
                  key={cat}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={() => setDraggedIdx(null)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border-l-4 transition-all cursor-move
                    ${draggedIdx === index ? 'opacity-50 shadow-inner' : 'hover:shadow-md'}`}
                  style={{ background: 'var(--soft)', borderLeftColor: 'var(--teal3)', borderColor: draggedIdx === index ? 'var(--teal3)' : 'transparent' }}
                >
                  <span className="text-lg opacity-30">☰</span>
                  <span className="text-xs font-bold uppercase tracking-wider flex-1" style={{ color: 'var(--teal3)' }}>{cat}</span>
                  <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'var(--paper)', color: 'var(--muted)', border: '1px solid var(--line)' }}>
                    {(grouped[cat] || []).length} items
                  </span>
                </div>
              ))}
            </div>
          ) : Object.entries(grouped).length === 0 ? (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--muted)' }}>
              <div className="text-3xl mb-2">📦</div>
              No products yet. Add your first product above.
            </div>
          ) : (
            <CategoryAccordion
              groups={grouped}
              accentColor="var(--teal3)"
              gridClass="grid grid-cols-1 md:grid-cols-2 gap-4"
              renderCard={(p) => (
                <div key={p.id} className="flex items-center justify-between p-4 rounded-2xl transition-all"
                  style={{ background: 'var(--soft)' }}
                >
                  {editId === p.id ? (
                    <div className="flex-1 flex gap-2 items-center flex-wrap">
                      <input value={editData.code} onChange={e => setEditData({ ...editData, code: e.target.value })}
                        className="w-20 px-2 py-1 rounded text-xs outline-none"
                        style={{ background: 'var(--paper)', color: 'var(--ink)' }}
                        title="Code"
                      />
                      <input value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })}
                        className="flex-1 min-w-[80px] px-2 py-1 rounded text-xs outline-none"
                        style={{ background: 'var(--paper)', color: 'var(--ink)' }}
                        placeholder="Name"
                      />
                      <input type="number" value={editData.min_stock} onChange={e => setEditData({ ...editData, min_stock: parseInt(e.target.value) || 0 })}
                        className="w-16 px-2 py-1 rounded text-xs outline-none"
                        style={{ background: 'var(--paper)', color: 'var(--ink)' }}
                        title="Min Stock"
                      />
                      <button onClick={saveEdit} className="text-xs px-3 py-1.5 rounded-full font-bold text-white" style={{ background: 'var(--success)' }}>Save</button>
                      <button onClick={() => setEditId(null)} className="text-xs px-3 py-1.5 rounded-full font-bold" style={{ background: 'var(--line)', color: 'var(--ink)' }}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col flex-1 overflow-hidden">
                        <span className="font-headline text-lg font-bold truncate" style={{ color: 'var(--ink)' }}>{p.code}</span>
                        {p.name && <span className="text-sm truncate mt-0.5" style={{ color: 'var(--ink)' }}>{p.name}</span>}
                        <div className="flex gap-4 mt-2" style={{ color: 'var(--muted)' }}>
                          <span className="text-xs">Category: <span style={{ color: 'var(--ink)' }}>{p.category}</span></span>
                          <span className="text-xs">Min Stock: <span style={{ color: 'var(--ink)' }}>{p.min_stock || 0}</span></span>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center flex-shrink-0 ml-4">
                        {isManager && (
                          <button onClick={() => startEdit(p)} className="px-4 py-2 rounded-full text-xs font-bold transition-all" style={{ background: 'var(--teal3)', color: 'var(--paper)' }}>
                            Edit
                          </button>
                        )}
                        {isManager && (
                          <button onClick={() => handleRemove(p.id)} className="w-8 h-8 rounded-full flex items-center justify-center transition-all opacity-60 hover:opacity-100 hover:bg-white/5" style={{ color: 'var(--danger)' }}>
                            ✕
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
