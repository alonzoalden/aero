import assert from 'node:assert/strict';
import test from 'node:test';
import { replaceFlights, upsertFlights } from '../src/lib/flightState';
import type { FlightPositionUpdate } from '../src/types/flight';

test('replaceFlights drops aircraft from the previous source snapshot', () => {
  const mockFlight = makeFlight('mock-1', 'mock');
  const liveFlight = makeFlight('live-1', 'airplanes-live');
  const previousState = upsertFlights({}, [mockFlight]);
  const nextState = replaceFlights([liveFlight]);

  assert.equal(Object.keys(previousState).length, 1);
  assert.equal(nextState['mock-1'], undefined);
  assert.equal(nextState['live-1']?.source, 'airplanes-live');
});

test('upsertFlights uses observed time for history and suppresses repeated observations', () => {
  const first = makeFlight('live-1', 'airplanes-live');
  first.observedAt = '2026-07-09T11:59:58.000Z';
  const repeated = { ...first, timestamp: '2026-07-09T12:00:10.000Z' };
  const firstState = upsertFlights({}, [first]);
  const repeatedState = upsertFlights(firstState, [repeated]);

  assert.equal(repeatedState['live-1']?.track.length, 1);
  assert.equal(repeatedState['live-1']?.track[0]?.timestamp, first.observedAt);
});

function makeFlight(flightId: string, source: FlightPositionUpdate['source']): FlightPositionUpdate {
  return {
    flightId,
    callsign: flightId.toUpperCase(),
    lat: 33.9,
    lon: -118.4,
    altitudeFt: 12000,
    groundSpeedKts: 250,
    headingDeg: 90,
    origin: 'LAX',
    destination: 'SFO',
    source,
    lastSeenSeconds: 0,
    timestamp: '2026-07-09T12:00:00.000Z'
  };
}
