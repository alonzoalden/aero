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
import type {
  FlightAlert,
  FlightDataSource,
  FlightPositionUpdate,
  FlightServerStatus,
  FlightSourceOption,
  FlightStreamMessage,
  RuntimeSwitchableFlightDataSource,
  ScaleMetrics
} from '../src/types/flight';

const app = express();
const httpServer = http.createServer(app);
const store = new FlightHistoryStore();
const stressProvider = config.dataSource === 'stress' ? createStressProvider(config.stress.aircraftCount) : null;
const demoOpsProvider = config.dataSource === 'demo-ops' ? createDemoOpsProvider(config.demoOps.aircraftCount) : null;
const runtimeSourceOptions: FlightSourceOption[] = [
  {
    source: 'mock',
    label: 'Simulated Demo',
    description: 'Simulated data for smoother demo behavior.',
    pollIntervalMs: 1000
  },
  {
    source: 'airplanes-live',
    label: 'Real ADS-B',
    description: 'Real public ADS-B-derived data; updates are externally polled and may be slower.',
    pollIntervalMs: config.airplanesLivePollMs
  }
];

let alerts: FlightAlert[] = [];
let activeSource: FlightDataSource = config.dataSource;
let runtimeProvider: AircraftProvider | null = isRuntimeSwitchableSource(config.dataSource)
  ? createRuntimeProvider(config.dataSource)
  : null;
let runtimePollTimer: ReturnType<typeof setInterval> | null = null;
let runtimePollGeneration = 0;
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

app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (request.method === 'OPTIONS') {
    response.sendStatus(204);
    return;
  }

  next();
});
app.use(express.json());

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

app.get('/api/sources', (_request, response) => {
  response.json({
    currentSource: activeSource,
    availableSources: runtimeSourceOptions,
    isRuntimeSwitchable: isRuntimeSwitchableSource(activeSource)
  });
});

app.post('/api/source', async (request, response) => {
  if (!isRuntimeSwitchableSource(activeSource)) {
    response.status(409).json({
      error: `${activeSource} is startup-only in this demo slice.`,
      status: getStatus()
    });
    return;
  }

  const requestedSource = readRequestedSource(request.body);
  if (!requestedSource) {
    response.status(400).json({
      error: 'source must be mock or airplanes-live',
      status: getStatus()
    });
    return;
  }

  try {
    await switchRuntimeSource(requestedSource);
    response.json(getStatus());
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to switch source',
      status: getStatus()
    });
  }
});

httpServer.listen(config.port, () => {
  console.log(`Live Airspace Pulse backend listening on http://localhost:${config.port}`);
  console.log(`Flight data source: ${activeSource}`);
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
  startRuntimePolling();
  void pollRuntimeProvider('snapshot');
}

setInterval(() => {
  ingestUpdatesPerSec = ingestUpdatesThisSecond;
  webSocketMessagesPerSec = webSocketMessagesThisSecond;
  aircraftUpdatesBroadcastPerSec = aircraftUpdatesBroadcastThisSecond;
  ingestUpdatesThisSecond = 0;
  webSocketMessagesThisSecond = 0;
  aircraftUpdatesBroadcastThisSecond = 0;
}, 1000);

async function pollRuntimeProvider(messageType: 'batch' | 'snapshot' = 'batch') {
  if (!runtimeProvider) {
    return false;
  }

  const generation = runtimePollGeneration;
  const provider = runtimeProvider;

  try {
    const result = await provider.getSnapshot();
    if (generation !== runtimePollGeneration || provider !== runtimeProvider) {
      return;
    }

    lastPollTimestamp = new Date().toISOString();
    alerts = result.alerts;
    if (messageType === 'snapshot') {
      store.clear();
    }
    store.upsertMany(result.flights);
    lastBroadcastTimestamp = new Date().toISOString();
    broadcastFlights(messageType, result.flights, lastBroadcastTimestamp);
    return true;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return false;
  }
}

function startRuntimePolling() {
  stopRuntimePolling();
  runtimePollTimer = setInterval(() => {
    void pollRuntimeProvider();
  }, getActivePollIntervalMs());
}

function stopRuntimePolling() {
  if (runtimePollTimer) {
    clearInterval(runtimePollTimer);
    runtimePollTimer = null;
  }
}

async function switchRuntimeSource(source: RuntimeSwitchableFlightDataSource) {
  runtimePollGeneration += 1;
  stopRuntimePolling();
  activeSource = source;
  runtimeProvider = createRuntimeProvider(source);
  alerts = [];
  lastPollTimestamp = null;
  store.clear();
  const timestamp = new Date().toISOString();
  lastBroadcastTimestamp = timestamp;
  broadcastFlights('snapshot', [], timestamp);
  startRuntimePolling();
  await pollRuntimeProvider('snapshot');
}

function broadcastFlights(type: 'batch' | 'snapshot', flights: FlightPositionUpdate[], timestamp: string) {
  const message: FlightStreamMessage = {
    type,
    flights,
    alerts,
    status: getStatus(),
    sequence: nextSequence(),
    serverTimestamp: timestamp
  };

  webSocketMessagesThisSecond += socketServer.broadcast(message);
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
    activeSource === 'stress'
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
    source: activeSource,
    connectedClients: socketServer.clientCount,
    aircraftCount: getCurrentAircraftCount(),
    lastPollTimestamp,
    lastBroadcastTimestamp,
    availableSources: isRuntimeSwitchableSource(activeSource) ? runtimeSourceOptions : undefined,
    sourceMode: isRuntimeSwitchableSource(activeSource) ? 'runtime-switchable' : 'startup-only',
    sourceDescription: getSourceDescription(activeSource),
    pollIntervalMs: isRuntimeSwitchableSource(activeSource) ? getActivePollIntervalMs() : undefined,
    isRuntimeSwitchable: isRuntimeSwitchableSource(activeSource),
    scaleMetrics
  };
}

function getCurrentAircraftCount() {
  return stressProvider?.aircraftCount ?? demoOpsProvider?.aircraftCount ?? store.aircraftCount;
}

function getActivePollIntervalMs() {
  return activeSource === 'airplanes-live' ? config.airplanesLivePollMs : 1000;
}

function getSourceDescription(source: FlightDataSource) {
  return (
    runtimeSourceOptions.find((option) => option.source === source)?.description ??
    (source === 'demo-ops'
      ? 'Synthetic operational demo data designed to show frontend/live-ops behavior.'
      : 'Startup-only scale/load simulation for local rendering and WebSocket throughput checks.')
  );
}

function createRuntimeProvider(source: RuntimeSwitchableFlightDataSource): AircraftProvider {
  return source === 'airplanes-live' ? createAirplanesLiveProvider(config.airplanesLiveUrl) : createMockProvider();
}

function isRuntimeSwitchableSource(source: FlightDataSource): source is RuntimeSwitchableFlightDataSource {
  return source === 'mock' || source === 'airplanes-live';
}

function readRequestedSource(body: unknown): RuntimeSwitchableFlightDataSource | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const source = (body as { source?: unknown }).source;
  return source === 'mock' || source === 'airplanes-live' ? source : null;
}

function nextSequence() {
  sequence += 1;
  return sequence;
}
