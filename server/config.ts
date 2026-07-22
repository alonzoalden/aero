import type { FlightDataSource } from '../src/types/flight';

const requestedSource = process.env.FLIGHT_DATA_SOURCE;
const dataSource: FlightDataSource =
  requestedSource === 'mock' ||
  requestedSource === 'airplanes-live' ||
  requestedSource === 'demo-ops' ||
  requestedSource === 'stress'
    ? requestedSource
    : 'airplanes-live';

function readClampedInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(Math.floor(value), max));
}

const stressMaxAircraftCount = readClampedInt('STRESS_MAX_AIRCRAFT_COUNT', 10000, 1, 50000);
const demoOpsBroadcastHz = readClampedInt('DEMO_OPS_BROADCAST_HZ', 3, 1, 10);

export const config = {
  port: Number(process.env.FLIGHT_WS_PORT ?? process.env.PORT ?? 8787),
  dataSource,
  airplanesLiveUrl:
    process.env.AIRPLANES_LIVE_URL ?? 'https://api.airplanes.live/v2/point/33.9416/-118.4085/100',
  airplanesLivePollMs: Math.max(Number(process.env.AIRPLANES_LIVE_POLL_MS ?? 10000), 5000),
  demoOps: {
    aircraftCount: readClampedInt('DEMO_OPS_AIRCRAFT_COUNT', 30, 5, 80),
    broadcastHz: demoOpsBroadcastHz,
    scenario: process.env.DEMO_OPS_SCENARIO ?? 'socal'
  },
  stress: {
    aircraftCount: readClampedInt('STRESS_AIRCRAFT_COUNT', 1000, 1, stressMaxAircraftCount),
    ingestUpdatesPerSec: readClampedInt('STRESS_INGEST_UPDATES_PER_SEC', 5000, 1, 100000),
    broadcastHz: readClampedInt('STRESS_BROADCAST_HZ', 10, 1, 30),
    maxAircraftCount: stressMaxAircraftCount
  }
};
