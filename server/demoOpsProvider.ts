import type { FlightAlert, FlightPositionUpdate } from '../src/types/flight';

export type Waypoint = {
  lat: number;
  lon: number;
};

type AirportCode = 'LAX' | 'JFK' | 'ORD' | 'ATL' | 'DFW' | 'SEA' | 'SFO' | 'LAS' | 'PHX' | 'DEN' | 'SAN' | 'ONT';
type DemoRouteCategory = 'departure' | 'arrival' | 'regional' | 'cargo' | 'holding' | 'ga';

type Airport = Waypoint & {
  code: AirportCode;
};

type DemoRoute = {
  id: string;
  category: DemoRouteCategory;
  origin: AirportCode;
  destination: AirportCode;
  waypoints: Waypoint[];
  cruiseAltitudeFt: number;
  lowAltitudeFt: number;
  speedKts: number;
};

type DemoAircraft = {
  flightId: string;
  callsign: string;
  routeIndex: number;
  distanceNm: number;
  speedBias: number;
  noiseSeed: number;
  previousAltitudeFt: number;
  stalePulse: boolean;
};

export type DemoOpsProvider = {
  source: 'demo-ops';
  aircraftCount: number;
  tick: (deltaSeconds: number) => void;
  drainChangedUpdates: (timestamp?: string) => FlightPositionUpdate[];
  getSnapshot: (timestamp?: string) => FlightPositionUpdate[];
  getAlerts: (timestamp?: string) => FlightAlert[];
};

const airports: Record<AirportCode, Airport> = {
  LAX: { code: 'LAX', lat: 33.9416, lon: -118.4085 },
  JFK: { code: 'JFK', lat: 40.6413, lon: -73.7781 },
  ORD: { code: 'ORD', lat: 41.9742, lon: -87.9073 },
  ATL: { code: 'ATL', lat: 33.6407, lon: -84.4277 },
  DFW: { code: 'DFW', lat: 32.8998, lon: -97.0403 },
  SEA: { code: 'SEA', lat: 47.4502, lon: -122.3088 },
  SFO: { code: 'SFO', lat: 37.6213, lon: -122.379 },
  LAS: { code: 'LAS', lat: 36.084, lon: -115.1537 },
  PHX: { code: 'PHX', lat: 33.4342, lon: -112.0116 },
  DEN: { code: 'DEN', lat: 39.8561, lon: -104.6737 },
  SAN: { code: 'SAN', lat: 32.7338, lon: -117.1933 },
  ONT: { code: 'ONT', lat: 34.056, lon: -117.6012 }
};

const outboundDestinations: AirportCode[] = ['JFK', 'ORD', 'ATL', 'DFW', 'SEA', 'SFO', 'LAS', 'PHX', 'DEN'];
const callsignPrefixes = ['AAL', 'UAL', 'DAL', 'SWA', 'ASA', 'JBU', 'NKS', 'FFT', 'SKW'];
const cargoPrefixes = ['FDX', 'UPS'];

const routes = createRoutes();

