import { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useInventory } from '../../context/InventoryContext';
import L from 'leaflet';
import toast from 'react-hot-toast';
import './FleetTracker.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const partyIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/149/149059.png',
  iconSize: [25, 25],
  iconAnchor: [12, 25],
});

const hubIcon = new L.DivIcon({
  html: `<div style="background-color: #4264fb; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 2px solid #fff; box-shadow: 0 0 12px rgba(66,100,251,0.8);"><span class="material-symbols-outlined" style="color: white; font-size: 17px;">warehouse</span></div>`,
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const riderScooterIcon = new L.DivIcon({
  html: `<div style="width:28px;height:28px;border-radius:9999px;background:#1e293b;border:2px solid #60a5fa;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px rgba(96,165,250,0.55);"><span style="font-size:14px;line-height:1;">&#128757;</span></div>`,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export default function FleetTracker() {
  const { state } = useInventory();
  const [isDispatchOpen, setIsDispatchOpen] = useState(false);
  const [deliveryPersons, setDeliveryPersons] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('magnus_fleet_persons') || '[]');
      if (Array.isArray(saved) && saved.length) return saved;
    } catch { }
    return [
      { id: 'dp-1', name: 'John Doe', lat: 19.3833, lng: 72.8333, status: 'Active', battery: 85, speed: 45, unit: 'Unit 402', eta: '14:32', idleMinutes: 0 },
      { id: 'dp-2', name: 'Jane Smith', lat: 19.39, lng: 72.84, status: 'Idle', battery: 60, speed: 0, unit: 'Unit 108', eta: '-', idleMinutes: 18 },
      { id: 'dp-3', name: 'Ravi Patil', lat: 19.4021, lng: 72.8642, status: 'Idle', battery: 73, speed: 0, unit: 'Unit 221', eta: '-', idleMinutes: 6 },
    ];
  });

  const [dispatches, setDispatches] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('magnus_fleet_dispatches') || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch { return []; }
  });

  const [dispatchForm, setDispatchForm] = useState({
    deliveryType: 'Standard Route',
    destinationPartyId: '',
    notes: '',
  });

  useEffect(() => {
    deliveryPersons.forEach(person => {
      if (person.status === 'Idle' && person.idleMinutes > 15) {
        toast.error(`${person.name} has been stagnant for ${person.idleMinutes} minutes!`, {
          icon: '!',
          style: { background: '#33343e', color: '#ffb4ab', border: '1px solid #93000a' },
          duration: 6000,
        });
      }
    });
  }, [deliveryPersons]);

  useEffect(() => {
    localStorage.setItem('magnus_fleet_persons', JSON.stringify(deliveryPersons));
  }, [deliveryPersons]);

  useEffect(() => {
    localStorage.setItem('magnus_fleet_dispatches', JSON.stringify(dispatches));
  }, [dispatches]);

  const mappedParties = useMemo(() => state.parties.filter(p => p.lat && p.lng), [state.parties]);
  const availableDrivers = useMemo(() => deliveryPersons.filter(d => d.status !== 'Active'), [deliveryPersons]);
  const activeDispatches = useMemo(() => dispatches.filter(d => d.status === 'Active'), [dispatches]);
  const recommendedDriver = availableDrivers[0] || deliveryPersons[0] || null;
  const nextReferenceId = `DCWR-OUT-${8800 + dispatches.length + 1}`;

  const hubLocation = [19.405722, 72.855166];

  const onExecuteDispatch = () => {
    if (!dispatchForm.destinationPartyId) return toast.error('Select a destination party first');
    if (!recommendedDriver) return toast.error('No delivery person available');

    const party = mappedParties.find((p) => String(p.id) === String(dispatchForm.destinationPartyId));
    if (!party) return toast.error('Invalid destination party');

    const newDispatch = {
      id: `disp-${Date.now()}`,
      refId: nextReferenceId,
      deliveryType: dispatchForm.deliveryType,
      destinationPartyId: party.id,
      destinationPartyName: party.name,
      destinationLat: party.lat,
      destinationLng: party.lng,
      assignedDriverId: recommendedDriver.id,
      assignedDriverName: recommendedDriver.name,
      assignedUnit: recommendedDriver.unit,
      status: 'Active',
      createdAt: new Date().toISOString(),
      notes: dispatchForm.notes || '',
    };

    setDispatches(prev => [newDispatch, ...prev]);
    setDeliveryPersons(prev => prev.map(p => p.id === recommendedDriver.id ? { ...p, status: 'Active', idleMinutes: 0, speed: 28, eta: 'In Route' } : p));
    setDispatchForm({ deliveryType: 'Standard Route', destinationPartyId: '', notes: '' });
    setIsDispatchOpen(false);
    toast.success(`Dispatch created: ${newDispatch.refId}`);
  };

  return (
    <div className="fleet-tracker-container relative w-full h-full overflow-hidden bg-fc-background text-fc-on-surface flex font-[Inter]">
      <div className="absolute inset-0 z-0">
        <MapContainer center={hubLocation} zoom={13} style={{ height: '100%', width: '100%', zIndex: 0 }}>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <Marker position={hubLocation} icon={hubIcon}><Popup>Vasai Hub</Popup></Marker>
          {mappedParties.map(party => <Marker key={`party-${party.id}`} position={[party.lat, party.lng]} icon={partyIcon}><Popup>{party.name}</Popup></Marker>)}
          {deliveryPersons.map(person => <Marker key={`person-${person.id}`} position={[person.lat, person.lng]} icon={riderScooterIcon}><Popup>{person.name} - {person.status}</Popup></Marker>)}
        </MapContainer>
      </div>

      <div className="absolute inset-0 flex justify-between p-6 pointer-events-none z-20">
        <div className="w-80 fc-glass-panel fc-ghost-border rounded-xl flex flex-col overflow-hidden pointer-events-auto h-full max-h-[calc(100vh-10rem)] shadow-2xl">
          <div className="p-4 border-b border-fc-outline-variant/20 flex justify-between items-center bg-fc-surface-container-high/40">
            <h2 className="text-[16px] font-semibold text-fc-on-surface tracking-wide">Active Fleet</h2>
            <span className="bg-fc-primary/20 text-fc-primary px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase font-[JetBrains_Mono]">{deliveryPersons.length} ONLINE</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 fc-scrollbar">
            {deliveryPersons.map(person => (
              <div key={person.id} className="bg-fc-surface-container-high/60 p-3 rounded-lg fc-ghost-border">
                <div className="flex items-center justify-between mb-2"><span className="text-[13px] font-medium text-fc-on-surface">{person.name}</span><span className="text-[10px]">{person.status}</span></div>
                <div className="text-[11px] text-fc-on-surface-variant">{person.unit} • Battery {person.battery}% • Speed {person.speed} MPH</div>
              </div>
            ))}
            <button onClick={() => setIsDispatchOpen(true)} className="w-full mt-4 bg-fc-primary-container/20 border border-fc-primary/30 text-fc-primary py-2.5 rounded text-[11px] font-bold tracking-widest uppercase">New Dispatch</button>
          </div>
        </div>

        <div className="w-96 fc-glass-panel fc-ghost-border rounded-xl p-4 pointer-events-auto h-auto max-h-[calc(100vh-10rem)] self-start shadow-2xl">
          <h2 className="text-[15px] font-semibold text-fc-on-surface tracking-wide mb-2">Route Optimizer</h2>
          <div className="text-[12px] text-fc-on-surface-variant mb-2">Recommended: {recommendedDriver?.name || 'No Driver'} ({recommendedDriver?.unit || 'N/A'})</div>
          <div className="text-[12px] text-fc-primary">Active Dispatches: {activeDispatches.length}</div>
        </div>
      </div>

      <div className={`absolute top-0 right-0 bottom-0 w-[450px] fc-glass-panel border-l border-fc-outline-variant/30 z-30 flex flex-col shadow-2xl transition-transform duration-300 transform ${isDispatchOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-fc-outline-variant/20 bg-fc-surface-container/50">
          <h2 className="text-[16px] font-semibold text-fc-on-surface tracking-wide">New Dispatch Order</h2>
          <button onClick={() => setIsDispatchOpen(false)}><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 fc-scrollbar">
          <div>
            <label className="text-[10px]">Reference ID</label>
            <input type="text" readOnly value={nextReferenceId} className="w-full bg-fc-surface-container-highest border-b-2 border-fc-outline-variant text-fc-on-surface-variant font-[JetBrains_Mono] text-[13px] px-3 py-2" />
          </div>
          <div>
            <label className="text-[10px]">Delivery Type</label>
            <select value={dispatchForm.deliveryType} onChange={(e) => setDispatchForm(f => ({ ...f, deliveryType: e.target.value }))} className="w-full bg-fc-surface-container-highest border-b-2 border-fc-outline text-fc-on-surface text-[13px] px-3 py-2">
              <option>Standard Route</option><option>Express Delivery</option><option>Return Pickup</option>
            </select>
          </div>
          <div>
            <label className="text-[10px]">Destination Party</label>
            <select value={dispatchForm.destinationPartyId} onChange={(e) => setDispatchForm(f => ({ ...f, destinationPartyId: e.target.value }))} className="w-full bg-fc-surface-container-highest border-b-2 border-fc-outline text-fc-on-surface text-[13px] px-3 py-2">
              <option value="">Select party...</option>
              {mappedParties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div className="p-6 border-t border-fc-outline-variant/20 bg-fc-surface-container/95 backdrop-blur flex justify-end gap-3 mt-auto shrink-0">
          <button onClick={() => setIsDispatchOpen(false)} className="px-5 py-2 rounded text-[11px]">Cancel</button>
          <button onClick={onExecuteDispatch} className="px-5 py-2 rounded text-[11px] bg-fc-primary-container text-fc-on-primary-container">Execute Dispatch</button>
        </div>
      </div>
    </div>
  );
}
