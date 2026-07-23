import assert from 'node:assert/strict';
import test from 'node:test';
import { createFlightCollection, replaceFlights, upsertFlights } from '../src/lib/flightState';
import type { FlightPositionUpdate } from '../src/types/flight';

test('replaceFlights drops aircraft from the previous source snapshot', () => {
  const mockFlight = makeFlight('mock-1', 'mock');
  const liveFlight = makeFlight('live-1', 'airplanes-live');
  const previousState = upsertFlights(createFlightCollection(), [mockFlight]);
  const nextState = replaceFlights([liveFlight]);

  assert.equal(Object.keys(previousState.flightsById).length, 1);
  assert.equal(nextState.flightsById['mock-1'], undefined);
  assert.equal(nextState.flightsById['live-1']?.source, 'airplanes-live');
  assert.deepEqual(nextState.orderedFlightIds, ['live-1']);
});

test('upsertFlights uses observed time for history and suppresses repeated observations', () => {
  const first = makeFlight('live-1', 'airplanes-live');
  first.observedAt = '2026-07-09T11:59:58.000Z';
  const repeated = { ...first, timestamp: '2026-07-09T12:00:10.000Z' };
  const firstState = upsertFlights(createFlightCollection(), [first]);
  const repeatedState = upsertFlights(firstState, [repeated]);

  assert.equal(repeatedState.flightsById['live-1']?.track.length, 1);
  assert.equal(repeatedState.flightsById['live-1']?.track[0]?.timestamp, first.observedAt);
});

test('replaceFlights orders aircraft by callsign and then flight ID', () => {
  const bravo = makeFlight('flight-2', 'mock', 'BRAVO2');
  const alphaSecond = makeFlight('flight-3', 'mock', 'ALPHA10');
  const alphaFirst = makeFlight('flight-1', 'mock', 'ALPHA2');

  const state = replaceFlights([bravo, alphaSecond, alphaFirst]);

  assert.deepEqual(state.orderedFlightIds, ['flight-1', 'flight-3', 'flight-2']);
});

test('upsertFlights inserts new aircraft into callsign order', () => {
  const initial = replaceFlights([
    makeFlight('flight-1', 'mock', 'ALPHA1'),
    makeFlight('flight-3', 'mock', 'CHARLIE1')
  ]);

  const next = upsertFlights(initial, [makeFlight('flight-2', 'mock', 'BRAVO1')]);

  assert.deepEqual(next.orderedFlightIds, ['flight-1', 'flight-2', 'flight-3']);
});

test('upsertFlights reorders an aircraft when its callsign changes', () => {
  const initial = replaceFlights([
    makeFlight('flight-1', 'mock', 'ALPHA1'),
    makeFlight('flight-2', 'mock', 'BRAVO1')
  ]);

  const next = upsertFlights(initial, [makeFlight('flight-2', 'mock', 'AARDVARK1')]);

  assert.deepEqual(next.orderedFlightIds, ['flight-2', 'flight-1']);
});

test('position-only updates retain the ordered ID array', () => {
  const initial = replaceFlights([
    makeFlight('flight-1', 'mock', 'ALPHA1'),
    makeFlight('flight-2', 'mock', 'BRAVO1')
  ]);
  const movedFlight = { ...makeFlight('flight-2', 'mock', 'BRAVO1'), lat: 34.2 };

  const next = upsertFlights(initial, [movedFlight]);

  assert.equal(next.orderedFlightIds, initial.orderedFlightIds);
  assert.equal(next.flightsById['flight-2']?.lat, 34.2);
});

function makeFlight(
  flightId: string,
  source: FlightPositionUpdate['source'],
  callsign = flightId.toUpperCase()
): FlightPositionUpdate {
  return {
    flightId,
    callsign,
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
