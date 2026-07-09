import type { FlightPositionUpdate, FlightState } from '@/types/flight';

const maxTrackPoints = 40;

export function upsertFlight(
  flightsById: Record<string, FlightState>,
  update: FlightPositionUpdate
): Record<string, FlightState> {
  return upsertFlights(flightsById, [update]);
}

export function upsertFlights(
  flightsById: Record<string, FlightState>,
  updates: FlightPositionUpdate[]
): Record<string, FlightState> {
  if (updates.length === 0) {
    return flightsById;
  }

  const next = { ...flightsById };

  for (const update of updates) {
    next[update.flightId] = mergeFlight(next[update.flightId], update);
  }

  return next;
}

export function replaceFlights(updates: FlightPositionUpdate[]): Record<string, FlightState> {
  return upsertFlights({}, updates);
}

function mergeFlight(previous: FlightState | undefined, update: FlightPositionUpdate): FlightState {
  const trackPoint = {
    lat: update.lat,
    lon: update.lon,
    altitudeFt: update.altitudeFt,
    groundSpeedKts: update.groundSpeedKts,
    headingDeg: update.headingDeg,
    timestamp: update.timestamp
  };

  return {
    ...update,
    track: [...(previous?.track ?? []), trackPoint].slice(-maxTrackPoints)
  };
}
