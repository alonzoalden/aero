export type FlightPositionUpdate = {
  flightId: string;
  callsign: string;
  lat: number;
  lon: number;
  altitudeFt: number;
  groundSpeedKts: number;
  headingDeg: number;
  origin: string;
  destination: string;
  timestamp: string;
};

export type FlightAlert = {
  id: string;
  flightId: string;
  severity: 'info' | 'warning' | 'critical';
  type: 'weather' | 'delay' | 'route' | 'airport';
  message: string;
  createdAt: string;
};

export type FlightTrackPoint = Pick<
  FlightPositionUpdate,
  'lat' | 'lon' | 'altitudeFt' | 'groundSpeedKts' | 'headingDeg' | 'timestamp'
>;

export type FlightState = FlightPositionUpdate & {
  track: FlightTrackPoint[];
};

export type FlightStreamMessage =
  | {
      type: 'snapshot';
      flights: FlightPositionUpdate[];
      alerts: FlightAlert[];
    }
  | {
      type: 'position';
      flight: FlightPositionUpdate;
      alerts: FlightAlert[];
    };
