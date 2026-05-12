import { useState, useRef, useCallback, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { formatDate } from '../../lib/dateUtils';
import * as XLSX from 'xlsx';

const SI_PROFILES_KEY = 'magnus_import_profiles';

export default function SmartImport() {
  const { state, addSale, addPurchase, addDcwrOut, addProduct } = useInventory();
  const { user } = useAuth();
  const canAddProducts = user?.role === 'admin' || user?.role === 'manager';
  const fileInputRef = useRef(null);

  // ── Wizard state ──
  const [step, setStep] = useState(1);
  const [workbook, setWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [sheetData, setSheetData] = useState([]); // 2D array
  const [headerRow, setHeaderRow] = useState(1);
  const [dataStart, setDataStart] = useState(2);
  const [headers, setHeaders] = useState([]);
  const [dataRows, setDataRows] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [importType, setImportType] = useState('sales');
  const [parsedEntries, setParsedEntries] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [matchedProducts, setMatchedProducts] = useState(0);
  const [skippedRows, setSkippedRows] = useState(0);

  // ── Smart Add Modal State ──
  const [smartAddCode, setSmartAddCode] = useState(null);
  const [smartAddName, setSmartAddName] = useState('');
  const [smartAddCategory, setSmartAddCategory] = useState('');

  // ── Profile management ──
  const [profiles, setProfiles] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SI_PROFILES_KEY) || '[]'); }
    catch { return []; }
  });
  const [selectedProfile, setSelectedProfile] = useState('');

  const saveProfiles = useCallback((p) => {
    localStorage.setItem(SI_PROFILES_KEY, JSON.stringify(p));
    setProfiles(p);
  }, []);

  // ── File handling ──
  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: false });
        setWorkbook(wb);
        setSheetNames(wb.SheetNames);

        // Try auto-apply a saved profile
        const profs = JSON.parse(localStorage.getItem(SI_PROFILES_KEY) || '[]');
        let applied = false;
        for (const p of profs) {
          if (wb.SheetNames.includes(p.sheetName)) {
            // Apply profile
            const ws = wb.Sheets[p.sheetName];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
            setSheetData(data);
            setSelectedSheet(p.sheetName);
            setHeaderRow(p.headerRow + 1);
            setDataStart(p.dataStartRow + 1);
            const hdrs = (data[p.headerRow] || []).map(h => String(h).trim());
            const dRows = data.slice(p.dataStartRow).filter(r => r.some(c => c !== ''));
            setHeaders(hdrs);
            setDataRows(dRows);
            setColumnMap(JSON.parse(JSON.stringify(p.columnMap)));
            setImportType(p.importType || 'sales');
            setStep(3);
            toast.success('✓ Profile applied: ' + p.name);
            applied = true;
            break;
          }
        }

        if (!applied) {
          const firstSheet = wb.SheetNames[0];
          const ws = wb.Sheets[firstSheet];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
          setSheetData(data);
          setSelectedSheet(firstSheet);
          const hdrs = (data[0] || []).map(h => String(h).trim());
          const dRows = data.slice(1).filter(r => r.some(c => c !== ''));
          setHeaders(hdrs);
          setDataRows(dRows);
          setStep(2);
        }
      } catch (err) {
        toast.error('⚠ Error reading file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // ── Sheet/range selection ──
  const handleSelectSheet = useCallback((name) => {
    if (!workbook) return;
    const ws = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    setSheetData(data);
    setSelectedSheet(name);
    const hIdx = headerRow - 1;
    const dIdx = dataStart - 1;
    const hdrs = (data[hIdx] || []).map(h => String(h).trim());
    const dRows = data.slice(dIdx).filter(r => r.some(c => c !== ''));
    setHeaders(hdrs);
    setDataRows(dRows);
  }, [workbook, headerRow, dataStart]);

  const updateRange = useCallback(() => {
    if (!sheetData.length) return;
    const hIdx = headerRow - 1;
    const dIdx = dataStart - 1;
    const hdrs = (sheetData[hIdx] || []).map(h => String(h).trim());
    const dRows = sheetData.slice(dIdx).filter(r => r.some(c => c !== ''));
    setHeaders(hdrs);
    setDataRows(dRows);
  }, [sheetData, headerRow, dataStart]);

  // ── Smart detection ──
  const detectColumns = useCallback(() => {
    const newMap = {};
    let dateCol = -1, qtyCol = -1, billCol = -1, partyCol = -1, productCodeCol = -1;

    headers.forEach((h, ci) => {
      const hu = h.toUpperCase();
      const samples = dataRows.slice(0, 10).map(r => String(r[ci] || ''));

      if (dateCol < 0 && (hu.includes('DATE') || hu.includes('END OF THE DAY') || hu.includes('INVOICE DATE'))) {
        const hasDate = samples.some(s => /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s));
        if (hasDate) { dateCol = ci; newMap[ci] = { field: 'date', format: 'DD/MM/YYYY' }; }
      }

      if (billCol < 0 && (hu.includes('INVOICE SEQUENCE') || hu.includes('VOUCHER') || hu.includes('INVOICE NO') || hu.includes('BILL') || hu.includes('DC NO') || hu.includes('CHALLAN'))) {
        billCol = ci; newMap[ci] = { field: 'bill' };
      }

      if (productCodeCol < 0 && hu === 'MATERIAL CODE') {
        productCodeCol = ci; newMap[ci] = { field: 'productCode' };
      }

      if (qtyCol < 0 && (hu === 'TOTAL VOLUME' || hu.includes('QTY') || hu.includes('QUANTITY'))) {
        const allNum = samples.filter(s => s !== '').every(s => !isNaN(parseInt(s)));
        if (allNum) { qtyCol = ci; newMap[ci] = { field: 'qty' }; }
      }

      if (partyCol < 0 && hu.includes('RETAILER') && hu.includes('ACCOUNT NAME')) {
        partyCol = ci; newMap[ci] = { field: 'party' };
      }

      if (partyCol < 0 && (hu.includes('CONSIGNEE') || hu.includes('PARTY') || hu.includes('CUSTOMER') || hu.includes('DEALER'))) {
        partyCol = ci; newMap[ci] = { field: 'party' };
      }
    });

    if (qtyCol < 0) {
      headers.forEach((h, ci) => {
        if (newMap[ci]) return;
        const samples = dataRows.slice(0, 10).map(r => String(r[ci] || '')).filter(s => s !== '');
        if (samples.length > 2 && samples.every(s => /^\d+$/.test(s.trim()))) {
          qtyCol = ci; newMap[ci] = { field: 'qty' };
        }
      });
    }

    setColumnMap(newMap);
    return newMap;
  }, [headers, dataRows]);

  // ── Build preview ──
  const buildPreview = useCallback(() => {
    const dateCi = Object.keys(columnMap).find(k => columnMap[k].field === 'date');
    const billCi = Object.keys(columnMap).find(k => columnMap[k].field === 'bill');
    const partyCi = Object.keys(columnMap).find(k => columnMap[k].field === 'party');
    const partyFb1Ci = Object.keys(columnMap).find(k => columnMap[k].field === 'partyFallback1');
    const partyFb2Ci = Object.keys(columnMap).find(k => columnMap[k].field === 'partyFallback2');
    const qtyCi = Object.keys(columnMap).find(k => columnMap[k].field === 'qty');
    const prodCodeCi = Object.keys(columnMap).find(k => columnMap[k].field === 'productCode');

    const entries = [];
    const warns = [];
    let matched = new Set();
    let skipped = 0;
    const billGroups = {};

    dataRows.forEach((row, ri) => {
      const rawDate = dateCi !== undefined ? String(row[dateCi] || '') : '';
      const bill = billCi !== undefined ? String(row[billCi] || '').trim() : '';
      const qtyRaw = qtyCi !== undefined ? String(row[qtyCi] || '0') : '0';
      const qty = parseInt(qtyRaw) || 0;
      const prodCode = prodCodeCi !== undefined ? String(row[prodCodeCi] || '').trim() : '';

      let party = '';
      if (partyCi !== undefined) party = String(row[partyCi] || '').trim();
      if (!party && partyFb1Ci !== undefined) party = String(row[partyFb1Ci] || '').trim();
      if (!party && partyFb2Ci !== undefined) party = String(row[partyFb2Ci] || '').trim();

      let date = rawDate;
      if (rawDate.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/)) {
        const parts = rawDate.split(/[\/\-]/);
        if (parts.length === 3) {
          let y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
          date = `${y}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }

      const product = state.products.find(p => p.code.toUpperCase() === prodCode.toUpperCase());
      if (!product && prodCode) {
        warns.push({ row: ri + 1, msg: `Product "${prodCode}" not found in system`, missingCode: prodCode.toUpperCase() });
        skipped++; return;
      }
      if (!product && !prodCode) { skipped++; return; }
      if (qty <= 0) { warns.push({ row: ri + 1, msg: `Qty is 0 for ${prodCode}` }); skipped++; return; }
      if (qty > 500) { warns.push({ row: ri + 1, msg: `Large qty (${qty}) for ${prodCode}` }); }

      matched.add(product.id);
      const key = bill || ('__row_' + ri);
      if (!billGroups[key]) billGroups[key] = { date, bill, party, items: {}, type: 'Normal' };
      billGroups[key].items[product.id] = (billGroups[key].items[product.id] || 0) + qty;
      if (date) billGroups[key].date = date;
      if (party) billGroups[key].party = party;
    });

    const parsed = Object.values(billGroups).filter(e => Object.keys(e.items).length > 0);
    setParsedEntries(parsed);
    setWarnings(warns);
    setMatchedProducts(matched.size);
    setSkippedRows(skipped);
  }, [columnMap, dataRows, state.products]);

  const handleAddMissingProduct = useCallback((code) => {
    setSmartAddCode(code);
    setSmartAddName('');
    setSmartAddCategory('');
  }, []);

  const confirmSmartAdd = useCallback(() => {
    if (!smartAddCode) return;
    addProduct({ code: smartAddCode, name: smartAddName, category: smartAddCategory || 'Uncategorized', minLevel: 10 });
    setSmartAddCode(null);
    toast.success(`✓ "${smartAddCode}" added! Background rescanning...`);
    // Allow state to catch up, then rebuild preview
    setTimeout(() => {
      buildPreview();
    }, 400);
  }, [smartAddCode, smartAddName, smartAddCategory, addProduct, buildPreview]);

  // ── Execute import ──
  const executeImport = useCallback(() => {
    if (!parsedEntries.length) { toast.error('⚠ No entries to import'); return; }
    let count = 0;

    parsedEntries.forEach(entry => {
      if (importType === 'sales') {
        if (entry.bill && state.sales.find(s => s.bill === entry.bill)) return;
        addSale({ date: entry.date, bill: entry.bill || '', party: entry.party || '', type: 'Normal', items: entry.items });
        count++;
      } else if (importType === 'purchases') {
        addPurchase({ date: entry.date, bill: entry.bill || '', party: entry.party || '', type: 'Normal', items: entry.items });
        count++;
      } else if (importType === 'dcwrOut') {
        addDcwrOut({ date: entry.date, challan: entry.bill || '', party: entry.party || '', remark: '', items: entry.items });
        count++;
      }
    });

    if (count > 0) {
      toast.success(`✓ Imported ${count} ${importType} entries!`);
    } else {
      toast.error('⚠ No new entries imported');
    }

    // Reset
    setStep(1);
    setWorkbook(null);
    setParsedEntries([]);
  }, [parsedEntries, importType, state.sales, addSale, addPurchase, addDcwrOut]);

  // ── Navigate steps ──
  const goToStep = useCallback((n) => {
    if (n === 3) detectColumns();
    if (n === 4) buildPreview();
    setStep(n);
  }, [detectColumns, buildPreview]);

  // ── Save profile ──
  const saveProfile = useCallback(() => {
    const name = prompt('Profile name:', 'Daily Sales Import');
    if (!name) return;
    const profile = {
      name, sheetName: selectedSheet,
      headerRow: headerRow - 1, dataStartRow: dataStart - 1,
      importType, columnMap: JSON.parse(JSON.stringify(columnMap)),
      created: new Date().toISOString().split('T')[0],
    };
    const newProfiles = [...profiles];
    const idx = newProfiles.findIndex(p => p.name === name);
    if (idx >= 0) newProfiles[idx] = profile;
    else newProfiles.push(profile);
    saveProfiles(newProfiles);
    toast.success('✓ Profile saved: ' + name);
  }, [selectedSheet, headerRow, dataStart, importType, columnMap, profiles, saveProfiles]);

  const deleteProfile = useCallback(() => {
    const idx = parseInt(selectedProfile);
    if (isNaN(idx)) { toast.error('Select a profile to delete'); return; }
    const newProfiles = [...profiles];
    const name = newProfiles[idx].name;
    newProfiles.splice(idx, 1);
    saveProfiles(newProfiles);
    setSelectedProfile('');
    toast.success('✓ Profile deleted: ' + name);
  }, [selectedProfile, profiles, saveProfiles]);

  const pmap = useMemo(() => {
    const m = {}; state.products.forEach(p => m[p.id] = p); return m;
  }, [state.products]);

  const FIELDS = [
    { value: 'skip', label: '⊘ Skip' },
    { value: 'date', label: '📅 Date' },
    { value: 'bill', label: '📑 Bill / Invoice No.' },
    { value: 'party', label: '👤 Party Name (Primary)' },
    { value: 'partyFallback1', label: '👤 Party Fallback 1' },
    { value: 'partyFallback2', label: '👤 Party Fallback 2' },
    { value: 'qty', label: '🔢 Quantity' },
    { value: 'productCode', label: '📦 Product Code' },
  ];

  // ── Step indicator ──
  const StepIndicator = () => (
    <div className="flex gap-2 mb-4">
      {[
        { n: 1, label: 'Upload' },
        { n: 2, label: 'Sheet & Range' },
        { n: 3, label: 'Mapping' },
        { n: 4, label: 'Import' },
      ].map(s => (
        <div key={s.n} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold ${step === s.n ? 'text-white' : step > s.n ? 'text-white opacity-70' : ''
          }`}
          style={{
            background: step >= s.n ? 'var(--teal3)' : 'var(--soft)',
            color: step >= s.n ? '#fff' : 'var(--muted)',
          }}>
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: step >= s.n ? 'rgba(255,255,255,.2)' : 'var(--line)' }}>
            {step > s.n ? '✓' : s.n}
          </span>
          {s.label}
        </div>
      ))}
    </div>
  );

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
      <div className="px-4 py-3 font-semibold text-sm" style={{ background: 'var(--teal)', color: '#fff' }}>
        📥 Smart Excel Importer <span className="text-[10px] opacity-70 ml-2">Hybrid Auto-Detect + Templates</span>
      </div>
      <div className="p-4">
        <StepIndicator />

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="space-y-3">
            {profiles.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <label className="font-semibold" style={{ color: 'var(--muted)' }}>Saved Profiles:</label>
                <select value={selectedProfile} onChange={e => setSelectedProfile(e.target.value)}
                  className="px-2 py-1 rounded text-xs outline-none"
                  style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                  <option value="">— None —</option>
                  {profiles.map((p, i) => <option key={i} value={i}>{p.name} ({p.importType})</option>)}
                </select>
                <button onClick={deleteProfile} className="px-2 py-1 rounded text-[10px] font-bold text-white" style={{ background: 'var(--teal)' }}>🗑</button>
              </div>
            )}
            <div className="rounded-xl border-2 border-dashed text-center py-12 cursor-pointer transition-all hover:shadow-md"
              style={{ borderColor: 'var(--teal3)', background: 'var(--soft)' }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = 'var(--open-bg)'; }}
              onDragLeave={e => { e.preventDefault(); e.currentTarget.style.background = 'var(--soft)'; }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.background = 'var(--soft)'; if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); }}>
              <div className="text-4xl mb-2">📂</div>
              <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Drop Excel file here or click to browse</div>
              <div className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>.xlsx files supported</div>
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ''; }} />
          </div>
        )}

        {/* Step 2: Sheet & Range */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Sheet</label>
                <select value={selectedSheet} onChange={e => handleSelectSheet(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                  {sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Header Row</label>
                <input type="number" min="1" max="50" value={headerRow}
                  onChange={e => { setHeaderRow(parseInt(e.target.value) || 1); }}
                  onBlur={updateRange}
                  className="px-3 py-2 rounded-lg text-sm outline-none w-16"
                  style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Data starts row</label>
                <input type="number" min="1" max="100" value={dataStart}
                  onChange={e => { setDataStart(parseInt(e.target.value) || 2); }}
                  onBlur={updateRange}
                  className="px-3 py-2 rounded-lg text-sm outline-none w-16"
                  style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
              </div>
              <button onClick={() => goToStep(3)} className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: 'var(--teal3)' }}>
                Next →
              </button>
              <button onClick={() => { setStep(1); setWorkbook(null); setSelectedSheet(''); setSheetData([]); setParsedEntries([]); }} className="px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-500/10" style={{ color: 'var(--danger)', border: '1px solid var(--danger)' }}>
                ✖ Upload Different File
              </button>
            </div>

            {/* Preview */}
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Preview (first 8 rows)</div>
            <div className="table-responsive rounded-lg" style={{ border: '1px solid var(--line)' }}>
              <table className="w-full text-[10px]">
                <thead>
                  <tr style={{ background: 'var(--teal)' }}>
                    {headers.slice(0, 30).map((h, i) => (
                      <th key={i} className="px-2 py-1.5 text-left font-semibold text-white/90 whitespace-nowrap">{h || `Col ${i}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.slice(0, 8).map((row, ri) => (
                    <tr key={ri} className="border-b" style={{ borderColor: 'var(--line)' }}>
                      {headers.slice(0, 30).map((_, ci) => (
                        <td key={ci} className="px-2 py-1 whitespace-nowrap" style={{ color: 'var(--ink)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {String(row[ci] || '').substring(0, 35)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 3: Column Mapping */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[10px] font-semibold" style={{ color: 'var(--muted)' }}>Import As:</label>
              {['sales', 'purchases', 'dcwrOut'].map(t => (
                <button key={t} onClick={() => setImportType(t)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${importType === t ? 'text-white' : ''}`}
                  style={{ background: importType === t ? 'var(--teal3)' : 'var(--soft)', color: importType === t ? '#fff' : 'var(--muted)' }}>
                  {t === 'sales' ? 'Sales' : t === 'purchases' ? 'Purchase' : 'DCWR Out'}
                </button>
              ))}
            </div>

            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              Column Mapping <span className="font-normal">(auto-detected — adjust as needed)</span>
            </div>
            <div className="space-y-1">
              {headers.filter(Boolean).map((h, ci) => {
                const mapped = columnMap[ci];
                const selectedField = mapped ? mapped.field : 'skip';
                return (
                  <div key={ci} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--soft)' }}>
                    <span className="text-xs font-medium flex-1 truncate" style={{ color: 'var(--ink)', maxWidth: 200 }} title={h}>
                      {h.substring(0, 25)}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--muted)' }}>→</span>
                    <select value={selectedField}
                      onChange={e => {
                        const newMap = { ...columnMap };
                        if (e.target.value === 'skip') delete newMap[ci];
                        else newMap[ci] = { field: e.target.value };
                        setColumnMap(newMap);
                      }}
                      className="px-2 py-1 rounded text-[10px] outline-none"
                      style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                      {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${mapped ? 'text-white' : ''}`}
                      style={{ background: mapped ? 'var(--success)' : 'var(--line)', color: mapped ? '#fff' : 'var(--muted)' }}>
                      {mapped ? '✓ Auto' : '—'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 mt-3">
              <button onClick={() => goToStep(2)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--soft)', color: 'var(--ink)' }}>← Back</button>
              <button onClick={() => goToStep(4)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: 'var(--teal3)' }}>Preview Import →</button>
              <button onClick={saveProfile} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>💾 Save as Profile</button>
              <button onClick={() => { setStep(1); setWorkbook(null); setSelectedSheet(''); setSheetData([]); setParsedEntries([]); }} className="px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-black/5 ml-auto" style={{ color: 'var(--danger)' }}>✖ Cancel</button>
            </div>
          </div>
        )}

        {/* Step 4: Confirm & Import */}
        {step === 4 && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="flex gap-6 items-center flex-wrap">
              <div className="text-center">
                <div className="text-2xl font-bold" style={{ color: 'var(--teal3)' }}>{parsedEntries.length}</div>
                <div className="text-[10px]" style={{ color: 'var(--muted)' }}>rows ready</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{matchedProducts}</div>
                <div className="text-[10px]" style={{ color: 'var(--muted)' }}>products matched</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold" style={{ color: 'var(--danger)' }}>{skippedRows}</div>
                <div className="text-[10px]" style={{ color: 'var(--muted)' }}>rows skipped</div>
              </div>
            </div>

            {/* Warnings */}
            <div className="space-y-1">
              {warnings.length === 0 ? (
                <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--final-bg)', color: 'var(--success)' }}>✓ No issues detected</div>
              ) : (
                warnings.slice(0, 20).map((w, i) => (
                  <div key={i} className="text-xs px-3 py-1.5 rounded-lg flex items-center justify-between gap-2" style={{ background: 'var(--diff-bg)', color: 'var(--danger)' }}>
                    <div className="truncate flex-1">⚠ Row {w.row}: {w.msg}</div>
                    {canAddProducts && w.missingCode && (
                      <button onClick={() => handleAddMissingProduct(w.missingCode)} 
                        className="px-2 py-1 rounded text-[10px] font-bold text-white shrink-0 hover:opacity-90 shadow-sm"
                        style={{ background: 'var(--teal3)' }}>
                        + Add Data
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Row Preview */}
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Row Preview</div>
            <div className="table-responsive rounded-lg" style={{ border: '1px solid var(--line)' }}>
              <table className="w-full text-[10px]">
                <thead>
                  <tr style={{ background: 'var(--teal)' }}>
                    {['#', 'Date', 'Bill', 'Party', 'Items'].map(h => (
                      <th key={h} className="px-2 py-1.5 text-left font-semibold text-white/90">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedEntries.slice(0, 30).map((e, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: 'var(--line)' }}>
                      <td className="px-2 py-1" style={{ color: 'var(--ink)' }}>{i + 1}</td>
                      <td className="px-2 py-1" style={{ color: 'var(--ink)' }}>{formatDate(e.date)}</td>
                      <td className="px-2 py-1 font-mono" style={{ color: 'var(--ink)' }}>{e.bill || '—'}</td>
                      <td className="px-2 py-1" style={{ color: 'var(--ink)' }}>{e.party || '—'}</td>
                      <td className="px-2 py-1" style={{ color: 'var(--ink)' }}>
                        {Object.entries(e.items).map(([pid, q]) => `${pmap[pid]?.code || pid}: ${q}`).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 mt-6 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
              <button onClick={() => goToStep(3)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--soft)', color: 'var(--ink)' }}>← Mapping</button>
              <button onClick={executeImport} className="px-4 py-2 rounded-lg text-sm font-bold text-white shadow-md relative group overflow-hidden" style={{ background: 'var(--accent)' }}>
                 <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform"></div>
                 Execute Import
              </button>
              <button onClick={() => { setStep(1); setWorkbook(null); setSelectedSheet(''); setSheetData([]); setParsedEntries([]); }} className="px-4 py-2 rounded-lg text-sm font-bold ml-auto hover:bg-black/5" style={{ color: 'var(--danger)' }}>✖ Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Smart Add Modal ── */}
      {smartAddCode && (
        <div className="fixed inset-0 bg-black/60 z-[99] flex items-center justify-center p-4 backdrop-blur-sm transition-all">
          <div className="rounded-2xl w-full max-w-sm p-6 shadow-2xl relative" style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
             <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--ink)' }}>Add Missing Product</h3>
             <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>Adding <span className="font-bold text-[11px] px-1 py-0.5 rounded" style={{ background: 'var(--soft)' }}>{smartAddCode}</span> to the system.</p>
             
             <div className="space-y-4 mb-6">
               <div>
                 <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--muted)' }}>Product Name *</label>
                 <input 
                   autoFocus
                   value={smartAddName} 
                   onChange={e => setSmartAddName(e.target.value)}
                   className="w-full px-3 py-2.5 rounded-lg text-sm outline-none border focus:ring-2"
                   style={{ borderColor: 'var(--line)', background: 'var(--soft)', color: 'var(--ink)' }}
                   placeholder="e.g. Blue Widget 50x"
                 />
               </div>
               <div>
                 <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--muted)' }}>Category (Optional)</label>
                 <input 
                   value={smartAddCategory} 
                   onChange={e => setSmartAddCategory(e.target.value)}
                   className="w-full px-3 py-2.5 rounded-lg text-sm outline-none border focus:ring-2"
                   style={{ borderColor: 'var(--line)', background: 'var(--soft)', color: 'var(--ink)' }}
                   placeholder="e.g. TOYS"
                 />
               </div>
             </div>
             
             <div className="flex gap-3 justify-end items-center border-t pt-4 mt-4" style={{ borderColor: 'var(--line)' }}>
               <button onClick={() => setSmartAddCode(null)} className="px-4 py-2 rounded-lg text-xs font-bold hover:bg-black/5" style={{ color: 'var(--ink)' }}>Cancel</button>
               <button 
                 onClick={confirmSmartAdd} 
                 disabled={!smartAddName.trim()}
                 className={`px-4 py-2 rounded-lg text-sm shadow-sm font-bold text-white transition-all ${!smartAddName.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-0.5'}`} 
                 style={{ background: 'var(--teal3)' }}
               >
                 + Create & Rescan
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
