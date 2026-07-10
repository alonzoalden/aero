'use client';

import { AltitudeChart } from '@/components/panels/AltitudeChart';
import { getDisplayHeadingDeg } from '@/lib/flightHeading';
import { basemapStyles } from '@/lib/basemaps';
import { formatNumber, formatRoute, formatTime } from '@/lib/format';
import type { ConnectionStatus, FrontendStreamMetrics } from '@/hooks/useFlightStream';
import type { BasemapId } from '@/lib/basemaps';
import type {
  FlightAlert,
  FlightServerStatus,
  FlightState,
  RuntimeSwitchableFlightDataSource
} from '@/types/flight';

type OperationsPanelProps = {
  alerts: FlightAlert[];
  basemapId: BasemapId;
  connectionStatus: ConnectionStatus;
  flights: FlightState[];
  frontendMetrics: FrontendStreamMetrics;
  serverStatus: FlightServerStatus | null;
  selectedFlight: FlightState | null;
  sourceSwitchError: string | null;
  switchingSource: RuntimeSwitchableFlightDataSource | null;
  onBasemapChange: (basemapId: BasemapId) => void;
  onSourceChange: (source: RuntimeSwitchableFlightDataSource) => void;
  onSelectFlight: (flightId: string) => void;
};

export function OperationsPanel({
  alerts,
  basemapId,
  connectionStatus,
  flights,
  frontendMetrics,
  serverStatus,
  selectedFlight,
  sourceSwitchError,
  switchingSource,
  onBasemapChange,
  onSourceChange,
  onSelectFlight
}: OperationsPanelProps) {
  const isStressMode = serverStatus?.source === 'stress';
  const isDemoOpsMode = serverStatus?.source === 'demo-ops';
  const visibleFlights = isStressMode ? flights.slice(0, 80) : flights;
  const hiddenFlightCount = Math.max(0, flights.length - visibleFlights.length);
  const scaleMetrics = serverStatus?.scaleMetrics;
  const selectedHeadingDeg = selectedFlight ? getDisplayHeadingDeg(selectedFlight) : null;
  const sourceOptions = serverStatus?.availableSources ?? [];
  const selectedBasemap = basemapStyles.find((style) => style.id === basemapId) ?? basemapStyles[0];
  const sourceNote =
    serverStatus?.sourceDescription ??
    (serverStatus?.source === 'airplanes-live'
      ? 'Real public ADS-B-derived data; updates are externally polled and may be slower.'
      : 'Simulated data for smoother demo behavior.');

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
        {isDemoOpsMode ? (
          <p className="muted source-note">Demo Ops is synthetic data designed to show frontend/live-ops behavior.</p>
        ) : null}
      </section>

      <section className="panel-section">
        <div className="section-heading-row">
          <h2>Data Source</h2>
          <strong>{switchingSource ? 'switching' : serverStatus?.source ?? 'unknown'}</strong>
        </div>
        {sourceOptions.length > 0 ? (
          <div className="source-segment" aria-label="Data source">
            {sourceOptions.map((option) => (
              <button
                aria-pressed={serverStatus?.source === option.source}
                className={serverStatus?.source === option.source ? 'mode-button active' : 'mode-button'}
                disabled={Boolean(switchingSource)}
                key={option.source}
                onClick={() => onSourceChange(option.source)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted source-note">This source is startup-only for this demo slice.</p>
        )}
        <p className="muted source-note">{sourceNote}</p>
        {sourceSwitchError ? <p className="source-error">{sourceSwitchError}</p> : null}
      </section>

      <section className="panel-section">
        <div className="section-heading-row">
          <h2>Basemap</h2>
          <strong>{selectedBasemap.label}</strong>
        </div>
        <div className="basemap-control" aria-label="Basemap style">
          <div className="basemap-buttons">
            {basemapStyles.map((style) => (
              <button
                aria-pressed={basemapId === style.id}
                className={basemapId === style.id ? 'basemap-button active' : 'basemap-button'}
                key={style.id}
                onClick={() => onBasemapChange(style.id)}
                title={style.description}
                type="button"
              >
                {style.label}
              </button>
            ))}
          </div>
        </div>
        <p className="muted source-note">{selectedBasemap.description}</p>
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
            <strong>{formatNumber(selectedHeadingDeg)} deg</strong>
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
              : 'Start the local backend to receive aircraft.'}
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
