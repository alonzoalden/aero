import type { LiveAircraftArea } from '../src/lib/liveAircraftAreas';

export function createAirplanesLiveUrl(baseUrl: string, area: LiveAircraftArea) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  return `${normalizedBaseUrl}/point/${area.latitude}/${area.longitude}/100`;
}
