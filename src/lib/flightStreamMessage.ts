import type {
  FlightAlert,
  FlightPositionUpdate,
  FlightServerStatus,
  FlightStreamMessage
} from '@/types/flight';

export function parseFlightStreamMessage(data: unknown): FlightStreamMessage | null {
  if (typeof data !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as unknown;
    return isFlightStreamMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isFlightStreamMessage(value: unknown): value is FlightStreamMessage {
  if (!isRecord(value)) {
    return false;
  }

  if (!Array.isArray(value.alerts) || !value.alerts.every(isFlightAlert)) {
    return false;
  }

  if (!isFlightServerStatus(value.status)) {
    return false;
  }

  if (value.sequence !== undefined && typeof value.sequence !== 'number') {
    return false;
  }

  if (value.serverTimestamp !== undefined && typeof value.serverTimestamp !== 'string') {
    return false;
  }

  if (value.type === 'position') {
    return isFlightPositionUpdate(value.flight);
  }

  if (value.type === 'snapshot' || value.type === 'batch') {
    return Array.isArray(value.flights) && value.flights.every(isFlightPositionUpdate);
  }

  return false;
}

function isFlightPositionUpdate(value: unknown): value is FlightPositionUpdate {
  return (
    isRecord(value) &&
    typeof value.flightId === 'string' &&
    typeof value.callsign === 'string' &&
    isFiniteNumber(value.lat) &&
    isFiniteNumber(value.lon) &&
    isNullableFiniteNumber(value.altitudeFt) &&
    isNullableFiniteNumber(value.groundSpeedKts) &&
    isNullableFiniteNumber(value.headingDeg) &&
    (value.verticalRateFpm === undefined || isNullableFiniteNumber(value.verticalRateFpm)) &&
    (value.origin === undefined || isNullableString(value.origin)) &&
    (value.destination === undefined || isNullableString(value.destination)) &&
    isFlightDataSource(value.source) &&
    (value.lastSeenSeconds === undefined || isNullableFiniteNumber(value.lastSeenSeconds)) &&
    (value.observedAt === undefined || typeof value.observedAt === 'string') &&
    (value.motion === undefined || isFlightMotion(value.motion)) &&
    typeof value.timestamp === 'string'
  );
}

function isFlightMotion(value: unknown) {
  return (
    isRecord(value) &&
    isFiniteNumber(value.northVelocityKts) &&
    isFiniteNumber(value.eastVelocityKts) &&
    isNullableFiniteNumber(value.verticalRateFpm) &&
    typeof value.validUntil === 'string'
  );
}

function isFlightAlert(value: unknown): value is FlightAlert {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.flightId === 'string' &&
    (value.severity === 'info' || value.severity === 'warning' || value.severity === 'critical') &&
    (value.type === 'weather' || value.type === 'delay' || value.type === 'route' || value.type === 'airport') &&
    typeof value.message === 'string' &&
    typeof value.createdAt === 'string'
  );
}

function isFlightServerStatus(value: unknown): value is FlightServerStatus {
  return (
    isRecord(value) &&
    isFlightDataSource(value.source) &&
    isFiniteNumber(value.connectedClients) &&
    isFiniteNumber(value.aircraftCount) &&
    isNullableString(value.lastPollTimestamp) &&
    isNullableString(value.lastBroadcastTimestamp)
  );
}

function isFlightDataSource(value: unknown) {
  return value === 'mock' || value === 'airplanes-live' || value === 'demo-ops' || value === 'stress';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown) {
  return value === null || isFiniteNumber(value);
}

function isNullableString(value: unknown) {
  return value === null || typeof value === 'string';
}
