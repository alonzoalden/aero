import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMeasurement, formatNumber, formatRoute, hasDisplayText } from '../src/lib/format';

test('format helpers omit missing or placeholder values', () => {
  assert.equal(formatNumber(undefined), null);
  assert.equal(formatMeasurement(null, 'ft'), null);
  assert.equal(formatRoute(null, null), null);
  assert.equal(formatRoute('unknown', 'KLAX'), null);
  assert.equal(hasDisplayText(' undefined '), false);
});

test('format helpers preserve zero and complete routes', () => {
  assert.equal(formatMeasurement(0, 'ft'), '0 ft');
  assert.equal(formatRoute('KSEA', 'KLAX'), 'KSEA to KLAX');
});
