import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const InventoryContext = createContext(null);

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const STORAGE_KEY = 'magnusData';

const EMPTY_STATE = {
  products: [],
  sales: [],
  purchases: [],
  dcwrOut: [],
  dcwrIn: [],
  transfers: [],
  adjustments: [],
  scrapLogs: [],
  thirdPartyEntries: [],
  physical: { '1 Vasai': {}, '2 Virar': {} },
  crm: { '1 Vasai': {}, '2 Virar': {} },
  parties: [],
  opening: { '1 Vasai': {}, '2 Virar': {} },
};

export function InventoryProvider({ children }) {
  const { user } = useAuth();

  // ── Category order ── (persisted in Supabase for all users + localStorage as fallback)
  const [categoryOrder, setCategoryOrderState] = useState(() => {
    try { return JSON.parse(localStorage.getItem('magnusCategoryOrder') || '[]'); } catch { return []; }
  });

  // Load from Supabase on mount
  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'category_order').single()
      .then(({ data, error }) => {
        if (!error && data?.value && Array.isArray(data.value) && data.value.length > 0) {
          setCategoryOrderState(data.value);
          localStorage.setItem('magnusCategoryOrder', JSON.stringify(data.value));
        }
      });
  }, []);

  const setCategoryOrder = useCallback((newOrder) => {
    // Resolve if called as updater function (from moveCategoryUp/Down)
    setCategoryOrderState(prev => {
      const resolved = typeof newOrder === 'function' ? newOrder(prev) : newOrder;
      localStorage.setItem('magnusCategoryOrder', JSON.stringify(resolved));
      // Sync to Supabase (fire and forget)
      supabase.from('app_settings')
        .upsert({ key: 'category_order', value: resolved }, { onConflict: 'key' })
        .then(({ error }) => { if (error) console.error('Category order sync failed:', error.message); });
      return resolved;
    });
  }, []);

  const moveCategoryUp = useCallback((cat) => {
    setCategoryOrder(prev => {
      const idx = prev.indexOf(cat);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, [setCategoryOrder]);

  const moveCategoryDown = useCallback((cat) => {
    setCategoryOrder(prev => {
      const idx = prev.indexOf(cat);
      if (idx === -1 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, [setCategoryOrder]);
  
  // structured = { module, ref_id, ref_bill, party, godown, before_snapshot, after_snapshot }
  const pushActivity = useCallback(async (action, details, structured = {}) => {
    if (!user) return;
    const basePayload = {
      time: new Date().toLocaleString('en-IN'),
      user_name: user.display_name || user.login_id || 'System',
      login_id: user.login_id || 'system',
      role: user.role || 'staff',
      action: action,
      details: details || '',
    };
    try {
      // Attempt full structured insert (new columns)
      const { error } = await supabase.from('activity_log').insert([{
        ...basePayload,
        module:          structured.module           || null,
        ref_id:          structured.ref_id           || null,
        ref_bill:        structured.ref_bill         || null,
        party:           structured.party            || null,
        godown:          structured.godown           || null,
        ip_address:      user.ip                     || null,
        before_snapshot: structured.before_snapshot  || null,
        after_snapshot:  structured.after_snapshot   || null,
      }]);
      if (error) {
        // Fallback: schema cache may not have refreshed yet — retry with only base columns
        console.warn('Activity log full insert failed, retrying with base columns:', error.message);
        const { error: fallbackError } = await supabase.from('activity_log').insert([basePayload]);
        if (fallbackError) {
          console.error('Activity log fallback also failed:', fallbackError.message);
          toast.error('Activity log failed: ' + fallbackError.message);
        }
      }
    } catch (err) {
      console.error('Fatal activity log exception:', err);
    }
  }, [user]);

  const [state, setState] = useState(() => {
    try {
      const savedStr = localStorage.getItem(STORAGE_KEY);
      if (!savedStr) return { ...EMPTY_STATE };
      const saved = JSON.parse(savedStr);
      
      // Migrate old structure if present (where opening/physical/crm were flat objects)
      const isLegacy = (obj) => obj && !obj['1 Vasai'] && Object.keys(obj).length > 0;
      
      return {
        ...EMPTY_STATE,
        ...saved,
        physical: isLegacy(saved.physical) ? { '1 Vasai': saved.physical, '2 Virar': {} } : (saved.physical || EMPTY_STATE.physical),
        crm: isLegacy(saved.crm) ? { '1 Vasai': saved.crm, '2 Virar': {} } : (saved.crm || EMPTY_STATE.crm),
        opening: isLegacy(saved.opening) ? { '1 Vasai': saved.opening, '2 Virar': {} } : (saved.opening || EMPTY_STATE.opening),
      };
    } catch { return { ...EMPTY_STATE }; }
  });

  useEffect(() => {
    if (!user) return;
    
    // Initial fetch
    loadFromCloud();

    // Set up Realtime Subscription with Debouncing
    let syncTimeout;
    const channel = supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          // Debounce fetch calls to prevent overloading Supabase upon batch operations
          clearTimeout(syncTimeout);
          syncTimeout = setTimeout(() => {
            console.log('Realtime DB change detected. Synchronizing...');
            loadFromCloud();
          }, 1500);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(syncTimeout);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const undoStack = useRef([]);

  // ── Persistence ──
  const save = useCallback((newState) => {
    setState(newState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  }, []);

  const pushUndo = useCallback((label) => {
    undoStack.current.push({ label, snapshot: JSON.stringify(state) });
    if (undoStack.current.length > 20) undoStack.current.shift();
  }, [state]);

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return null;
    const restored = JSON.parse(entry.snapshot);
    save(restored);
    return entry.label;
  }, [save]);

  // ── Cloud Sync ──
  const loadFromCloud = useCallback(async () => {
    try {
      const results = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('sales').select('*'),
        supabase.from('purchases').select('*'),
        supabase.from('dcwr_out').select('*'),
        supabase.from('dcwr_in').select('*'),
        supabase.from('parties').select('*'),
        supabase.from('opening_stock').select('*'),
        supabase.from('transfers').select('*'),
        supabase.from('adjustments').select('*'),
        supabase.from('third_party_entries').select('*'),  // ← proper table
        supabase.from('scrap_logs').select('*'),            // ← proper table
        supabase.from('app_settings').select('key, value').eq('key', 'category_order'),
      ]);

      const errors = results.filter(r => r.error).map(r => r.error);
      if (errors.length > 0) {
        console.error('Cloud load aborted due to database errors:', errors);
        return false;
      }

      const [products, sales, purchases, dcwrOut, dcwrIn, parties, openingRows, transfersRes, adjustmentsRes, tpRows, scrapRows] = results.map(r => r.data || []);

      const cloud = { ...EMPTY_STATE };
      if (products.length) cloud.products = products.map(p => ({ id: p.id, code: p.code, category: p.category, min_stock: p.min_stock || 0, order_index: p.order_index || 0 }));
      if (parties.length) cloud.parties = parties.map(p => ({ id: p.id, name: p.name, type: p.type, lat: p.lat, lng: p.lng, address: p.address }));
      if (purchases.length) cloud.purchases = purchases.map(p => ({
        id: p.id, godown: p.godown || '1 Vasai', date: p.date, bill: p.bill,
        party: p.party, type: p.type, items: p.items, remark: p.remark || '',
        serialNumbersByProduct: p.serial_numbers_by_product || {},
      }));
      if (sales.length) cloud.sales = sales.map(s => {
        let tpSource = s.third_party_source || null;
        if (!tpSource && s.remark) {
          const match = s.remark.match(/\[TP Source:\s*([^\]]+)\]/);
          if (match) tpSource = match[1].trim();
        }
        return {
          id: s.id, godown: s.godown || '1 Vasai', date: s.date, bill: s.bill,
          party: s.party, type: s.type, items: s.items,
          scrapProvided: s.scrap_provided || false, scrapItems: s.scrap_items || {},
          remark: s.remark || '', thirdPartySource: tpSource,
          thirdPartyEntryId: s.third_party_entry_id || null,
          serialNumbersByProduct: s.serial_numbers_by_product || {},
        };
      });
      if (dcwrOut.length) cloud.dcwrOut = dcwrOut.map(d => ({ id: d.id, godown: d.godown || '1 Vasai', date: d.date, challan: d.challan, party: d.party, remark: d.remark, items: d.items }));
      if (dcwrIn.length) cloud.dcwrIn = dcwrIn.map(d => ({ id: d.id, godown: d.godown || '1 Vasai', refOutId: d.ref_out_id || d.refOutId, date: d.date, remark: d.remark, items: d.items }));
      if (transfersRes.length) cloud.transfers = transfersRes.map(t => ({ id: t.id, date: t.date, fromGodown: t.from_godown, toGodown: t.to_godown, refNo: t.ref_no, remark: t.remark, items: t.items }));
      if (adjustmentsRes.length) cloud.adjustments = adjustmentsRes.map(a => ({ id: a.id, godown: a.godown || '1 Vasai', date: a.date, type: a.type, reason: a.reason, items: a.items }));

      // ── Map third_party_entries rows → JS camelCase ──
      if (tpRows.length) cloud.thirdPartyEntries = tpRows.map(r => ({
        id: r.id, godown: r.godown || 'Third Party Godown', date: r.date,
        bill: r.bill || '', party: r.party || '', type: r.type || 'Adjustment',
        status: r.status || 'pending',
        items: r.items || {}, consumedItems: r.consumed_items || {},
        consumedBySales: r.consumed_by_sales || [],
        serialNumbersByProduct: r.serial_numbers_by_product || {},
        remark: r.remark || '',
      }));

      // ── Map scrap_logs rows → JS camelCase ──
      if (scrapRows.length) cloud.scrapLogs = scrapRows.map(r => ({
        id: r.id, date: r.date, godown: r.godown || '1 Vasai',
        productId: r.product_id || null, items: r.items || {},
        qty: r.qty || 0, reason: r.reason || 'Other',
        recoverable: r.recoverable || false, remark: r.remark || '',
        status: r.status || 'pending', disposalValue: Number(r.disposal_value || 0),
        source: r.source || 'manual', sourceRefId: r.source_ref_id || null,
      }));

      if (openingRows.length) {
        cloud.opening = { '1 Vasai': {}, '2 Virar': {} };
        openingRows.forEach(r => {
          const q = r.qty ?? r.quantity ?? 0;
          const g = r.godown || '1 Vasai';
          if (q > 0) {
            if (!cloud.opening[g]) cloud.opening[g] = {};
            cloud.opening[g][r.product_id] = q;
          }
        });
      }

      // Preserve physical/crm from local state
      const currentState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      cloud.physical = currentState.physical || { '1 Vasai': {}, '2 Virar': {} };
      cloud.crm = currentState.crm || { '1 Vasai': {}, '2 Virar': {} };

      save(cloud);
      return true;
    } catch (err) {
      console.error('Cloud load failed:', err);
      return false;
    }
  }, [save]);

  const syncToCloud = useCallback(async () => {
    try {
      const ops = [];
      if (state.products.length) ops.push(supabase.from('products').upsert(state.products.map(p => ({ id: p.id, code: p.code, category: p.category, min_stock: p.min_stock || 0, order_index: p.order_index || 0 })), { onConflict: 'id' }));
      if (state.sales.length) ops.push(supabase.from('sales').upsert(state.sales.map(s => ({ id: s.id, godown: s.godown || '1 Vasai', date: s.date, bill: s.bill || '', party: s.party || '', type: s.type || 'Normal', items: s.items, scrap_provided: s.scrapProvided || false, scrap_items: s.scrapItems || {}, remark: s.remark || '', third_party_source: s.thirdPartySource || null, third_party_entry_id: s.thirdPartyEntryId || null, serial_numbers_by_product: s.serialNumbersByProduct || {} })), { onConflict: 'id' }));
      if (state.purchases.length) ops.push(supabase.from('purchases').upsert(state.purchases.map(p => ({ id: p.id, godown: p.godown || '1 Vasai', date: p.date, bill: p.bill || '', party: p.party || '', type: p.type || 'Normal', items: p.items, remark: p.remark || '', serial_numbers_by_product: p.serialNumbersByProduct || {} })), { onConflict: 'id' }));
      if (state.dcwrOut.length) ops.push(supabase.from('dcwr_out').upsert(state.dcwrOut.map(d => ({ id: d.id, godown: d.godown || '1 Vasai', date: d.date, challan: d.challan || '', party: d.party || '', remark: d.remark || '', items: d.items })), { onConflict: 'id' }));
      if (state.dcwrIn.length) ops.push(supabase.from('dcwr_in').upsert(state.dcwrIn.map(d => ({ id: d.id, godown: d.godown || '1 Vasai', ref_out_id: d.refOutId, date: d.date, remark: d.remark || '', items: d.items })), { onConflict: 'id' }));
      if (state.parties.length) ops.push(supabase.from('parties').upsert(state.parties.map(p => ({ id: p.id, name: p.name })), { onConflict: 'id' }));

      const openingRows = [];
      Object.entries(state.opening).forEach(([godown, products]) => {
        Object.entries(products).forEach(([product_id, qty]) => openingRows.push({ godown, product_id, qty }));
      });
      if (openingRows.length) ops.push(supabase.from('opening_stock').upsert(openingRows.map(r => ({ godown: r.godown, product_id: r.product_id, quantity: r.qty }))));
      if (state.transfers.length) ops.push(supabase.from('transfers').upsert(state.transfers.map(t => ({ id: t.id, date: t.date, from_godown: t.fromGodown, to_godown: t.toGodown, ref_no: t.refNo || '', remark: t.remark || '', items: t.items })), { onConflict: 'id' }));
      if (state.adjustments.length) ops.push(supabase.from('adjustments').upsert(state.adjustments.map(a => ({ id: a.id, godown: a.godown || '1 Vasai', date: a.date, type: a.type || 'Damage', reason: a.reason || '', items: a.items })), { onConflict: 'id' }));

      // ── Proper tables (no more blobs) ──
      if (state.thirdPartyEntries.length) ops.push(supabase.from('third_party_entries').upsert(
        state.thirdPartyEntries.map(e => ({ id: e.id, godown: e.godown || 'Third Party Godown', date: e.date, bill: e.bill || '', party: e.party || '', type: e.type || 'Adjustment', status: e.status || 'pending', items: e.items || {}, consumed_items: e.consumedItems || {}, consumed_by_sales: e.consumedBySales || [], serial_numbers_by_product: e.serialNumbersByProduct || {}, remark: e.remark || '' })),
        { onConflict: 'id' }
      ));
      if (state.scrapLogs.length) ops.push(supabase.from('scrap_logs').upsert(
        state.scrapLogs.map(l => ({ id: l.id, date: l.date, godown: l.godown || '1 Vasai', product_id: l.productId || null, items: l.items || {}, qty: l.qty || 0, reason: l.reason || 'Other', recoverable: l.recoverable || false, remark: l.remark || '', status: l.status || 'pending', disposal_value: l.disposalValue || 0, source: l.source || 'manual', source_ref_id: l.sourceRefId || null })),
        { onConflict: 'id' }
      ));

      const results = await Promise.all(ops);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        console.error('Cloud sync encountered errors:', errors);
        toast.error('Sync encountered errors. Check console.');
        return false;
      }
      return true;
    } catch (err) {
      console.error('Cloud sync failed:', err);
      return false;
    }
  }, [state]);

  // ── Products ──
  const addProduct = useCallback((product) => {
    const newProduct = { id: uid(), min_stock: 0, order_index: 0, ...product };
    const newState = { ...state, products: [...state.products, newProduct] };
    save(newState);
    supabase.from('products').upsert([{ id: newProduct.id, code: newProduct.code, category: newProduct.category, min_stock: newProduct.min_stock, order_index: newProduct.order_index }]).then(({ error }) => { if (error) toast.error('Save failed: ' + error.message) });
    pushActivity('Added Product', `Created new master product: ${product.code}`);
    return newProduct;
  }, [state, save, pushActivity]);

  const removeProduct = useCallback((id) => {
    pushUndo('Remove Product');
    const newState = { ...state, products: state.products.filter(p => p.id !== id) };
    save(newState);
    supabase.from('products').delete().eq('id', id).then(({ error }) => { if (error) toast.error('Delete failed: ' + error.message) });
  }, [state, save, pushUndo]);

  const updateProduct = useCallback((id, updates) => {
    const newProducts = state.products.map(p => p.id === id ? { ...p, ...updates } : p);
    const newState = { ...state, products: newProducts };
    save(newState);
    const updatedProd = newProducts.find(p => p.id === id);
    if(updatedProd) {
      supabase.from('products').upsert([{ id: updatedProd.id, code: updatedProd.code, category: updatedProd.category, min_stock: updatedProd.min_stock, order_index: updatedProd.order_index }]).then(({ error }) => { if (error) toast.error('Update failed: ' + error.message) });
    }
  }, [state, save]);

  // ── Sales ──
  const addSale = useCallback((sale) => {
    const newSale = { id: uid(), godown: sale.godown || '1 Vasai', ...sale };
    const newState = { ...state, sales: [...state.sales, newSale] };
    save(newState);
    supabase.from('sales').upsert([{ id: newSale.id, godown: newSale.godown, date: newSale.date, bill: newSale.bill || '', party: newSale.party || '', type: newSale.type || 'Normal', items: newSale.items, scrap_provided: newSale.scrapProvided || false, scrap_items: newSale.scrapItems || {}, remark: newSale.remark || '', third_party_source: newSale.thirdPartySource || null, third_party_entry_id: newSale.thirdPartyEntryId || null, serial_numbers_by_product: newSale.serialNumbersByProduct || {} }]).then(({ error }) => { if (error) toast.error('Save failed: ' + error.message) });
    pushActivity('Registered Sale', `Sale Bill [${sale.bill || 'N/A'}] registered at ${newSale.godown} for ${sale.party || 'Customer'}`, { module: 'sales', ref_id: newSale.id, ref_bill: newSale.bill, party: newSale.party, godown: newSale.godown });
    return newSale;
  }, [state, save, pushActivity]);

  const removeSale = useCallback((id) => {
    pushUndo('Remove Sale');
    const target = state.sales.find(s => s.id === id);
    const releasedThirdParty = state.thirdPartyEntries.map((entry) => {
      const consumedBySales = (entry.consumedBySales || []).filter((c) => c.saleId !== id);
      const consumedItems = {};
      consumedBySales.forEach((c) => {
        Object.entries(c.items || {}).forEach(([pid, qty]) => {
          consumedItems[pid] = (consumedItems[pid] || 0) + (qty || 0);
        });
      });
      const entryItemKeys = Object.keys(entry.items || {});
      const isFullyConsumed = entryItemKeys.length > 0 && entryItemKeys.every((pid) => (consumedItems[pid] || 0) >= (entry.items[pid] || 0));
      return {
        ...entry,
        consumedBySales,
        consumedItems,
        status: isFullyConsumed ? 'closed' : 'pending',
      };
    });
    const newState = { ...state, sales: state.sales.filter(s => s.id !== id), thirdPartyEntries: releasedThirdParty };
    save(newState);
    supabase.from('sales').delete().eq('id', id).then(({ error }) => { if (error) toast.error('Delete failed: ' + error.message) });
    // Update only affected third-party entries directly in their proper table
    const changedTp = releasedThirdParty.filter(e => {
      const orig = state.thirdPartyEntries.find(o => o.id === e.id);
      return orig && (orig.status !== e.status || JSON.stringify(orig.consumedItems) !== JSON.stringify(e.consumedItems));
    });
    if (changedTp.length) {
      supabase.from('third_party_entries').upsert(changedTp.map(e => ({ id: e.id, godown: e.godown || 'Third Party Godown', date: e.date, bill: e.bill || '', party: e.party || '', type: e.type || 'Adjustment', status: e.status || 'pending', items: e.items || {}, consumed_items: e.consumedItems || {}, consumed_by_sales: e.consumedBySales || [], serial_numbers_by_product: e.serialNumbersByProduct || {}, remark: e.remark || '' })), { onConflict: 'id' }).then(({ error }) => { if (error) toast.error('Third Party release sync failed: ' + error.message); });
    }
    if (target) pushActivity('Deleted Sale', `Bill [${target.bill || 'N/A'}] from ${target.party || 'Unknown'} was completely removed`, { module: 'sales', ref_id: target.id, ref_bill: target.bill, party: target.party, godown: target.godown });
  }, [state, save, pushUndo, pushActivity]);

  const updateSale = useCallback((id, updates) => {
    const newSales = state.sales.map((s) => (s.id === id ? { ...s, ...updates } : s));
    const newState = { ...state, sales: newSales };
    save(newState);
    const updated = newSales.find((s) => s.id === id);
    if (updated) {
      supabase.from('sales').upsert([{
        id: updated.id, godown: updated.godown || '1 Vasai', date: updated.date,
        bill: updated.bill || '', party: updated.party || '', type: updated.type || 'Normal',
        items: updated.items, scrap_provided: updated.scrapProvided || false,
        scrap_items: updated.scrapItems || {}, remark: updated.remark || '',
        third_party_source: updated.thirdPartySource || null,
        third_party_entry_id: updated.thirdPartyEntryId || null,
        serial_numbers_by_product: updated.serialNumbersByProduct || {},
      }]).then(({ error }) => { if (error) toast.error('Update failed: ' + error.message); });
      pushActivity('Edited Sale', `Sale Bill [${updated.bill || 'N/A'}] for ${updated.party || 'Unknown'} was modified`, { module: 'sales', ref_id: updated.id, ref_bill: updated.bill, party: updated.party, godown: updated.godown });
    }
  }, [state, save, pushActivity]);

  // ── Purchases ──
  const addPurchase = useCallback((purchase) => {
    const newPurchase = { id: uid(), godown: purchase.godown || '1 Vasai', ...purchase };
    const newState = { ...state, purchases: [...state.purchases, newPurchase] };
    save(newState);
    supabase.from('purchases').upsert([{ id: newPurchase.id, godown: newPurchase.godown, date: newPurchase.date, bill: newPurchase.bill || '', party: newPurchase.party || '', type: newPurchase.type || 'Normal', items: newPurchase.items, remark: newPurchase.remark || '', serial_numbers_by_product: newPurchase.serialNumbersByProduct || {} }]).then(({ error }) => { if (error) toast.error('Save failed: ' + error.message) });
    pushActivity('Registered Purchase', `Purchase Bill [${purchase.bill || 'N/A'}] recorded at ${newPurchase.godown} from ${purchase.party || 'Unknown'}`, { module: 'purchases', ref_id: newPurchase.id, ref_bill: newPurchase.bill, party: newPurchase.party, godown: newPurchase.godown });
    return newPurchase;
  }, [state, save, pushActivity]);

  const removePurchase = useCallback((id) => {
    pushUndo('Remove Purchase');
    const target = state.purchases.find(p => p.id === id);
    const newState = { ...state, purchases: state.purchases.filter(p => p.id !== id) };
    save(newState);
    supabase.from('purchases').delete().eq('id', id).then(({ error }) => { if (error) toast.error('Delete failed: ' + error.message) });
    if (target) pushActivity('Deleted Purchase', `Purchase Bill [${target.bill || 'N/A'}] from ${target.party || 'Unknown'} was completely removed`);
  }, [state, save, pushUndo, pushActivity]);

  const updatePurchase = useCallback((id, updates) => {
    const newPurchases = state.purchases.map((p) => (p.id === id ? { ...p, ...updates } : p));
    const newState = { ...state, purchases: newPurchases };
    save(newState);
    const updated = newPurchases.find((p) => p.id === id);
    if (updated) {
      supabase.from('purchases').upsert([{
        id: updated.id,
        godown: updated.godown || '1 Vasai',
        date: updated.date,
        bill: updated.bill || '',
        party: updated.party || '',
        type: updated.type || 'Normal',
        items: updated.items,
        remark: updated.remark || '',
        serial_numbers_by_product: updated.serialNumbersByProduct || {},
      }]).then(({ error }) => { if (error) toast.error('Update failed: ' + error.message); });
    }
  }, [state, save]);

  // ── DCWR ──
  const addDcwrOut = useCallback((entry) => {
    const newEntry = { id: uid(), godown: entry.godown || '1 Vasai', ...entry };
    const newState = { ...state, dcwrOut: [...state.dcwrOut, newEntry] };
    save(newState);
    supabase.from('dcwr_out').upsert([{ id: newEntry.id, godown: newEntry.godown, date: newEntry.date, challan: newEntry.challan || '', party: newEntry.party || '', remark: newEntry.remark || '', items: newEntry.items }]).then(({ error }) => { if (error) toast.error('Save failed: ' + error.message) });
    pushActivity('Generated DCWR Out', `Challan [${entry.challan || 'N/A'}] generated at ${newEntry.godown} for ${entry.party || 'Unknown'}`);
    return newEntry;
  }, [state, save, pushActivity]);

  const removeDcwrOut = useCallback((id) => {
    pushUndo('Remove DCWR OUT');
    const target = state.dcwrOut.find(d => d.id === id);
    // Also remove associated dcwrIn entries
    const newState = {
      ...state,
      dcwrOut: state.dcwrOut.filter(d => d.id !== id),
      dcwrIn: state.dcwrIn.filter(d => d.refOutId !== id),
    };
    save(newState);
    supabase.from('dcwr_out').delete().eq('id', id).then(({ error }) => { if (error) toast.error('Delete failed: ' + error.message) });
    if (target) pushActivity('Deleted DCWR Out', `Challan [${target.challan || 'N/A'}] for ${target.party || 'Unknown'} was completely removed`);
  }, [state, save, pushUndo, pushActivity]);

  const updateDcwrOut = useCallback((id, updates) => {
    const newOuts = state.dcwrOut.map((d) => (d.id === id ? { ...d, ...updates } : d));
    const newState = { ...state, dcwrOut: newOuts };
    save(newState);
    const updated = newOuts.find((d) => d.id === id);
    if (updated) {
      supabase.from('dcwr_out').upsert([{ id: updated.id, godown: updated.godown || '1 Vasai', date: updated.date, challan: updated.challan || '', party: updated.party || '', remark: updated.remark || '', items: updated.items }]).then(({ error }) => { if (error) toast.error('Update failed: ' + error.message); });
      pushActivity('Edited DCWR Out', `Challan [${updated.challan || 'N/A'}] was modified`);
    }
  }, [state, save, pushActivity]);

  const addDcwrIn = useCallback((entry) => {
    const newEntry = { id: uid(), godown: entry.godown || '1 Vasai', ...entry };
    const newState = { ...state, dcwrIn: [...state.dcwrIn, newEntry] };
    save(newState);
    supabase.from('dcwr_in').upsert([{ id: newEntry.id, godown: newEntry.godown, ref_out_id: newEntry.refOutId, date: newEntry.date, remark: newEntry.remark || '', items: newEntry.items }]).then(({ error }) => { if (error) toast.error('Save failed: ' + error.message) });
    pushActivity('Logged DCWR In', `Return recorded at ${newEntry.godown} against Outward reference [${entry.refOutId || 'None'}]`);
    return newEntry;
  }, [state, save, pushActivity]);

  const removeDcwrIn = useCallback((id) => {
    pushUndo('Remove DCWR IN');
    const newState = { ...state, dcwrIn: state.dcwrIn.filter(d => d.id !== id) };
    save(newState);
    supabase.from('dcwr_in').delete().eq('id', id).then(({ error }) => { if (error) toast.error('Delete failed: ' + error.message) });
    pushActivity('Deleted DCWR In', `A return mapping entry against an outward Challan was completely removed`);
  }, [state, save, pushUndo, pushActivity]);

  const updateDcwrIn = useCallback((id, updates) => {
    const newIns = state.dcwrIn.map((d) => (d.id === id ? { ...d, ...updates } : d));
    const newState = { ...state, dcwrIn: newIns };
    save(newState);
    const updated = newIns.find((d) => d.id === id);
    if (updated) {
      supabase.from('dcwr_in').upsert([{ id: updated.id, godown: updated.godown || '1 Vasai', ref_out_id: updated.refOutId, date: updated.date, remark: updated.remark || '', items: updated.items }]).then(({ error }) => { if (error) toast.error('Update failed: ' + error.message); });
      pushActivity('Edited DCWR In', `A DCWR IN receipt was modified`);
    }
  }, [state, save, pushActivity]);

  const dcwrOutstanding = useCallback((outId) => {
    const out = state.dcwrOut.find(d => d.id === outId);
    if (!out) return {};
    const received = {};
    state.dcwrIn.filter(r => r.refOutId === outId).forEach(r => {
      Object.entries(r.items).forEach(([id, qty]) => { received[id] = (received[id] || 0) + qty; });
    });
    const outstanding = {};
    Object.entries(out.items).forEach(([id, qty]) => {
      const rem = qty - (received[id] || 0);
      if (rem > 0) outstanding[id] = rem;
    });
    return outstanding;
  }, [state.dcwrOut, state.dcwrIn]);

  // ── Transfers ──
  const addTransfer = useCallback((transfer) => {
    const newEntry = { id: uid(), ...transfer };
    const newState = { ...state, transfers: [...state.transfers, newEntry] };
    save(newState);
    supabase.from('transfers').upsert([{ id: newEntry.id, date: newEntry.date, from_godown: newEntry.fromGodown, to_godown: newEntry.toGodown, ref_no: newEntry.refNo || '', remark: newEntry.remark || '', items: newEntry.items }]).then(({ error }) => { if (error) toast.error('Save failed: ' + error.message) });
    pushActivity('Transferred Stock', `Transferred items from ${newEntry.fromGodown} to ${newEntry.toGodown} (Ref: ${newEntry.refNo || 'None'})`);
    return newEntry;
  }, [state, save, pushActivity]);

  const removeTransfer = useCallback((id) => {
    pushUndo('Remove Transfer');
    const newState = { ...state, transfers: state.transfers.filter(t => t.id !== id) };
    save(newState);
    supabase.from('transfers').delete().eq('id', id).then(({ error }) => { if (error) toast.error('Delete failed: ' + error.message) });
    pushActivity('Deleted Transfer', `A transfer entry was completely removed`);
  }, [state, save, pushUndo, pushActivity]);

  const updateTransfer = useCallback((id, updates) => {
    const newTransfers = state.transfers.map((t) => (t.id === id ? { ...t, ...updates } : t));
    const newState = { ...state, transfers: newTransfers };
    save(newState);
    const updated = newTransfers.find((t) => t.id === id);
    if (updated) {
      supabase.from('transfers').upsert([{ id: updated.id, date: updated.date, from_godown: updated.fromGodown, to_godown: updated.toGodown, ref_no: updated.refNo || '', remark: updated.remark || '', items: updated.items }]).then(({ error }) => { if (error) toast.error('Update failed: ' + error.message); });
      pushActivity('Edited Transfer', `A transfer entry was modified`);
    }
  }, [state, save, pushActivity]);

  // ── Adjustments ──
  const addAdjustment = useCallback((adjustment) => {
    const newEntry = { id: uid(), godown: adjustment.godown || '1 Vasai', ...adjustment };
    const isPositive = (newEntry.type || '').startsWith('ADD:');
    const scrapTagged = /scrap/i.test(newEntry.type || '') || /scrap/i.test(newEntry.reason || '');
    let nextScrapLogs = state.scrapLogs;
    if (!isPositive && scrapTagged) {
      const totalQty = Object.values(newEntry.items || {}).reduce((sum, q) => sum + (q || 0), 0);
      const autoLog = {
        id: uid(),
        date: newEntry.date,
        godown: newEntry.godown || '1 Vasai',
        productId: null,
        items: newEntry.items || {},
        qty: totalQty,
        reason: 'Scrap',
        recoverable: false,
        remark: newEntry.reason || '',
        status: 'pending',
        source: 'adjustment',
        sourceRefId: newEntry.id,
        disposalValue: 0,
      };
      nextScrapLogs = [...state.scrapLogs, autoLog];
    }
    const newState = { ...state, adjustments: [...state.adjustments, newEntry], scrapLogs: nextScrapLogs };
    save(newState);
    supabase.from('adjustments').upsert([{ id: newEntry.id, godown: newEntry.godown, date: newEntry.date, type: newEntry.type || 'Damage', reason: newEntry.reason || '', items: newEntry.items }]).then(({ error }) => { if (error) toast.error('Save failed: ' + error.message) });
    if (!isPositive && scrapTagged) {
      supabase.from('scrap_logs').upsert([{ id: autoLog.id, date: autoLog.date, godown: autoLog.godown || '1 Vasai', product_id: autoLog.productId || null, items: autoLog.items || {}, qty: autoLog.qty || 0, reason: autoLog.reason || 'Other', recoverable: false, remark: autoLog.remark || '', status: autoLog.status || 'pending', disposal_value: 0, source: 'adjustment', source_ref_id: newEntry.id }], { onConflict: 'id' }).then(({ error }) => { if (error) toast.error('Scrap save failed: ' + error.message); });
    }
    pushActivity('Stock Adjusted', `Negative adjustment [${newEntry.type}] at ${newEntry.godown}. Reason: ${newEntry.reason || 'None'}`);
    return newEntry;
  }, [state, save, pushActivity]);

  const removeAdjustment = useCallback((id) => {
    pushUndo('Remove Adjustment');
    const newState = { ...state, adjustments: state.adjustments.filter(a => a.id !== id) };
    save(newState);
    supabase.from('adjustments').delete().eq('id', id).then(({ error }) => { if (error) toast.error('Delete failed: ' + error.message) });
    pushActivity('Deleted Adjustment', `An adjustment entry was completely removed`);
  }, [state, save, pushUndo, pushActivity]);

  const updateAdjustment = useCallback((id, updates) => {
    const newAdj = state.adjustments.map((a) => (a.id === id ? { ...a, ...updates } : a));
    const newState = { ...state, adjustments: newAdj };
    save(newState);
    const updated = newAdj.find((a) => a.id === id);
    if (updated) {
      supabase.from('adjustments').upsert([{ id: updated.id, godown: updated.godown || '1 Vasai', date: updated.date, type: updated.type || 'Damage', reason: updated.reason || '', items: updated.items }]).then(({ error }) => { if (error) toast.error('Update failed: ' + error.message); });
      pushActivity('Edited Adjustment', `An adjustment entry was modified`);
    }
  }, [state, save, pushActivity]);

  // ── Scrap Tracker ──
  const addScrapLog = useCallback((log) => {
    const newLog = {
      id: uid(),
      date: log.date,
      godown: log.godown || '1 Vasai',
      productId: log.productId || null,
      items: log.items || {},
      qty: log.qty || 0,
      reason: log.reason || 'Other',
      recoverable: !!log.recoverable,
      remark: log.remark || '',
      status: log.status || 'pending',
      disposalValue: Number(log.disposalValue || 0),
      source: log.source || 'manual',
      sourceRefId: log.sourceRefId || null,
    };
    const nextLogs = [...state.scrapLogs, newLog];
    const newState = { ...state, scrapLogs: nextLogs };
    save(newState);
    supabase.from('scrap_logs').upsert([{ id: newLog.id, date: newLog.date, godown: newLog.godown || '1 Vasai', product_id: newLog.productId || null, items: newLog.items || {}, qty: newLog.qty || 0, reason: newLog.reason || 'Other', recoverable: newLog.recoverable || false, remark: newLog.remark || '', status: newLog.status || 'pending', disposal_value: newLog.disposalValue || 0, source: newLog.source || 'manual', source_ref_id: newLog.sourceRefId || null }], { onConflict: 'id' }).then(({ error }) => { if (error) toast.error('Save failed: ' + error.message); });
    pushActivity('Scrap Logged', `Scrap entry recorded at ${newLog.godown} (${newLog.reason}, qty ${newLog.qty})`);
    return newLog;
  }, [state, save, pushActivity]);

  const updateScrapLog = useCallback((id, updates) => {
    const nextLogs = state.scrapLogs.map((l) => (l.id === id ? { ...l, ...updates } : l));
    const newState = { ...state, scrapLogs: nextLogs };
    save(newState);
    const updated = nextLogs.find(l => l.id === id);
    if (updated) {
      supabase.from('scrap_logs').upsert([{ id: updated.id, date: updated.date, godown: updated.godown || '1 Vasai', product_id: updated.productId || null, items: updated.items || {}, qty: updated.qty || 0, reason: updated.reason || 'Other', recoverable: updated.recoverable || false, remark: updated.remark || '', status: updated.status || 'pending', disposal_value: updated.disposalValue || 0, source: updated.source || 'manual', source_ref_id: updated.sourceRefId || null }], { onConflict: 'id' }).then(({ error }) => { if (error) toast.error('Update failed: ' + error.message); });
    }
  }, [state, save]);

  const removeScrapLog = useCallback((id) => {
    pushUndo('Remove Scrap Log');
    const nextLogs = state.scrapLogs.filter((l) => l.id !== id);
    const newState = { ...state, scrapLogs: nextLogs };
    save(newState);
    supabase.from('scrap_logs').delete().eq('id', id).then(({ error }) => { if (error) toast.error('Delete failed: ' + error.message); });
    pushActivity('Deleted Scrap Log', 'A scrap tracker entry was deleted');
  }, [state, save, pushUndo, pushActivity]);

  // ── Third Party Stock ──
  const addThirdPartyEntry = useCallback((entry) => {
    const newEntry = {
      id: uid(),
      godown: 'Third Party Godown',
      date: entry.date,
      bill: entry.bill || '',
      party: entry.party || '',
      type: 'Adjustment',
      serialNumbersByProduct: entry.serialNumbersByProduct || {},
      remark: entry.remark || '',
      items: entry.items || {},
      status: entry.status || 'pending',
      consumedItems: entry.consumedItems || {},
      consumedBySales: entry.consumedBySales || [],
    };
    const nextEntries = [...state.thirdPartyEntries, newEntry];
    const newState = { ...state, thirdPartyEntries: nextEntries };
    save(newState);
    supabase.from('third_party_entries').upsert([{ id: newEntry.id, godown: newEntry.godown, date: newEntry.date, bill: newEntry.bill || '', party: newEntry.party || '', type: newEntry.type || 'Adjustment', status: newEntry.status || 'pending', items: newEntry.items || {}, consumed_items: newEntry.consumedItems || {}, consumed_by_sales: newEntry.consumedBySales || [], serial_numbers_by_product: newEntry.serialNumbersByProduct || {}, remark: newEntry.remark || '' }], { onConflict: 'id' }).then(({ error }) => { if (error) toast.error('Third Party save failed: ' + error.message); });
    pushActivity('Third Party Entry Added', `Third-party stock logged for ${newEntry.party} (Bill: ${newEntry.bill || 'N/A'})`, { module: 'third_party', ref_id: newEntry.id, ref_bill: newEntry.bill, party: newEntry.party });
    return newEntry;
  }, [state, save, pushActivity]);

  const updateThirdPartyEntry = useCallback((id, updates) => {
    const nextEntries = state.thirdPartyEntries.map((e) => (e.id === id ? { ...e, ...updates } : e));
    const newState = { ...state, thirdPartyEntries: nextEntries };
    save(newState);
    const updated = nextEntries.find(e => e.id === id);
    if (updated) {
      supabase.from('third_party_entries').upsert([{ id: updated.id, godown: updated.godown || 'Third Party Godown', date: updated.date, bill: updated.bill || '', party: updated.party || '', type: updated.type || 'Adjustment', status: updated.status || 'pending', items: updated.items || {}, consumed_items: updated.consumedItems || {}, consumed_by_sales: updated.consumedBySales || [], serial_numbers_by_product: updated.serialNumbersByProduct || {}, remark: updated.remark || '' }], { onConflict: 'id' }).then(({ error }) => { if (error) toast.error('Third Party update failed: ' + error.message); });
    }
  }, [state, save]);

  const removeThirdPartyEntry = useCallback((id) => {
    pushUndo('Remove Third Party Entry');
    const nextEntries = state.thirdPartyEntries.filter((e) => e.id !== id);
    const newState = { ...state, thirdPartyEntries: nextEntries };
    save(newState);
    supabase.from('third_party_entries').delete().eq('id', id).then(({ error }) => { if (error) toast.error('Third Party delete failed: ' + error.message); });
    pushActivity('Third Party Entry Deleted', 'A third-party stock entry was deleted', { module: 'third_party', ref_id: id });
  }, [state, save, pushUndo, pushActivity]);

  const consumeThirdPartyStock = useCallback(({ party, items, saleId }) => {
    const needs = { ...(items || {}) };
    const entries = state.thirdPartyEntries
      .filter((e) => e.party === party && (e.status || 'pending') === 'pending')
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const planned = [];
    Object.entries(needs).forEach(([pid, qty]) => {
      let remainingNeed = qty || 0;
      if (remainingNeed <= 0) return;
      for (const entry of entries) {
        const total = entry.items?.[pid] || 0;
        const consumed = entry.consumedItems?.[pid] || 0;
        const remaining = Math.max(0, total - consumed);
        if (remaining <= 0) continue;
        const take = Math.min(remainingNeed, remaining);
        if (take > 0) {
          planned.push({ entryId: entry.id, productId: pid, qty: take });
          remainingNeed -= take;
        }
        if (remainingNeed === 0) break;
      }
      if (remainingNeed > 0) {
        throw new Error(`Insufficient third-party stock for ${(state.products.find((p) => p.id === pid)?.code) || pid}`);
      }
    });

    const nextEntries = state.thirdPartyEntries.map((entry) => {
      const forEntry = planned.filter((p) => p.entryId === entry.id);
      if (!forEntry.length) return entry;

      const mergedItems = {};
      forEntry.forEach((a) => { mergedItems[a.productId] = (mergedItems[a.productId] || 0) + a.qty; });

      const consumedBySales = [...(entry.consumedBySales || []), { saleId, items: mergedItems }];
      const consumedItems = {};
      consumedBySales.forEach((c) => {
        Object.entries(c.items || {}).forEach(([pid, qty]) => {
          consumedItems[pid] = (consumedItems[pid] || 0) + (qty || 0);
        });
      });
      const keys = Object.keys(entry.items || {});
      const isFullyConsumed = keys.length > 0 && keys.every((pid) => (consumedItems[pid] || 0) >= (entry.items[pid] || 0));
      return {
        ...entry,
        consumedBySales,
        consumedItems,
        status: isFullyConsumed ? 'closed' : 'pending',
      };
    });

    const newState = { ...state, thirdPartyEntries: nextEntries };
    save(newState);
    // Update only the affected rows directly in the proper table
    const affectedIds = new Set(planned.map(p => p.entryId));
    const affectedEntries = nextEntries.filter(e => affectedIds.has(e.id));
    if (affectedEntries.length) {
      supabase.from('third_party_entries').upsert(
        affectedEntries.map(e => ({ id: e.id, godown: e.godown || 'Third Party Godown', date: e.date, bill: e.bill || '', party: e.party || '', type: e.type || 'Adjustment', status: e.status || 'pending', items: e.items || {}, consumed_items: e.consumedItems || {}, consumed_by_sales: e.consumedBySales || [], serial_numbers_by_product: e.serialNumbersByProduct || {}, remark: e.remark || '' })),
        { onConflict: 'id' }
      ).then(({ error }) => { if (error) toast.error('Third Party consume sync failed: ' + error.message); });
    }
    return { ok: true, allocations: planned };
  }, [state, save]);

  // ── Opening / Physical / CRM ──
  const setOpening = useCallback((godown, productId, qty) => {
    const newOpening = { ...state.opening, [godown]: { ...(state.opening[godown] || {}), [productId]: qty } };
    const newState = { ...state, opening: newOpening };
    save(newState);
    supabase.from('opening_stock').upsert([{ godown, product_id: productId, quantity: qty }]).then(({ error }) => { if (error) toast.error('Save failed: ' + error.message) });
  }, [state, save]);

  const setPhysical = useCallback((godown, productId, qty) => {
    const newPhysical = { ...state.physical, [godown]: { ...(state.physical[godown] || {}), [productId]: qty } };
    const newState = { ...state, physical: newPhysical };
    save(newState);
    // Not tracked in Supabase currently per user logic, but if they add it, they know
  }, [state, save]);

  const setCrm = useCallback((godown, productId, qty) => {
    const newCrm = { ...state.crm, [godown]: { ...(state.crm[godown] || {}), [productId]: qty } };
    const newState = { ...state, crm: newCrm };
    save(newState);
  }, [state, save]);

  // ── Parties ──
  const addParty = useCallback((party) => {
    const newParty = { id: uid(), ...party };
    const newState = { ...state, parties: [...state.parties, newParty] };
    save(newState);
    supabase.from('parties').upsert([newParty]).then(({ error }) => { if (error) toast.error('Save failed: ' + error.message) });
    return newParty;
  }, [state, save]);

  const removeParty = useCallback((id) => {
    pushUndo('Remove Party');
    const newState = { ...state, parties: state.parties.filter(p => p.id !== id) };
    save(newState);
    supabase.from('parties').delete().eq('id', id).then(({ error }) => { if (error) toast.error('Delete failed: ' + error.message) });
  }, [state, save, pushUndo]);

  const updateParty = useCallback((id, updates) => {
    const newState = { ...state, parties: state.parties.map(p => p.id === id ? { ...p, ...updates } : p) };
    save(newState);
    const updated = newState.parties.find(p => p.id === id);
    if (updated) supabase.from('parties').upsert([updated]).then(({ error }) => { if (error) toast.error('Save failed: ' + error.message) });
  }, [state, save]);

  // ── Utility ──
  const groupByCategory = useCallback(() => {
    const groups = {};
    // Products inside each category sorted A-Z by code
    [...state.products].sort((a, b) => a.code.localeCompare(b.code)).forEach(p => {
      const cat = p.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });

    // Build category list: first from saved order, then any new ones alphabetically
    const allCats = Object.keys(groups);
    const orderedCats = [
      ...categoryOrder.filter(c => allCats.includes(c)),   // saved order (only existing cats)
      ...allCats.filter(c => !categoryOrder.includes(c)).sort(), // new cats alphabetically
    ];

    // Ensure categoryOrder is up to date (add new cats that appeared)
    if (orderedCats.some(c => !categoryOrder.includes(c))) {
      setCategoryOrder(orderedCats);
    }

    const sortedGroups = {};
    orderedCats.forEach(cat => { sortedGroups[cat] = groups[cat]; });
    return sortedGroups;
  }, [state.products, categoryOrder, setCategoryOrder]);

  const allPartyNames = useCallback(() => {
    const names = new Set();
    state.parties.forEach(p => names.add(p.name));
    state.sales.forEach(s => { if (s.party) names.add(s.party); });
    state.purchases.forEach(p => { if (p.party || p.supplier) names.add(p.party || p.supplier); });
    state.thirdPartyEntries.forEach((e) => { if (e.party) names.add(e.party); });
    return [...names].filter(Boolean).sort();
  }, [state.parties, state.sales, state.purchases, state.thirdPartyEntries]);

  return (
    <InventoryContext.Provider value={{
      state, save, undo, pushUndo,
      loadFromCloud, syncToCloud,
      addProduct, removeProduct, updateProduct,
      addSale, removeSale, updateSale,
      addPurchase, removePurchase, updatePurchase,
      addDcwrOut, removeDcwrOut, updateDcwrOut, addDcwrIn, removeDcwrIn, updateDcwrIn, dcwrOutstanding,
      addTransfer, removeTransfer, updateTransfer, addAdjustment, removeAdjustment, updateAdjustment,
      addScrapLog, updateScrapLog, removeScrapLog,
      addThirdPartyEntry, updateThirdPartyEntry, removeThirdPartyEntry, consumeThirdPartyStock,
      setOpening, setPhysical, setCrm,
      addParty, removeParty, updateParty,
      groupByCategory, allPartyNames, pushActivity,
      categoryOrder, setCategoryOrder, moveCategoryUp, moveCategoryDown
    }}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
}
