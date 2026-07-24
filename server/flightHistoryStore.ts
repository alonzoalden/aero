import type { FlightPositionUpdate, FlightTrackPoint } from '../src/types/flight';

const maxHistoryPoints = 40;

export class FlightHistoryStore {
  private latestAircraft = new Map<string, FlightPositionUpdate>();
  private historyByAircraft = new Map<string, FlightTrackPoint[]>();

  upsertMany(flights: FlightPositionUpdate[]) {
    for (const flight of flights) {
      this.latestAircraft.set(flight.flightId, flight);
      const observedTimestamp = flight.observedAt ?? flight.timestamp;
      const historyPoint: FlightTrackPoint = {
        lat: flight.lat,
        lon: flight.lon,
        altitudeFt: flight.altitudeFt,
        groundSpeedKts: flight.groundSpeedKts,
        headingDeg: flight.headingDeg,
        timestamp: observedTimestamp
      };
      const history = this.historyByAircraft.get(flight.flightId) ?? [];
      if (history.at(-1)?.timestamp !== observedTimestamp) {
        this.historyByAircraft.set(flight.flightId, [...history, historyPoint].slice(-maxHistoryPoints));
      }
    }
  }

  replaceMany(flights: FlightPositionUpdate[]) {
    const nextFlightIds = new Set(flights.map((flight) => flight.flightId));

    for (const flightId of this.latestAircraft.keys()) {
      if (!nextFlightIds.has(flightId)) {
        this.latestAircraft.delete(flightId);
        this.historyByAircraft.delete(flightId);
      }
    }

    this.upsertMany(flights);
  }

  getFlights() {
    return Array.from(this.latestAircraft.values());
  }

  clear() {
    this.latestAircraft.clear();
    this.historyByAircraft.clear();
  }

  get aircraftCount() {
    return this.latestAircraft.size;
  }
}
