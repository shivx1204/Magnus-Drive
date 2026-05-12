import { useMemo, useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../lib/dateUtils';
import toast from 'react-hot-toast';

export default function ScrapTracker() {
  const { state, addScrapLog, updateScrapLog, removeScrapLog } = useInventory();
  const { activeGodown, isAdmin } = useAuth();

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [godown, setGodown] = useState(activeGodown || '1 Vasai');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('Scrap');
  const [recoverable, setRecoverable] = useState(false);
  const [remark, setRemark] = useState('');

  const [fGodown, setFGodown] = useState('all');
  const [fReason, setFReason] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [smart, setSmart] = useState('');

  const pmap = useMemo(() => {
    const m = {};
    state.products.forEach(p => m[p.id] = p);
    return m;
  }, [state.products]);

  const summary = useMemo(() => {
    const logs = state.scrapLogs || [];
    let pendingQty = 0;
    let closedQty = 0;
    let recoveredValue = 0;
    logs.forEach((l) => {
      const q = Number(l.qty || 0);
      const status = l.status || 'pending';
      if (status === 'pending') pendingQty += q;
      else closedQty += q;
      recoveredValue += Number(l.disposalValue || 0);
    });
    return {
      totalLogs: logs.length,
      pendingQty,
      closedQty,
      recoveredValue,
    };
  }, [state.scrapLogs]);

  const filteredLogs = useMemo(() => {
    const q = smart.toLowerCase();
    return (state.scrapLogs || [])
      .filter((l) => {
        if (fGodown !== 'all' && l.godown !== fGodown) return false;
        if (fReason !== 'all' && l.reason !== fReason) return false;
        if (fStatus !== 'all' && (l.status || 'pending') !== fStatus) return false;
        if (fFrom && l.date < fFrom) return false;
        if (fTo && l.date > fTo) return false;
        if (!q) return true;
        const productLabel = l.productId ? (pmap[l.productId]?.code || '') : '';
        return (
          l.date?.includes(q) ||
          l.godown?.toLowerCase().includes(q) ||
          l.reason?.toLowerCase().includes(q) ||
          l.remark?.toLowerCase().includes(q) ||
          productLabel.toLowerCase().includes(q) ||
          (l.status || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [state.scrapLogs, fGodown, fReason, fStatus, fFrom, fTo, smart, pmap]);

  const reasonOptions = ['Scrap', 'Damage', 'Expired', 'Transit Loss', 'Return', 'Other'];
  const statusOptions = ['pending', 'disposed', 'sold', 'recycled'];

  const submit = (e) => {
    e.preventDefault();
    if (!productId) {
      toast.error('Select a product');
      return;
    }
    if (!qty || qty <= 0) {
      toast.error('Enter valid quantity');
      return;
    }
    addScrapLog({
      date,
      godown,
      productId,
      qty: Number(qty),
      reason,
      recoverable,
      remark,
      status: 'pending',
      source: 'manual',
    });
    toast.success('Scrap entry added');
    setProductId('');
    setQty(1);
    setRemark('');
    setRecoverable(false);
  };

  const renderProductText = (log) => {
    if (log.productId) return `${pmap[log.productId]?.code || 'Unknown'} (${log.qty || 0})`;
    const entries = Object.entries(log.items || {});
    if (!entries.length) return '—';
    return entries.map(([id, q]) => `${pmap[id]?.code || id} (${q})`).join(', ');
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
        <div className="px-4 py-3 font-semibold text-sm flex justify-between items-center" style={{ background: 'var(--teal)', color: '#f2ebd9' }}>
          <span>♻️ Scrap Material Tracker</span>
          <span className="text-[10px] bg-black/10 px-2 py-0.5 rounded shadow-sm">{summary.totalLogs} Total Logs</span>
        </div>
        
        <div className="p-4 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--soft)', border: '1px solid var(--line)' }}>
              <div className="text-xs font-bold" style={{ color: 'var(--muted)' }}>Pending Qty</div>
              <div className="text-lg font-black" style={{ color: '#d32f2f' }}>{summary.pendingQty}</div>
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--soft)', border: '1px solid var(--line)' }}>
              <div className="text-xs font-bold" style={{ color: 'var(--muted)' }}>Closed Qty</div>
              <div className="text-lg font-black" style={{ color: '#2e7d32' }}>{summary.closedQty}</div>
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--soft)', border: '1px solid var(--line)' }}>
              <div className="text-xs font-bold" style={{ color: 'var(--muted)' }}>Recovered Value</div>
              <div className="text-lg font-black" style={{ color: 'var(--ink)' }}>₹{summary.recoveredValue}</div>
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--soft)', border: '1px solid var(--line)' }}>
              <div className="text-xs font-bold" style={{ color: 'var(--muted)' }}>Total Logs</div>
              <div className="text-lg font-black" style={{ color: 'var(--ink)' }}>{summary.totalLogs}</div>
            </div>
          </div>

          <form onSubmit={submit} className="rounded-lg p-3 space-y-3" style={{ background: 'var(--soft)', border: '1px solid var(--line)' }}>
            <div className="text-xs font-bold" style={{ color: 'var(--ink)' }}>Add Scrap Entry</div>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-2 py-2 rounded text-xs outline-none" style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }} />
              <select value={godown} onChange={(e) => setGodown(e.target.value)} className="px-2 py-2 rounded text-xs outline-none" style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                <option value="1 Vasai">1 Vasai</option>
                <option value="2 Virar">2 Virar</option>
              </select>
              <select value={productId} onChange={(e) => setProductId(e.target.value)} className="px-2 py-2 rounded text-xs outline-none lg:col-span-2" style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                <option value="">Select Product</option>
                {state.products.map((p) => <option key={p.id} value={p.id}>{p.code} ({p.category || 'Uncategorized'})</option>)}
              </select>
              <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" className="px-2 py-2 rounded text-xs outline-none" style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }} />
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="px-2 py-2 rounded text-xs outline-none" style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                {reasonOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Remark / Reference..." className="flex-1 min-w-[220px] px-2 py-2 rounded text-xs outline-none" style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }} />
              <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                <input type="checkbox" checked={recoverable} onChange={(e) => setRecoverable(e.target.checked)} />
                Recoverable
              </label>
              <button type="submit" className="px-3 py-2 rounded text-xs font-bold text-white" style={{ background: '#2e7d32' }}>+ Add Scrap</button>
            </div>
          </form>

          <div>
            <div className="rounded-lg p-3 mb-3 flex flex-wrap gap-2 items-center" style={{ background: 'var(--soft)', border: '1px solid var(--line)' }}>
              <input value={smart} onChange={(e) => setSmart(e.target.value)} placeholder="Smart search..." className="flex-1 min-w-[180px] px-2 py-2 rounded text-xs outline-none" style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }} />
              <select value={fGodown} onChange={(e) => setFGodown(e.target.value)} className="px-2 py-2 rounded text-xs outline-none" style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                <option value="all">All Godowns</option>
                <option value="1 Vasai">1 Vasai</option>
                <option value="2 Virar">2 Virar</option>
              </select>
              <select value={fReason} onChange={(e) => setFReason(e.target.value)} className="px-2 py-2 rounded text-xs outline-none" style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                <option value="all">All Reasons</option>
                {reasonOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="px-2 py-2 rounded text-xs outline-none" style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                <option value="all">All Status</option>
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="px-2 py-2 rounded text-xs outline-none" style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }} />
              <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="px-2 py-2 rounded text-xs outline-none" style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }} />
            </div>
            <div className="table-responsive rounded-lg border" style={{ borderColor: 'var(--line)' }}>
            <table className="w-full text-xs" style={{ minWidth: '700px' }}>
              <thead>
                <tr style={{ background: 'var(--soft)' }}>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--ink)' }}>Date</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--ink)' }}>Godown</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--ink)' }}>Product(s)</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--ink)' }}>Reason</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--ink)' }}>Recoverable</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--ink)' }}>Status</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--ink)' }}>Value</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--ink)' }}>Remark</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--ink)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center py-8" style={{ color: 'var(--muted)' }}>No scrap records found.</td>
                  </tr>
                ) : (
                  filteredLogs.map((s) => (
                    <tr key={s.id} className="border-b transition-colors hover:bg-black/5" style={{ borderColor: 'var(--line)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{formatDate(s.date)}</td>
                      <td className="px-3 py-2 font-bold" style={{ color: 'var(--ink)' }}>{s.godown}</td>
                      <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--ink)' }}>{renderProductText(s)}</td>
                      <td className="px-3 py-2 font-bold" style={{ color: 'var(--teal3)' }}>{s.reason || 'Other'}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: s.recoverable ? '#e8f5e9' : '#ffebee', color: s.recoverable ? '#1b5e20' : '#c62828' }}>
                          {s.recoverable ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={s.status || 'pending'}
                          onChange={(e) => updateScrapLog(s.id, { status: e.target.value })}
                          disabled={!isAdmin}
                          className="px-2 py-1 rounded text-[10px] outline-none disabled:opacity-60"
                          style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }}
                        >
                          {statusOptions.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          value={s.disposalValue || 0}
                          onChange={(e) => updateScrapLog(s.id, { disposalValue: Number(e.target.value || 0) })}
                          disabled={!isAdmin}
                          className="w-20 px-2 py-1 rounded text-[10px] outline-none disabled:opacity-60"
                          style={{ background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }}
                        />
                      </td>
                      <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--muted)' }}>
                        {s.remark || (s.source === 'adjustment' ? 'Auto from adjustment' : '—')}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!isAdmin) return;
                            if (confirm('Delete scrap log?')) removeScrapLog(s.id);
                          }}
                          disabled={!isAdmin}
                          className="px-2 py-1 rounded text-[10px] font-bold disabled:opacity-60"
                          style={{ background: 'var(--soft)', color: '#c62828', border: '1px solid var(--line)' }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
