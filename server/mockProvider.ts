import type { AircraftProvider } from './aircraftProvider';
import type { FlightAlert, FlightPositionUpdate } from '../src/types/flight';

type AirportCode = 'LAX' | 'SFO' | 'SEA' | 'JFK' | 'ORD' | 'ATL';

type Airport = {
  code: AirportCode;
  lat: number;
  lon: number;
};

type SimFlight = {
  flightId: string;
  callsign: string;
  origin: Airport;
  destination: Airport;
  progress: number;
  speedFactor: number;
  lowAltitudeFt: number;
  cruiseAltitudeFt: number;
  altitudeWaveFt: number;
  altitudePhase: number;
  altitudeStepFt: number;
};

const airports: Record<AirportCode, Airport> = {
  LAX: { code: 'LAX', lat: 33.9416, lon: -118.4085 },
  SFO: { code: 'SFO', lat: 37.6213, lon: -122.379 },
  SEA: { code: 'SEA', lat: 47.4502, lon: -122.3088 },
  JFK: { code: 'JFK', lat: 40.6413, lon: -73.7781 },
  ORD: { code: 'ORD', lat: 41.9742, lon: -87.9073 },
  ATL: { code: 'ATL', lat: 33.6407, lon: -84.4277 }
};

const flights: SimFlight[] = [
  createFlight('AAL128', airports.LAX, airports.JFK, 0.05, 0.008),
  createFlight('UAL442', airports.SFO, airports.ORD, 0.26, 0.01),
  createFlight('DAL983', airports.ATL, airports.SEA, 0.54, 0.007),
  createFlight('ASA611', airports.SEA, airports.SFO, 0.38, 0.014),
  createFlight('JBU204', airports.JFK, airports.LAX, 0.73, 0.009),
  createFlight('SWA271', airports.ORD, airports.ATL, 0.18, 0.012)
];

const alerts: FlightAlert[] = [
  makeAlert('AAL128', 'warning', 'weather', 'Mock weather alert near arrival corridor'),
  makeAlert('DAL983', 'info', 'delay', 'Mock ground delay update at SEA'),
  makeAlert('UAL442', 'critical', 'route', 'Mock route deviation for dispatcher review')
];

export function createMockProvider(): AircraftProvider {
  return {
    source: 'mock',
    async getSnapshot() {
      for (const flight of flights) {
        flight.progress += flight.speedFactor;
        if (flight.progress > 1) {
          const previousOrigin = flight.origin;
          flight.origin = flight.destination;
          flight.destination = previousOrigin;
          flight.progress = 0;
        }
      }

      return { flights: flights.map(toPositionUpdate), alerts };
    }
  };
}

function createFlight(
  callsign: string,
  origin: Airport,
  destination: Airport,
  progress: number,
  speedFactor: number
): SimFlight {
  return {
    flightId: callsign.toLowerCase(),
    callsign,
    origin,
    destination,
    progress,
    speedFactor,
    lowAltitudeFt: 2500 + deterministicValue(callsign, 4500),
    cruiseAltitudeFt: 27000 + deterministicValue(`${callsign}-cruise`, 12000),
    altitudeWaveFt: 3200 + deterministicValue(`${callsign}-wave`, 3800),
    altitudePhase: deterministicValue(`${callsign}-phase`, 360) * (Math.PI / 180),
    altitudeStepFt: 1200 + deterministicValue(`${callsign}-step`, 2600)
  };
}

function toPositionUpdate(flight: SimFlight): FlightPositionUpdate {
  const lat = interpolate(flight.origin.lat, flight.destination.lat, flight.progress);
  const lon = interpolate(flight.origin.lon, flight.destination.lon, flight.progress);
  const altitudeProfile = calculateAltitudeProfile(flight);
  const headingDeg = bearing(flight.origin, flight.destination);

  return {
    flightId: flight.flightId,
    callsign: flight.callsign,
    lat,
    lon,
    altitudeFt: altitudeProfile.altitudeFt,
    groundSpeedKts: altitudeProfile.groundSpeedKts,
    headingDeg,
    verticalRateFpm: altitudeProfile.verticalRateFpm,
    origin: flight.origin.code,
    destination: flight.destination.code,
    source: 'mock',
    lastSeenSeconds: 0,
    timestamp: new Date().toISOString()
  };
}

function calculateAltitudeProfile(flight: SimFlight) {
  const altitudeFt = calculateMockAltitudeFt(flight, flight.progress);
  const nextProgress = Math.min(1, flight.progress + flight.speedFactor);
  const nextAltitudeFt = calculateMockAltitudeFt(flight, nextProgress);
  const cruiseShape = getCruiseShape(flight.progress);

  return {
    altitudeFt,
    groundSpeedKts: 250 + Math.round(cruiseShape * 245),
    verticalRateFpm: Math.round((nextAltitudeFt - altitudeFt) * 60)
  };
}

function calculateMockAltitudeFt(flight: SimFlight, progress: number) {
  const cruiseShape = getCruiseShape(progress);
  const profileAltitude = interpolate(flight.lowAltitudeFt, flight.cruiseAltitudeFt, cruiseShape);
  const cruiseWave =
    Math.sin(progress * Math.PI * 10 + flight.altitudePhase) * flight.altitudeWaveFt * Math.max(0.25, cruiseShape);
  const stepChange = Math.round(Math.sin(progress * Math.PI * 5 + flight.altitudePhase) * 1.25) * flight.altitudeStepFt;
  const approachBump = Math.sin(progress * Math.PI * 17 + flight.altitudePhase * 0.6) * 850;
  const wave = cruiseWave + stepChange + approachBump;
  const altitudeFt = Math.round(profileAltitude + wave);

  return Math.max(900, altitudeFt);
}

function getCruiseShape(progress: number) {
  const climbCruiseDescent = Math.sin(progress * Math.PI);
  const shaped = Math.pow(Math.max(0, climbCruiseDescent), 0.58);

  // Add a mild stair-step profile so mock charts show level-offs and corrections, not one smooth arc.
  return Math.max(0, Math.min(1, shaped + Math.sin(progress * Math.PI * 6) * 0.08));
}

function interpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function bearing(origin: Airport, destination: Airport): number {
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);
  const deltaLon = toRadians(destination.lon - origin.lon);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function deterministicValue(seed: string, maxExclusive: number): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100000;
  }

  return hash % maxExclusive;
}

function makeAlert(
  flightId: string,
  severity: FlightAlert['severity'],
  type: FlightAlert['type'],
  message: string
): FlightAlert {
  return {
    id: `${flightId}-${type}`,
    flightId: flightId.toLowerCase(),
    severity,
    type,
    message,
    createdAt: new Date().toISOString()
  };
}
