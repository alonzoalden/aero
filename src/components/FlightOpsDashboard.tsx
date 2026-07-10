'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FlightMap } from '@/components/map/FlightMap';
import { OperationsPanel } from '@/components/panels/OperationsPanel';
import { useFlightStream } from '@/hooks/useFlightStream';
import { defaultBasemapId } from '@/lib/basemaps';
import { flightApiUrl } from '@/lib/flightApi';
import type { BasemapId } from '@/lib/basemaps';
import type { CameraMode, CameraSettings } from '@/types/camera';
import type { FlightServerStatus, FlightState, RuntimeSwitchableFlightDataSource } from '@/types/flight';

const initialMapViewportBounds = {
  minLat: 32.2,
  maxLat: 35.5,
  minLon: -121.2,
  maxLon: -115.6
};

function isInsideInitialMapViewport(flight: FlightState) {
  return (
    flight.lat >= initialMapViewportBounds.minLat &&
    flight.lat <= initialMapViewportBounds.maxLat &&
    flight.lon >= initialMapViewportBounds.minLon &&
    flight.lon <= initialMapViewportBounds.maxLon
  );
}

export function FlightOpsDashboard() {
  const { alerts, connectionStatus, flightsById, frontendMetrics, serverStatus } = useFlightStream();
  const flights = useMemo(() => Object.values(flightsById), [flightsById]);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [basemapId, setBasemapId] = useState<BasemapId>(defaultBasemapId);
  const [cameraMode, setCameraMode] = useState<CameraMode>('free');
  const [cameraSettings] = useState<CameraSettings>({ framing: 'center' });
  const [sourceSwitchError, setSourceSwitchError] = useState<string | null>(null);
  const [switchingSource, setSwitchingSource] = useState<RuntimeSwitchableFlightDataSource | null>(null);
  const previousSourceRef = useRef(serverStatus?.source ?? null);
  const defaultSelectedFlight = useMemo(
    () => flights.find(isInsideInitialMapViewport) ?? flights[0] ?? null,
    [flights]
  );
  const effectiveSelectedFlightId =
    selectedFlightId && flightsById[selectedFlightId] ? selectedFlightId : defaultSelectedFlight?.flightId ?? null;
  const selectedFlight = effectiveSelectedFlightId ? flightsById[effectiveSelectedFlightId] ?? null : null;

  useEffect(() => {
    if (!serverStatus?.source || previousSourceRef.current === serverStatus.source) {
      return;
    }

    previousSourceRef.current = serverStatus.source;
    setSelectedFlightId(null);
    setSourceSwitchError(null);
  }, [serverStatus?.source]);

  async function handleSourceChange(source: RuntimeSwitchableFlightDataSource) {
    if (switchingSource || source === serverStatus?.source) {
      return;
    }

    setSwitchingSource(source);
    setSourceSwitchError(null);
    setSelectedFlightId(null);

    try {
      const response = await fetch(`${flightApiUrl}/api/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source })
      });
      const payload = (await response.json()) as { error?: string; status?: FlightServerStatus };

      if (!response.ok) {
        throw new Error(payload.error ?? `Source switch failed with ${response.status}`);
      }
    } catch (error) {
      setSourceSwitchError(error instanceof Error ? error.message : 'Source switch failed');
    } finally {
      setSwitchingSource(null);
    }
  }

  return (
    <main className="dashboard-shell">
      <section className="map-region" aria-label="Live flight map">
        <FlightMap
          cameraMode={cameraMode}
          cameraSettings={cameraSettings}
          basemapId={basemapId}
          flights={flights}
          selectedFlight={selectedFlight}
          onCameraModeChange={setCameraMode}
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
        basemapId={basemapId}
        sourceSwitchError={sourceSwitchError}
        switchingSource={switchingSource}
        onBasemapChange={setBasemapId}
        onSourceChange={handleSourceChange}
        onSelectFlight={setSelectedFlightId}
      />
    </main>
  );
}