export function createDemoOpsProvider(aircraftCount: number): DemoOpsProvider {
  const aircraft = new Map<string, DemoAircraft>();
  const changedIds = new Set<string>();
  let routeCursor = 0;
  let elapsedSeconds = 0;
  let lastTickSeconds = 1;

  for (let index = 0; index < aircraftCount; index += 1) {
    const routeIndex = pickRouteIndex(index);
    const route = routes[routeIndex];
    const totalDistance = getRouteDistanceNm(route.waypoints);
    const progressRatio = ((index * 0.173) % 1 + 1) % 1;
    const flightId = `demo-ops-${index.toString().padStart(3, '0')}`;

    aircraft.set(flightId, {
      flightId,
      callsign: createCallsign(index, route.category),
      routeIndex,
      distanceNm: totalDistance * progressRatio,
      speedBias: 0.92 + seededUnit(index + 23) * 0.2,
      noiseSeed: index * 19 + 7,
      previousAltitudeFt: route.lowAltitudeFt,
      stalePulse: index % 17 === 0
    });
    changedIds.add(flightId);
  }

  function tick(deltaSeconds: number) {
    lastTickSeconds = Math.max(deltaSeconds, 0.1);
    elapsedSeconds += deltaSeconds;
    for (const flight of aircraft.values()) {
      const route = routes[flight.routeIndex];
      const totalDistance = getRouteDistanceNm(route.waypoints);
      const profile = getAltitudeProfile(route.category, flight.distanceNm / totalDistance, route);
      const speedKts = getPhaseSpeedKts(route.category, flight.distanceNm / totalDistance, route.speedKts);
      flight.distanceNm += (speedKts * flight.speedBias * deltaSeconds) / 3600;

      if (flight.distanceNm >= totalDistance) {
        routeCursor += 1;
        const nextRouteIndex = pickRouteIndex(routeCursor + aircraft.size);
        const nextRoute = routes[nextRouteIndex];
        flight.routeIndex = nextRouteIndex;
        flight.distanceNm = (seededUnit(flight.noiseSeed + routeCursor) * 0.08) * getRouteDistanceNm(nextRoute.waypoints);
        flight.callsign = createCallsign(routeCursor + flight.noiseSeed, nextRoute.category);
        flight.previousAltitudeFt = nextRoute.lowAltitudeFt;
      } else {
        flight.previousAltitudeFt = profile.altitudeFt;
      }

      changedIds.add(flight.flightId);
    }
  }

  function drainChangedUpdates(timestamp = new Date().toISOString()) {
    const updates = Array.from(changedIds, (id) => toPositionUpdate(aircraft.get(id), timestamp, elapsedSeconds)).filter(
      isFlightPositionUpdate
    );
    changedIds.clear();
    return updates;
  }

  function getSnapshot(timestamp = new Date().toISOString()) {
    return Array.from(aircraft.values(), (flight) => toPositionUpdate(flight, timestamp, elapsedSeconds)).filter(
      isFlightPositionUpdate
    );
  }

  function getAlerts(timestamp = new Date().toISOString()) {
    const updates = getSnapshot(timestamp);
    const holding = updates.find((flight) => getRoute(flight)?.category === 'holding');
    const arrival = updates.find((flight) => getRoute(flight)?.category === 'arrival' && (flight.altitudeFt ?? 0) < 9000);
    const cargo = updates.find((flight) => flight.callsign.startsWith('FDX') || flight.callsign.startsWith('UPS'));
    const stale = updates.find((flight) => (flight.lastSeenSeconds ?? 0) > 5);
    const conflictPair = findAltitudeConflict(updates);
    const alerts: FlightAlert[] = [
      {
        id: 'demo-ops-flow-control',
        flightId: updates[0]?.flightId ?? 'demo-ops',
        severity: 'info',
        type: 'weather',
        message: 'Demo-only flow-control note: synthetic marine layer reducing west arrivals.',
        createdAt: timestamp
      }
    ];

    if (holding) {
      alerts.push({
        id: 'demo-ops-holding',
        flightId: holding.flightId,
        severity: 'warning',
        type: 'route',
        message: `${holding.callsign} demo-only holding pattern near the SoCal arrival corridor.`,
        createdAt: timestamp
      });
    }

    if (arrival) {
      alerts.push({
        id: 'demo-ops-descent-monitor',
        flightId: arrival.flightId,
        severity: 'info',
        type: 'airport',
        message: `${arrival.callsign} demo-only descent monitor: verify stabilized LAX approach profile.`,
        createdAt: timestamp
      });
    }

    if (cargo) {
      alerts.push({
        id: 'demo-ops-route-deviation',
        flightId: cargo.flightId,
        severity: 'warning',
        type: 'route',
        message: `${cargo.callsign} demo-only route deviation check for cargo arrival sequencing.`,
        createdAt: timestamp
      });
    }

    if (stale) {
      alerts.push({
        id: 'demo-ops-stale-aircraft',
        flightId: stale.flightId,
        severity: 'info',
        type: 'route',
        message: `${stale.callsign} demo-only lost update simulation; backend cache is retaining last position.`,
        createdAt: timestamp
      });
    }

    if (conflictPair) {
      alerts.push({
        id: 'demo-ops-altitude-conflict',
        flightId: conflictPair[0].flightId,
        severity: 'critical',
        type: 'route',
        message: `Demo-only altitude conflict warning between ${conflictPair[0].callsign} and ${conflictPair[1].callsign}.`,
        createdAt: timestamp
      });
    }

    return alerts;
  }

  function getRoute(flight: FlightPositionUpdate) {
    const tracked = aircraft.get(flight.flightId);
    return tracked ? routes[tracked.routeIndex] : null;
  }

  return {
    source: 'demo-ops',
    tick,
    drainChangedUpdates,
    getSnapshot,
    getAlerts,
    get aircraftCount() {
      return aircraft.size;
    }
  };

  function toPositionUpdate(
    flight: DemoAircraft | undefined,
    timestamp: string,
    seconds: number
  ): FlightPositionUpdate | undefined {
    if (!flight) {
      return undefined;
    }

    const route = routes[flight.routeIndex];
    const totalDistance = getRouteDistanceNm(route.waypoints);
    const progress = clamp(flight.distanceNm / totalDistance, 0, 1);
    const routePoint = interpolateRoute(route.waypoints, progress);
    const nextProgress = clamp(progress + 0.0025, 0, 1);
    const nextPoint = interpolateRoute(route.waypoints, nextProgress);
    const noise = getPositionNoise(flight.noiseSeed, seconds, route.category);
    const profile = getAltitudeProfile(route.category, progress, route);
    const altitudeFt = Math.round(profile.altitudeFt);
    const lastSeenSeconds =
      flight.stalePulse && Math.floor(seconds / 18) % 3 === 1 ? 6 + Math.round((seconds % 4) * 2) : 0;

    return {
      flightId: flight.flightId,
      callsign: flight.callsign,
      lat: roundCoordinate(routePoint.lat + noise.lat),
      lon: roundCoordinate(routePoint.lon + noise.lon),
      altitudeFt,
      groundSpeedKts: Math.round(getPhaseSpeedKts(route.category, progress, route.speedKts) * flight.speedBias),
      headingDeg: Math.round(calculateBearing(routePoint, nextPoint)),
      verticalRateFpm: Math.round(((altitudeFt - flight.previousAltitudeFt) / lastTickSeconds) * 60),
      origin: route.origin,
      destination: route.destination,
      source: 'demo-ops',
      lastSeenSeconds,
      timestamp
    };
  }
}

