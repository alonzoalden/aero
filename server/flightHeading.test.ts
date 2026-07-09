import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBearingDeg, getTrackHeadingDeg } from '../src/lib/flightHeading';

test('calculateBearingDeg returns compass heading from rendered movement', () => {
  assert.ok(Math.abs(calculateBearingDeg({ lat: 33.9, lon: -118.4 }, { lat: 34.9, lon: -118.4 })) < 1);
  assert.ok(Math.abs(calculateBearingDeg({ lat: 33.9, lon: -118.4 }, { lat: 33.9, lon: -117.4 }) - 90) < 1);
});

test('getTrackHeadingDeg prefers latest track movement over stale provider heading', () => {
  const heading = getTrackHeadingDeg(
    [
      { lat: 34.04789, lon: -117.60943, headingDeg: 251 },
      { lat: 34.04975, lon: -117.61177, headingDeg: 251 }
    ],
    251
  );

  assert.notEqual(heading, 251);
  assert.equal(heading, 314);
});
