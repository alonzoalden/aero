import type { AircraftProvider } from './aircraftProvider';
import type { FlightAlert, FlightPositionUpdate } from '../src/types/flight';

type AirportCode = 'LAX' | 'SFO' | 'LAS' | 'SAN' | 'PHX' | 'ONT';

type Airport = {
  code: AirportCode;
  lat: number;
  lon: number;
};

type GeoPoint = {
  lat: number;
  lon: number;
};

type SimFlight = {
  flightId: string;
  callsign: string;
  origin: Airport;
  destination: Airport;
  progress: number;
  cruiseGroundSpeedKts: number;
  lowAltitudeFt: number;
  cruiseAltitudeFt: number;
  altitudeWaveFt: number;
  altitudePhase: number;
  altitudeStepFt: number;
  headingWaveDeg: number;
  headingPhase: number;
  lateralWaveNm: number;
};

const airports: Record<AirportCode, Airport> = {
  LAX: { code: 'LAX', lat: 33.9416, lon: -118.4085 },
  SFO: { code: 'SFO', lat: 37.6213, lon: -122.379 },
  LAS: { code: 'LAS', lat: 36.084, lon: -115.1537 },
  SAN: { code: 'SAN', lat: 32.7338, lon: -117.1933 },
  PHX: { code: 'PHX', lat: 33.4342, lon: -112.0116 },
  ONT: { code: 'ONT', lat: 34.0559, lon: -117.6012 }
};

const flights: SimFlight[] = [
  createFlight('AAL128', airports.LAX, airports.SFO, 0.05, 430),
  createFlight('UAL442', airports.SFO, airports.LAX, 0.26, 420),
  createFlight('DAL983', airports.LAX, airports.LAS, 0.54, 360),
  createFlight('ASA611', airports.SAN, airports.SFO, 0.38, 390),
  createFlight('JBU204', airports.PHX, airports.LAX, 0.73, 410),
  createFlight('SWA271', airports.ONT, airports.LAS, 0.18, 310),
  createFlight('SKW732', airports.SFO, airports.SAN, 0.12, 345),
  createFlight('NKS419', airports.LAS, airports.LAX, 0.44, 385),
  createFlight('FFT908', airports.PHX, airports.SFO, 0.31, 405),
  createFlight('AAL287', airports.LAX, airports.PHX, 0.66, 395),
  createFlight('UAL119', airports.SFO, airports.LAS, 0.58, 415),
  createFlight('DAL774', airports.SAN, airports.LAX, 0.22, 285),
  createFlight('ASA506', airports.SFO, airports.ONT, 0.81, 375),
  createFlight('JBU631', airports.LAS, airports.SAN, 0.49, 350),
  createFlight('SWA884', airports.PHX, airports.ONT, 0.09, 330),
  createFlight('SKW245', airports.ONT, airports.SFO, 0.35, 340),
  createFlight('NKS702', airports.LAX, airports.SAN, 0.61, 300),
  createFlight('FFT312', airports.LAS, airports.PHX, 0.27, 325),
  createFlight('AAL915', airports.SFO, airports.PHX, 0.76, 425),
  createFlight('UAL683', airports.SAN, airports.LAS, 0.15, 355),
  createFlight('DAL430', airports.ONT, airports.LAX, 0.52, 260),
  createFlight('ASA178', airports.LAX, airports.ONT, 0.41, 255),
  createFlight('JBU957', airports.PHX, airports.SAN, 0.68, 390),
  createFlight('SWA536', airports.LAS, airports.SFO, 0.88, 400)
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
        flight.progress += calculateMockProgressStep(flight);
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
  cruiseGroundSpeedKts: number
): SimFlight {
  return {
    flightId: callsign.toLowerCase(),
    callsign,
    origin,
    destination,
    progress,
    cruiseGroundSpeedKts,
    lowAltitudeFt: 2500 + deterministicValue(callsign, 4500),
    cruiseAltitudeFt: 27000 + deterministicValue(`${callsign}-cruise`, 12000),
    altitudeWaveFt: 3200 + deterministicValue(`${callsign}-wave`, 3800),
    altitudePhase: deterministicValue(`${callsign}-phase`, 360) * (Math.PI / 180),
    altitudeStepFt: 1200 + deterministicValue(`${callsign}-step`, 2600),
    headingWaveDeg: 8 + deterministicValue(`${callsign}-heading-wave`, 22),
    headingPhase: deterministicValue(`${callsign}-heading-phase`, 360) * (Math.PI / 180),
    lateralWaveNm: 12 + deterministicValue(`${callsign}-lateral-wave`, 26)
  };
}

