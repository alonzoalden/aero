import type { FlightPositionUpdate, FlightState } from '@/types/flight';

const maxTrackPoints = 40;

export type FlightCollection = {
  flightsById: Record<string, FlightState>;
  orderedFlightIds: string[];
};

export function createFlightCollection(): FlightCollection {
  return {
    flightsById: {},
    orderedFlightIds: []
  };
}

export function upsertFlight(
  collection: FlightCollection,
  update: FlightPositionUpdate
): FlightCollection {
  return upsertFlights(collection, [update]);
}

export function upsertFlights(
  collection: FlightCollection,
  updates: FlightPositionUpdate[]
): FlightCollection {
  if (updates.length === 0) {
    return collection;
  }

  const nextFlightsById = { ...collection.flightsById };
  let requiresReorder = false;

  for (const update of updates) {
    const previous = nextFlightsById[update.flightId];
    requiresReorder ||= !previous || getFlightSortKey(previous) !== getFlightSortKey(update);
    nextFlightsById[update.flightId] = mergeFlight(previous, update);
  }

  return {
    flightsById: nextFlightsById,
    orderedFlightIds: requiresReorder
      ? Object.keys(nextFlightsById).sort((leftId, rightId) =>
          compareFlights(nextFlightsById[leftId], nextFlightsById[rightId])
        )
      : collection.orderedFlightIds
  };
}

export function replaceFlights(
  collection: FlightCollection,
  updates: FlightPositionUpdate[]
): FlightCollection {
  const nextFlightIds = new Set(updates.map((update) => update.flightId));
  const retainedFlightsById = Object.fromEntries(
    Object.entries(collection.flightsById).filter(([flightId]) => nextFlightIds.has(flightId))
  );
  const retainedOrderedFlightIds = collection.orderedFlightIds.filter((flightId) => nextFlightIds.has(flightId));

  return upsertFlights(
    {
      flightsById: retainedFlightsById,
      orderedFlightIds: retainedOrderedFlightIds
    },
    updates
  );
}

function getFlightSortKey(flight: Pick<FlightPositionUpdate, 'callsign' | 'flightId'>) {
  return flight.callsign.trim().toUpperCase() || flight.flightId.toUpperCase();
}

function compareFlights(left: FlightPositionUpdate, right: FlightPositionUpdate) {
  const callsignComparison = getFlightSortKey(left).localeCompare(getFlightSortKey(right), undefined, {
    numeric: true,
    sensitivity: 'base'
  });

  return callsignComparison || left.flightId.localeCompare(right.flightId);
}

function mergeFlight(previous: FlightState | undefined, update: FlightPositionUpdate): FlightState {
  const observedTimestamp = update.observedAt ?? update.timestamp;
  const trackPoint = {
    lat: update.lat,
    lon: update.lon,
    altitudeFt: update.altitudeFt,
    groundSpeedKts: update.groundSpeedKts,
    headingDeg: update.headingDeg,
    timestamp: observedTimestamp
  };
  const previousTrack = previous?.track ?? [];
  const latestTrackPoint = previousTrack.at(-1);
  const track =
    latestTrackPoint?.timestamp === observedTimestamp
      ? previousTrack
      : [...previousTrack, trackPoint].slice(-maxTrackPoints);

  return {
    ...update,
    track
  };
}
