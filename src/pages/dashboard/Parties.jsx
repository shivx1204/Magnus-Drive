import { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import toast from 'react-hot-toast';

const PARTY_TYPES = ['Common Dealer', '2W Exclusive', '4W Exclusive', '4W Exclusive - OEM'];

export default function Parties() {
  const { state, addParty, removeParty, updateParty } = useInventory();
  const [name, setName] = useState('');
  const [type, setType] = useState('Common Dealer');
  const [search, setSearch] = useState('');

  // Mapping state: { [partyName]: selectedType }
  const [mapTypes, setMapTypes] = useState({});

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return state.parties.filter(p => !q || p.name?.toLowerCase().includes(q) || p.type?.toLowerCase().includes(q));
  }, [state.parties, search]);

  // Collect all party names used in today's sales & purchases that are NOT in the parties master list
  const unmappedTodayParties = useMemo(() => {
    const masterNames = new Set(state.parties.map(p => p.name ? String(p.name).toLowerCase().trim() : ''));
    const todayNames = new Set();

    (state.sales || []).forEach(s => {
      if (s.date === today && s.party) {
        const pName = String(s.party).trim();
        if (pName && !masterNames.has(pName.toLowerCase())) {
          todayNames.add(pName);
        }
      }
    });
    (state.purchases || []).forEach(p => {
      if (p.date === today && p.party) {
        const pName = String(p.party).trim();
        if (pName && !masterNames.has(pName.toLowerCase())) {
          todayNames.add(pName);
        }
      }
    });

    return [...todayNames].sort();
  }, [state.parties, state.sales, state.purchases, today]);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Enter party name'); return; }
    addParty({ name: name.trim(), type });
    toast.success(`✓ ${name} added`);
    setName('');
  };

  const handleMap = (partyName) => {
    const selectedType = mapTypes[partyName] || 'Common Dealer';
    addParty({ name: partyName, type: selectedType });
    toast.success(`✓ "${partyName}" mapped as ${selectedType}`);
    setMapTypes(prev => { const n = { ...prev }; delete n[partyName]; return n; });
  };

  const handlePinLocation = (partyId) => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    toast.loading('Acquiring location...', { id: 'geo' });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          const address = data.display_name || 'Address not found';

          updateParty(partyId, { lat: latitude, lng: longitude, address });
          toast.success('Location pinned successfully!', { id: 'geo' });
        } catch (err) {
          updateParty(partyId, { lat: latitude, lng: longitude, address: 'Unknown Address' });
          toast.success('Coordinates pinned (address lookup failed)', { id: 'geo' });
        }
      },
      (error) => {
        let msg = 'Failed to get location';
        if (error.code === 1) msg = 'Location access denied by user';
        else if (error.code === 2) msg = 'Location unavailable';
        else if (error.code === 3) msg = 'Location request timed out';
        toast.error(msg, { id: 'geo' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="space-y-5">

      {/* ── Unmapped Parties Today (only shown if any exist) ── */}
      {unmappedTodayParties.length > 0 && (
        <div className="rounded-xl overflow-hidden animate-fadeIn" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ background: 'rgba(245,158,11,0.12)' }}>
            <span className="text-base">⚠️</span>
            <span className="font-semibold text-sm" style={{ color: '#f59e0b' }}>
              Unmapped Parties in Today's Bills ({unmappedTodayParties.length})
            </span>
            <span className="ml-auto text-[10px] font-medium" style={{ color: 'var(--muted)' }}>Map them to add to your party master</span>
          </div>
          <div className="p-4 space-y-2">
            {unmappedTodayParties.map(partyName => (
              <div key={partyName} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'var(--soft)', border: '1px solid var(--line)' }}>
                <span className="text-sm font-semibold flex-1" style={{ color: 'var(--ink)' }}>{partyName}</span>
                <select
                  value={mapTypes[partyName] || 'Common Dealer'}
                  onChange={e => setMapTypes(prev => ({ ...prev, [partyName]: e.target.value }))}
                  className="px-2 py-1.5 rounded-lg text-xs outline-none font-medium"
                  style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                >
                  {PARTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button
                  onClick={() => handleMap(partyName)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:scale-105"
                  style={{ background: 'var(--teal3)' }}
                >
                  Map ✓
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add Party ── */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
        <div className="px-4 py-3 font-semibold text-sm" style={{ background: 'var(--teal)', color: '#f2ebd9' }}>
          ➕ Add Party
        </div>
        <form onSubmit={handleAdd} className="p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
              placeholder="Party name"
            />
          </div>
          <div className="w-40">
            <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Type</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none font-medium"
              style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
            >
              {PARTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button type="submit" className="px-5 py-2 rounded-lg text-sm font-bold text-white" style={{ background: 'var(--teal3)' }}>+ Add</button>
        </form>
      </div>

      {/* ── Party Master List ── */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--teal)', color: '#f2ebd9' }}>
          <span className="font-semibold text-sm">🤝 Parties ({state.parties.length})</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-1 rounded-lg text-xs bg-white/10 text-white placeholder:text-white/40 outline-none border border-white/20 w-48"
            placeholder="🔍 Search..."
          />
        </div>
        <div className="p-4">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--muted)' }}>No parties found.</div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map(p => (
                <div key={p.id} className="flex flex-col gap-2 px-3 py-2 rounded-lg transition-all hover:shadow-sm" style={{ background: 'var(--soft)' }}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{p.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                      style={{ background: 'var(--teal3)', color: '#fff', opacity: .8 }}
                    >{p.type}</span>
                    <div className="ml-auto flex items-center gap-2">
                      <button onClick={() => handlePinLocation(p.id)} className="text-xs px-2 py-1 rounded font-semibold text-white transition-all hover:scale-105" style={{ background: p.lat ? 'var(--teal)' : '#f59e0b' }}>
                        {p.lat ? '📍 Update Pin' : '📍 Pin Location'}
                      </button>
                      <button onClick={() => { removeParty(p.id); toast.success('Removed'); }} className="text-xs opacity-50 hover:opacity-100" style={{ color: 'var(--danger)' }}>✕</button>
                    </div>
                  </div>
                  {p.lat && (
                    <div className="text-[10px] font-medium opacity-70 flex items-center gap-1" style={{ color: 'var(--ink)' }}>
                      <span title={`${p.lat}, ${p.lng}`}>🗺️ {p.address || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
