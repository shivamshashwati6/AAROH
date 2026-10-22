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

const ASSAM_CENTER: [number, number] = [26.34, 91.02];

export interface MapZone {
  id: string;
  name: string;
  location_lat: number;
  location_lng: number;
  priority_score: number;
  band: string;
  affected_population: number;
  medical_risk?: string;
}

export interface MapShelter {
  id: string;
  name: string;
  location_lat: number;
  location_lng: number;
  capacity: number;
  occupied: number;
  occupancy_pct: number;
  facilities: string[];
}

export interface MapCenter {
  id: string;
  name: string;
  location_lat: number;
  location_lng: number;
  vehicles_available: number;
  boats_available: number;
  medical_teams_available: number;
  total_fleet: number;
}

export interface MapRoad {
  id: string;
  name: string;
  status: 'accessible' | 'partial' | 'blocked';
  length_km: number;
  risk_score: number;
  geometry?: {
    type: string;
    coordinates: [number, number][]; // [lng, lat]
  } | null;
}

export interface CommandMapProps {
  zones?: MapZone[];
  shelters?: MapShelter[];
  centers?: MapCenter[];
  roads?: MapRoad[];
  selectedZoneId?: string;
  onSelectZone?: (id: string) => void;
}

export function CommandMap({
  zones = [],
  shelters = [],
  centers = [],
  roads = [],
  selectedZoneId = 'zone-a',
  onSelectZone,
}: CommandMapProps) {
  const getRouteStyle = (status: 'accessible' | 'partial' | 'blocked') => {
    switch (status) {
      case 'blocked':
        return { color: '#ef4444', weight: 4, dashArray: '6, 8', opacity: 0.85 };
      case 'partial':
        return { color: '#f59e0b', weight: 3, dashArray: '4, 4', opacity: 0.75 };
      case 'accessible':
      default:
        return { color: '#10b981', weight: 5, opacity: 0.95 };
    }
  };

  // Find canonical hero items if present in API data
  const zoneA = zones.find((z) => z.id === 'zone-a');
  const shelterB = shelters.find((s) => s.id === 'shelter-2');
  const depot3 = centers.find((c) => c.id === 'center-3');

  // Filter remaining zones to display top critical points without map clutter
  const otherZones = zones.filter((z) => z.id !== 'zone-a').slice(0, 4);

  return (
    <div className="relative w-full h-[480px] rounded-xl overflow-hidden border border-[#1f2e48] shadow-2xl bg-[#0d1522]">
      {/* Map Control Overlay Header */}
      <div className="absolute top-3 left-3 z-[1000] bg-[#0d1522]/90 backdrop-blur px-3 py-1.5 rounded-lg border border-[#1f2e48] text-xs text-slate-300 flex items-center gap-3 shadow-lg pointer-events-auto">
        <span className="font-semibold text-white flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Tactical GIS View (Barpeta, Assam)
        </span>
        <span className="text-[11px] text-slate-400 font-mono">PostGIS EPSG:4326</span>
      </div>

      {/* Map Legend Overlay */}
      <div className="absolute bottom-6 left-3 z-[1000] bg-[#0d1522]/95 backdrop-blur p-2.5 rounded-lg border border-[#1f2e48] text-[11px] text-slate-300 space-y-1.5 shadow-lg pointer-events-auto max-w-[260px]">
        <div className="font-bold text-slate-200">Live PostGIS Infrastructure</div>
        {roads.length === 0 ? (
          <div className="text-slate-500 italic text-[10px]">No route overlays loaded</div>
        ) : (
          roads.map((road) => (
            <div key={road.id} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-3.5 h-1 rounded inline-block ${
                    road.status === 'blocked'
                      ? 'bg-red-500'
                      : road.status === 'partial'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                />
                <span className="truncate max-w-[130px]">{road.name}</span>
              </span>
              <span
                className={`text-[10px] font-mono uppercase font-bold ${
                  road.status === 'blocked'
                    ? 'text-red-400'
                    : road.status === 'partial'
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {road.status}
              </span>
            </div>
          ))
        )}
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

        {/* Dynamic PostGIS Route Polylines */}
        {roads.map((road) => {
          const coords = road.geometry?.coordinates;
          if (!Array.isArray(coords) || coords.length < 2) {
            return null;
          }

          // PostGIS coordinates are [lng, lat] (EPSG:4326), Leaflet requires [lat, lng]
          const latLngPositions: [number, number][] = coords
            .filter((pt): pt is [number, number] => Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number')
            .map(([lng, lat]) => [lat, lng]);

          if (latLngPositions.length < 2) {
            return null;
          }

          return (
            <Polyline
              key={road.id}
              positions={latLngPositions}
              pathOptions={getRouteStyle(road.status)}
            >
              <Popup className="tactical-popup">
                <div className="p-1 space-y-1 text-slate-900 text-xs">
                  <div className="font-bold text-sm text-slate-900">{road.name}</div>
                  <div><strong>Status:</strong> <span className="uppercase font-semibold">{road.status}</span></div>
                  <div><strong>Length:</strong> {road.length_km} km</div>
                  <div><strong>Risk Score:</strong> {road.risk_score} / 100</div>
                </div>
              </Popup>
            </Polyline>
          );
        })}

        {/* 1. Hero Zone A Marker */}
        {zoneA && (
          <Marker
            position={[zoneA.location_lat, zoneA.location_lng]}
            icon={createBadgeIcon(
              selectedZoneId === 'zone-a' ? '#ef4444' : '#b91c1c',
              `🚨 Zone A (${zoneA.priority_score}/100)`
            )}
            eventHandlers={{
              click: () => onSelectZone && onSelectZone('zone-a'),
            }}
          >
            <Popup className="tactical-popup">
              <div className="p-1 space-y-1 text-slate-900">
                <div className="font-bold text-sm text-red-600">
                  {zoneA.name}
                </div>
                <div className="text-xs">
                  <strong>Priority:</strong> {zoneA.priority_score} / 100 ({zoneA.band})
                </div>
                <div className="text-xs">
                  <strong>Affected Population:</strong> {zoneA.affected_population.toLocaleString()}
                </div>
                <div className="text-xs">
                  <strong>Medical Urgency:</strong> {zoneA.medical_risk ? zoneA.medical_risk.toUpperCase() : 'CRITICAL'}
                </div>
                <div className="text-xs text-slate-600">
                  Primary access Route A submerged. Sourcing aid from Depot #3 via Route C.
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Other Critical Zone Markers */}
        {otherZones.map((z) => (
          <Marker
            key={z.id}
            position={[z.location_lat, z.location_lng]}
            icon={createBadgeIcon(
              selectedZoneId === z.id ? '#f97316' : z.band === 'Critical' ? '#dc2626' : '#ea580c',
              `⚠️ ${z.id.toUpperCase()} (${z.priority_score})`
            )}
            eventHandlers={{
              click: () => onSelectZone && onSelectZone(z.id),
            }}
          >
            <Popup className="tactical-popup">
              <div className="p-1 space-y-1 text-slate-900">
                <div className="font-bold text-xs text-slate-800">{z.name}</div>
                <div className="text-[11px]">
                  <strong>Priority:</strong> {z.priority_score}/100 ({z.band})
                </div>
                <div className="text-[11px]">
                  <strong>Affected:</strong> {z.affected_population.toLocaleString()}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* 2. Shelter B Marker */}
        {shelterB && (
          <Marker
            position={[shelterB.location_lat, shelterB.location_lng]}
            icon={createBadgeIcon(
              '#10b981',
              `🏥 Shelter B (${shelterB.occupied}/${shelterB.capacity})`
            )}
          >
            <Popup className="tactical-popup">
              <div className="p-1 space-y-1 text-slate-900">
                <div className="font-bold text-sm text-emerald-600">
                  {shelterB.name}
                </div>
                <div className="text-xs">
                  <strong>Capacity:</strong> {shelterB.occupied} / {shelterB.capacity} Occupied (
                  {shelterB.occupancy_pct}%)
                </div>
                <div className="text-xs">
                  <strong>Available Spaces:</strong> {shelterB.capacity - shelterB.occupied} beds
                </div>
                <div className="text-xs">
                  <strong>Facilities:</strong> {(shelterB.facilities || ['water', 'generator', 'child_care']).join(', ')}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* 3. Depot #3 Marker */}
        {depot3 && (
          <Marker
            position={[depot3.location_lat, depot3.location_lng]}
            icon={createBadgeIcon('#8b5cf6', '📦 Depot #3 (Barpeta)')}
          >
            <Popup className="tactical-popup">
              <div className="p-1 space-y-1 text-slate-900">
                <div className="font-bold text-sm text-purple-600">
                  {depot3.name}
                </div>
                <div className="text-xs">
                  <strong>Vehicles Available:</strong> {depot3.vehicles_available} Trucks, {depot3.boats_available} Rescue Boats
                </div>
                <div className="text-xs">
                  <strong>Medical Response:</strong> {depot3.medical_teams_available} Teams
                </div>
                <div className="text-xs">
                  <strong>Total Fleet:</strong> {depot3.total_fleet} Units
                </div>
                <div className="text-xs text-slate-600">
                  Designated dispatch depot for Zone A response plan.
                </div>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

export default CommandMap;