export function interpolateRoute(waypoints: Waypoint[], progress: number): Waypoint {
  if (waypoints.length === 0) {
    return { lat: 0, lon: 0 };
  }

  if (waypoints.length === 1) {
    return waypoints[0];
  }

  const clampedProgress = clamp(progress, 0, 1);
  const totalDistance = getRouteDistanceNm(waypoints);
  let remainingDistance = totalDistance * clampedProgress;

  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const start = waypoints[index];
    const end = waypoints[index + 1];
    const segmentDistance = distanceNm(start, end);

    if (remainingDistance <= segmentDistance || index === waypoints.length - 2) {
      const segmentProgress = segmentDistance === 0 ? 0 : remainingDistance / segmentDistance;
      return {
        lat: lerp(start.lat, end.lat, segmentProgress),
        lon: lerp(start.lon, end.lon, segmentProgress)
      };
    }

    remainingDistance -= segmentDistance;
  }

  return waypoints.at(-1) ?? waypoints[0];
}

export function calculateBearing(origin: Waypoint, destination: Waypoint): number {
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);
  const deltaLon = toRadians(destination.lon - origin.lon);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function getAltitudeProfile(category: DemoRouteCategory, progress: number, route: DemoRoute) {
  const clampedProgress = clamp(progress, 0, 1);
  let altitudeFt: number;

  if (category === 'arrival' || category === 'cargo') {
    altitudeFt = lerp(route.cruiseAltitudeFt, route.lowAltitudeFt, smoothstep(0.18, 0.9, clampedProgress));
  } else if (category === 'holding') {
    altitudeFt = route.cruiseAltitudeFt + Math.sin(clampedProgress * Math.PI * 6) * 350;
  } else if (category === 'ga') {
    altitudeFt = route.lowAltitudeFt + Math.sin(clampedProgress * Math.PI * 4) * 450;
  } else {
    altitudeFt = lerp(route.lowAltitudeFt, route.cruiseAltitudeFt, smoothstep(0.06, 0.72, clampedProgress));
  }

  return { altitudeFt: Math.max(500, altitudeFt) };
}

