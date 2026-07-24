import type { AircraftProvider } from './aircraftProvider';
import { createAirplanesLiveMotionTracker } from './airplanesLiveMotion';
import { normalizeAirplanesLiveAircraft, type AirplanesLiveAircraft } from './normalizeAircraft';
import type { LiveAircraftLimit } from '../src/types/flight';

type AirplanesLiveResponse = {
  ac?: AirplanesLiveAircraft[];
};

export function createAirplanesLiveProvider(
  url: string,
  pollIntervalMs: number,
  aircraftLimit: LiveAircraftLimit
): AircraftProvider {
  const motionTracker = createAirplanesLiveMotionTracker(pollIntervalMs);

  return {
    source: 'airplanes-live',
    async getSnapshot() {
      const response = await fetch(url, {
        headers: { accept: 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Airplanes.live returned ${response.status}`);
      }

      const timestamp = new Date().toISOString();
      const payload = (await response.json()) as AirplanesLiveResponse;
      const flights = (payload.ac ?? [])
        .map((aircraft) => normalizeAirplanesLiveAircraft(aircraft, timestamp))
        .filter((flight): flight is NonNullable<typeof flight> => Boolean(flight))
        .slice(0, aircraftLimit);

      return { flights: flights.map(motionTracker.enrich), alerts: [] };
    }
  };
}
