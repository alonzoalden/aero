import assert from 'node:assert/strict';
import test from 'node:test';
import { readRuntimeSourceConfiguration } from './sourceConfiguration';

test('accepts every supported live aircraft limit', () => {
  for (const aircraftLimit of [30, 60, 100]) {
    assert.deepEqual(readRuntimeSourceConfiguration({ source: 'airplanes-live', aircraftLimit }), {
      configuration: { source: 'airplanes-live', aircraftLimit }
    });
  }
});

test('keeps source-only requests backward compatible', () => {
  assert.deepEqual(readRuntimeSourceConfiguration({ source: 'airplanes-live' }), {
    configuration: { source: 'airplanes-live' }
  });
  assert.deepEqual(readRuntimeSourceConfiguration({ source: 'mock' }), {
    configuration: { source: 'mock' }
  });
});

test('accepts supported live airport changes independently of the aircraft limit', () => {
  assert.deepEqual(readRuntimeSourceConfiguration({ source: 'airplanes-live', areaId: 'KJFK' }), {
    configuration: { source: 'airplanes-live', areaId: 'KJFK' }
  });
  assert.deepEqual(
    readRuntimeSourceConfiguration({ source: 'airplanes-live', aircraftLimit: 100, areaId: 'EGLL' }),
    { configuration: { source: 'airplanes-live', aircraftLimit: 100, areaId: 'EGLL' } }
  );
});

test('rejects unsupported, malformed, and source-incompatible limits', () => {
  assert.match(readRuntimeSourceConfiguration({ source: 'airplanes-live', aircraftLimit: 50 }).error ?? '', /30, 60, 100/);
  assert.match(readRuntimeSourceConfiguration({ source: 'airplanes-live', aircraftLimit: '30' }).error ?? '', /30, 60, 100/);
  assert.match(readRuntimeSourceConfiguration({ source: 'mock', aircraftLimit: 30 }).error ?? '', /only supported/);
  assert.match(readRuntimeSourceConfiguration({ source: 'mock', areaId: 'KJFK' }).error ?? '', /only supported/);
  assert.match(readRuntimeSourceConfiguration({ source: 'airplanes-live', areaId: 'unknown' }).error ?? '', /areaId/);
  assert.match(readRuntimeSourceConfiguration({ source: 'unknown' }).error ?? '', /source must be/);
});