function toPositionUpdate(flight: SimFlight): FlightPositionUpdate {
  const position = calculateMockPosition(flight, flight.progress);
  const altitudeProfile = calculateAltitudeProfile(flight);
  const headingDeg = calculateMockHeadingDeg(flight);

  return {
    flightId: flight.flightId,
    callsign: flight.callsign,
    lat: position.lat,
    lon: position.lon,
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

function calculateMockHeadingDeg(flight: SimFlight) {
  const progressStep = calculateMockProgressStep(flight);
  const previousProgress = Math.max(0, flight.progress - progressStep * 2);
  const nextProgress = Math.min(1, flight.progress + progressStep * 2);
  const previousPosition = calculateMockPosition(flight, previousProgress);
  const nextPosition = calculateMockPosition(flight, nextProgress);
  const correctionTurn = Math.sin(flight.progress * Math.PI * 9 + flight.headingPhase * 0.7) * 3;

  return Math.round((bearing(previousPosition, nextPosition) + correctionTurn + 360) % 360);
}

function calculateMockPosition(flight: SimFlight, progress: number): GeoPoint {
  const routePosition = {
    lat: interpolate(flight.origin.lat, flight.destination.lat, progress),
    lon: interpolate(flight.origin.lon, flight.destination.lon, progress)
  };
  const routeHeading = bearing(flight.origin, flight.destination);
  const routeHeadingRad = toRadians(routeHeading);
  const midpointLatRad = toRadians(routePosition.lat);
  const routeEnvelope = Math.sin(progress * Math.PI);
  const broadTurn = Math.sin(progress * Math.PI * 2 + flight.headingPhase) * flight.headingWaveDeg;
  const localTurn = Math.sin(progress * Math.PI * 6 + flight.headingPhase * 0.5) * flight.headingWaveDeg * 0.24;
  const lateralOffsetNm = routeEnvelope * flight.lateralWaveNm * ((broadTurn + localTurn) / flight.headingWaveDeg);
  const perpendicularHeadingRad = routeHeadingRad + Math.PI / 2;
  const latOffset = (Math.cos(perpendicularHeadingRad) * lateralOffsetNm) / 60;
  const lonOffset = (Math.sin(perpendicularHeadingRad) * lateralOffsetNm) / (60 * Math.max(0.2, Math.cos(midpointLatRad)));

  return {
    lat: routePosition.lat + latOffset,
    lon: routePosition.lon + lonOffset
  };
}

function calculateAltitudeProfile(flight: SimFlight) {
  const altitudeFt = calculateMockAltitudeFt(flight, flight.progress);
  const nextProgress = Math.min(1, flight.progress + calculateMockProgressStep(flight));
  const nextAltitudeFt = calculateMockAltitudeFt(flight, nextProgress);

  return {
    altitudeFt,
    groundSpeedKts: calculateMockGroundSpeedKts(flight, flight.progress),
    verticalRateFpm: Math.round((nextAltitudeFt - altitudeFt) * 60)
  };
}

function calculateMockProgressStep(
  flight: Pick<SimFlight, 'origin' | 'destination' | 'progress' | 'cruiseGroundSpeedKts' | 'headingPhase'>
) {
  const routeDistanceNm = calculateMockRouteDistanceNm(flight.origin, flight.destination);
  const groundSpeedKts = calculateMockGroundSpeedKts(flight, flight.progress);

  return calculateMockProgressStepFromSpeed(routeDistanceNm, groundSpeedKts);
}

export function calculateMockProgressStepFromSpeed(routeDistanceNm: number, groundSpeedKts: number) {
  const nauticalMilesPerSecond = groundSpeedKts / 3600;

  return nauticalMilesPerSecond / Math.max(1, routeDistanceNm);
}

export function calculateMockRouteDistanceNm(origin: GeoPoint, destination: GeoPoint): number {
  const earthRadiusNm = 3440.065;
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);
  const deltaLat = toRadians(destination.lat - origin.lat);
  const deltaLon = toRadians(destination.lon - origin.lon);
  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  return 2 * earthRadiusNm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function calculateMockGroundSpeedKts(
  flight: Pick<SimFlight, 'progress' | 'cruiseGroundSpeedKts' | 'headingPhase'>,
  progress: number
) {
  const cruiseShape = getCruiseShape(progress);
  const routeEndDamping = Math.max(0.5, Math.sin(progress * Math.PI));
  const speedWave = Math.sin(progress * Math.PI * 4 + flight.headingPhase) * 18;
  const speedKts = 165 + (flight.cruiseGroundSpeedKts - 165) * cruiseShape * routeEndDamping + speedWave;

  return Math.max(95, Math.round(speedKts));
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

function bearing(origin: GeoPoint, destination: GeoPoint): number {
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
