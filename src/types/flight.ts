export type FlightPositionUpdate = {
  flightId: string;
  callsign: string;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  groundSpeedKts: number | null;
  headingDeg: number | null;
  verticalRateFpm?: number | null;
  origin?: string | null;
  destination?: string | null;
  source: 'mock' | 'airplanes-live';
  lastSeenSeconds?: number | null;
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

export type FlightDataSource = 'mock' | 'airplanes-live';

export type FlightServerStatus = {
  source: FlightDataSource;
  connectedClients: number;
  aircraftCount: number;
  lastPollTimestamp: string | null;
  lastBroadcastTimestamp: string | null;
};

export type FlightStreamMessage =
  | {
      type: 'snapshot';
      flights: FlightPositionUpdate[];
      alerts: FlightAlert[];
      status: FlightServerStatus;
    }
  | {
      type: 'position';
      flight: FlightPositionUpdate;
      alerts: FlightAlert[];
      status: FlightServerStatus;
    }
  | {
      type: 'batch';
      flights: FlightPositionUpdate[];
      alerts: FlightAlert[];
      status: FlightServerStatus;
    };
