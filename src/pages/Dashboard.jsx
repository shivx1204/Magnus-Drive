import { useState, useMemo, useRef, lazy, Suspense, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import Header from '../components/Header';
import { formatDate } from '../lib/dateUtils';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const HomePage = lazy(() => import('./dashboard/Home'));
const ProductsPage = lazy(() => import('./dashboard/Products'));
const PartiesPage = lazy(() => import('./dashboard/Parties'));
const OpeningPage = lazy(() => import('./dashboard/Opening'));
const PurchasesPage = lazy(() => import('./dashboard/Purchases'));
const SalesPage = lazy(() => import('./dashboard/Sales'));
const DcwrPage = lazy(() => import('./dashboard/Dcwr'));
const StatementPage = lazy(() => import('./dashboard/Statement'));
const ActivityPage = lazy(() => import('./dashboard/Activity'));
const UsersPage = lazy(() => import('./dashboard/Users'));
const SmartImportPage = lazy(() => import('./dashboard/SmartImport'));
const ScrapTrackerPage = lazy(() => import('./dashboard/ScrapTracker'));
const ThirdPartyStockPage = lazy(() => import('./dashboard/ThirdPartyStock'));
const TransfersPage = lazy(() => import('./dashboard/Transfers'));
const AdjustmentsPage = lazy(() => import('./dashboard/Adjustments'));
const FleetTrackerPage = lazy(() => import('./dashboard/FleetTracker'));

const TABS = [
  { id: 'home',       label: 'Home',            icon: '🏠' },
  { id: 'products',   label: 'Products',        icon: '📦' },
  { id: 'parties',    label: 'Parties',         icon: '🤝' },
  { id: 'opening',    label: 'Opening Stock',   icon: '📋' },
  { id: 'purchases',  label: 'Purchases',       icon: '🛒' },
  { id: 'sales',      label: 'Sales',           icon: '💰' },
  { id: 'third-party-stock', label: 'Third Party Stock', icon: '🏷️' },
  { id: 'dcwr',       label: 'DCWR',            icon: '🔄' },
  { id: 'transfers',  label: 'Transfers',       icon: '🚚', managerOnly: true },
  { id: 'adjustments',label: 'Adjustments',     icon: '📉', managerOnly: true },
  { id: 'statement',  label: 'Statement',       icon: '📊' },
  { id: 'activity',   label: 'Activity',          icon: '📝', adminOnly: true },
  { id: 'users',      label: 'Users',             icon: '👥', adminOnly: true },
  { id: 'import',     label: 'Smart Import',      icon: '🧠' },
  { id: 'scrap',      label: 'Scrap Tracker',     icon: '♻️' },
  { id: 'fleet',      label: 'Fleet Tracker',     icon: '📍' },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('home');
  const [salesPrefill, setSalesPrefill] = useState({ type: null, nonce: 0 });
  const [selectedThirdPartyParty, setSelectedThirdPartyParty] = useState({ party: null, nonce: 0 });
  const { isAdmin, isManager, user } = useAuth();
  const { state, save, syncToCloud } = useInventory();
  const jsonFileRef = useRef(null);
  const excelFileRef = useRef(null);

  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleTabSelect = (tabId) => {
    setActiveTab(tabId);
    if (isMobile) setSidebarOpen(false);
  };

  const visibleTabs = useMemo(() =>
    TABS.filter(t => !t.hidden && (!t.adminOnly || isAdmin) && (!t.managerOnly || isManager)),
    [isAdmin, isManager]
  );

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const handleSync = async () => {
    toast.loading('Syncing to cloud...', { id: 'sync' });
    const ok = await syncToCloud();
    toast.dismiss('sync');
    toast[ok ? 'success' : 'error'](ok ? '☁ Synced to cloud' : '✕ Sync failed');
  };

  // ── JSON Export/Import ──
  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'inventory_register_magnus.json'; a.click();
    URL.revokeObjectURL(url);
    toast.success('✓ JSON exported');
  };

  const handleImportJSON = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        save({ ...state, ...imported });
        toast.success('✓ JSON imported');
      } catch { toast.error('⚠ Invalid JSON file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Excel Export ──
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const prodCodes = state.products.map(p => p.code);

    // Products sheet
    const prodData = [['Product Code', 'Category'], ...state.products.map(p => [p.code, p.category])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prodData), 'Products');

    // Opening Stock sheet
    const openData = [['Product Code', 'Category', 'Opening Qty'], ...state.products.map(p => [p.code, p.category, state.opening[p.id] || 0])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(openData), 'Opening Stock');

    // Sales sheet
    const salHdr = ['Date', 'Bill No.', 'Party Name', 'Type', ...prodCodes, 'Total'];
    const salData = [salHdr, ...state.sales.map(s => [
      formatDate(s.date), s.bill || '', s.party, s.type,
      ...state.products.map(p => s.items[p.id] || 0),
      Object.values(s.items).reduce((a, b) => a + b, 0)
    ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(salData), 'Sales (Sheet1)');

    // Purchases sheet
    const purHdr = ['Date', 'Bill No.', 'Supplier', 'Type', ...prodCodes, 'Total'];
    const purData = [purHdr, ...state.purchases.map(p => [
      formatDate(p.date), p.bill || '', p.party, p.type,
      ...state.products.map(pr => p.items[pr.id] || 0),
      Object.values(p.items).reduce((a, b) => a + b, 0)
    ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(purData), 'Purchases');

    // DCWR OUT sheet
    const dcwrOutHdr = ['Date', 'Challan No.', 'Party', 'Remark', ...prodCodes, 'Total'];
    const dcwrOutData = [dcwrOutHdr, ...state.dcwrOut.map(d => [
      formatDate(d.date), d.challan || '', d.party, d.remark || '',
      ...state.products.map(p => d.items[p.id] || 0),
      Object.values(d.items).reduce((a, b) => a + b, 0)
    ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dcwrOutData), 'DCWR OUT');

    // DCWR IN sheet
    const dcwrInHdr = ['Date', 'Against Challan', 'Party', 'Remark', ...prodCodes, 'Total'];
    const dcwrInData = [dcwrInHdr, ...state.dcwrIn.map(r => {
      const out = state.dcwrOut.find(d => d.id === r.refOutId);
      return [
        formatDate(r.date), out ? (out.challan || '') : '', out ? out.party : '', r.remark || '',
        ...state.products.map(p => r.items[p.id] || 0),
        Object.values(r.items).reduce((a, b) => a + b, 0)
      ];
    })];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dcwrInData), 'DCWR IN');

    // Transfers sheet
    const transfersHdr = ['Date', 'From', 'To', 'Ref No.', 'Remark', ...prodCodes, 'Total'];
    const transfersData = [transfersHdr, ...state.transfers.map(t => [
      formatDate(t.date), t.fromGodown, t.toGodown, t.refNo || '', t.remark || '',
      ...state.products.map(p => t.items[p.id] || 0),
      Object.values(t.items).reduce((a, b) => a + b, 0)
    ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(transfersData), 'Transfers');

    // Adjustments sheet
    const adjHdr = ['Date', 'Godown', 'Type', 'Reason', ...prodCodes, 'Total'];
    const adjData = [adjHdr, ...state.adjustments.map(a => [
      formatDate(a.date), a.godown, a.type || '', a.reason || '',
      ...state.products.map(p => a.items[p.id] || 0),
      Object.values(a.items).reduce((c, b) => c + b, 0)
    ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(adjData), 'Adjustments');

    // Scrap Tracker sheet
    const scrapHdr = ['Date', 'Godown', 'Product', 'Qty', 'Reason', 'Recoverable', 'Status', 'Disposal Value', 'Remark', 'Source'];
    const scrapData = [scrapHdr, ...(state.scrapLogs || []).map((s) => [
      formatDate(s.date),
      s.godown || '',
      s.productId ? (state.products.find((p) => p.id === s.productId)?.code || s.productId) : Object.entries(s.items || {}).map(([id, qty]) => `${state.products.find((p) => p.id === id)?.code || id}:${qty}`).join(', '),
      s.qty || Object.values(s.items || {}).reduce((a, b) => a + (b || 0), 0),
      s.reason || '',
      s.recoverable ? 'Yes' : 'No',
      s.status || 'pending',
      s.disposalValue || 0,
      s.remark || '',
      s.source || 'manual',
    ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(scrapData), 'Scrap Tracker');

    // Third Party Stock sheet
    const tpHdr = ['Date', 'Bill', 'Party', 'Type', 'Godown', 'Status', 'Items', 'Serial Numbers', 'Remark'];
    const tpData = [tpHdr, ...(state.thirdPartyEntries || []).map((e) => [
      formatDate(e.date),
      e.bill || '',
      e.party || '',
      e.type || 'Adjustment',
      e.godown || 'Third Party Godown',
      e.status || 'pending',
      Object.entries(e.items || {}).map(([id, qty]) => `${state.products.find((p) => p.id === id)?.code || id}:${qty}`).join(', '),
      Object.entries(e.serialNumbersByProduct || {}).map(([id, list]) => `${state.products.find((p) => p.id === id)?.code || id}:${(list || []).join('|')}`).join(' ; '),
      e.remark || '',
    ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tpData), 'Third Party Stock');

    // Statement sheet
    // We export a single aggregated statement logic (ignoring activeGodown specific rules, just global sum, OR per godown maybe, sticking to what existed previously)
    const openQ = id => state.opening['1 Vasai']?.[id] || 0; // The previous script only mapped the aggregated mapping, wait, let's keep original
    // Wait, the previous logic: `const openQ = id => state.opening[id] || 0;` assumed flat opening.
    const getGlobalTotal = (dict) => Object.values(dict).reduce((a, b) => a + b, 0); 
    const totalPur = id => state.purchases.filter(p => p.type !== 'DCWR').reduce((s, p) => s + (p.items[id] || 0), 0);
    const totalSal = id => state.sales.filter(s => s.type !== 'DCWR').reduce((s, sal) => s + (sal.items[id] || 0), 0);
    const totalDcwrIn = id => state.dcwrIn.reduce((s, r) => s + (r.items[id] || 0), 0);
    // Since it's a global statement, transfers between godowns net to 0 globally, but adjustments subtract globally.
    const totalAdjustments = id => state.adjustments.reduce((s, a) => s + (a.items[id] || 0), 0);

    // Summing opening across godowns:
    const sumOpening = id => Object.values(state.opening).reduce((s, godownObj) => s + (godownObj[id] || 0), 0);
    const sumPhys = id => Object.values(state.physical).reduce((s, obj) => s + (obj[id] || 0), 0);
    const sumCrm = id => Object.values(state.crm).reduce((s, obj) => s + (obj[id] || 0), 0);

    const finalQ = id => sumOpening(id) + totalPur(id) + totalDcwrIn(id) - totalSal(id) - totalAdjustments(id);
    const sumRow = fn => state.products.reduce((s, p) => s + fn(p.id), 0);
    const addRow = (label, fn) => [label, ...state.products.map(p => fn(p.id)), sumRow(fn)];
    const stmtData = [
      ['Description', ...prodCodes, 'TOTAL'],
      addRow('Total Opening', sumOpening), addRow('Total Sales', totalSal), addRow('Total Purchase', totalPur),
      addRow('DCWR IN', totalDcwrIn), addRow('Total Adjustments', totalAdjustments), addRow('Final Total', finalQ),
      addRow('Physical Total', sumPhys), addRow('CRM Total', sumCrm),
      addRow('Diff (Final-Physical)', id => finalQ(id) - sumPhys(id)),
      addRow('Diff (Final-CRM)', id => finalQ(id) - sumCrm(id)),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stmtData), 'Statement (Sheet4)');

    XLSX.writeFile(wb, 'Inventory_Register_Magnus.xlsx');
    toast.success('✓ Excel exported');
  };

  // ── Excel Import ──
  const handleImportExcel = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const newState = { ...state };

        // Products
        const prodSheet = wb.Sheets['Products'];
        if (prodSheet) {
          newState.products = [];
          XLSX.utils.sheet_to_json(prodSheet, { header: 1 }).slice(1).forEach(([code, cat]) => {
            if (code && cat) newState.products.push({ id: uid(), code: String(code).trim(), category: String(cat).trim() });
          });
        }

        // Opening
        const openSheet = wb.Sheets['Opening Stock'];
        if (openSheet) {
          newState.opening = { '1 Vasai': {}, '2 Virar': {} };
          XLSX.utils.sheet_to_json(openSheet, { header: 1 }).slice(1).forEach(([code, , qty]) => {
            const p = newState.products.find(x => x.code === String(code).trim());
            if (p && qty) newState.opening['1 Vasai'][p.id] = parseInt(qty) || 0;
          });
        }

        const parseItems = (row, startCol) => {
          const items = {};
          newState.products.forEach((p, i) => { const v = parseInt(row[startCol + i]) || 0; if (v > 0) items[p.id] = v; });
          return items;
        };

        // Sales
        const salSheet = wb.Sheets['Sales (Sheet1)'];
        if (salSheet) {
          newState.sales = [];
          XLSX.utils.sheet_to_json(salSheet, { header: 1 }).slice(1).forEach(r => {
            const items = parseItems(r, 4);
            if (Object.keys(items).length) newState.sales.push({ id: uid(), godown: '1 Vasai', date: String(r[0] || ''), bill: String(r[1] || ''), party: String(r[2] || ''), type: String(r[3] || 'Normal'), items, scrapProvided: false, scrapItems: {}, remark: '' });
          });
        }

        // Purchases
        const purSheet = wb.Sheets['Purchases'];
        if (purSheet) {
          newState.purchases = [];
          XLSX.utils.sheet_to_json(purSheet, { header: 1 }).slice(1).forEach(r => {
            const items = parseItems(r, 4);
            if (Object.keys(items).length) newState.purchases.push({ id: uid(), godown: '1 Vasai', date: String(r[0] || ''), bill: String(r[1] || ''), party: String(r[2] || ''), type: String(r[3] || 'Normal'), items, remark: '' });
          });
        }

        save(newState);
        toast.success('✓ Excel imported');
      } catch (err) { toast.error('⚠ Import error: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const renderPage = () => {
    switch (activeTab) {
      case 'products':  return <ProductsPage />;
      case 'parties':   return <PartiesPage />;
      case 'opening':   return <OpeningPage />;
      case 'purchases': return <PurchasesPage />;
      case 'sales':     return <SalesPage prefill={salesPrefill} thirdPartySelection={selectedThirdPartyParty} />;
      case 'third-party-stock': return (
        <ThirdPartyStockPage
          selectedParty={selectedThirdPartyParty.party}
          isAdmin={isAdmin}
          onUseInSales={(partyName) => {
            setSelectedThirdPartyParty((p) => ({ party: partyName, nonce: (p.nonce || 0) + 1 }));
            setActiveTab('sales');
          }}
        />
      );
      case 'dcwr':      return <DcwrPage />;
      case 'transfers': return <TransfersPage />;
      case 'adjustments':return <AdjustmentsPage />;
      case 'statement': return <StatementPage />;
      case 'activity':  return <ActivityPage />;
      case 'users':     return <UsersPage />;
      case 'import':    return <SmartImportPage />;
      case 'scrap':     return <ScrapTrackerPage />;
      case 'fleet':     return <FleetTrackerPage />;
      default:          return (
        <HomePage
          onCreateUnbilled={() => {
            setSalesPrefill((p) => ({ type: 'Unbilled', nonce: (p.nonce || 0) + 1 }));
            setActiveTab('sales');
          }}
        />
      );
    }
  };

  // Sidebar content (shared logic)
  const sidebarContent = (
    <>
      <div className={`${isMobile ? 'w-full' : 'w-64'} h-[76px] flex items-center gap-3 px-5 border-b shrink-0`} style={{ borderColor: 'var(--line)' }}>
        <div className="w-8 h-8 flex items-center justify-center shrink-0">
          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 20V4L12 12" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 12L20 4V20" stroke="#ff4b89" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className={`font-bold text-xl tracking-tight whitespace-nowrap ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-300`} style={{ fontFamily: 'var(--font-display)', color: '#ffffff' }}>
          Magnus Drive
        </div>
        {isMobile && (
          <button onClick={() => setSidebarOpen(false)}
            className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >✕</button>
        )}
      </div>

      <nav className={`${isMobile ? 'w-full' : 'w-64'} flex-1 overflow-y-auto overflow-x-hidden py-6 px-4 space-y-1`}>
        <div className={`text-[10px] font-bold uppercase tracking-wider mb-3 px-2 text-white/50 whitespace-nowrap ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-300`}>Navigation</div>
        {visibleTabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabSelect(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                isActive 
                  ? 'text-white shadow-md' 
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
              style={{
                background: isActive ? 'var(--teal3)' : 'transparent',
              }}
            >
              <span className={`text-lg shrink-0 transition-transform ${isActive ? 'scale-110' : ''}`}>{tab.icon}</span>
              <span className={`whitespace-nowrap ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-300`}>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User Profile Capsule (Bottom of Sidebar) */}
      <div className={`${isMobile ? 'w-full' : 'w-64'} p-4 shrink-0 mb-2`}>
        {user && (
          <div className="flex items-center gap-3.5 px-3 py-2.5 rounded-full transition-colors cursor-pointer w-full"
            style={{ background: '#2c2211', border: '1px solid rgba(245, 158, 11, 0.2)' }}
          >
            <div className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-[16px] font-extrabold shrink-0 shadow-sm"
              style={{ background: '#ee9d0c', color: '#fff' }}>
              {user.display_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className={`flex flex-col justify-center overflow-hidden ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-300 whitespace-nowrap`}>
              <span className="text-[15px] font-bold text-white leading-tight mb-0.5 truncate tracking-wide" style={{ color: '#eaeaea' }}>
                {user.display_name || user.login_id}
              </span>
              <span className="text-[12px] font-bold uppercase leading-none tracking-widest" style={{ color: '#ce8812' }}>
                {user.role}
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex text-gray-200 font-sans" style={{ background: 'var(--cream)', maxWidth: '100vw', overflowX: 'hidden' }}>
      {/* Mobile Sidebar Backdrop */}
      {isMobile && sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — Desktop: hover expansion, Mobile: overlay drawer */}
      {(!isMobile || sidebarOpen) && (
        <aside className={`${
          isMobile 
            ? 'fixed inset-y-0 left-0 w-72 z-[100] sidebar-drawer' 
            : 'group w-[76px] hover:w-64 flex-shrink-0 sticky top-0 transition-[width] duration-300 ease-in-out'
          } border-r flex flex-col h-[100dvh] z-50 overflow-x-hidden`}
          style={{ background: 'var(--teal)', borderColor: 'var(--line)' }}
        >
          {sidebarContent}
        </aside>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden relative">
        <div className={activeTab === 'fleet' ? 'absolute top-0 left-0 right-0 z-50 pointer-events-none' : ''}>
          <div className={activeTab === 'fleet' ? 'pointer-events-auto' : ''}>
            <Header 
              onSync={handleSync} 
              onExportJSON={handleExportJSON} 
              onImportJSON={() => jsonFileRef.current?.click()} 
              onExportExcel={handleExportExcel} 
              onImportExcel={() => excelFileRef.current?.click()}
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            />
          </div>
        </div>
        <input ref={jsonFileRef} type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
        <input ref={excelFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />

        <main className={`flex-1 mobile-main-padding overflow-y-auto overflow-x-hidden ${activeTab === 'fleet' ? 'p-0 pb-0' : 'p-4 md:p-6 pb-24 md:pb-6'} animate-[fadeIn_.2s]`} key={activeTab}>
          <div className={`w-full ${activeTab === 'fleet' ? 'h-full min-h-screen max-w-full' : 'max-w-7xl mx-auto space-y-6'}`}>
            <Suspense fallback={
              <div className="flex items-center justify-center p-12 text-sm" style={{ color: 'var(--muted)' }}>
                Loading module...
              </div>
            }>
              {renderPage()}
            </Suspense>
          </div>
        </main>
      </div>

      {/* ── Glassmorphic Bottom Navigation (Mobile Only) ── */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 z-[60] bg-[#1b1b1b]/80 backdrop-blur-2xl border-t border-white/5 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex justify-around items-center h-[72px] px-2 pb-safe">
            {[
              { id: 'home', icon: 'home', label: 'Home' },
              { id: 'purchases', icon: 'shopping_cart', label: 'Purchases' },
              { id: 'sales', icon: 'trending_up', label: 'Sales' },
              { id: 'statement', icon: 'bar_chart', label: 'Statement' },
            ].map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabSelect(tab.id)}
                  className="flex flex-col items-center justify-center w-16 h-full gap-1 transition-all"
                  style={{ color: isActive ? 'var(--teal3)' : 'var(--muted)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '24px', fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                    {tab.icon}
                  </span>
                  <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
                </button>
              );
            })}
            
            {/* More / Sidebar Toggle */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex flex-col items-center justify-center w-16 h-full gap-1 transition-all"
              style={{ color: sidebarOpen ? 'var(--teal3)' : 'var(--muted)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>more_horiz</span>
              <span className="text-[10px] font-medium tracking-wide">More</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
