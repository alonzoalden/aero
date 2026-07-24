import assert from 'node:assert/strict';
import test from 'node:test';
import { createAirplanesLiveProvider } from './airplanesLiveProvider';
import type { AirplanesLiveAircraft } from './normalizeAircraft';

test('normalizes live aircraft before applying the configured limit', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ac: [
          { hex: 'invalid-without-position' },
          ...Array.from({ length: 35 }, (_, index) => makeAircraft(index))
        ]
      }),
      { status: 200 }
    );

  try {
    const provider = createAirplanesLiveProvider('https://example.test/aircraft', 10_000, 30);
    const result = await provider.getSnapshot();

    assert.equal(result.flights.length, 30);
    assert.equal(result.flights[0]?.flightId, '000000');
    assert.equal(result.flights.at(-1)?.flightId, '00001d');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns fewer aircraft than the limit without fabricating records', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ac: [makeAircraft(1), makeAircraft(2)] }), { status: 200 });

  try {
    const provider = createAirplanesLiveProvider('https://example.test/aircraft', 10_000, 60);
    const result = await provider.getSnapshot();

    assert.equal(result.flights.length, 2);
    assert.deepEqual(result.flights.map((flight) => flight.flightId), ['000001', '000002']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('filters exact-zero ground speed while retaining unknown, low positive, and zero-altitude aircraft', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ac: [
          makeAircraft(1, { gs: 0 }),
          makeAircraft(2, { gs: null }),
          makeAircraft(3, { gs: 0.1 }),
          makeAircraft(4, { alt_baro: 'ground', gs: 50 })
        ]
      }),
      { status: 200 }
    );

  try {
    const provider = createAirplanesLiveProvider('https://example.test/aircraft', 10_000, 30);
    const result = await provider.getSnapshot();

    assert.deepEqual(result.flights.map((flight) => flight.flightId), ['000002', '000003', '000004']);
    assert.equal(result.flights[0]?.groundSpeedKts, null);
    assert.equal(result.flights[1]?.groundSpeedKts, 0.1);
    assert.equal(result.flights[2]?.altitudeFt, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('filters stationary aircraft before applying the configured limit', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ac: [
          ...Array.from({ length: 5 }, (_, index) => makeAircraft(index, { gs: 0 })),
          ...Array.from({ length: 30 }, (_, index) => makeAircraft(index + 5))
        ]
      }),
      { status: 200 }
    );

  try {
    const provider = createAirplanesLiveProvider('https://example.test/aircraft', 10_000, 30);
    const result = await provider.getSnapshot();

    assert.equal(result.flights.length, 30);
    assert.equal(result.flights[0]?.flightId, '000005');
    assert.equal(result.flights.at(-1)?.flightId, '000022');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function makeAircraft(index: number, overrides: Partial<AirplanesLiveAircraft> = {}) {
  return {
    hex: index.toString(16).padStart(6, '0'),
    flight: `TEST${index}`,
    lat: 33.9 + index / 1000,
    lon: -118.4,
    alt_baro: 10_000,
    gs: 250,
    track: 90,
    seen_pos: 0,
    ...overrides
  };
}
