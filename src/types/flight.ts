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
  source: FlightDataSource;
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

export type FlightDataSource = 'mock' | 'airplanes-live' | 'stress';

export type AircraftVisualMode = 'dots' | 'models' | 'hybrid' | 'proof';

export type ScaleMetrics = {
  ingestUpdatesPerSec: number;
  webSocketMessagesPerSec: number;
  aircraftUpdatesBroadcastPerSec: number;
  connectedClients: number;
  activeAircraftCount: number;
  lastBroadcastTimestamp: string | null;
  coalescedUpdateCount: number;
  sequence: number;
};

export type FlightServerStatus = {
  source: FlightDataSource;
  connectedClients: number;
  aircraftCount: number;
  lastPollTimestamp: string | null;
  lastBroadcastTimestamp: string | null;
  scaleMetrics?: ScaleMetrics;
};

type FlightStreamEnvelope = {
  alerts: FlightAlert[];
  status: FlightServerStatus;
  sequence?: number;
  serverTimestamp?: string;
};

export type FlightStreamMessage =
  | (FlightStreamEnvelope & {
      type: 'snapshot';
      flights: FlightPositionUpdate[];
    })
  | (FlightStreamEnvelope & {
      type: 'position';
      flight: FlightPositionUpdate;
    })
  | (FlightStreamEnvelope & {
      type: 'batch';
      flights: FlightPositionUpdate[];
    });
