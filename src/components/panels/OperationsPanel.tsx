'use client';

import { AltitudeChart } from '@/components/panels/AltitudeChart';
import { formatNumber, formatRoute, formatTime } from '@/lib/format';
import type { ConnectionStatus } from '@/hooks/useFlightStream';
import type { FlightAlert, FlightServerStatus, FlightState } from '@/types/flight';

type OperationsPanelProps = {
  alerts: FlightAlert[];
  connectionStatus: ConnectionStatus;
  flights: FlightState[];
  serverStatus: FlightServerStatus | null;
  selectedFlight: FlightState | null;
  onSelectFlight: (flightId: string) => void;
};

export function OperationsPanel({
  alerts,
  connectionStatus,
  flights,
  serverStatus,
  selectedFlight,
  onSelectFlight
}: OperationsPanelProps) {
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
          <p className="muted">Start the local backend to receive aircraft.</p>
        )}
      </section>

      <section className="panel-section">
        <AltitudeChart flight={selectedFlight} />
      </section>

      <section className="panel-section">
        <h2>Active aircraft</h2>
        <div className="flight-list">
          {flights.map((flight) => (
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
