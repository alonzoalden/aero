import type { FlightState, FlightTrackPoint } from '@/types/flight';

type GeoPoint = {
  lat: number;
  lon: number;
};

type HeadingTrackPoint = Pick<FlightTrackPoint, 'lat' | 'lon' | 'headingDeg'>;

const coordinateEpsilon = 0.00001;

export function calculateBearingDeg(origin: GeoPoint, destination: GeoPoint): number {
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);
  const deltaLon = toRadians(destination.lon - origin.lon);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return normalizeHeading((Math.atan2(y, x) * 180) / Math.PI);
}

export function getDisplayHeadingDeg(flight: FlightState): number | null {
  return getTrackHeadingDeg(flight.track, flight.headingDeg);
}

export function getTrackHeadingDeg(track: HeadingTrackPoint[], fallbackHeadingDeg?: number | null): number | null {
  const latestPoint = track.at(-1);

  if (latestPoint) {
    for (let index = track.length - 2; index >= 0; index -= 1) {
      const previousPoint = track[index];
      if (hasMeaningfulMovement(previousPoint, latestPoint)) {
        return Math.round(calculateBearingDeg(previousPoint, latestPoint));
      }
    }
  }

  return fallbackHeadingDeg === null || fallbackHeadingDeg === undefined ? null : Math.round(normalizeHeading(fallbackHeadingDeg));
}

export function getHeadingTrackPoints(track: HeadingTrackPoint[]) {
  return track
    .map((point, index) => {
      const previousPoint = index > 0 ? track[index - 1] : null;
      const headingDeg =
        previousPoint && hasMeaningfulMovement(previousPoint, point)
          ? Math.round(calculateBearingDeg(previousPoint, point))
          : point.headingDeg;

      return headingDeg === null || headingDeg === undefined
        ? null
        : {
            headingDeg,
            index
          };
    })
    .filter((point): point is { headingDeg: number; index: number } => Boolean(point));
}

function hasMeaningfulMovement(origin: GeoPoint, destination: GeoPoint) {
  return Math.abs(destination.lat - origin.lat) > coordinateEpsilon || Math.abs(destination.lon - origin.lon) > coordinateEpsilon;
}

function normalizeHeading(headingDeg: number) {
  return ((headingDeg % 360) + 360) % 360;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
