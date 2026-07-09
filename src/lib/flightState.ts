import type { FlightPositionUpdate, FlightState } from '@/types/flight';

const maxTrackPoints = 40;

export function upsertFlight(
  flightsById: Record<string, FlightState>,
  update: FlightPositionUpdate
): Record<string, FlightState> {
  const previous = flightsById[update.flightId];
  const trackPoint = {
    lat: update.lat,
    lon: update.lon,
    altitudeFt: update.altitudeFt,
    groundSpeedKts: update.groundSpeedKts,
    headingDeg: update.headingDeg,
    timestamp: update.timestamp
  };

  return {
    ...flightsById,
    [update.flightId]: {
      ...update,
      track: [...(previous?.track ?? []), trackPoint].slice(-maxTrackPoints)
    }
  };
}