function createRoutes(): DemoRoute[] {
  const departureRoutes = outboundDestinations.map((destination, index) => {
    const initialFixes: Waypoint[][] = [
      [point(33.9, -118.65), point(34.15, -119.35), point(35.25, -119.9)],
      [point(33.82, -118.25), point(34.15, -117.75), point(35.25, -116.9)],
      [point(33.75, -118.1), point(34.05, -117.45), point(34.9, -116.7)]
    ];
    const fixes = initialFixes[index % initialFixes.length];
    const finalPoint = destinationPoint(destination);

    return createRoute(`lax-dep-${destination}`, 'departure', 'LAX', destination, [airports.LAX, ...fixes, finalPoint], {
      cruiseAltitudeFt: 28000 + (index % 4) * 3000,
      lowAltitudeFt: 1800,
      speedKts: 355 + (index % 3) * 22
    });
  });

  const arrivalRoutes = outboundDestinations.map((origin, index) => {
    const entryFixes: Waypoint[][] = [
      [point(35.6, -116.9), point(34.95, -117.5), point(34.18, -118.05), point(33.98, -118.28)],
      [point(34.8, -120.0), point(34.35, -119.35), point(34.05, -118.7), point(33.96, -118.42)],
      [point(32.9, -115.2), point(33.25, -116.25), point(33.55, -117.35), point(33.86, -118.35)]
    ];
    const fixes = entryFixes[index % entryFixes.length];

    return createRoute(`lax-arr-${origin}`, 'arrival', origin, 'LAX', [destinationPoint(origin), ...fixes, airports.LAX], {
      cruiseAltitudeFt: 30000 + (index % 4) * 3000,
      lowAltitudeFt: 1600,
      speedKts: 340 + (index % 3) * 18
    });
  });

  const regionalRoutes = [
    createRoute('regional-lax-sfo', 'regional', 'LAX', 'SFO', [airports.LAX, point(34.7, -119.2), airports.SFO], {
      cruiseAltitudeFt: 23000,
      lowAltitudeFt: 1700,
      speedKts: 310
    }),
    createRoute('regional-sfo-lax', 'regional', 'SFO', 'LAX', [airports.SFO, point(35.2, -120.3), airports.LAX], {
      cruiseAltitudeFt: 22000,
      lowAltitudeFt: 1700,
      speedKts: 300
    }),
    createRoute('regional-lax-las', 'regional', 'LAX', 'LAS', [airports.LAX, point(34.25, -117.4), airports.LAS], {
      cruiseAltitudeFt: 21000,
      lowAltitudeFt: 1800,
      speedKts: 285
    }),
    createRoute('regional-lax-san', 'regional', 'LAX', 'SAN', [airports.LAX, point(33.55, -118.0), airports.SAN], {
      cruiseAltitudeFt: 11000,
      lowAltitudeFt: 1400,
      speedKts: 230
    }),
    createRoute('regional-phx-lax', 'regional', 'PHX', 'LAX', [airports.PHX, point(33.4, -115.2), airports.LAX], {
      cruiseAltitudeFt: 26000,
      lowAltitudeFt: 1600,
      speedKts: 315
    })
  ];

  const holdingRoutes = [
    holdingRoute('hold-catalina', 'LAS', 'LAX', point(33.45, -118.48), 0.28, 9000),
    holdingRoute('hold-inland', 'PHX', 'LAX', point(34.05, -117.45), 0.24, 11000),
    holdingRoute('hold-coast', 'SFO', 'LAX', point(33.85, -119.05), 0.3, 8000)
  ];

  const gaRoutes = [
    createRoute('ga-coast', 'ga', 'SAN', 'LAX', [airports.SAN, point(33.15, -117.65), point(33.55, -118.05), airports.LAX], {
      cruiseAltitudeFt: 4500,
      lowAltitudeFt: 1200,
      speedKts: 130
    }),
    createRoute('ga-inland', 'ga', 'ONT', 'LAX', [airports.ONT, point(34.0, -117.9), point(33.9, -118.25), airports.LAX], {
      cruiseAltitudeFt: 3500,
      lowAltitudeFt: 900,
      speedKts: 105
    })
  ];

  const cargoRoutes = [
    createRoute('cargo-dfw-lax', 'cargo', 'DFW', 'LAX', [airports.DFW, point(34.5, -115.7), point(34.0, -118.0), airports.LAX], {
      cruiseAltitudeFt: 33000,
      lowAltitudeFt: 1700,
      speedKts: 360
    }),
    createRoute('cargo-lax-ord', 'cargo', 'LAX', 'ORD', [airports.LAX, point(34.3, -117.4), point(37.8, -110.8), airports.ORD], {
      cruiseAltitudeFt: 31000,
      lowAltitudeFt: 1800,
      speedKts: 350
    })
  ];

  return [...departureRoutes, ...arrivalRoutes, ...regionalRoutes, ...cargoRoutes, ...holdingRoutes, ...gaRoutes];
}

