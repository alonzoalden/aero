import type { FlightPositionUpdate, FlightTrackPoint } from '../src/types/flight';

const maxHistoryPoints = 40;

export class FlightHistoryStore {
  private latestAircraft = new Map<string, FlightPositionUpdate>();
  private historyByAircraft = new Map<string, FlightTrackPoint[]>();

  upsertMany(flights: FlightPositionUpdate[]) {
    for (const flight of flights) {
      this.latestAircraft.set(flight.flightId, flight);
      const historyPoint: FlightTrackPoint = {
        lat: flight.lat,
        lon: flight.lon,
        altitudeFt: flight.altitudeFt,
        groundSpeedKts: flight.groundSpeedKts,
        headingDeg: flight.headingDeg,
        timestamp: flight.timestamp
      };
      const history = this.historyByAircraft.get(flight.flightId) ?? [];
      this.historyByAircraft.set(flight.flightId, [...history, historyPoint].slice(-maxHistoryPoints));
    }
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
