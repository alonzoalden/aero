'use client';

import { useMemo, useState } from 'react';
import { FlightMap } from '@/components/map/FlightMap';
import { OperationsPanel } from '@/components/panels/OperationsPanel';
import { useFlightStream } from '@/hooks/useFlightStream';
import type { CameraMode, CameraSettings } from '@/types/camera';
import type { AircraftVisualMode } from '@/types/flight';

export function FlightOpsDashboard() {
  const { alerts, connectionStatus, flightsById, frontendMetrics, serverStatus } = useFlightStream();
  const flights = useMemo(() => Object.values(flightsById), [flightsById]);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [aircraftVisualMode, setAircraftVisualMode] = useState<AircraftVisualMode>('hybrid');
  const [cameraMode, setCameraMode] = useState<CameraMode>('free');
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>({
    orbitEnabled: false,
    orbitSpeed: 'slow',
    framing: 'center'
  });
  const selectedFlight = selectedFlightId ? flightsById[selectedFlightId] ?? null : null;

  return (
    <main className="dashboard-shell">
      <section className="map-region" aria-label="Live flight map">
        <FlightMap
          cameraMode={cameraMode}
          cameraSettings={cameraSettings}
          aircraftVisualMode={aircraftVisualMode}
          flights={flights}
          selectedFlight={selectedFlight}
          selectedFlightId={selectedFlight?.flightId ?? null}
          onCameraModeChange={setCameraMode}
          onCameraSettingsChange={setCameraSettings}
          onSelectFlight={setSelectedFlightId}
        />
      </section>
      <OperationsPanel
        alerts={alerts}
        connectionStatus={connectionStatus}
        flights={flights}
        frontendMetrics={frontendMetrics}
        serverStatus={serverStatus}
        selectedFlight={selectedFlight}
        aircraftVisualMode={aircraftVisualMode}
        onAircraftVisualModeChange={setAircraftVisualMode}
        onSelectFlight={setSelectedFlightId}
      />
    </main>
  );
}
