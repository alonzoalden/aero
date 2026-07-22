import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFlightDisplayTransition,
  retargetFlightDisplayTransition,
  sampleFlightDisplayTransition
} from '../src/lib/flightDisplayTransition';
import type { FlightDisplayState } from '../src/lib/flightProjection';
import type { FlightState } from '../src/types/flight';

test('samples position, altitude, and heading at the transition midpoint', () => {
  const from = makeDisplay({ lat: 34, lon: -118, altitudeFt: 10_000, headingDeg: 359 });
  const to = makeDisplay({ lat: 36, lon: -116, altitudeFt: 12_000, headingDeg: 1 });
  const transition = {
    ...createFlightDisplayTransition(from, 1_000, 1_000),
    from,
    to
  };
  const sample = sampleFlightDisplayTransition(transition, 1_500);

  assert.equal(sample.lat, 35);
  assert.equal(sample.lon, -117);
  assert.equal(sample.altitudeFt, 11_000);
  assert.equal(sample.headingDeg, 360);
});

test('clamps samples before and after the transition interval', () => {
  const from = makeDisplay({ lat: 34 });
  const to = makeDisplay({ lat: 36 });
  const transition = {
    ...createFlightDisplayTransition(from, 1_000, 1_000),
    from,
    to
  };

  assert.equal(sampleFlightDisplayTransition(transition, 500).lat, 34);
  assert.equal(sampleFlightDisplayTransition(transition, 2_500).lat, 36);
});

test('retargets from the current in-flight sample without a position discontinuity', () => {
  const from = makeDisplay({ lat: 34, lon: -118 });
  const firstTarget = makeDisplay({ lat: 36, lon: -116 });
  const initial = {
    ...createFlightDisplayTransition(from, 1_000, 1_000),
    from,
    to: firstTarget
  };
  const current = sampleFlightDisplayTransition(initial, 1_500);
  const retargeted = retargetFlightDisplayTransition(
    initial,
    makeDisplay({ lat: 38, lon: -114 }),
    1_500,
    1_000
  );

  assert.equal(retargeted.from.lat, current.lat);
  assert.equal(retargeted.from.lon, current.lon);
  assert.equal(sampleFlightDisplayTransition(retargeted, 1_500).lat, current.lat);
});

test('selection changes reset immediately to the new aircraft', () => {
  const first = makeDisplay({ flightId: 'first', lat: 34 });
  const second = makeDisplay({ flightId: 'second', lat: 40 });
  const retargeted = retargetFlightDisplayTransition(
    createFlightDisplayTransition(first, 1_000, 1_000),
    second,
    1_500,
    1_000
  );

  assert.equal(retargeted.flightId, 'second');
  assert.equal(sampleFlightDisplayTransition(retargeted, 1_500).lat, 40);
});

test('uses target nullable telemetry without inventing intermediate values', () => {
  const from = makeDisplay({ altitudeFt: null, headingDeg: null });
  const to = makeDisplay({ altitudeFt: 12_000, headingDeg: 90 });
  const transition = {
    ...createFlightDisplayTransition(from, 1_000, 1_000),
    from,
    to
  };
  const sample = sampleFlightDisplayTransition(transition, 1_500);

  assert.equal(sample.altitudeFt, 12_000);
  assert.equal(sample.headingDeg, 90);
});

test('stale transitions freeze directly at the prediction horizon', () => {
  const target = makeDisplay({ lat: 36, status: 'stale' });
  const transition = createFlightDisplayTransition(target, 1_000, 1_000);

  assert.deepEqual(sampleFlightDisplayTransition(transition, 1_000), target);
});

function makeDisplay(
  overrides: Partial<FlightDisplayState> & { flightId?: string } = {}
): FlightDisplayState {
  const { flightId = 'abc123', ...displayOverrides } = overrides;
  const flight = makeFlight(flightId);

  return {
    flight,
    lat: 34,
    lon: -118,
    altitudeFt: 10_000,
    headingDeg: 90,
    status: 'estimated',
    ...displayOverrides
  };
}

function makeFlight(flightId: string): FlightState {
  return {
    flightId,
    callsign: flightId.toUpperCase(),
    lat: 34,
    lon: -118,
    altitudeFt: 10_000,
    groundSpeedKts: 400,
    headingDeg: 90,
    verticalRateFpm: 0,
    source: 'mock',
    timestamp: '2026-07-21T12:00:00.000Z',
    track: []
  };
}
