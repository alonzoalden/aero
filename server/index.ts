import http from 'node:http';
import express from 'express';
import { createAirplanesLiveProvider } from './airplanesLiveProvider';
import { config } from './config';
import { FlightHistoryStore } from './flightHistoryStore';
import { createMockProvider } from './mockProvider';
import { createWebSocketFlightServer } from './websocketServer';
import type { AircraftProvider } from './aircraftProvider';
import type { FlightAlert, FlightServerStatus, FlightStreamMessage } from '../src/types/flight';

const app = express();
const httpServer = http.createServer(app);
const store = new FlightHistoryStore();
const provider: AircraftProvider =
  config.dataSource === 'airplanes-live'
    ? createAirplanesLiveProvider(config.airplanesLiveUrl)
    : createMockProvider();

let alerts: FlightAlert[] = [];
let lastPollTimestamp: string | null = null;
let lastBroadcastTimestamp: string | null = null;

const socketServer = createWebSocketFlightServer({
  server: httpServer,
  getStatus,
  getSnapshot: () => store.getFlights(),
  getAlerts: () => alerts
});

app.get('/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/status', (_request, response) => {
  response.json(getStatus());
});

httpServer.listen(config.port, () => {
  console.log(`Live Airspace Pulse backend listening on http://localhost:${config.port}`);
  console.log(`Flight data source: ${config.dataSource}`);
});

void pollProvider();
setInterval(() => {
  void pollProvider();
}, config.dataSource === 'airplanes-live' ? config.airplanesLivePollMs : 1000);

async function pollProvider() {
  try {
    const result = await provider.getSnapshot();
    lastPollTimestamp = new Date().toISOString();
    alerts = result.alerts;
    store.upsertMany(result.flights);
    lastBroadcastTimestamp = new Date().toISOString();

    const message: FlightStreamMessage = {
      type: 'batch',
      flights: result.flights,
      alerts,
      status: getStatus()
    };

    socketServer.broadcast(message);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
}

function getStatus(): FlightServerStatus {
  return {
    source: config.dataSource,
    connectedClients: socketServer.clientCount,
    aircraftCount: store.aircraftCount,
    lastPollTimestamp,
    lastBroadcastTimestamp
  };
}
