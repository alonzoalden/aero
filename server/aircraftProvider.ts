import type { FlightAlert, FlightPositionUpdate } from '../src/types/flight';

export type AircraftProviderResult = {
  flights: FlightPositionUpdate[];
  alerts: FlightAlert[];
};

export type AircraftProvider = {
  source: FlightPositionUpdate['source'];
  getSnapshot: () => Promise<AircraftProviderResult>;
};
