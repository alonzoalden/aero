import { getDisplayHeadingDeg } from '@/lib/flightHeading';
import type { FlightState } from '@/types/flight';

export type FlightDisplayStatus = 'observed' | 'estimated' | 'stale';

export type FlightDisplayState = {
  flight: FlightState;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  headingDeg: number | null;
  status: FlightDisplayStatus;
};

const earthRadiusNm = 3_440.065;

export function getServerAlignedNowMs(localNowMs: number, serverTimeOffsetMs: number) {
  return localNowMs + serverTimeOffsetMs;
}

export function projectFlightForDisplay(flight: FlightState, evaluatedAtMs: number): FlightDisplayState {
  const observed = createObservedFlightDisplay(flight);
  const motion = flight.motion;

  if (flight.source !== 'airplanes-live' || !motion) {
    return observed;
  }

  const observedAtMs = Date.parse(flight.observedAt ?? flight.timestamp);
  const validUntilMs = Date.parse(motion.validUntil);
  if (!Number.isFinite(observedAtMs) || !Number.isFinite(validUntilMs) || validUntilMs <= observedAtMs) {
    return observed;
  }

  const projectionTimeMs = Math.min(Math.max(evaluatedAtMs, observedAtMs), validUntilMs);
  const elapsedHours = (projectionTimeMs - observedAtMs) / 3_600_000;
  const speedKts = Math.hypot(motion.northVelocityKts, motion.eastVelocityKts);
  const projectedHeadingDeg =
    speedKts > 0
      ? normalizeHeading((Math.atan2(motion.eastVelocityKts, motion.northVelocityKts) * 180) / Math.PI)
      : observed.headingDeg;
  const headingDeg = unwrapHeadingDeg(observed.headingDeg, projectedHeadingDeg);
  const position =
    speedKts > 0 && headingDeg !== null
      ? destinationPoint(flight.lat, flight.lon, headingDeg, speedKts * elapsedHours)
      : { lat: flight.lat, lon: flight.lon };
  const altitudeFt =
    flight.altitudeFt === null || motion.verticalRateFpm === null
      ? flight.altitudeFt
      : Math.max(0, flight.altitudeFt + motion.verticalRateFpm * elapsedHours * 60);

  return {
    flight,
    ...position,
    altitudeFt,
    headingDeg,
    status: evaluatedAtMs > validUntilMs ? 'stale' : projectionTimeMs > observedAtMs ? 'estimated' : 'observed'
  };
}

export function createObservedFlightDisplay(flight: FlightState): FlightDisplayState {
  return {
    flight,
    lat: flight.lat,
    lon: flight.lon,
    altitudeFt: flight.altitudeFt,
    headingDeg: getDisplayHeadingDeg(flight),
    status: 'observed'
  };
}

export function unwrapHeadingDeg(previousHeadingDeg: number | null, nextHeadingDeg: number | null) {
  if (nextHeadingDeg === null || previousHeadingDeg === null) {
    return nextHeadingDeg;
  }

  const delta = ((nextHeadingDeg - previousHeadingDeg + 540) % 360) - 180;
  return previousHeadingDeg + delta;
}

function destinationPoint(lat: number, lon: number, headingDeg: number, distanceNm: number) {
  const angularDistance = distanceNm / earthRadiusNm;
  const headingRad = toRadians(headingDeg);
  const latRad = toRadians(lat);
  const lonRad = toRadians(lon);
  const nextLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(headingRad)
  );
  const nextLonRad =
    lonRad +
    Math.atan2(
      Math.sin(headingRad) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(nextLatRad)
    );

  return {
    lat: (nextLatRad * 180) / Math.PI,
    lon: (((nextLonRad * 180) / Math.PI + 540) % 360) - 180
  };
}

function normalizeHeading(headingDeg: number) {
  return ((headingDeg % 360) + 360) % 360;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