function createRoute(
  id: string,
  category: DemoRouteCategory,
  origin: AirportCode,
  destination: AirportCode,
  waypoints: Waypoint[],
  profile: Pick<DemoRoute, 'cruiseAltitudeFt' | 'lowAltitudeFt' | 'speedKts'>
): DemoRoute {
  return { id, category, origin, destination, waypoints, ...profile };
}

function holdingRoute(
  id: string,
  origin: AirportCode,
  destination: AirportCode,
  center: Waypoint,
  radiusDeg: number,
  altitudeFt: number
) {
  const waypoints = Array.from({ length: 9 }, (_, index) => {
    const angle = (index / 8) * Math.PI * 2;
    return point(center.lat + Math.sin(angle) * radiusDeg * 0.68, center.lon + Math.cos(angle) * radiusDeg);
  });

  return createRoute(id, 'holding', origin, destination, waypoints, {
    cruiseAltitudeFt: altitudeFt,
    lowAltitudeFt: altitudeFt - 500,
    speedKts: 210
  });
}

function pickRouteIndex(index: number) {
  return index % routes.length;
}

function createCallsign(index: number, category: DemoRouteCategory) {
  const prefix =
    category === 'cargo'
      ? cargoPrefixes[index % cargoPrefixes.length]
      : category === 'ga'
        ? index % 2 === 0
          ? 'N'
          : 'HLC'
        : callsignPrefixes[index % callsignPrefixes.length];
  const number = 100 + ((index * 137) % 8900);

  return prefix === 'N' ? `N${number}LA` : `${prefix}${number}`;
}

function destinationPoint(code: AirportCode): Waypoint {
  const airport = airports[code];
  if (code === 'JFK' || code === 'ORD' || code === 'ATL' || code === 'DFW' || code === 'DEN') {
    return {
      lat: lerp(airports.LAX.lat, airport.lat, 0.16),
      lon: lerp(airports.LAX.lon, airport.lon, 0.16)
    };
  }

  return airport;
}

function getPhaseSpeedKts(category: DemoRouteCategory, progress: number, baseSpeedKts: number) {
  if (category === 'holding') {
    return baseSpeedKts + Math.sin(progress * Math.PI * 4) * 12;
  }

  if (category === 'ga') {
    return baseSpeedKts + Math.sin(progress * Math.PI * 3) * 10;
  }

  const departureOrRegional = category === 'departure' || category === 'regional';
  const phaseBoost = departureOrRegional
    ? smoothstep(0.05, 0.45, progress)
    : 1 - smoothstep(0.45, 0.95, progress);

  return baseSpeedKts * (0.68 + phaseBoost * 0.32);
}

function getPositionNoise(seed: number, seconds: number, category: DemoRouteCategory) {
  const magnitude = category === 'ga' ? 0.006 : category === 'holding' ? 0.004 : 0.003;
  return {
    lat: Math.sin(seconds * 0.19 + seed) * magnitude,
    lon: Math.cos(seconds * 0.17 + seed * 1.7) * magnitude
  };
}

function findAltitudeConflict(flights: FlightPositionUpdate[]): [FlightPositionUpdate, FlightPositionUpdate] | null {
  for (let index = 0; index < flights.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < flights.length; nextIndex += 1) {
      const first = flights[index];
      const second = flights[nextIndex];
      const altitudeDelta = Math.abs((first.altitudeFt ?? 0) - (second.altitudeFt ?? 0));
      if (altitudeDelta < 650 && distanceNm(first, second) < 5) {
        return [first, second];
      }
    }
  }

  return null;
}

function getRouteDistanceNm(waypoints: Waypoint[]) {
  let distance = 0;
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    distance += distanceNm(waypoints[index], waypoints[index + 1]);
  }
  return Math.max(distance, 1);
}

function distanceNm(start: Waypoint, end: Waypoint) {
  const earthRadiusNm = 3440.065;
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLon = toRadians(end.lon - start.lon);
  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusNm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function point(lat: number, lon: number): Waypoint {
  return { lat, lon };
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(5));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function isFlightPositionUpdate(value: FlightPositionUpdate | undefined): value is FlightPositionUpdate {
  return Boolean(value);
}
