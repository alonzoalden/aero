import airportCatalogJson from '../public/data/live-airports.json';
import {
  defaultLiveAircraftArea,
  defaultLiveAircraftAreaId,
  type LiveAircraftArea,
  type LiveAircraftAreaCatalog,
  type LiveAircraftAreaId
} from '../src/lib/liveAircraftAreas';

const airportCatalog = airportCatalogJson as LiveAircraftAreaCatalog;
export const liveAircraftAreas = airportCatalog.airports;
const airportsById = new Map<LiveAircraftAreaId, LiveAircraftArea>(
  liveAircraftAreas.map((airport) => [airport.id, airport])
);

export const liveAircraftAreaCount = liveAircraftAreas.length;

export function getLiveAircraftArea(areaId: LiveAircraftAreaId | undefined) {
  return airportsById.get(areaId ?? defaultLiveAircraftAreaId) ?? defaultLiveAircraftArea;
}

export function isLiveAircraftAreaId(value: unknown): value is LiveAircraftAreaId {
  return typeof value === 'string' && airportsById.has(value);
}
