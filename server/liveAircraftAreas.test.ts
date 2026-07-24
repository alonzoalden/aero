import assert from 'node:assert/strict';
import test from 'node:test';
import { createAirplanesLiveUrl } from './airplanesLiveUrl';
import { getLiveAircraftArea, liveAircraftAreaCount, liveAircraftAreas } from './liveAirportCatalog';
import {
  getLiveAircraftAreaCode,
  isLiveAircraftAreaCatalog,
  searchLiveAircraftAreas
} from '../src/lib/liveAircraftAreas';
import airportCatalogJson from '../public/data/live-airports.json';

test('loads the generated worldwide airport catalog with Los Angeles as the default', () => {
  assert.equal(isLiveAircraftAreaCatalog(airportCatalogJson), true);
  assert.ok(liveAircraftAreaCount > 3000);
  assert.equal(getLiveAircraftArea(undefined).id, 'KLAX');
  assert.equal(getLiveAircraftAreaCode(getLiveAircraftArea('KJFK')), 'JFK');
});

test('airport search covers cities, IATA and ICAO codes, regions, countries, and keywords', () => {
  assert.equal(searchLiveAircraftAreas(liveAircraftAreas, 'LGA').areas[0]?.id, 'KLGA');
  assert.equal(searchLiveAircraftAreas(liveAircraftAreas, 'EGLL').areas[0]?.id, 'EGLL');
  assert.equal(searchLiveAircraftAreas(liveAircraftAreas, 'California LAX').areas[0]?.id, 'KLAX');
  assert.ok(searchLiveAircraftAreas(liveAircraftAreas, 'United Kingdom London').total > 1);
  assert.equal(searchLiveAircraftAreas(liveAircraftAreas, 'Idlewild').areas[0]?.id, 'KJFK');
});

test('limits rendered airport results while retaining the total match count', () => {
  const result = searchLiveAircraftAreas(liveAircraftAreas, 'United States', 20);

  assert.equal(result.areas.length, 20);
  assert.ok(result.total > result.areas.length);
});

test('builds an Airplanes.live point URL for the selected airport', () => {
  assert.equal(
    createAirplanesLiveUrl('https://api.airplanes.live/v2/', getLiveAircraftArea('KJFK')),
    'https://api.airplanes.live/v2/point/40.639447/-73.779317/100'
  );
});
