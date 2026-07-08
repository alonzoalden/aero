'use client';

import { useMemo, useState } from 'react';
import { FlightMap } from '@/components/map/FlightMap';
import { OperationsPanel } from '@/components/panels/OperationsPanel';
import { useFlightStream } from '@/hooks/useFlightStream';

export function FlightOpsDashboard() {
  const { alerts, connectionStatus, flightsById } = useFlightStream();
  const flights = useMemo(() => Object.values(flightsById), [flightsById]);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const selectedFlight = selectedFlightId ? flightsById[selectedFlightId] : flights[0] ?? null;

  return (
    <main className="dashboard-shell">
      <section className="map-region" aria-label="Live flight map">
        <FlightMap
          flights={flights}
          selectedFlightId={selectedFlight?.flightId ?? null}
          onSelectFlight={setSelectedFlightId}
        />
      </section>
      <OperationsPanel
        alerts={alerts}
        connectionStatus={connectionStatus}
        flights={flights}
        selectedFlight={selectedFlight}
        onSelectFlight={setSelectedFlightId}
      />
    </main>
  );
}
