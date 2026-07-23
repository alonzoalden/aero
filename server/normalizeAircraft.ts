import type { FlightPositionUpdate } from '../src/types/flight';

export type AirplanesLiveAircraft = {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | 'ground' | null;
  alt_geom?: number | null;
  gs?: number | null;
  track?: number | null;
  baro_rate?: number | null;
  seen?: number | null;
  seen_pos?: number | null;
  messages?: number;
  type?: string;
};

export function normalizeAirplanesLiveAircraft(
  aircraft: AirplanesLiveAircraft,
  timestamp = new Date().toISOString()
): FlightPositionUpdate | null {
  if (!aircraft.hex || typeof aircraft.lat !== 'number' || typeof aircraft.lon !== 'number') {
    return null;
  }

  const lastSeenSeconds = aircraft.seen_pos ?? aircraft.seen ?? null;

  return {
    flightId: aircraft.hex.toLowerCase(),
    callsign: aircraft.flight?.trim() || aircraft.hex.toUpperCase(),
    lat: aircraft.lat,
    lon: aircraft.lon,
    altitudeFt: normalizeAltitude(aircraft.alt_baro, aircraft.alt_geom),
    groundSpeedKts: aircraft.gs ?? null,
    headingDeg: aircraft.track ?? null,
    verticalRateFpm: aircraft.baro_rate ?? null,
    origin: null,
    destination: null,
    source: 'airplanes-live',
    lastSeenSeconds,
    observedAt: deriveObservedAt(timestamp, lastSeenSeconds),
    timestamp
  };
}

export function deriveObservedAt(receivedAt: string, lastSeenSeconds: number | null): string {
  const receivedAtMs = Date.parse(receivedAt);
  if (!Number.isFinite(receivedAtMs) || lastSeenSeconds === null || !Number.isFinite(lastSeenSeconds)) {
    return receivedAt;
  }

  return new Date(receivedAtMs - Math.max(0, lastSeenSeconds) * 1000).toISOString();
}

function normalizeAltitude(
  barometricAltitude: AirplanesLiveAircraft['alt_baro'],
  geometricAltitude: AirplanesLiveAircraft['alt_geom']
) {
  if (typeof barometricAltitude === 'number') {
    return barometricAltitude;
  }

  if (barometricAltitude === 'ground') {
    return 0;
  }

  return geometricAltitude ?? null;
}
