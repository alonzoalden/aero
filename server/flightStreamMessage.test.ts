import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFlightStreamMessage } from '../src/lib/flightStreamMessage';
import type { FlightStreamMessage } from '../src/types/flight';

const validMessage: FlightStreamMessage = {
  type: 'batch',
  flights: [
    {
      flightId: 'AAL123',
      callsign: 'AAL123',
      lat: 33.94,
      lon: -118.4,
      altitudeFt: 12000,
      groundSpeedKts: 310,
      headingDeg: 270,
      verticalRateFpm: null,
      origin: 'LAX',
      destination: 'SFO',
      source: 'mock',
      lastSeenSeconds: null,
      timestamp: '2026-07-09T12:00:00.000Z'
    }
  ],
  alerts: [],
  status: {
    source: 'mock',
    connectedClients: 1,
    aircraftCount: 1,
    lastPollTimestamp: '2026-07-09T12:00:00.000Z',
    lastBroadcastTimestamp: '2026-07-09T12:00:00.000Z'
  },
  sequence: 1,
  serverTimestamp: '2026-07-09T12:00:00.000Z'
};

test('parseFlightStreamMessage accepts a valid stream frame', () => {
  assert.deepEqual(parseFlightStreamMessage(JSON.stringify(validMessage)), validMessage);
});

test('parseFlightStreamMessage rejects invalid JSON', () => {
  assert.equal(parseFlightStreamMessage('{not-json'), null);
});

test('parseFlightStreamMessage rejects structurally invalid stream frames', () => {
  assert.equal(parseFlightStreamMessage(JSON.stringify({ ...validMessage, flights: [{ ...validMessage.flights[0], lat: 'bad' }] })), null);
  assert.equal(parseFlightStreamMessage(JSON.stringify({ ...validMessage, type: 'unknown' })), null);
});

test('parseFlightStreamMessage accepts optional motion metadata and rejects malformed vectors', () => {
  const flight = validMessage.flights[0];
  const withMotion = {
    ...validMessage,
    flights: [
      {
        ...flight,
        observedAt: '2026-07-09T11:59:59.000Z',
        motion: {
          northVelocityKts: 100,
          eastVelocityKts: 200,
          verticalRateFpm: null,
          validUntil: '2026-07-09T12:00:20.000Z'
        }
      }
    ]
  };

  assert.deepEqual(parseFlightStreamMessage(JSON.stringify(withMotion)), withMotion);
  assert.equal(
    parseFlightStreamMessage(
      JSON.stringify({
        ...withMotion,
        flights: [{ ...withMotion.flights[0], motion: { ...withMotion.flights[0].motion, eastVelocityKts: 'bad' } }]
      })
    ),
    null
  );
});
