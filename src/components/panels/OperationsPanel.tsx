'use client';

import { AltitudeChart } from '@/components/panels/AltitudeChart';
import { formatNumber, formatRoute, formatTime } from '@/lib/format';
import type { ConnectionStatus, FrontendStreamMetrics } from '@/hooks/useFlightStream';
import type { AircraftVisualMode, FlightAlert, FlightServerStatus, FlightState } from '@/types/flight';

type OperationsPanelProps = {
  alerts: FlightAlert[];
  aircraftVisualMode: AircraftVisualMode;
  connectionStatus: ConnectionStatus;
  flights: FlightState[];
  frontendMetrics: FrontendStreamMetrics;
  serverStatus: FlightServerStatus | null;
  selectedFlight: FlightState | null;
  onAircraftVisualModeChange: (mode: AircraftVisualMode) => void;
  onSelectFlight: (flightId: string) => void;
};

const aircraftModelThreshold = 300;

export function OperationsPanel({
  alerts,
  aircraftVisualMode,
  connectionStatus,
  flights,
  frontendMetrics,
  serverStatus,
  selectedFlight,
  onAircraftVisualModeChange,
  onSelectFlight
}: OperationsPanelProps) {
  const isStressMode = serverStatus?.source === 'stress';
  const modelFallbackIsActive = aircraftVisualMode === 'models' && flights.length > aircraftModelThreshold;
  const visibleFlights = isStressMode ? flights.slice(0, 80) : flights;
  const hiddenFlightCount = Math.max(0, flights.length - visibleFlights.length);
  const scaleMetrics = serverStatus?.scaleMetrics;

  return (
    <aside className="ops-panel">
      <header className="panel-header">
        <div>
          <p>Operations</p>
          <h1>Live Airspace Pulse</h1>
        </div>
        <span className={`status-pill status-${connectionStatus}`}>{connectionStatus}</span>
      </header>

      <section className="panel-section">
        <h2>Stream status</h2>
        <div className="detail-grid">
          <span>Source</span>
          <strong>{serverStatus?.source ?? 'unknown'}</strong>
          <span>Aircraft</span>
          <strong>{serverStatus?.aircraftCount ?? flights.length}</strong>
          <span>Clients</span>
          <strong>{serverStatus?.connectedClients ?? 'unknown'}</strong>
          <span>Server update</span>
          <strong>
            {serverStatus?.lastBroadcastTimestamp ? formatTime(serverStatus.lastBroadcastTimestamp) : 'unknown'}
          </strong>
        </div>
      </section>

      {isStressMode ? (
        <section className="panel-section scale-lab">
          <h2>Scale Lab</h2>
          <div className="detail-grid">
            <span>Source</span>
            <strong>{serverStatus.source}</strong>
            <span>Aircraft</span>
            <strong>{formatNumber(scaleMetrics?.activeAircraftCount ?? serverStatus.aircraftCount)}</strong>
            <span>Clients</span>
            <strong>{formatNumber(scaleMetrics?.connectedClients ?? serverStatus.connectedClients)}</strong>
            <span>Ingest/sec</span>
            <strong>{formatNumber(scaleMetrics?.ingestUpdatesPerSec)}</strong>
            <span>WS msg/sec</span>
            <strong>{formatNumber(scaleMetrics?.webSocketMessagesPerSec)}</strong>
            <span>Broadcast/sec</span>
            <strong>{formatNumber(scaleMetrics?.aircraftUpdatesBroadcastPerSec)}</strong>
            <span>Received/sec</span>
            <strong>{formatNumber(frontendMetrics.aircraftUpdatesReceivedPerSec)}</strong>
            <span>Frontend msg/sec</span>
            <strong>{formatNumber(frontendMetrics.receivedMessagesPerSec)}</strong>
            <span>Approx FPS</span>
            <strong>{formatNumber(frontendMetrics.renderFps)}</strong>
            <span>Coalesced</span>
            <strong>{formatNumber(scaleMetrics?.coalescedUpdateCount)}</strong>
            <span>Sequence</span>
            <strong>{formatNumber(frontendMetrics.lastSequence ?? scaleMetrics?.sequence)}</strong>
            <span>Server time</span>
            <strong>
              {frontendMetrics.lastServerTimestamp
                ? formatTime(frontendMetrics.lastServerTimestamp)
                : scaleMetrics?.lastBroadcastTimestamp
                  ? formatTime(scaleMetrics.lastBroadcastTimestamp)
                  : 'unknown'}
            </strong>
          </div>
        </section>
      ) : null}

      <section className="panel-section">
        <div className="section-heading-row">
          <h2>Aircraft Style</h2>
          <strong>{aircraftVisualMode}</strong>
        </div>
        <div className="mode-segment" aria-label="Aircraft visual mode">
          {(['dots', 'models', 'hybrid', 'proof'] as const).map((mode) => (
            <button
              aria-pressed={aircraftVisualMode === mode}
              className={aircraftVisualMode === mode ? 'mode-button active' : 'mode-button'}
              key={mode}
              onClick={() => onAircraftVisualModeChange(mode)}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>
        <p className="muted mode-note">
          {modelFallbackIsActive
            ? `Models are capped at ${aircraftModelThreshold} aircraft for this demo, so the map is using dots.`
            : aircraftVisualMode === 'hybrid'
              ? 'Hybrid draws the selected aircraft as a dominant model while keeping small faint dots for context.'
              : aircraftVisualMode === 'proof'
                ? 'Proof draws one fixed ScenegraphLayer test aircraft near LAX with dots suppressed.'
              : aircraftVisualMode === 'models'
                ? 'Models use deck.gl ScenegraphLayer only when the count is below the demo safety cap.'
                : 'Dots keep high-density and stress-mode views readable.'}
        </p>
      </section>

      <section className="panel-section">
        <h2>Selected aircraft</h2>
        {selectedFlight ? (
          <div className="detail-grid">
            <span>Callsign</span>
            <strong>{selectedFlight.callsign}</strong>
            <span>Route</span>
            <strong>{formatRoute(selectedFlight.origin, selectedFlight.destination)}</strong>
            <span>Altitude</span>
            <strong>{formatNumber(selectedFlight.altitudeFt)} ft</strong>
            <span>Speed</span>
            <strong>{formatNumber(selectedFlight.groundSpeedKts)} kts</strong>
            <span>Heading</span>
            <strong>{formatNumber(selectedFlight.headingDeg)} deg</strong>
            <span>Vertical rate</span>
            <strong>{formatNumber(selectedFlight.verticalRateFpm)} fpm</strong>
            <span>Source</span>
            <strong>{selectedFlight.source}</strong>
            <span>Last seen</span>
            <strong>
              {selectedFlight.lastSeenSeconds === null || selectedFlight.lastSeenSeconds === undefined
                ? 'unknown'
                : `${formatNumber(selectedFlight.lastSeenSeconds)} sec`}
            </strong>
            <span>Updated</span>
            <strong>{formatTime(selectedFlight.timestamp)}</strong>
          </div>
        ) : (
          <p className="muted">
            {flights.length > 0
              ? 'The first aircraft is selected automatically; select another aircraft from the map or list.'
              : 'Start the local backend to receive aircraft, or use proof mode to verify the local model.'}
          </p>
        )}
      </section>

      <section className="panel-section">
        <AltitudeChart flight={selectedFlight} />
      </section>

      <section className="panel-section">
        <h2>Active aircraft</h2>
        {hiddenFlightCount > 0 ? (
          <p className="muted list-summary">
            Showing {visibleFlights.length} of {formatNumber(flights.length)} aircraft to keep the panel readable.
          </p>
        ) : null}
        <div className="flight-list">
          {visibleFlights.map((flight) => (
            <button
              className={flight.flightId === selectedFlight?.flightId ? 'flight-row selected' : 'flight-row'}
              key={flight.flightId}
              onClick={() => onSelectFlight(flight.flightId)}
              type="button"
            >
              <span>
                <strong>{flight.callsign}</strong>
                <small>{formatRoute(flight.origin, flight.destination)}</small>
              </span>
              <span>{formatNumber(flight.altitudeFt)} ft</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <h2>Alerts</h2>
        <div className="alert-list">
          {alerts.map((alert) => (
            <article className={`alert alert-${alert.severity}`} key={alert.id}>
              <strong>{alert.type}</strong>
              <span>{alert.message}</span>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}
