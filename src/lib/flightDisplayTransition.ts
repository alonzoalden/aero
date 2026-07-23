import type { FlightDisplayState } from './flightProjection';

export type FlightDisplayTransition = {
  flightId: string;
  from: FlightDisplayState;
  to: FlightDisplayState;
  startedAtMs: number;
  durationMs: number;
};

export function createFlightDisplayTransition(
  target: FlightDisplayState,
  startedAtMs: number,
  durationMs: number
): FlightDisplayTransition {
  return {
    flightId: target.flight.flightId,
    from: target,
    to: target,
    startedAtMs,
    durationMs: target.status === 'stale' ? 0 : Math.max(0, durationMs)
  };
}

export function retargetFlightDisplayTransition(
  transition: FlightDisplayTransition | null,
  target: FlightDisplayState,
  startedAtMs: number,
  durationMs: number
): FlightDisplayTransition {
  if (!transition || transition.flightId !== target.flight.flightId) {
    return createFlightDisplayTransition(target, startedAtMs, durationMs);
  }

  return {
    flightId: target.flight.flightId,
    from: sampleFlightDisplayTransition(transition, startedAtMs),
    to: target,
    startedAtMs,
    durationMs: target.status === 'stale' ? 0 : Math.max(0, durationMs)
  };
}

export function sampleFlightDisplayTransition(
  transition: FlightDisplayTransition,
  evaluatedAtMs: number
): FlightDisplayState {
  const progress = getTransitionProgress(transition, evaluatedAtMs);
  if (progress >= 1) {
    return transition.to;
  }

  if (progress <= 0) {
    return { ...transition.from, flight: transition.to.flight, status: transition.to.status };
  }

  return {
    flight: transition.to.flight,
    lat: interpolateNumber(transition.from.lat, transition.to.lat, progress),
    lon: interpolateNumber(transition.from.lon, transition.to.lon, progress),
    altitudeFt: interpolateNullableNumber(transition.from.altitudeFt, transition.to.altitudeFt, progress),
    headingDeg: interpolateHeading(transition.from.headingDeg, transition.to.headingDeg, progress),
    status: transition.to.status
  };
}

function getTransitionProgress(transition: FlightDisplayTransition, evaluatedAtMs: number) {
  if (transition.durationMs <= 0) {
    return 1;
  }

  return Math.min(Math.max((evaluatedAtMs - transition.startedAtMs) / transition.durationMs, 0), 1);
}

function interpolateNullableNumber(from: number | null, to: number | null, progress: number) {
  return from === null || to === null ? to : interpolateNumber(from, to, progress);
}

function interpolateHeading(from: number | null, to: number | null, progress: number) {
  if (from === null || to === null) {
    return to;
  }

  const delta = ((to - from + 540) % 360) - 180;
  return from + delta * progress;
}

function interpolateNumber(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}
