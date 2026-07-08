'use client';

import { AltitudeChart } from '@/components/panels/AltitudeChart';
import { formatNumber, formatTime } from '@/lib/format';
import type { ConnectionStatus } from '@/hooks/useFlightStream';
import type { FlightAlert, FlightState } from '@/types/flight';

type OperationsPanelProps = {
  alerts: FlightAlert[];
  connectionStatus: ConnectionStatus;
  flights: FlightState[];
  selectedFlight: FlightState | null;
  onSelectFlight: (flightId: string) => void;
};

export function OperationsPanel({
  alerts,
  connectionStatus,
  flights,
  selectedFlight,
  onSelectFlight
}: OperationsPanelProps) {
  return (
    <aside className="ops-panel">
      <header className="panel-header">
        <div>
          <p>Operations</p>
          <h1>Live Traffic</h1>
        </div>
        <span className={`status-pill status-${connectionStatus}`}>{connectionStatus}</span>
      </header>

      <section className="panel-section">
        <h2>Selected flight</h2>
        {selectedFlight ? (
          <div className="detail-grid">
            <span>Callsign</span>
            <strong>{selectedFlight.callsign}</strong>
            <span>Route</span>
            <strong>
              {selectedFlight.origin} to {selectedFlight.destination}
            </strong>
            <span>Altitude</span>
            <strong>{formatNumber(selectedFlight.altitudeFt)} ft</strong>
            <span>Speed</span>
            <strong>{formatNumber(selectedFlight.groundSpeedKts)} kts</strong>
            <span>Heading</span>
            <strong>{formatNumber(selectedFlight.headingDeg)} deg</strong>
            <span>Updated</span>
            <strong>{formatTime(selectedFlight.timestamp)}</strong>
          </div>
        ) : (
          <p className="muted">Start the mock WebSocket server to receive flights.</p>
        )}
      </section>

      <section className="panel-section">
        <AltitudeChart flight={selectedFlight} />
      </section>

      <section className="panel-section">
        <h2>Active flights</h2>
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
                <small>
                  {flight.origin} to {flight.destination}
                </small>
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
