import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, LineElement, PointElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, LineElement, PointElement);

export default function Home({ onCreateUnbilled }) {
  const { state } = useInventory();
  const { user } = useAuth();
  const [daysSpan, setDaysSpan] = useState(30);

  const [dashboardGodown, setDashboardGodown] = useState('All');
  const [lowStockFilter, setLowStockFilter] = useState('below_min');

  const stockLevels = useMemo(() => {
    const levels = {};
    const targets = dashboardGodown === 'All' ? ['1 Vasai', '2 Virar'] : [dashboardGodown];

    state.products?.forEach((p) => {
      levels[p.id] = 0;
      targets.forEach((g) => {
        levels[p.id] += state.opening?.[g]?.[p.id] || 0;
      });
    });

    state.purchases?.forEach((p) => {
      if (!targets.includes(p.godown)) return;
      Object.entries(p.items || {}).forEach(([id, qty]) => {
        if (levels[id] !== undefined) levels[id] += qty;
      });
    });

    state.sales?.forEach((s) => {
      if (!targets.includes(s.godown)) return;
      Object.entries(s.items || {}).forEach(([id, qty]) => {
        if (levels[id] !== undefined) levels[id] -= qty;
      });
    });

    state.dcwrIn?.forEach((r) => {
      if (!targets.includes(r.godown)) return;
      Object.entries(r.items || {}).forEach(([id, qty]) => {
        if (levels[id] !== undefined) levels[id] += qty;
      });
    });

    state.transfers?.forEach((t) => {
      Object.entries(t.items || {}).forEach(([id, qty]) => {
        if (targets.includes(t.toGodown) && levels[id] !== undefined) levels[id] += qty;
        if (targets.includes(t.fromGodown) && levels[id] !== undefined) levels[id] -= qty;
      });
    });

    state.adjustments?.forEach((a) => {
      if (!targets.includes(a.godown)) return;
      Object.entries(a.items || {}).forEach(([id, qty]) => {
        if (levels[id] !== undefined) levels[id] -= qty;
      });
    });

    return levels;
  }, [state, dashboardGodown]);

  const lowStockItems = useMemo(() => {
    if (!state.products) return [];
    return state.products
      .map((p) => ({ ...p, stock: stockLevels[p.id] ?? 0, minLvl: p.min_stock ?? 0 }))
      .filter((p) => (lowStockFilter === 'zero' ? p.stock <= 0 : p.stock <= (p.minLvl ?? 0)))
      .sort((a, b) => a.stock - b.stock);
  }, [state.products, stockLevels, lowStockFilter]);

  const pendingUnbilled = useMemo(() => {
    return state.sales ? state.sales.filter((s) => s.type === 'Unbilled').slice().reverse() : [];
  }, [state.sales]);

  // 2. Weekly/Monthly Dispatch Velocity
  const velocityData = useMemo(() => {
    const dates = [];
    const salesByDate = {};
    const purchasesByDate = {};
    
    for (let i = daysSpan - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      dates.push(ds);
      salesByDate[ds] = 0;
      purchasesByDate[ds] = 0;
    }

    if (state.sales) {
      state.sales.forEach(s => {
        if (salesByDate[s.date] !== undefined) {
          let totalQty = Object.values(s.items || {}).reduce((a, b) => a + b, 0);
          salesByDate[s.date] += totalQty;
        }
      });
    }

    if (state.purchases) {
      state.purchases.forEach(p => {
        if (purchasesByDate[p.date] !== undefined) {
          let totalQty = Object.values(p.items || {}).reduce((a, b) => a + b, 0);
          purchasesByDate[p.date] += totalQty;
        }
      });
    }

    return {
      labels: dates.map(d => {
        const parts = d.split('-');
        return `${parts[2]}/${parts[1]}`;
      }),
      datasets: [
        {
          label: 'Outward (Sales)',
          data: dates.map(d => salesByDate[d]),
          backgroundColor: '#fc6042',
          borderRadius: 4,
        },
        {
          label: 'Inward (Receipts)',
          data: dates.map(d => purchasesByDate[d]),
          backgroundColor: '#2e1065',
          borderRadius: 4,
        }
      ]
    };
  }, [state.sales, state.purchases, daysSpan]);

  // 3. Top Dealers by Volume
  const dealerData = useMemo(() => {
    const volumes = {};
    if (state.sales) {
      state.sales.forEach(s => {
        let totalQty = Object.values(s.items || {}).reduce((a, b) => a + b, 0);
        if (!volumes[s.party]) volumes[s.party] = 0;
        volumes[s.party] += totalQty;
      });
    }

    const sorted = Object.entries(volumes).sort((a, b) => b[1] - a[1]).slice(0, 5);
    
    return {
      labels: sorted.map(i => i[0] || 'Unknown'),
      datasets: [
        {
          data: sorted.map(i => i[1]),
          backgroundColor: ['#fc6042', '#2e1065', '#a855f7', '#fb923c', '#d8b4fe'],
          borderWidth: 0,
        }
      ]
    };
  }, [state.sales]);

  // Total unreturned DCWRs (Any challan that has outstanding pending quantites)
  const unreturnedDCWR = useMemo(() => {
    if (!state.dcwrOut) return 0;
    
    let pendingCount = 0;
    state.dcwrOut.forEach(out => {
      const received = {};
      if (state.dcwrIn) {
        state.dcwrIn.filter(r => r.refOutId === out.id).forEach(r => {
          Object.entries(r.items || {}).forEach(([id, qty]) => {
            received[id] = (received[id] || 0) + qty;
          });
        });
      }
      const hasOutstanding = Object.entries(out.items || {}).some(([id, qty]) => (qty - (received[id] || 0)) > 0);
      if (hasOutstanding) pendingCount++;
    });
    return pendingCount;
  }, [state.dcwrOut, state.dcwrIn]);

  // 4. Transaction Matrix (Sale Types Breakdown)
  const transactionMatrix = useMemo(() => {
    const counts = { 'Normal': 0, 'Pro-rata': 0, 'Service': 0, 'Scheme': 0 };
    if (state.sales) {
      state.sales.forEach(s => {
        const t = s.type || 'Normal';
        if (counts[t] !== undefined) counts[t]++;
        else counts[t] = 1;
      });
    }
    const hasData = Object.values(counts).some(v => v > 0);
    return {
      labels: Object.keys(counts),
      hasData,
      datasets: [{
        data: Object.values(counts),
        backgroundColor: ['#2dd4bf', '#fbbf24', '#f87171', '#c084fc', '#94a3b8'],
        borderWidth: 0,
      }]
    };
  }, [state.sales]);

  const [activeLogs, setActiveLogs] = useState([]);
  
  useEffect(() => {
    if (user?.role !== 'admin') return;
    const fetchStats = async () => {
      try {
        const { data } = await supabase.from('activity_log').select('*').order('id', {ascending: false}).limit(15);
        if (data) setActiveLogs(data);
      } catch (e) {
        console.warn('Silent tracker error:', e);
      }
    };
    fetchStats();
  }, [user]);

  return (
    <div className="space-y-8 pb-10">
      {/* Welcome & Highlights Header */}
      <div className="flex flex-col gap-6 animate-fadeIn" style={{ animationDelay: '0ms', animationFillMode: 'both' }}>
        <div>
          <h2 className="text-3xl md:text-4xl font-headline font-bold tracking-tight" style={{ color: 'var(--ink)' }}>Welcome back, {user?.display_name || 'Admin'}</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Here's your inventory pulse for today.</p>
        </div>
        
        {/* Quick KPI Cards - Stitch Bento Style */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-6 rounded-2xl shadow-sm flex flex-col justify-between relative overflow-hidden group transition-all hover:-translate-y-1" style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
             <div className="relative z-10 flex items-center justify-between">
               <div className="p-3 rounded-xl" style={{ background: 'rgba(255, 75, 137, 0.1)', color: '#ff4b89' }}>
                 <span className="material-symbols-outlined">warning</span>
               </div>
               <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: 'var(--muted)' }}>Low Stock</span>
             </div>
             <div className="mt-4 relative z-10">
               <div className="text-4xl font-headline font-bold" style={{ color: 'var(--ink)' }}>{lowStockItems.length}</div>
               <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>items below minimum level</div>
             </div>
             {/* Decorative glow */}
             <div className="absolute right-0 bottom-0 opacity-10 group-hover:scale-110 transition-transform blur-xl w-32 h-32 rounded-full" style={{ background: '#ff4b89', transform: 'translate(30%, 30%)' }}></div>
          </div>

          <div className="p-6 rounded-2xl shadow-sm flex flex-col justify-between relative overflow-hidden group transition-all hover:-translate-y-1" style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
             <div className="relative z-10 flex items-center justify-between">
               <div className="p-3 rounded-xl" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
                 <span className="material-symbols-outlined">pending_actions</span>
               </div>
               <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: 'var(--muted)' }}>Pending DCWR</span>
             </div>
             <div className="mt-4 relative z-10">
               <div className="text-4xl font-headline font-bold" style={{ color: 'var(--ink)' }}>{unreturnedDCWR}</div>
               <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>challans await return</div>
             </div>
             {/* Decorative glow & icon */}
             <div className="absolute right-0 bottom-0 opacity-10 group-hover:scale-110 transition-transform blur-xl w-32 h-32 rounded-full" style={{ background: '#a855f7', transform: 'translate(30%, 30%)' }}></div>
             <div className="absolute right-0 bottom-0 opacity-[0.03] group-hover:scale-110 transition-transform pointer-events-none">
                <span className="material-symbols-outlined text-[120px] translate-x-8 translate-y-8" style={{ color: 'var(--ink)' }}>receipt_long</span>
             </div>
          </div>
        </div>
      </div>

      {/* Unbilled tracker (first analytical section) */}
      <div className="rounded-2xl overflow-hidden shadow-sm animate-fadeIn" style={{ background: 'var(--paper)', border: '1px solid var(--line)', animationDelay: '100ms', animationFillMode: 'both' }}>
        <div className="px-5 py-4 flex items-center justify-between gap-3 border-b" style={{ borderColor: 'var(--line)' }}>
          <h3 className="font-headline font-bold text-sm uppercase tracking-wider" style={{ color: 'var(--ink)' }}>🟡 Pending Unbilled</h3>
          <button
            type="button"
            onClick={() => onCreateUnbilled?.()}
            className="px-4 py-2 rounded-full text-[11px] font-bold text-white shadow-md transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
            title="Create a new Unbilled entry"
          >
            + New Entry
          </button>
        </div>
        <div className="table-responsive">
          <table className="w-full text-xs" style={{ minWidth: '480px' }}>
            <thead>
              <tr style={{ background: 'var(--soft)' }}>
                {['Date', 'Ref/Bill', 'Party', 'Godown', 'Total Qty', 'Scrap?'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendingUnbilled.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-emerald-600 font-medium">✅ No unbilled entries pending</td>
                </tr>
              ) : (
                pendingUnbilled.map((s) => {
                  const total = Object.values(s.items || {}).reduce((a, b) => a + b, 0);
                  return (
                    <tr key={s.id} className="border-b transition-colors hover:bg-black/5" style={{ borderColor: 'var(--line)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{s.date}</td>
                      <td className="px-3 py-2 font-mono font-bold text-amber-600">{s.bill || '—'}</td>
                      <td className="px-3 py-2 font-bold" style={{ color: 'var(--ink)' }}>{s.party}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{s.godown}</td>
                      <td className="px-3 py-2 font-bold" style={{ color: 'var(--ink)' }}>{total}</td>
                      <td className="px-3 py-2">{s.scrapProvided ? '♻️ Yes' : '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8 animate-fadeIn" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
        {/* Left Column: Velocity Chart */}
        <div className="lg:col-span-2 rounded-2xl p-6 shadow-sm flex flex-col" style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-headline font-bold text-sm uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Dispatch Velocity Trend</h3>
            <select 
              value={daysSpan} 
              onChange={e => setDaysSpan(Number(e.target.value))}
              className="text-xs font-bold px-3 py-1.5 outline-none rounded-full"
              style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
            >
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={90}>Last 90 Days</option>
            </select>
          </div>
          <div className="flex-1 min-h-[250px] relative">
            <Bar 
              data={velocityData} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                  x: { grid: { display: false } }
                },
                plugins: {
                  legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8, font: { weight: 'bold' } } }
                }
              }} 
            />
          </div>
        </div>

        {/* Right Column: Top Dealers Doughnut */}
        <div className="rounded-2xl p-6 shadow-sm flex flex-col" style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
          <h3 className="font-headline font-bold text-sm uppercase tracking-wider mb-4" style={{ color: 'var(--muted)' }}>Top Dealers</h3>
          <div className="flex-1 min-h-[200px] relative flex items-center justify-center">
            {dealerData.labels.length > 0 ? (
              <Doughnut 
                data={dealerData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '70%',
                  plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15, font: { size: 10 } } }
                  }
                }}
              />
            ) : (
              <div className="text-sm opacity-50">No data.</div>
            )}
          </div>
        </div>

        {/* Transaction Matrix */}
        <div className="rounded-2xl border p-6 shadow-sm flex flex-col" style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}>
          <h3 className="font-headline font-bold text-sm uppercase tracking-wider mb-4" style={{ color: 'var(--muted)' }}>Tx Matrix</h3>
          <div className="flex-1 min-h-[200px] relative flex items-center justify-center">
            {transactionMatrix.hasData ? (
              <Doughnut 
                data={transactionMatrix}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '70%',
                  plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15, font: { size: 10 } } }
                  }
                }}
              />
            ) : (
              <div className="text-sm opacity-50">No transaction data.</div>
            )}
          </div>
        </div>

      </div>

      <div className={`grid grid-cols-1 ${user?.role === 'admin' ? 'lg:grid-cols-3' : ''} gap-4 md:gap-6 mt-8 animate-fadeIn`} style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
        {/* Active Alerts / Low Stock List */}
        <div className={`${user?.role === 'admin' ? 'lg:col-span-2' : ''} rounded-2xl shadow-sm overflow-hidden`} style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
           <div className="px-5 py-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3" style={{ borderColor: 'var(--line)' }}>
             <h3 className="font-headline font-bold text-sm uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Needs Attention: Low Stock</h3>
             <div className="flex gap-2">
               <select value={dashboardGodown} onChange={e => setDashboardGodown(e.target.value)} className="text-[10px] font-bold px-3 py-1.5 rounded-full outline-none" style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                 <option value="All">All Godowns</option>
                 <option value="1 Vasai">1 Vasai</option>
                 <option value="2 Virar">2 Virar</option>
               </select>
             </div>
           </div>
           <div className="divide-y max-h-[400px] overflow-y-auto" style={{ borderColor: 'var(--line)' }}>
             {lowStockItems.length === 0 ? (
               <div className="p-8 text-center text-sm font-medium" style={{ color: 'var(--muted)' }}>
                 🎉 All products are sufficiently stocked!
               </div>
             ) : (
               lowStockItems.map(p => (
                 <div key={p.id} className="p-4 flex items-center justify-between hover:bg-black/20 transition-colors">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-inner" style={{ background: '#ff4b89', color: '#fff' }}>{p.stock}</div>
                     <div>
                      <div className="font-headline font-bold text-lg" style={{ color: 'var(--ink)' }}>{p.code}</div>
                       <div className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--muted)' }}>
                         Min: {p.minLvl}
                       </div>
                     </div>
                   </div>
                   <button className="px-5 py-2 rounded-full text-[11px] font-bold text-white shadow-md transition-all hover:scale-105" style={{ background: 'linear-gradient(135deg, #ff4b89, #ffb1c3)' }}>
                     Restock
                   </button>
                 </div>
               ))
             )}
           </div>
        </div>
        
        {/* Live Activity Feed */}
        {user?.role === 'admin' && (
          <div className="rounded-2xl border shadow-sm overflow-hidden flex flex-col max-h-[345px]" style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}>
             <div className="px-5 py-3 border-b flex justify-between items-center" style={{ borderColor: 'var(--line)', background: 'var(--teal)' }}>
               <h3 className="font-headline font-bold text-sm uppercase tracking-wider" style={{ color: '#f2ebd9' }}>Live Activity 👀</h3>
             </div>
             <div className="divide-y overflow-y-auto flex-1 p-2" style={{ borderColor: 'var(--line)' }}>
               {activeLogs.length > 0 ? activeLogs.map(log => (
                 <div key={log.id} className="p-2 py-3 hover:bg-black/5 transition-colors text-xs text-left">
                   <div className="font-bold mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis mr-2" style={{ color: 'var(--teal3)' }}>
                      {log.user_name} 
                      <span className="font-normal text-[10px] text-gray-500/70 float-right ml-2">{typeof log.time === 'string' ? log.time.split(', ')[1] || log.time : log.time}</span>
                   </div>
                   <div className="font-semibold" style={{ color: 'var(--ink)' }}>{log.action}</div>
                   <div className="text-[10px] mt-1 leading-snug" style={{ color: 'var(--muted)' }}>{log.details.replace(/\(IP:.*\)/,'')}</div>
                 </div>
               )) : (
                 <div className="p-5 text-center text-xs opacity-50">Loading activity feed...</div>
               )}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
