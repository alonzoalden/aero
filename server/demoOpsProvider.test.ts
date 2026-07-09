import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateBearing,
  createDemoOpsProvider,
  getAltitudeProfile,
  interpolateRoute,
  type Waypoint
} from './demoOpsProvider';

test('interpolateRoute follows multi-point segment distance', () => {
  const route: Waypoint[] = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 1 },
    { lat: 1, lon: 1 }
  ];

  const midpoint = interpolateRoute(route, 0.5);

  assert.ok(Math.abs(midpoint.lat) < 0.05);
  assert.ok(Math.abs(midpoint.lon - 1) < 0.05);
});

test('calculateBearing returns compass heading', () => {
  assert.ok(Math.abs(calculateBearing({ lat: 33.9, lon: -118.4 }, { lat: 34.9, lon: -118.4 })) < 1);
  assert.ok(Math.abs(calculateBearing({ lat: 33.9, lon: -118.4 }, { lat: 33.9, lon: -117.4 }) - 90) < 1);
});

test('altitude profile climbs for departures and descends for arrivals', () => {
  const route = {
    id: 'test',
    category: 'departure' as const,
    origin: 'LAX' as const,
    destination: 'JFK' as const,
    waypoints: [],
    cruiseAltitudeFt: 30000,
    lowAltitudeFt: 2000,
    speedKts: 320
  };

  const departureStart = getAltitudeProfile('departure', 0.1, route).altitudeFt;
  const departureEnd = getAltitudeProfile('departure', 0.8, route).altitudeFt;
  const arrivalStart = getAltitudeProfile('arrival', 0.1, route).altitudeFt;
  const arrivalEnd = getAltitudeProfile('arrival', 0.9, route).altitudeFt;

  assert.ok(departureEnd > departureStart);
  assert.ok(arrivalEnd < arrivalStart);
});

test('demo provider emits valid demo-ops flight updates', () => {
  const provider = createDemoOpsProvider(8);

  provider.tick(0.5);
  const updates = provider.drainChangedUpdates('2026-07-09T12:00:00.000Z');

  assert.equal(updates.length, 8);
  assert.ok(updates.every((flight) => flight.source === 'demo-ops'));
  assert.ok(updates.every((flight) => flight.flightId.startsWith('demo-ops-')));
  assert.ok(updates.every((flight) => flight.origin && flight.destination));
  assert.ok(updates.every((flight) => Number.isFinite(flight.lat) && Number.isFinite(flight.lon)));
  assert.ok(updates.every((flight) => Number.isFinite(flight.altitudeFt)));
  assert.ok(updates.every((flight) => Number.isFinite(flight.groundSpeedKts)));
  assert.ok(updates.every((flight) => Number.isFinite(flight.headingDeg)));
});

test('demo provider updates heading for displayed low-altitude tracks', () => {
  const provider = createDemoOpsProvider(30);
  const headings = new Set<number>();

  for (let index = 0; index < 12; index += 1) {
    provider.tick(1 / 3);
    const helicopterLikeTrack = provider.getSnapshot().find((flight) => flight.callsign.startsWith('HLC'));
    assert.ok(helicopterLikeTrack);
    headings.add(helicopterLikeTrack.headingDeg ?? -1);
  }

  assert.ok(headings.size > 1);
});
