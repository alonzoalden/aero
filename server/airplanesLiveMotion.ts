import type { FlightMotion, FlightPositionUpdate } from '../src/types/flight';

type TrackedObservation = {
  lat: number;
  lon: number;
  altitudeFt: number | null;
  observedAt: string;
  motion?: FlightMotion;
};

type Velocity = {
  northVelocityKts: number;
  eastVelocityKts: number;
};

const newestSampleWeight = 0.65;
const maxObservationGapMs = 60_000;
const maxGroundSpeedKts = 800;
const maxVerticalRateFpm = 8_000;
const earthRadiusNm = 3_440.065;
const coordinateEpsilon = 0.000001;

export function createAirplanesLiveMotionTracker(pollIntervalMs: number) {
  const observations = new Map<string, TrackedObservation>();
  const predictionHorizonMs = pollIntervalMs * 2;

  function enrich(flight: FlightPositionUpdate): FlightPositionUpdate {
    const candidateObservedAt = flight.observedAt ?? flight.timestamp;
    const previous = observations.get(flight.flightId);

    if (previous && hasSamePosition(previous, flight)) {
      return {
        ...flight,
        observedAt: previous.observedAt,
        motion: previous.motion
      };
    }

    const observedAtMs = Date.parse(candidateObservedAt);
    const previousObservedAtMs = previous ? Date.parse(previous.observedAt) : null;
    const elapsedMs =
      previousObservedAtMs !== null && Number.isFinite(previousObservedAtMs)
        ? observedAtMs - previousObservedAtMs
        : null;
    const invalidSequence =
      !Number.isFinite(observedAtMs) ||
      (elapsedMs !== null && (elapsedMs <= 0 || elapsedMs > maxObservationGapMs));

    if (flight.altitudeFt === 0 || invalidSequence) {
      const observation = toTrackedObservation(flight, candidateObservedAt);
      observations.set(flight.flightId, observation);
      return { ...flight, observedAt: candidateObservedAt, motion: undefined };
    }

    const reportedVelocity = velocityFromSpeedAndHeading(flight.groundSpeedKts, flight.headingDeg);
    const derivedVelocity =
      !reportedVelocity && previous && elapsedMs !== null
        ? velocityFromPositions(previous, flight, elapsedMs)
        : null;
    const rawVelocity = reportedVelocity ?? derivedVelocity;

    if (!rawVelocity) {
      const observation = toTrackedObservation(flight, candidateObservedAt);
      observations.set(flight.flightId, observation);
      return { ...flight, observedAt: candidateObservedAt, motion: undefined };
    }

    const velocity = previous?.motion
      ? smoothVelocity(previous.motion, rawVelocity)
      : rawVelocity;
    const rawVerticalRate = getVerticalRate(flight, previous, elapsedMs);
    const verticalRateFpm = smoothVerticalRate(previous?.motion?.verticalRateFpm, rawVerticalRate);
    const motion: FlightMotion = {
      ...velocity,
      verticalRateFpm,
      validUntil: new Date(observedAtMs + predictionHorizonMs).toISOString()
    };
    const enriched = { ...flight, observedAt: candidateObservedAt, motion };
    observations.set(flight.flightId, toTrackedObservation(enriched, candidateObservedAt));

    return enriched;
  }

  return { enrich };
}

export function velocityFromSpeedAndHeading(
  groundSpeedKts: number | null,
  headingDeg: number | null
): Velocity | null {
  if (
    groundSpeedKts === null ||
    headingDeg === null ||
    !Number.isFinite(groundSpeedKts) ||
    !Number.isFinite(headingDeg) ||
    groundSpeedKts < 0 ||
    groundSpeedKts > maxGroundSpeedKts
  ) {
    return null;
  }

  const headingRad = toRadians(headingDeg);
  return {
    northVelocityKts: groundSpeedKts * Math.cos(headingRad),
    eastVelocityKts: groundSpeedKts * Math.sin(headingRad)
  };
}

function velocityFromPositions(
  previous: TrackedObservation,
  current: FlightPositionUpdate,
  elapsedMs: number
): Velocity | null {
  if (elapsedMs <= 0) {
    return null;
  }

  const distanceNm = haversineDistanceNm(previous, current);
  const speedKts = distanceNm / (elapsedMs / 3_600_000);
  if (!Number.isFinite(speedKts) || speedKts > maxGroundSpeedKts) {
    return null;
  }

  return velocityFromSpeedAndHeading(speedKts, calculateBearingDeg(previous, current));
}

function getVerticalRate(
  flight: FlightPositionUpdate,
  previous: TrackedObservation | undefined,
  elapsedMs: number | null
): number | null {
  const reportedRate = flight.verticalRateFpm;
  if (
    reportedRate !== null &&
    reportedRate !== undefined &&
    Number.isFinite(reportedRate) &&
    Math.abs(reportedRate) <= maxVerticalRateFpm
  ) {
    return reportedRate;
  }

  if (
    !previous ||
    elapsedMs === null ||
    elapsedMs <= 0 ||
    previous.altitudeFt === null ||
    flight.altitudeFt === null
  ) {
    return null;
  }

  const derivedRate = (flight.altitudeFt - previous.altitudeFt) / (elapsedMs / 60_000);
  return Number.isFinite(derivedRate) && Math.abs(derivedRate) <= maxVerticalRateFpm ? derivedRate : null;
}

function smoothVelocity(previous: FlightMotion, current: Velocity): Velocity {
  return {
    northVelocityKts: weightedAverage(previous.northVelocityKts, current.northVelocityKts),
    eastVelocityKts: weightedAverage(previous.eastVelocityKts, current.eastVelocityKts)
  };
}

function smoothVerticalRate(previous: number | null | undefined, current: number | null): number | null {
  if (current === null) {
    return previous ?? null;
  }
  return previous === null || previous === undefined ? current : weightedAverage(previous, current);
}

function weightedAverage(previous: number, current: number) {
  return previous * (1 - newestSampleWeight) + current * newestSampleWeight;
}

function toTrackedObservation(flight: FlightPositionUpdate, observedAt: string): TrackedObservation {
  return {
    lat: flight.lat,
    lon: flight.lon,
    altitudeFt: flight.altitudeFt,
    observedAt,
    motion: flight.motion
  };
}

function hasSamePosition(previous: TrackedObservation, flight: FlightPositionUpdate) {
  return (
    Math.abs(previous.lat - flight.lat) <= coordinateEpsilon &&
    Math.abs(previous.lon - flight.lon) <= coordinateEpsilon
  );
}

function haversineDistanceNm(origin: { lat: number; lon: number }, destination: { lat: number; lon: number }) {
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(destination.lon - origin.lon);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return earthRadiusNm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBearingDeg(origin: { lat: number; lon: number }, destination: { lat: number; lon: number }) {
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);
  const deltaLon = toRadians(destination.lon - origin.lon);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
