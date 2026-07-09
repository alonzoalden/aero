import type { FlightPositionUpdate } from '../src/types/flight';

type StressAircraft = {
  flightId: string;
  callsign: string;
  lat: number;
  lon: number;
  altitudeFt: number;
  groundSpeedKts: number;
  headingDeg: number;
  verticalRateFpm: number;
};

const lax = { lat: 33.9416, lon: -118.4085 };

export function createStressProvider(aircraftCount: number) {
  const aircraft = new Map<string, StressAircraft>();
  const changedIds = new Set<string>();
  const ids: string[] = [];

  for (let index = 0; index < aircraftCount; index += 1) {
    const radius = Math.sqrt(Math.random()) * 2.4;
    const angle = Math.random() * Math.PI * 2;
    const id = `stress-${index.toString().padStart(5, '0')}`;

    aircraft.set(id, {
      flightId: id,
      callsign: `LAB${index.toString().padStart(4, '0')}`,
      lat: lax.lat + Math.sin(angle) * radius,
      lon: lax.lon + Math.cos(angle) * radius,
      altitudeFt: 3000 + Math.round(Math.random() * 36000),
      groundSpeedKts: 180 + Math.round(Math.random() * 360),
      headingDeg: Math.round(Math.random() * 359),
      verticalRateFpm: Math.round(Math.random() * 1200 - 600)
    });
    ids.push(id);
    changedIds.add(id);
  }

  function ingest(rawUpdateCount: number) {
    for (let index = 0; index < rawUpdateCount; index += 1) {
      const id = ids[Math.floor(Math.random() * ids.length)];
      const current = aircraft.get(id);
      if (!current) {
        continue;
      }

      const headingJitter = Math.random() * 10 - 5;
      const headingDeg = (current.headingDeg + headingJitter + 360) % 360;
      const speed = current.groundSpeedKts / 3600;
      const distanceNm = speed * 0.25;
      const latStep = Math.cos(toRadians(headingDeg)) * distanceNm * 0.0167;
      const lonStep = Math.sin(toRadians(headingDeg)) * distanceNm * 0.0167;
      const verticalRateFpm = clamp(current.verticalRateFpm + Math.random() * 80 - 40, -1800, 1800);

      let lat = current.lat + latStep;
      let lon = current.lon + lonStep;
      if (lat < 31.8 || lat > 35.8 || lon < -121.3 || lon > -115.2) {
        lat = lax.lat + (lat - lax.lat) * 0.92;
        lon = lax.lon + (lon - lax.lon) * 0.92;
      }

      aircraft.set(id, {
        ...current,
        lat,
        lon,
        headingDeg,
        verticalRateFpm,
        altitudeFt: clamp(current.altitudeFt + verticalRateFpm / 240, 0, 43000),
        groundSpeedKts: clamp(current.groundSpeedKts + Math.random() * 8 - 4, 120, 560)
      });
      changedIds.add(id);
    }
  }

  function drainChangedUpdates(timestamp = new Date().toISOString()) {
    const updates = Array.from(changedIds, (id) => toPositionUpdate(aircraft.get(id), timestamp)).filter(
      isFlightPositionUpdate
    );
    changedIds.clear();
    return updates;
  }

  return {
    source: 'stress' as const,
    ingest,
    drainChangedUpdates,
    getSnapshot: () =>
      Array.from(aircraft.values(), (flight) => toPositionUpdate(flight, new Date().toISOString())).filter(
        isFlightPositionUpdate
      ),
    get aircraftCount() {
      return aircraft.size;
    }
  };
}

function toPositionUpdate(
  flight: StressAircraft | undefined,
  timestamp: string
): FlightPositionUpdate | undefined {
  if (!flight) {
    return undefined;
  }

  return {
    flightId: flight.flightId,
    callsign: flight.callsign,
    lat: flight.lat,
    lon: flight.lon,
    altitudeFt: Math.round(flight.altitudeFt),
    groundSpeedKts: Math.round(flight.groundSpeedKts),
    headingDeg: Math.round(flight.headingDeg),
    verticalRateFpm: Math.round(flight.verticalRateFpm),
    origin: null,
    destination: null,
    source: 'stress',
    lastSeenSeconds: 0,
    timestamp
  };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function isFlightPositionUpdate(value: FlightPositionUpdate | undefined): value is FlightPositionUpdate {
  return Boolean(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
