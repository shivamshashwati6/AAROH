import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';

// Fix for default Leaflet icon paths in bundlers
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom styled div icons for tactical command map
const createBadgeIcon = (color: string, label: string) =>
  L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="background-color: ${color}; color: white; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 11px; font-family: sans-serif; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255,255,255,0.3); text-align: center; white-space: nowrap; transform: translate(-50%, -50%); cursor: pointer;">${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

const zoneAIcon = createBadgeIcon('#ef4444', '🚨 Zone A (94/100)');
const shelterIcon = createBadgeIcon('#10b981', '🏥 Shelter B (300/800)');
const centerIcon = createBadgeIcon('#8b5cf6', '📦 Depot #3');

// Canonical coordinates for the Assam Flood Demo Scenario (Brahmaputra Basin / Barpeta Hub)
const ASSAM_CENTER: [number, number] = [26.34, 91.02];

// Canonical Locations
const ZONE_A_POS: [number, number] = [26.3216, 91.0059];
const SHELTER_B_POS: [number, number] = [26.432, 91.045];
const DEPOT_3_POS: [number, number] = [26.315, 91.012];

// Canonical Routes:
// Route A: Direct state highway (Flooded / 1.8m water) -> Blocked
const ROUTE_A_COORDS: [number, number][] = [
  DEPOT_3_POS,
  [26.35, 91.02],
  [26.39, 91.03],
  SHELTER_B_POS,
];

// Route B: Rural embankment connector -> Partial risk
const ROUTE_B_COORDS: [number, number][] = [
  DEPOT_3_POS,
  [26.31, 91.05],
  [26.36, 91.07],
  [26.41, 91.06],
  SHELTER_B_POS,
];

// Route C: High elevation bypass highway -> Accessible & Selected (17.4 km)
const ROUTE_C_COORDS: [number, number][] = [
  DEPOT_3_POS,
  [26.29, 90.98],
  [26.33, 90.95],
  [26.41, 90.99],
  [26.44, 91.02],
  SHELTER_B_POS,
];

export function CommandMap() {
  return (
    <div className="relative w-full h-[460px] rounded-xl overflow-hidden border border-[#1f2e48] shadow-2xl bg-[#0d1522]">
      {/* Map Control Overlay Header */}
      <div className="absolute top-3 left-3 z-[1000] bg-[#0d1522]/90 backdrop-blur px-3 py-1.5 rounded-lg border border-[#1f2e48] text-xs text-slate-300 flex items-center gap-3 shadow-lg pointer-events-auto">
        <span className="font-semibold text-white flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Tactical GIS View (Barpeta, Assam)
        </span>
        <span className="text-[11px] text-slate-400 font-mono">EPSG:4326</span>
      </div>

      {/* Map Legend Overlay */}
      <div className="absolute bottom-6 left-3 z-[1000] bg-[#0d1522]/95 backdrop-blur p-2.5 rounded-lg border border-[#1f2e48] text-[11px] text-slate-300 space-y-1 shadow-lg pointer-events-auto">
        <div className="font-bold text-slate-200 mb-1">Route Status Legend</div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-1 bg-red-500 rounded inline-block" />
          <span>Route A: Flooded (Blocked)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-1 bg-amber-500 rounded inline-block" />
          <span>Route B: Waterlogged (Partial)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-1 bg-emerald-500 rounded inline-block" />
          <span>Route C: Bypass (Accessible &amp; Selected)</span>
        </div>
      </div>

      <MapContainer
        center={ASSAM_CENTER}
        zoom={11}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
      >
        {/* OpenStreetMap Base Tile Layer with Mandatory Legal Attribution */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="map-tiles"
        />

        {/* Canonical Routes */}
        <Polyline
          positions={ROUTE_A_COORDS}
          pathOptions={{ color: '#ef4444', weight: 4, dashArray: '6, 8', opacity: 0.8 }}
        />
        <Polyline
          positions={ROUTE_B_COORDS}
          pathOptions={{ color: '#f59e0b', weight: 3, opacity: 0.7 }}
        />
        <Polyline
          positions={ROUTE_C_COORDS}
          pathOptions={{ color: '#10b981', weight: 5, opacity: 0.95 }}
        />

        {/* 1. Hero Zone A Marker */}
        <Marker position={ZONE_A_POS} icon={zoneAIcon}>
          <Popup className="tactical-popup">
            <div className="p-1 space-y-1 text-slate-900">
              <div className="font-bold text-sm text-red-600">Zone A (Barpeta Central)</div>
              <div className="text-xs"><strong>Priority:</strong> 94 / 100 (Critical)</div>
              <div className="text-xs"><strong>Affected Population:</strong> 3,842</div>
              <div className="text-xs"><strong>Food Deficit:</strong> 72% | <strong>Water Deficit:</strong> 61%</div>
              <div className="text-xs text-slate-600">Primary access Route A submerged.</div>
            </div>
          </Popup>
        </Marker>

        {/* 2. Shelter B Marker */}
        <Marker position={SHELTER_B_POS} icon={shelterIcon}>
          <Popup className="tactical-popup">
            <div className="p-1 space-y-1 text-slate-900">
              <div className="font-bold text-sm text-emerald-600">Shelter B (Howly Community)</div>
              <div className="text-xs"><strong>Capacity:</strong> 300 / 800 Occupied (37%)</div>
              <div className="text-xs"><strong>Distance from Zone A:</strong> 5.4 km</div>
              <div className="text-xs"><strong>Facilities:</strong> Water, Generator, Child Care</div>
            </div>
          </Popup>
        </Marker>

        {/* 3. Depot #3 Marker */}
        <Marker position={DEPOT_3_POS} icon={centerIcon}>
          <Popup className="tactical-popup">
            <div className="p-1 space-y-1 text-slate-900">
              <div className="font-bold text-sm text-purple-600">Relief Center #3 (Barpeta Depot)</div>
              <div className="text-xs"><strong>Vehicles Available:</strong> 4 Trucks, 4 Rescue Boats</div>
              <div className="text-xs"><strong>Medical Units:</strong> 5 Teams</div>
              <div className="text-xs"><strong>Status:</strong> Active Dispatch Point</div>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
