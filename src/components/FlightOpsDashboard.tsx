'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FlightMap } from '@/components/map/FlightMap';
import { OperationsPanel } from '@/components/panels/OperationsPanel';
import { useFlightStream } from '@/hooks/useFlightStream';
import { defaultBasemapId } from '@/lib/basemaps';
import { flightApiUrl } from '@/lib/flightApi';
import { defaultLiveAircraftArea, type LiveAircraftAreaId } from '@/lib/liveAircraftAreas';
import type { BasemapId } from '@/lib/basemaps';
import type { CameraMode, CameraSettings } from '@/types/camera';
import type {
  FlightServerStatus,
  FlightState,
  LiveAircraftLimit,
  RuntimeSwitchableFlightDataSource
} from '@/types/flight';

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
  const {
    alerts,
    connectionStatus,
    flightsById,
    frontendMetrics,
    orderedFlightIds,
    serverStatus,
    serverTimeOffsetMs
  } = useFlightStream();
  const flights = useMemo(() => orderedFlightIds.map((flightId) => flightsById[flightId]), [flightsById, orderedFlightIds]);
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
  const liveArea = serverStatus?.area ?? defaultLiveAircraftArea;

  useEffect(() => {
    if (!serverStatus?.source || previousSourceRef.current === serverStatus.source) {
      return;
    }

    previousSourceRef.current = serverStatus.source;
    setSelectedFlightId(null);
    setSourceSwitchError(null);
  }, [serverStatus?.source]);

  async function handleSourceChange(
    source: RuntimeSwitchableFlightDataSource,
    options: { aircraftLimit?: LiveAircraftLimit; areaId?: LiveAircraftAreaId } = {}
  ) {
    const isUnchangedSource = source === serverStatus?.source;
    const isUnchangedLimit =
      source !== 'airplanes-live' ||
      options.aircraftLimit === undefined ||
      options.aircraftLimit === serverStatus?.aircraftLimit;
    const isUnchangedArea =
      source !== 'airplanes-live' || options.areaId === undefined || options.areaId === serverStatus?.areaId;

    if (switchingSource || (isUnchangedSource && isUnchangedLimit && isUnchangedArea)) {
      return;
    }

    setSwitchingSource(source);
    setSourceSwitchError(null);
    setSelectedFlightId(null);

    try {
      const response = await fetch(`${flightApiUrl}/api/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source, ...options })
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
          liveArea={liveArea}
          selectedFlight={selectedFlight}
          predictionEnabled={serverStatus?.source === 'airplanes-live'}
          serverTimeOffsetMs={serverTimeOffsetMs}
          onCameraModeChange={setCameraMode}
          onSelectFlight={setSelectedFlightId}
        />
      </section>
      <OperationsPanel
        alerts={alerts}
        connectionStatus={connectionStatus}
        flightsById={flightsById}
        frontendMetrics={frontendMetrics}
        orderedFlightIds={orderedFlightIds}
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
