import type { FlightDataSource } from '../src/types/flight';

const requestedSource = process.env.FLIGHT_DATA_SOURCE;
const dataSource: FlightDataSource = requestedSource === 'airplanes-live' ? 'airplanes-live' : 'mock';

export const config = {
  port: Number(process.env.FLIGHT_WS_PORT ?? process.env.PORT ?? 8787),
  dataSource,
  airplanesLiveUrl:
    process.env.AIRPLANES_LIVE_URL ?? 'https://api.airplanes.live/v2/point/33.9416/-118.4085/100',
  airplanesLivePollMs: Math.max(Number(process.env.AIRPLANES_LIVE_POLL_MS ?? 10000), 5000)
};
