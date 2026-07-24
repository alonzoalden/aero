import type { LiveAircraftArea, LiveAircraftAreaId } from '@/lib/liveAircraftAreas';

export type FlightMotion = {
  northVelocityKts: number;
  eastVelocityKts: number;
  verticalRateFpm: number | null;
  validUntil: string;
};

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
  observedAt?: string;
  motion?: FlightMotion;
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

export type FlightDataSource = 'mock' | 'airplanes-live' | 'demo-ops' | 'stress';

export type RuntimeSwitchableFlightDataSource = Extract<FlightDataSource, 'mock' | 'airplanes-live'>;

export const liveAircraftLimits = [30, 60, 100] as const;

export type LiveAircraftLimit = (typeof liveAircraftLimits)[number];

export type FlightSourceOption = {
  source: RuntimeSwitchableFlightDataSource;
  label: string;
  description: string;
  pollIntervalMs: number;
  aircraftLimits?: LiveAircraftLimit[];
};

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
  availableSources?: FlightSourceOption[];
  sourceMode?: 'runtime-switchable' | 'startup-only';
  sourceDescription?: string;
  pollIntervalMs?: number;
  aircraftLimit?: LiveAircraftLimit;
  areaId?: LiveAircraftAreaId;
  area?: LiveAircraftArea;
  isRuntimeSwitchable?: boolean;
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
