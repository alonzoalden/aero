import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getServerAlignedNowMs,
  projectFlightForDisplay,
  unwrapHeadingDeg
} from '../src/lib/flightProjection';
import type { FlightState } from '../src/types/flight';

test('projectFlightForDisplay advances an eastbound aircraft about 1.25 nautical miles in ten seconds', () => {
  const flight = makeFlight({
    motion: {
      northVelocityKts: 0,
      eastVelocityKts: 450,
      verticalRateFpm: 1_200,
      validUntil: '2026-07-20T12:00:20.000Z'
    }
  });
  const projected = projectFlightForDisplay(flight, Date.parse('2026-07-20T12:00:10.000Z'));

  assert.equal(projected.status, 'estimated');
  assert.ok(projected.lon > flight.lon + 0.02);
  assert.ok(Math.abs(projected.lat - flight.lat) < 0.001);
  assert.equal(projected.altitudeFt, 12_200);
  assert.equal(projected.headingDeg, 90);
});

test('projectFlightForDisplay clamps motion to the prediction horizon and marks expired data stale', () => {
  const flight = makeFlight();
  const atHorizon = projectFlightForDisplay(flight, Date.parse('2026-07-20T12:00:20.000Z'));
  const afterHorizon = projectFlightForDisplay(flight, Date.parse('2026-07-20T12:00:30.000Z'));

  assert.equal(atHorizon.status, 'estimated');
  assert.equal(afterHorizon.status, 'stale');
  assert.equal(afterHorizon.lat, atHorizon.lat);
  assert.equal(afterHorizon.lon, atHorizon.lon);
  assert.equal(afterHorizon.altitudeFt, atHorizon.altitudeFt);
});

test('projectFlightForDisplay leaves flights without motion authoritative and does not mutate history', () => {
  const flight = makeFlight({ motion: undefined });
  const original = structuredClone(flight);
  const projected = projectFlightForDisplay(flight, Date.parse('2026-07-20T12:00:10.000Z'));

  assert.equal(projected.status, 'observed');
  assert.equal(projected.lat, flight.lat);
  assert.equal(projected.lon, flight.lon);
  assert.deepEqual(flight, original);
});

test('projection helpers align server time and unwrap the shortest heading change', () => {
  assert.equal(getServerAlignedNowMs(1_000, 250), 1_250);
  assert.equal(unwrapHeadingDeg(359, 1), 361);
  assert.equal(unwrapHeadingDeg(1, 359), -1);
});

function makeFlight(overrides: Partial<FlightState> = {}): FlightState {
  return {
    flightId: 'abc123',
    callsign: 'AAL123',
    lat: 34,
    lon: -118.4,
    altitudeFt: 12_000,
    groundSpeedKts: 450,
    headingDeg: 90,
    verticalRateFpm: 1_200,
    source: 'airplanes-live',
    observedAt: '2026-07-20T12:00:00.000Z',
    timestamp: '2026-07-20T12:00:01.000Z',
    motion: {
      northVelocityKts: 450,
      eastVelocityKts: 0,
      verticalRateFpm: 1_200,
      validUntil: '2026-07-20T12:00:20.000Z'
    },
    track: [
      {
        lat: 34,
        lon: -118.4,
        altitudeFt: 12_000,
        groundSpeedKts: 450,
        headingDeg: 90,
        timestamp: '2026-07-20T12:00:00.000Z'
      }
    ],
    ...overrides
  };
}
