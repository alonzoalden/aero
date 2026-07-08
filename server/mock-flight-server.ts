import { WebSocketServer } from 'ws';
import type { FlightAlert, FlightPositionUpdate, FlightStreamMessage } from '../src/types/flight';

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
  baseAltitudeFt: number;
};

const port = Number(process.env.FLIGHT_WS_PORT ?? 8787);

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
  makeAlert('AAL128', 'warning', 'weather', 'Convective weather near arrival corridor'),
  makeAlert('DAL983', 'info', 'delay', 'Ground delay program lifted at SEA'),
  makeAlert('UAL442', 'critical', 'route', 'Route deviation requires dispatcher review')
];

const server = new WebSocketServer({ port });

server.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'snapshot', flights: flights.map(toPositionUpdate), alerts } satisfies FlightStreamMessage));
});

function tick() {
  for (const flight of flights) {
    flight.progress += flight.speedFactor;
    if (flight.progress > 1) {
      const previousOrigin = flight.origin;
      flight.origin = flight.destination;
      flight.destination = previousOrigin;
      flight.progress = 0;
    }
  }

  const message = JSON.stringify({
    type: 'position',
    flight: toPositionUpdate(flights[Math.floor(Math.random() * flights.length)]),
    alerts
  } satisfies FlightStreamMessage);

  for (const client of server.clients) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }

  setTimeout(tick, 500 + Math.random() * 1500);
}

tick();

console.log(`Mock flight WebSocket server listening on ws://localhost:${port}`);

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
    baseAltitudeFt: 29000 + Math.round(Math.random() * 9000)
  };
}

function toPositionUpdate(flight: SimFlight): FlightPositionUpdate {
  const lat = interpolate(flight.origin.lat, flight.destination.lat, flight.progress);
  const lon = interpolate(flight.origin.lon, flight.destination.lon, flight.progress);
  const cruiseWave = Math.sin(flight.progress * Math.PI);
  const headingDeg = bearing(flight.origin, flight.destination);

  return {
    flightId: flight.flightId,
    callsign: flight.callsign,
    lat,
    lon,
    altitudeFt: flight.baseAltitudeFt + Math.round(cruiseWave * 4500),
    groundSpeedKts: 410 + Math.round(cruiseWave * 80),
    headingDeg,
    origin: flight.origin.code,
    destination: flight.destination.code,
    timestamp: new Date().toISOString()
  };
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
