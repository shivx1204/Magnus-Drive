import { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useInventory } from '../../context/InventoryContext';
import L from 'leaflet';
import toast from 'react-hot-toast';
import './FleetTracker.css';

// Fix for default Leaflet icon paths in Vite/React
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

export default function FleetTracker() {
  const { state } = useInventory();
  const [isDispatchOpen, setIsDispatchOpen] = useState(false);
  
  // Hardcoded for now until Traccar is running. We will connect this to WebSocket later.
  const [deliveryPersons] = useState([
    { id: 1, name: 'John Doe', lat: 19.3833, lng: 72.8333, status: 'Active', battery: 85, speed: 45, unit: 'Unit 402', eta: '14:32', idleMinutes: 0 },
    { id: 2, name: 'Jane Smith', lat: 19.3900, lng: 72.8400, status: 'Idle', battery: 60, speed: 0, unit: 'Unit 108', eta: '-', idleMinutes: 18 },
  ]);

  useEffect(() => {
    // Check for stagnant drivers on load or data update
    deliveryPersons.forEach(person => {
      if (person.status === 'Idle' && person.idleMinutes > 15) {
        toast.error(`${person.name} has been stagnant for ${person.idleMinutes} minutes!`, {
          icon: '⚠️',
          style: {
            background: '#33343e',
            color: '#ffb4ab',
            border: '1px solid #93000a'
          },
          duration: 6000
        });
      }
    });
  }, [deliveryPersons]);

  const mappedParties = useMemo(() => {
    return state.parties.filter(p => p.lat && p.lng);
  }, [state.parties]);

  const hubLocation = [19.405722, 72.855166];
  const mapCenter = hubLocation; 

  return (
    <div className="fleet-tracker-container relative w-full h-full overflow-hidden bg-fc-background text-fc-on-surface flex font-[Inter]">
      
      {/* Background Interactive Map */}
      <div className="absolute inset-0 z-0">
        {/* Note: The dark style is handled via CartoDB Dark Matter tiles */}
        <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%', zIndex: 0 }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          
          <Marker position={hubLocation} icon={hubIcon}>
            <Popup className="fc-popup">
              <div className="text-sm font-bold text-[#111]">Vasai Hub</div>
              <div className="text-xs text-blue-600 font-bold tracking-widest uppercase mt-1">Central Dispatch</div>
            </Popup>
          </Marker>
          
          {mappedParties.map(party => (
            <Marker key={`party-${party.id}`} position={[party.lat, party.lng]} icon={partyIcon}>
              <Popup className="fc-popup">
                <div className="text-sm font-bold text-[#111]">{party.name}</div>
                <div className="text-xs text-gray-500">{party.type}</div>
              </Popup>
            </Marker>
          ))}

          {deliveryPersons.map(person => (
            <Marker key={`person-${person.id}`} position={[person.lat, person.lng]}>
              <Popup>
                <div className="text-sm font-bold">{person.name}</div>
                <div className="text-xs flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700">{person.status}</span>
                  <span className="text-gray-500">🔋 {person.battery}%</span>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        {/* Subtle dark overlay for map contrast */}
        <div className="absolute inset-0 bg-fc-background/30 pointer-events-none mix-blend-overlay z-10"></div>
      </div>

      {/* OVERLAYS */}
      <div className="absolute inset-0 flex justify-between p-6 pointer-events-none z-20">
        
        {/* Left Panel: Active Fleet */}
        <div className="w-80 fc-glass-panel fc-ghost-border rounded-xl flex flex-col overflow-hidden pointer-events-auto h-full max-h-[calc(100vh-10rem)] shadow-2xl">
          <div className="p-4 border-b border-fc-outline-variant/20 flex justify-between items-center bg-fc-surface-container-high/40">
            <h2 className="text-[16px] font-semibold text-fc-on-surface tracking-wide">Active Fleet</h2>
            <span className="bg-fc-primary/20 text-fc-primary px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase font-[JetBrains_Mono]">
              {deliveryPersons.length} ONLINE
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3 fc-scrollbar">
            {deliveryPersons.map(person => (
              <div key={person.id} className="bg-fc-surface-container-high/60 p-3 rounded-lg fc-ghost-border hover:border-fc-primary/50 transition-colors cursor-pointer group backdrop-blur-md">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-fc-primary/20 flex items-center justify-center text-xs font-bold text-fc-primary border border-fc-primary/30">
                      {person.name[0]}
                    </div>
                    <span className="text-[13px] font-medium text-fc-on-surface">{person.name}</span>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold tracking-widest uppercase font-[JetBrains_Mono] ${person.status === 'Active' ? 'bg-fc-primary/10 text-fc-primary' : person.idleMinutes > 15 ? 'bg-fc-error/20 text-fc-error animate-pulse' : 'bg-fc-tertiary/10 text-fc-tertiary'}`}>
                    {person.status === 'Active' ? 'IN TRANSIT' : person.idleMinutes > 15 ? 'STAGNANT' : 'IDLE'}
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-fc-on-surface-variant font-[JetBrains_Mono] tracking-widest mb-0.5">
                      {person.status === 'Idle' ? 'IDLE TIME' : 'ETA'}
                    </span>
                    <span className={`text-[13px] font-[JetBrains_Mono] ${person.idleMinutes > 15 ? 'text-fc-error' : 'text-fc-on-surface'}`}>
                      {person.status === 'Idle' ? `${person.idleMinutes} MIN` : person.eta}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] text-fc-on-surface-variant font-[JetBrains_Mono] tracking-widest mb-0.5">SPEED</span>
                    <span className="text-[13px] font-[JetBrains_Mono] text-fc-on-surface">{person.speed} MPH</span>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Action button inside Left Panel */}
            <button onClick={() => setIsDispatchOpen(true)} className="w-full mt-4 bg-fc-primary-container/20 border border-fc-primary/30 text-fc-primary hover:bg-fc-primary-container hover:text-fc-on-primary-container py-2.5 rounded text-[11px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 font-[JetBrains_Mono]">
              <span className="material-symbols-outlined text-[16px]">add</span>
              New Dispatch
            </button>
          </div>
        </div>

        {/* Right Panel: Smart Route Optimizer */}
        <div className="w-96 fc-glass-panel fc-ghost-border rounded-xl flex flex-col overflow-hidden pointer-events-auto h-auto max-h-[calc(100vh-10rem)] self-start shadow-2xl">
          <div className="p-4 border-b border-fc-outline-variant/20 flex justify-between items-center bg-fc-surface-container-high/40">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-fc-primary text-[18px]">route</span>
              <h2 className="text-[15px] font-semibold text-fc-on-surface tracking-wide">Route Optimizer</h2>
            </div>
          </div>
          
          <div className="p-4 bg-fc-surface-container-high/30 border-b border-fc-outline-variant/20 flex items-center justify-between backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-fc-primary/40 bg-fc-surface-container-highest flex items-center justify-center text-fc-on-surface font-bold text-sm">
                JD
              </div>
              <div>
                <div className="text-[13px] font-bold text-fc-on-surface">John Doe <span className="font-normal text-fc-on-surface-variant ml-1">- Unit 402</span></div>
                <div className="text-[11px] text-fc-primary mt-0.5 tracking-wide">Active Route • 85% Efficiency</div>
              </div>
            </div>
          </div>
          
          <div className="p-6 relative overflow-y-auto fc-scrollbar">
            {/* Vertical Line */}
            <div className="absolute left-[39px] top-8 bottom-12 w-[2px] bg-fc-outline-variant/30"></div>
            <div className="absolute left-[39px] top-8 h-[40%] w-[2px] bg-fc-primary shadow-[0_0_8px_rgba(185,195,255,0.6)]"></div>
            
            <ul className="space-y-6">
              <li className="relative flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-fc-surface-container-high border-2 border-fc-outline-variant flex items-center justify-center z-10 shrink-0">
                  <span className="material-symbols-outlined text-[14px] text-fc-outline-variant">check</span>
                </div>
                <div className="flex-1 pt-1 opacity-60">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[13px] font-semibold text-fc-on-surface">Vasai Hub (Origin)</span>
                    <span className="text-[11px] font-[JetBrains_Mono] text-fc-on-surface-variant">10:15 AM</span>
                  </div>
                  <div className="text-[9px] text-fc-on-surface-variant font-[JetBrains_Mono] tracking-widest uppercase">PICKUP COMPLETED</div>
                </div>
              </li>
              
              <li className="relative flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-fc-primary-container border-2 border-fc-primary flex items-center justify-center z-10 shadow-[0_0_12px_rgba(66,100,251,0.6)] shrink-0">
                  <div className="w-2 h-2 bg-fc-on-primary-container rounded-full animate-pulse"></div>
                </div>
                <div className="flex-1 pt-1 bg-fc-surface-container-high/40 p-3 rounded-lg fc-ghost-border backdrop-blur-md">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[13px] font-semibold text-fc-primary">Kiran Motors</span>
                    <span className="text-[11px] font-[JetBrains_Mono] text-fc-primary">ETA 14:32</span>
                  </div>
                  <div className="text-[11px] text-fc-on-surface-variant mb-2">Delivery: 4 Pallets (Engine Oil)</div>
                  <div className="flex justify-between items-center text-[9px] font-[JetBrains_Mono] border-t border-fc-outline-variant/20 pt-2 tracking-widest uppercase">
                    <span className="text-fc-on-surface-variant">NEXT STOP</span>
                    <span className="text-fc-on-surface">4.2 MILES REMAINING</span>
                  </div>
                </div>
              </li>
              
              <li className="relative flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-fc-surface-container-high border-2 border-fc-outline-variant flex items-center justify-center z-10 shrink-0">
                  <span className="material-symbols-outlined text-[14px] text-fc-on-surface-variant">location_on</span>
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[13px] font-semibold text-fc-on-surface-variant">Shree Autos</span>
                    <span className="text-[11px] font-[JetBrains_Mono] text-fc-on-surface-variant">EST 15:45</span>
                  </div>
                  <div className="text-[9px] text-fc-on-surface-variant font-[JetBrains_Mono] tracking-widest uppercase">FINAL DELIVERY</div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Slide-over Modal: New Dispatch */}
      <div className={`absolute top-0 right-0 bottom-0 w-[450px] fc-glass-panel border-l border-fc-outline-variant/30 z-30 flex flex-col shadow-2xl transition-transform duration-300 transform ${isDispatchOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-fc-outline-variant/20 bg-fc-surface-container/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-fc-primary/10 border border-fc-primary/20 flex items-center justify-center text-fc-primary">
              <span className="material-symbols-outlined text-[18px]">add_box</span>
            </div>
            <h2 className="text-[16px] font-semibold text-fc-on-surface tracking-wide">New Dispatch Order</h2>
          </div>
          <button onClick={() => setIsDispatchOpen(false)} className="text-fc-on-surface-variant hover:text-fc-error hover:bg-fc-error-container/20 rounded p-1 transition-colors flex items-center justify-center">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 fc-scrollbar">
          
          <section>
            <h3 className="text-[11px] font-[JetBrains_Mono] text-fc-primary mb-4 flex items-center gap-2 uppercase tracking-widest">
              <span className="material-symbols-outlined text-[14px]">article</span> Order Parameters
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="text-[9px] font-[JetBrains_Mono] text-fc-on-surface-variant mb-1 uppercase tracking-widest">Reference ID (DCWR)</label>
                <input type="text" readOnly value="DCWR-OUT-8834" className="bg-fc-surface-container-highest border-b-2 border-fc-outline-variant text-fc-on-surface-variant font-[JetBrains_Mono] text-[13px] px-3 py-2 outline-none cursor-not-allowed" />
              </div>
              <div className="flex flex-col">
                <label className="text-[9px] font-[JetBrains_Mono] text-fc-on-surface-variant mb-1 uppercase tracking-widest">Delivery Type</label>
                <select className="bg-fc-surface-container-highest border-b-2 border-fc-outline focus:border-fc-primary text-fc-on-surface text-[13px] px-3 py-2 outline-none appearance-none cursor-pointer transition-colors">
                  <option>Standard Route</option>
                  <option>Express Delivery</option>
                  <option>Return Pickup</option>
                </select>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[11px] font-[JetBrains_Mono] text-fc-primary mb-4 flex items-center gap-2 uppercase tracking-widest">
              <span className="material-symbols-outlined text-[14px]">route</span> Logistics Nodes
            </h3>
            <div className="relative pl-6 before:absolute before:left-[11px] before:top-4 before:bottom-4 before:w-0.5 before:bg-fc-outline-variant/30">
              
              <div className="relative mb-6">
                <div className="absolute -left-[27px] top-2.5 w-3 h-3 rounded-full border-2 border-fc-primary bg-fc-background z-10"></div>
                <label className="text-[9px] font-[JetBrains_Mono] text-fc-on-surface-variant mb-1 uppercase tracking-widest block">Origin (Hub)</label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-fc-on-surface-variant text-[16px]">warehouse</span>
                  <input type="text" value="1 Vasai Godown" className="w-full bg-fc-surface-container-highest border-b-2 border-fc-outline focus:border-fc-primary text-fc-on-surface text-[13px] pl-10 pr-3 py-2.5 outline-none transition-colors" />
                </div>
              </div>
              
              <div className="relative">
                <div className="absolute -left-[27px] top-2.5 w-3 h-3 rounded-full border-2 border-fc-error bg-fc-background z-10"></div>
                <label className="text-[9px] font-[JetBrains_Mono] text-fc-on-surface-variant mb-1 uppercase tracking-widest block">Destination (Party)</label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-fc-on-surface-variant text-[16px]">location_on</span>
                  <select className="w-full bg-fc-surface-container-highest border-b-2 border-fc-outline focus:border-fc-primary text-fc-on-surface text-[13px] pl-10 pr-3 py-2.5 outline-none transition-colors appearance-none">
                    <option value="">Select party...</option>
                    {mappedParties.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-[JetBrains_Mono] text-fc-primary flex items-center gap-2 uppercase tracking-widest">
                <span className="material-symbols-outlined text-[14px]">smart_toy</span> AI Fleet Allocation
              </h3>
              <span className="bg-fc-primary/10 text-fc-primary font-[JetBrains_Mono] text-[9px] px-2 py-0.5 rounded border border-fc-primary/20 tracking-wider">Optimal Match</span>
            </div>
            
            <div className="bg-fc-surface-container-high border border-fc-primary/30 rounded-lg p-4 relative overflow-hidden shadow-[0_0_15px_rgba(66,100,251,0.1)]">
              <div className="absolute -right-8 -top-8 w-24 h-24 bg-fc-primary/10 rounded-full blur-2xl"></div>
              <div className="flex items-start gap-4 relative z-10">
                <div className="w-12 h-12 rounded bg-fc-surface-container-highest border border-fc-outline-variant flex items-center justify-center text-xl font-bold text-fc-on-surface shadow-inner">
                  JD
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-[14px] font-semibold text-fc-on-surface leading-tight">John Doe</h4>
                      <p className="font-[JetBrains_Mono] text-[10px] text-fc-on-surface-variant mt-0.5 tracking-wide">ID: OP-402 • 2W Carrier</p>
                    </div>
                    <div className="text-right">
                      <span className="block font-[JetBrains_Mono] text-[13px] text-fc-primary">2.4 mi</span>
                      <span className="text-[8px] font-[JetBrains_Mono] text-fc-on-surface-variant uppercase tracking-widest">Proximity</span>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <div className="bg-fc-surface-container-highest border border-fc-outline-variant/30 rounded px-2 py-1 flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_#34d399]"></div>
                      <span className="text-[9px] font-[JetBrains_Mono] tracking-wide text-fc-on-surface uppercase">Available Now</span>
                    </div>
                    <div className="bg-fc-surface-container-highest border border-fc-outline-variant/30 rounded px-2 py-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px] text-fc-on-surface-variant">battery_charging_full</span>
                      <span className="font-[JetBrains_Mono] text-[9px] text-fc-on-surface tracking-wide">85%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <button className="w-full mt-3 border border-fc-outline-variant text-fc-on-surface-variant hover:text-fc-on-surface hover:bg-fc-surface-container-highest py-2 rounded text-[10px] font-[JetBrains_Mono] uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[14px]">swap_horiz</span> Browse Manual Roster
            </button>
          </section>

        </div>
        
        <div className="p-6 border-t border-fc-outline-variant/20 bg-fc-surface-container/95 backdrop-blur flex justify-end gap-3 mt-auto shrink-0">
          <button onClick={() => setIsDispatchOpen(false)} className="px-5 py-2 rounded text-[11px] font-[JetBrains_Mono] uppercase tracking-widest transition-colors border border-transparent text-fc-on-surface hover:bg-fc-surface-container-highest">
            Cancel
          </button>
          <button onClick={() => { setIsDispatchOpen(false); }} className="px-5 py-2 rounded text-[11px] font-[JetBrains_Mono] uppercase tracking-widest transition-colors bg-fc-primary-container text-fc-on-primary-container hover:bg-fc-primary-container/90 flex items-center gap-2 shadow-[0_0_10px_rgba(66,100,251,0.2)]">
            <span className="material-symbols-outlined text-[16px]">send</span> Execute Dispatch
          </button>
        </div>
      </div>
      
    </div>
  );
}
