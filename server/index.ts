import http from 'node:http';
import express from 'express';
import { createAirplanesLiveProvider } from './airplanesLiveProvider';
import { config } from './config';
import { createDemoOpsProvider } from './demoOpsProvider';
import { FlightHistoryStore } from './flightHistoryStore';
import { createMockProvider } from './mockProvider';
import { createStressProvider } from './stressProvider';
import { createWebSocketFlightServer } from './websocketServer';
import type { AircraftProvider } from './aircraftProvider';
import type { FlightAlert, FlightServerStatus, FlightStreamMessage, ScaleMetrics } from '../src/types/flight';

const app = express();
const httpServer = http.createServer(app);
const store = new FlightHistoryStore();
const provider: AircraftProvider | null =
  config.dataSource === 'stress' || config.dataSource === 'demo-ops'
    ? null
    : config.dataSource === 'airplanes-live'
      ? createAirplanesLiveProvider(config.airplanesLiveUrl)
      : createMockProvider();
const stressProvider =
  config.dataSource === 'stress' ? createStressProvider(config.stress.aircraftCount) : null;
const demoOpsProvider =
  config.dataSource === 'demo-ops' ? createDemoOpsProvider(config.demoOps.aircraftCount) : null;

let alerts: FlightAlert[] = [];
let lastPollTimestamp: string | null = null;
let lastBroadcastTimestamp: string | null = null;
let sequence = 0;
let ingestUpdatesThisSecond = 0;
let ingestUpdatesPerSec = 0;
let webSocketMessagesThisSecond = 0;
let webSocketMessagesPerSec = 0;
let aircraftUpdatesBroadcastThisSecond = 0;
let aircraftUpdatesBroadcastPerSec = 0;
let coalescedUpdateCount = 0;
let rawUpdatesSinceBroadcast = 0;

const socketServer = createWebSocketFlightServer({
  server: httpServer,
  getStatus,
  getSnapshot: () => stressProvider?.getSnapshot() ?? demoOpsProvider?.getSnapshot() ?? store.getFlights(),
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
  if (config.dataSource === 'stress') {
    console.log(
      `Stress mode: ${config.stress.aircraftCount} aircraft, ` +
        `${config.stress.ingestUpdatesPerSec} ingest updates/sec, ` +
        `${config.stress.broadcastHz} broadcasts/sec`
    );
  } else if (config.dataSource === 'demo-ops') {
    console.log(
      `Demo Ops mode: ${config.demoOps.aircraftCount} aircraft, ` +
        `${config.demoOps.broadcastHz} broadcasts/sec, scenario=${config.demoOps.scenario}`
    );
  }
});

if (stressProvider) {
  startStressMode();
} else if (demoOpsProvider) {
  startDemoOpsMode();
} else {
  void pollProvider();
  setInterval(() => {
    void pollProvider();
  }, config.dataSource === 'airplanes-live' ? config.airplanesLivePollMs : 1000);
}

setInterval(() => {
  ingestUpdatesPerSec = ingestUpdatesThisSecond;
  webSocketMessagesPerSec = webSocketMessagesThisSecond;
  aircraftUpdatesBroadcastPerSec = aircraftUpdatesBroadcastThisSecond;
  ingestUpdatesThisSecond = 0;
  webSocketMessagesThisSecond = 0;
  aircraftUpdatesBroadcastThisSecond = 0;
}, 1000);

async function pollProvider() {
  if (!provider) {
    return;
  }

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
      status: getStatus(),
      sequence: nextSequence(),
      serverTimestamp: lastBroadcastTimestamp
    };

    webSocketMessagesThisSecond += socketServer.broadcast(message);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
}

function startDemoOpsMode() {
  if (!demoOpsProvider) {
    return;
  }

  const broadcastMs = Math.round(1000 / config.demoOps.broadcastHz);
  const tickSeconds = broadcastMs / 1000;

  setInterval(() => {
    const timestamp = new Date().toISOString();
    demoOpsProvider.tick(tickSeconds);
    const updates = demoOpsProvider.drainChangedUpdates(timestamp);
    alerts = demoOpsProvider.getAlerts(timestamp);
    lastPollTimestamp = timestamp;
    store.upsertMany(updates);
    lastBroadcastTimestamp = timestamp;
    ingestUpdatesThisSecond += updates.length;
    aircraftUpdatesBroadcastThisSecond += updates.length;

    const message: FlightStreamMessage = {
      type: 'batch',
      flights: updates,
      alerts,
      status: getStatus(),
      sequence: nextSequence(),
      serverTimestamp: timestamp
    };

    webSocketMessagesThisSecond += socketServer.broadcast(message);
  }, broadcastMs);
}

function startStressMode() {
  if (!stressProvider) {
    return;
  }

  const ingestTickMs = 100;
  const ingestPerTick = Math.max(1, Math.round(config.stress.ingestUpdatesPerSec / (1000 / ingestTickMs)));
  const broadcastMs = Math.max(33, Math.round(1000 / config.stress.broadcastHz));

  // Stress mode separates raw ingest from client transport; this is the core scale lesson.
  setInterval(() => {
    stressProvider.ingest(ingestPerTick);
    ingestUpdatesThisSecond += ingestPerTick;
    rawUpdatesSinceBroadcast += ingestPerTick;
    lastPollTimestamp = new Date().toISOString();
  }, ingestTickMs);

  setInterval(() => {
    const timestamp = new Date().toISOString();
    const updates = stressProvider.drainChangedUpdates(timestamp);
    if (updates.length === 0) {
      return;
    }

    coalescedUpdateCount += Math.max(0, rawUpdatesSinceBroadcast - updates.length);
    rawUpdatesSinceBroadcast = 0;
    store.upsertMany(updates);
    lastBroadcastTimestamp = timestamp;
    aircraftUpdatesBroadcastThisSecond += updates.length;

    const message: FlightStreamMessage = {
      type: 'batch',
      flights: updates,
      alerts,
      status: getStatus(),
      sequence: nextSequence(),
      serverTimestamp: timestamp
    };

    webSocketMessagesThisSecond += socketServer.broadcast(message);
  }, broadcastMs);
}

function getStatus(): FlightServerStatus {
  const scaleMetrics: ScaleMetrics | undefined =
    config.dataSource === 'stress'
      ? {
          ingestUpdatesPerSec,
          webSocketMessagesPerSec,
          aircraftUpdatesBroadcastPerSec,
          connectedClients: socketServer.clientCount,
          activeAircraftCount: stressProvider?.aircraftCount ?? store.aircraftCount,
          lastBroadcastTimestamp,
          coalescedUpdateCount,
          sequence
        }
      : undefined;

  return {
    source: config.dataSource,
    connectedClients: socketServer.clientCount,
    aircraftCount: stressProvider?.aircraftCount ?? demoOpsProvider?.aircraftCount ?? store.aircraftCount,
    lastPollTimestamp,
    lastBroadcastTimestamp,
    scaleMetrics
  };
}

function nextSequence() {
  sequence += 1;
  return sequence;
}
