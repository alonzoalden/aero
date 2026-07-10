import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateMockProgressStepFromSpeed,
  calculateMockRouteDistanceNm,
  createMockProvider
} from './mockProvider';

test('mock progress advances by route distance and displayed ground speed', () => {
  const oneHourRouteNm = 450;
  const groundSpeedKts = 450;

  const progressStep = calculateMockProgressStepFromSpeed(oneHourRouteNm, groundSpeedKts);

  assert.ok(Math.abs(progressStep - 1 / 3600) < 0.000001);
});

test('mock routes stay regional enough for the default demo', async () => {
  const provider = createMockProvider();
  const { flights } = await provider.getSnapshot();

  assert.equal(flights.length, 24);
  assert.ok(flights.every((flight) => flight.source === 'mock'));
  assert.ok(flights.every((flight) => Number.isFinite(flight.lat) && Number.isFinite(flight.lon)));
  assert.ok(flights.every((flight) => Number.isFinite(flight.headingDeg)));
  assert.ok(flights.every((flight) => Number.isFinite(flight.groundSpeedKts)));
  assert.ok(flights.every((flight) => flight.origin && flight.destination));
  assert.ok(flights.every((flight) => flight.lon < -110 && flight.lon > -123));
  assert.ok(flights.every((flight) => flight.lat > 31 && flight.lat < 39));
});

test('mock route distance uses nautical miles', () => {
  const lax = { lat: 33.9416, lon: -118.4085 };
  const sfo = { lat: 37.6213, lon: -122.379 };
  const distanceNm = calculateMockRouteDistanceNm(lax, sfo);

  assert.ok(distanceNm > 290);
  assert.ok(distanceNm < 310);
});
