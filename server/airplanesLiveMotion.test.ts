import assert from 'node:assert/strict';
import test from 'node:test';
import { createAirplanesLiveMotionTracker, velocityFromSpeedAndHeading } from './airplanesLiveMotion';
import { deriveObservedAt } from './normalizeAircraft';
import type { FlightPositionUpdate } from '../src/types/flight';

test('deriveObservedAt subtracts source position age from receipt time', () => {
  assert.equal(
    deriveObservedAt('2026-07-20T12:00:10.000Z', 2.5),
    '2026-07-20T12:00:07.500Z'
  );
});

test('velocityFromSpeedAndHeading converts an eastbound track to vector components', () => {
  const velocity = velocityFromSpeedAndHeading(450, 90);

  assert.ok(velocity);
  assert.ok(Math.abs(velocity.northVelocityKts) < 0.000001);
  assert.ok(Math.abs(velocity.eastVelocityKts - 450) < 0.000001);
});

test('motion tracker smooths velocity components across north without a heading wrap', () => {
  const tracker = createAirplanesLiveMotionTracker(10_000);
  const first = tracker.enrich(makeFlight({ headingDeg: 350, observedAt: '2026-07-20T12:00:00.000Z' }));
  const second = tracker.enrich(
    makeFlight({ lat: 34.01, headingDeg: 10, observedAt: '2026-07-20T12:00:10.000Z' })
  );

  assert.ok(first.motion);
  assert.ok(second.motion);
  assert.ok(second.motion.northVelocityKts > 90);
  assert.ok(second.motion.eastVelocityKts > 0);
  assert.ok(second.motion.eastVelocityKts < 10);
});

test('motion tracker falls back to position deltas when reported velocity is missing', () => {
  const tracker = createAirplanesLiveMotionTracker(10_000);
  const first = tracker.enrich(
    makeFlight({ groundSpeedKts: null, headingDeg: null, observedAt: '2026-07-20T12:00:00.000Z' })
  );
  const second = tracker.enrich(
    makeFlight({
      lon: -118.39,
      groundSpeedKts: null,
      headingDeg: null,
      observedAt: '2026-07-20T12:00:10.000Z'
    })
  );

  assert.equal(first.motion, undefined);
  assert.ok(second.motion);
  assert.ok(second.motion.eastVelocityKts > 100);
});

test('motion tracker preserves repeated observation time and expiration', () => {
  const tracker = createAirplanesLiveMotionTracker(10_000);
  const first = tracker.enrich(makeFlight({ observedAt: '2026-07-20T12:00:00.000Z' }));
  const repeated = tracker.enrich(
    makeFlight({ timestamp: '2026-07-20T12:00:10.000Z', observedAt: '2026-07-20T12:00:10.000Z' })
  );

  assert.equal(first.motion?.validUntil, '2026-07-20T12:00:20.000Z');
  assert.equal(repeated.observedAt, first.observedAt);
  assert.equal(repeated.motion?.validUntil, first.motion?.validUntil);
});

test('motion tracker rejects ground, implausible speed, and long-gap predictions', () => {
  const groundTracker = createAirplanesLiveMotionTracker(10_000);
  assert.equal(groundTracker.enrich(makeFlight({ altitudeFt: 0 })).motion, undefined);

  const speedTracker = createAirplanesLiveMotionTracker(10_000);
  assert.equal(speedTracker.enrich(makeFlight({ groundSpeedKts: 801 })).motion, undefined);

  const gapTracker = createAirplanesLiveMotionTracker(10_000);
  gapTracker.enrich(makeFlight({ observedAt: '2026-07-20T12:00:00.000Z' }));
  const afterGap = gapTracker.enrich(
    makeFlight({ lat: 34.1, observedAt: '2026-07-20T12:01:01.000Z' })
  );
  assert.equal(afterGap.motion, undefined);
});

test('motion tracker drops an implausible vertical component but keeps horizontal motion', () => {
  const tracker = createAirplanesLiveMotionTracker(10_000);
  const flight = tracker.enrich(makeFlight({ verticalRateFpm: 8_001 }));

  assert.ok(flight.motion);
  assert.equal(flight.motion.verticalRateFpm, null);
});

function makeFlight(overrides: Partial<FlightPositionUpdate> = {}): FlightPositionUpdate {
  return {
    flightId: 'abc123',
    callsign: 'AAL123',
    lat: 34,
    lon: -118.4,
    altitudeFt: 12_000,
    groundSpeedKts: 100,
    headingDeg: 90,
    verticalRateFpm: 500,
    origin: null,
    destination: null,
    source: 'airplanes-live',
    lastSeenSeconds: 0,
    observedAt: '2026-07-20T12:00:00.000Z',
    timestamp: '2026-07-20T12:00:00.000Z',
    ...overrides
  };
}
