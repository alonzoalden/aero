'use client';

import type { PickingInfo } from '@deck.gl/core';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import maplibregl from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { formatNumber, formatRoute, formatTime } from '@/lib/format';
import type { CameraFraming, CameraMode, CameraSettings } from '@/types/camera';
import type { AircraftVisualMode, FlightState } from '@/types/flight';

type FlightMapProps = {
  aircraftVisualMode: AircraftVisualMode;
  cameraMode: CameraMode;
  cameraSettings: CameraSettings;
  flights: FlightState[];
  selectedFlight: FlightState | null;
  selectedFlightId: string | null;
  onCameraModeChange: (mode: CameraMode) => void;
  onCameraSettingsChange: Dispatch<SetStateAction<CameraSettings>>;
  onSelectFlight: (flightId: string) => void;
};

type AircraftModelStatus = 'checking' | 'ready' | 'failed';
type AircraftModelFetchStatus = 'not-started' | 'ok' | 'http-error' | 'network-error' | 'invalid-glb';
type AircraftModelDrawStatus = 'not-requested' | 'waiting' | 'drawn' | 'error';
type AircraftModelDiagnostics = {
  fetchStatus: AircraftModelFetchStatus;
  drawStatus: AircraftModelDrawStatus;
  byteSize: number | null;
  message: string | null;
};

const mapStyle = 'https://demotiles.maplibre.org/style.json';
const aircraftModelUrl = '/models/airplane.glb';
const aircraftModelThreshold = 300;
const feetToMeters = 0.3048;
const altitudeVisualScale = 0.02;
const aircraftModelScale = 1;
const selectedAircraftModelScale = 2;
const proofAircraftModelScale = 3;
const aircraftModelMinPixels = 4;
const aircraftModelMaxPixels = 18;
const AIRCRAFT_MODEL_YAW_OFFSET_DEG = 0;
const minCameraUpdateMs = 700;
const minOrbitUpdateMs = 900;

const proofFlight: FlightState = {
  flightId: 'model-proof-aircraft',
  callsign: 'MODEL-PROOF',
  lat: 33.9416,
  lon: -118.4085,
  altitudeFt: 3200,
  groundSpeedKts: 180,
  headingDeg: 285,
  verticalRateFpm: 0,
  origin: 'LAX',
  destination: 'SCENEGRAPH',
  source: 'mock',
  lastSeenSeconds: 0,
  timestamp: new Date(0).toISOString(),
  track: []
};

function hasHeading(flight: FlightState): flight is FlightState & { headingDeg: number } {
  return flight.headingDeg !== null && flight.headingDeg !== undefined;
}

function getCameraOffset(flight: FlightState, framing: CameraFraming): [number, number] {
  if (framing === 'lowerThird') {
    return [0, 140];
  }

  if (framing === 'lookAhead' && hasHeading(flight)) {
    const headingRad = (flight.headingDeg * Math.PI) / 180;
    const distancePx = 110;

    return [-Math.sin(headingRad) * distancePx, Math.cos(headingRad) * distancePx];
  }

  return [0, 0];
}

function getOrbitDegreesPerSecond(speed: CameraSettings['orbitSpeed']) {
  return speed === 'medium' ? 7 : 3;
}

function getReadableAltitudeMeters(flight: FlightState) {
  if (flight.altitudeFt === null || flight.altitudeFt === undefined) {
    return 80;
  }

  const altitudeMeters = flight.altitudeFt * feetToMeters;

  return Math.min(Math.max(altitudeMeters * altitudeVisualScale, 20), 500);
}

function getAircraftOrientation(flight: FlightState): [number, number, number] {
  const heading = hasHeading(flight) ? flight.headingDeg : 0;

  // The generated GLB points along its local +Y axis. Keep this yaw offset named so a future asset swap can be tuned.
  return [0, heading + AIRCRAFT_MODEL_YAW_OFFSET_DEG, 0];
}

function validateAircraftModel(bytes: ArrayBuffer) {
  const dataView = new DataView(bytes);

  if (bytes.byteLength < 20) {
    throw new Error('GLB is too small to contain a header and JSON chunk');
  }

  const magic = dataView.getUint32(0, true);
  const version = dataView.getUint32(4, true);
  const declaredLength = dataView.getUint32(8, true);

  if (magic !== 0x46546c67) {
    throw new Error('GLB magic header is missing');
  }

  if (version !== 2) {
    throw new Error(`Unsupported GLB version ${version}`);
  }

  if (declaredLength !== bytes.byteLength) {
    throw new Error(`GLB length mismatch: header ${declaredLength}, response ${bytes.byteLength}`);
  }

  const jsonChunkLength = dataView.getUint32(12, true);
  const jsonChunkType = dataView.getUint32(16, true);

  if (jsonChunkType !== 0x4e4f534a) {
    throw new Error('First GLB chunk is not JSON');
  }

  const jsonBytes = new Uint8Array(bytes, 20, jsonChunkLength);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes).trim());
  const meshCount = Array.isArray(json.meshes) ? json.meshes.length : 0;
  const primitiveCount = Array.isArray(json.meshes)
    ? json.meshes.reduce(
        (count: number, mesh: { primitives?: unknown[] }) => count + (Array.isArray(mesh.primitives) ? mesh.primitives.length : 0),
        0
      )
    : 0;

  if (meshCount === 0 || primitiveCount === 0) {
    throw new Error('GLB has no mesh geometry for ScenegraphLayer');
  }

  return { meshCount, primitiveCount };
}

export function FlightMap({
  aircraftVisualMode,
  cameraMode,
  cameraSettings,
  flights,
  selectedFlight,
  selectedFlightId,
  onCameraModeChange,
  onCameraSettingsChange,
  onSelectFlight
}: FlightMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const cameraTimeoutRef = useRef<number | null>(null);
  const orbitFrameRef = useRef<number | null>(null);
  const orbitStartedAtRef = useRef<number | null>(null);
  const orbitStartBearingRef = useRef<number | null>(null);
  const lastCameraUpdateRef = useRef(0);
  const cameraModeRef = useRef(cameraMode);
  const cameraSettingsRef = useRef(cameraSettings);
  const selectedFlightRef = useRef(selectedFlight);
  const [hovered, setHovered] = useState<FlightState | null>(null);
  const [aircraftModelStatus, setAircraftModelStatus] = useState<AircraftModelStatus>('checking');
  const [aircraftModelDiagnostics, setAircraftModelDiagnostics] = useState<AircraftModelDiagnostics>({
    fetchStatus: 'not-started',
    drawStatus: 'not-requested',
    byteSize: null,
    message: null
  });
  const isDense = flights.length > 250;
  const shouldFallbackToDots = aircraftVisualMode === 'models' && flights.length > aircraftModelThreshold;
  const modelRequested = aircraftVisualMode === 'models' || aircraftVisualMode === 'hybrid' || aircraftVisualMode === 'proof';
  const modelLoadFailed = aircraftModelStatus === 'failed' && modelRequested;
  const effectiveVisualMode: AircraftVisualMode = shouldFallbackToDots || modelLoadFailed ? 'dots' : aircraftVisualMode;
  const modelLayerIsAllowed = aircraftModelStatus === 'ready';
  const fallbackReason = shouldFallbackToDots
    ? `model cap hit: ${flights.length} aircraft exceeds ${aircraftModelThreshold}`
    : modelLoadFailed
      ? aircraftModelDiagnostics.message ?? 'model asset failed validation or loading'
      : modelRequested && aircraftModelStatus === 'checking'
        ? 'model asset check pending'
        : 'none';
  const cameraNeedsSelection = cameraMode !== 'free' && !selectedFlight;
  const orbitIsActive = cameraMode !== 'free' && cameraSettings.orbitEnabled && Boolean(selectedFlight);
  const modelFlights = useMemo(() => {
    if (!modelLayerIsAllowed) {
      return [];
    }

    if (effectiveVisualMode === 'models') {
      return flights;
    }

    if (effectiveVisualMode === 'hybrid') {
      return selectedFlight ? [selectedFlight] : [];
    }

    if (effectiveVisualMode === 'proof') {
      return [proofFlight];
    }

    return [];
  }, [effectiveVisualMode, flights, modelLayerIsAllowed, selectedFlight]);
  const modelLayerActiveCount = modelFlights.length;

  const layers = useMemo(
    () => {
      const modelOnlyIsActive = effectiveVisualMode === 'models' && modelLayerActiveCount > 0;
      const dotFlights = modelOnlyIsActive || effectiveVisualMode === 'proof' ? [] : flights;
      const dotLayerIsVisible = dotFlights.length > 0;

      const aircraftDotLayer = dotLayerIsVisible
        ? new ScatterplotLayer<FlightState>({
            id: 'aircraft-positions',
            data: dotFlights,
            pickable: true,
            stroked: true,
            getPosition: (flight) => [flight.lon, flight.lat],
            getRadius: (flight) =>
              flight.flightId === selectedFlightId && effectiveVisualMode !== 'hybrid'
                ? 70000
                : isDense
                  ? 18000
                  : 32000,
            radiusMinPixels: effectiveVisualMode === 'hybrid' ? 2 : isDense ? 2 : 5,
            radiusMaxPixels: effectiveVisualMode === 'hybrid' ? 7 : isDense ? 9 : 16,
            getFillColor: (flight) =>
              flight.flightId === selectedFlightId && effectiveVisualMode !== 'hybrid'
                ? [250, 204, 21, 210]
                : effectiveVisualMode === 'hybrid'
                  ? [56, 189, 248, 120]
                  : [56, 189, 248, 220],
            getLineColor: effectiveVisualMode === 'hybrid' ? [8, 15, 30, 120] : [8, 15, 30, 245],
            lineWidthMinPixels: effectiveVisualMode === 'hybrid' ? 0.5 : 1,
            onHover: (info: PickingInfo<FlightState>) => setHovered(info.object ?? null),
            onClick: (info: PickingInfo<FlightState>) => {
              if (info.object) {
                onSelectFlight(info.object.flightId);
              }
            }
          })
        : null;

      const aircraftModelLayer =
        modelFlights.length > 0
          ? new ScenegraphLayer<FlightState>({
              id: 'aircraft-models',
              data: modelFlights,
              scenegraph: aircraftModelUrl,
              pickable: true,
              // Keep the GLB in model units; ScenegraphLayer pixel clamps own screen readability.
              sizeScale: 1,
              sizeMinPixels: aircraftModelMinPixels,
              sizeMaxPixels: aircraftModelMaxPixels,
              _lighting: 'flat',
              getPosition: (flight) => [flight.lon, flight.lat, getReadableAltitudeMeters(flight)],
              getOrientation: getAircraftOrientation,
              getScale: (flight) => {
                const scale =
                  flight.flightId === proofFlight.flightId
                    ? proofAircraftModelScale
                    : flight.flightId === selectedFlightId
                      ? selectedAircraftModelScale
                      : aircraftModelScale;

                return [scale, scale, scale];
              },
              getColor: (flight) =>
                flight.flightId === proofFlight.flightId || flight.flightId === selectedFlightId
                  ? [250, 204, 21, 255]
                  : [125, 211, 252, 245],
              onFirstDraw: () => {
                setAircraftModelDiagnostics((diagnostics) => ({
                  ...diagnostics,
                  drawStatus: 'drawn',
                  message:
                    diagnostics.fetchStatus === 'ok'
                      ? `${(diagnostics.message ?? 'asset loaded').replace('; first draw complete', '')}; first draw complete`
                      : diagnostics.message
                }));
              },
              onError: (error) => {
                console.warn('Aircraft model layer failed; falling back to dots.', error);
                const message = error instanceof Error ? error.message : 'ScenegraphLayer failed while loading or drawing';
                setAircraftModelDiagnostics((diagnostics) => ({
                  ...diagnostics,
                  drawStatus: 'error',
                  message
                }));
                setAircraftModelStatus('failed');
                return true;
              },
              onHover: (info: PickingInfo<FlightState>) => setHovered(info.object ?? null),
              onClick: (info: PickingInfo<FlightState>) => {
                if (info.object) {
                  onSelectFlight(info.object.flightId);
                }
              }
            })
          : null;

      const showAllLabels = effectiveVisualMode === 'dots' && !isDense;
      const selectedLabelFlights =
        effectiveVisualMode === 'proof'
          ? [proofFlight]
          : effectiveVisualMode !== 'dots' && selectedFlight
            ? [selectedFlight]
            : [];
      const labelFlights = showAllLabels ? flights : selectedLabelFlights;
      const aircraftLabelLayer = new TextLayer<FlightState>({
        id: 'aircraft-labels',
        data: labelFlights,
        getPosition: (flight) => [flight.lon, flight.lat],
        getText: (flight) => flight.callsign,
        getSize: 12,
        getPixelOffset: [0, -22],
        getColor: [226, 232, 240, 240]
      });

      function withModelLayer(
        baseLayers: Array<ScatterplotLayer<FlightState> | ScenegraphLayer<FlightState> | TextLayer<FlightState>>
      ) {
        if (aircraftModelLayer) {
          return [...baseLayers, aircraftModelLayer, aircraftLabelLayer];
        }

        return [...baseLayers, aircraftLabelLayer];
      }

      if (effectiveVisualMode === 'models') {
        return withModelLayer(aircraftDotLayer ? [aircraftDotLayer] : []);
      }

      if (effectiveVisualMode === 'hybrid') {
        return withModelLayer(aircraftDotLayer ? [aircraftDotLayer] : []);
      }

      if (effectiveVisualMode === 'proof') {
        return withModelLayer(aircraftDotLayer ? [aircraftDotLayer] : []);
      }

      return isDense
        ? aircraftDotLayer
          ? [aircraftDotLayer]
          : []
        : aircraftDotLayer
          ? [aircraftDotLayer, aircraftLabelLayer]
          : [aircraftLabelLayer];
    },
    [
      effectiveVisualMode,
      flights,
      isDense,
      modelFlights,
      modelLayerActiveCount,
      onSelectFlight,
      selectedFlight,
      selectedFlightId
    ]
  );

  useEffect(() => {
    let isCancelled = false;

    async function checkAircraftModel() {
      try {
        setAircraftModelDiagnostics({
          fetchStatus: 'not-started',
          drawStatus: 'waiting',
          byteSize: null,
          message: null
        });
        const response = await fetch(aircraftModelUrl, { cache: 'no-store' });

        if (!response.ok) {
          if (!isCancelled) {
            setAircraftModelDiagnostics({
              fetchStatus: 'http-error',
              drawStatus: 'error',
              byteSize: null,
              message: `Aircraft model request failed with HTTP ${response.status}`
            });
          }
          throw new Error(`Aircraft model request failed with ${response.status}`);
        }

        const modelBytes = await response.arrayBuffer();

        let assetSummary: ReturnType<typeof validateAircraftModel>;

        try {
          assetSummary = validateAircraftModel(modelBytes);
        } catch (validationError) {
          if (!isCancelled) {
            setAircraftModelDiagnostics({
              fetchStatus: 'invalid-glb',
              drawStatus: 'error',
              byteSize: modelBytes.byteLength,
              message: validationError instanceof Error ? validationError.message : 'Aircraft model failed validation'
            });
          }
          throw validationError;
        }

        if (!isCancelled) {
          setAircraftModelDiagnostics({
            fetchStatus: 'ok',
            drawStatus: 'waiting',
            byteSize: modelBytes.byteLength,
            message: `asset ready: ${assetSummary.meshCount} mesh, ${assetSummary.primitiveCount} primitive`
          });
          setAircraftModelStatus('ready');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown aircraft model error';
        console.warn('Aircraft model asset is unavailable; falling back to dots.', error);
        if (!isCancelled) {
          setAircraftModelDiagnostics((diagnostics) => ({
            fetchStatus: diagnostics.fetchStatus === 'not-started' ? 'network-error' : diagnostics.fetchStatus,
            drawStatus: 'error',
            byteSize: diagnostics.byteSize,
            message
          }));
          setAircraftModelStatus('failed');
        }
      }
    }

    checkAircraftModel();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [-118.4085, 33.9416],
      zoom: 7,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      overlay.finalize();
      map.remove();
      overlayRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    overlayRef.current?.setProps({ layers });
  }, [layers]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
    cameraSettingsRef.current = cameraSettings;
    selectedFlightRef.current = selectedFlight;
  }, [cameraMode, cameraSettings, selectedFlight]);

  function easeSelectedCamera(durationMs?: number) {
    const activeMap = mapRef.current;
    const activeMode = cameraModeRef.current;
    const activeSettings = cameraSettingsRef.current;
    const activeFlight = selectedFlightRef.current;

    if (!activeMap || activeMode === 'free' || !activeFlight) {
      return;
    }

    const now = window.performance.now();
    const orbitEnabled = activeSettings.orbitEnabled;
    let bearing = activeMap.getBearing();

    if (orbitEnabled) {
      if (orbitStartedAtRef.current === null || orbitStartBearingRef.current === null) {
        orbitStartedAtRef.current = now;
        orbitStartBearingRef.current =
          activeMode === 'chase' && hasHeading(activeFlight) ? activeFlight.headingDeg : activeMap.getBearing();
      }

      const orbitStartBearing = orbitStartBearingRef.current;
      const elapsedSeconds = (now - orbitStartedAtRef.current) / 1000;
      bearing =
        orbitStartBearing +
        elapsedSeconds * getOrbitDegreesPerSecond(activeSettings.orbitSpeed);
    } else if (activeMode === 'chase' && hasHeading(activeFlight)) {
      bearing = activeFlight.headingDeg;
    }

    lastCameraUpdateRef.current = now;
    activeMap.easeTo({
      center: [activeFlight.lon, activeFlight.lat],
      zoom: activeMode === 'chase' ? 10 : 8.8,
      pitch: activeMode === 'chase' ? 65 : orbitEnabled ? 52 : 42,
      bearing,
      offset: getCameraOffset(activeFlight, activeSettings.framing),
      duration: durationMs ?? (orbitEnabled ? minOrbitUpdateMs : activeMode === 'chase' ? 800 : 650),
      essential: true
    });
  }

  useEffect(() => {
    if (cameraMode === 'free' || !cameraSettings.orbitEnabled) {
      orbitStartedAtRef.current = null;
      orbitStartBearingRef.current = null;
    }
  }, [cameraMode, cameraSettings.orbitEnabled]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || cameraMode === 'free' || !selectedFlight) {
      return;
    }

    const minUpdateMs = cameraSettings.orbitEnabled ? minOrbitUpdateMs : minCameraUpdateMs;
    const elapsedMs = window.performance.now() - lastCameraUpdateRef.current;
    if (elapsedMs >= minUpdateMs) {
      easeSelectedCamera();
      return;
    }

    if (cameraTimeoutRef.current) {
      window.clearTimeout(cameraTimeoutRef.current);
    }
    cameraTimeoutRef.current = window.setTimeout(easeSelectedCamera, minUpdateMs - elapsedMs);

    return () => {
      if (cameraTimeoutRef.current) {
        window.clearTimeout(cameraTimeoutRef.current);
        cameraTimeoutRef.current = null;
      }
    };
  }, [cameraMode, cameraSettings, selectedFlight]);

  useEffect(() => {
    if (!orbitIsActive) {
      if (orbitFrameRef.current) {
        window.cancelAnimationFrame(orbitFrameRef.current);
        orbitFrameRef.current = null;
      }
      return;
    }

    function tick() {
      const now = window.performance.now();

      if (now - lastCameraUpdateRef.current >= minOrbitUpdateMs) {
        easeSelectedCamera(minOrbitUpdateMs);
      }

      orbitFrameRef.current = window.requestAnimationFrame(tick);
    }

    orbitFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (orbitFrameRef.current) {
        window.cancelAnimationFrame(orbitFrameRef.current);
        orbitFrameRef.current = null;
      }
    };
  }, [orbitIsActive]);

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map-canvas" />
      <div className="map-title">
        <span>Live Airspace Pulse</span>
        <small>
          MapLibre basemap + deck.gl aircraft overlay
          {isDense ? ' + reduced labels for Scale Lab' : ''}
        </small>
      </div>
      <div className="visual-mode-badge">
        <span>Aircraft Style</span>
        <strong>{effectiveVisualMode}</strong>
        {fallbackReason !== 'none' ? <small>{fallbackReason}</small> : null}
      </div>
      <div className="model-diagnostics" aria-label="Aircraft model diagnostics">
        <div className="diagnostic-heading">
          <span>Model Diagnostics</span>
          <strong>{aircraftModelStatus}</strong>
        </div>
        <dl>
          <div>
            <dt>Asset URL</dt>
            <dd>{aircraftModelUrl}</dd>
          </div>
          <div>
            <dt>Fetch</dt>
            <dd>{aircraftModelDiagnostics.fetchStatus}</dd>
          </div>
          <div>
            <dt>Draw</dt>
            <dd>{aircraftModelDiagnostics.drawStatus}</dd>
          </div>
          <div>
            <dt>Bytes</dt>
            <dd>{aircraftModelDiagnostics.byteSize === null ? 'unknown' : formatNumber(aircraftModelDiagnostics.byteSize)}</dd>
          </div>
          <div>
            <dt>Layer count</dt>
            <dd>{formatNumber(modelLayerActiveCount)}</dd>
          </div>
          <div>
            <dt>Current</dt>
            <dd>{aircraftVisualMode}</dd>
          </div>
          <div>
            <dt>Effective</dt>
            <dd>{effectiveVisualMode}</dd>
          </div>
          <div>
            <dt>Fallback</dt>
            <dd>{fallbackReason}</dd>
          </div>
        </dl>
        {aircraftModelDiagnostics.message ? <p>{aircraftModelDiagnostics.message}</p> : null}
      </div>
      <div className="camera-control" aria-label="Camera mode">
        <div className="camera-control-header">
          <span>Camera</span>
          <strong>{cameraMode}</strong>
        </div>
        <div className="camera-buttons">
          {(['free', 'follow', 'chase'] as const).map((mode) => (
            <button
              aria-pressed={cameraMode === mode}
              className={cameraMode === mode ? 'camera-button active' : 'camera-button'}
              key={mode}
              onClick={() => onCameraModeChange(mode)}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="camera-subsection">
          <label className={selectedFlight && cameraMode !== 'free' ? 'camera-toggle' : 'camera-toggle disabled'}>
            <input
              checked={cameraSettings.orbitEnabled}
              disabled={!selectedFlight || cameraMode === 'free'}
              onChange={(event) =>
                onCameraSettingsChange((settings) => ({
                  ...settings,
                  orbitEnabled: event.target.checked
                }))
              }
              type="checkbox"
            />
            <span>Orbit</span>
          </label>
          <div className="camera-buttons two">
            {(['slow', 'medium'] as const).map((speed) => (
              <button
                aria-pressed={cameraSettings.orbitSpeed === speed}
                className={cameraSettings.orbitSpeed === speed ? 'camera-button active' : 'camera-button'}
                disabled={!cameraSettings.orbitEnabled || !selectedFlight || cameraMode === 'free'}
                key={speed}
                onClick={() => onCameraSettingsChange((settings) => ({ ...settings, orbitSpeed: speed }))}
                type="button"
              >
                {speed}
              </button>
            ))}
          </div>
        </div>
        <div className="camera-subsection">
          <span className="camera-label">Framing</span>
          <div className="camera-buttons">
            {(['center', 'lookAhead', 'lowerThird'] as const).map((framing) => (
              <button
                aria-pressed={cameraSettings.framing === framing}
                className={cameraSettings.framing === framing ? 'camera-button active' : 'camera-button'}
                disabled={!selectedFlight || cameraMode === 'free'}
                key={framing}
                onClick={() => onCameraSettingsChange((settings) => ({ ...settings, framing }))}
                type="button"
              >
                {framing === 'lookAhead' ? 'look ahead' : framing === 'lowerThird' ? 'lower third' : framing}
              </button>
            ))}
          </div>
        </div>
        {cameraNeedsSelection ? (
          <p className="camera-note">Select an aircraft to activate {cameraMode} camera.</p>
        ) : (
          <p className="camera-note">
            {cameraMode === 'free'
              ? 'Manual pan, zoom, pitch, and bearing.'
              : selectedFlight
                ? 'MapLibre is easing center, bearing, pitch, and offset.'
                : 'Cinematic controls are inactive until an aircraft is selected.'}
          </p>
        )}
      </div>
      {hovered ? (
        <div className="map-hover-card">
          <strong>{hovered.callsign}</strong>
          <span>{formatRoute(hovered.origin, hovered.destination)}</span>
          <span>{formatNumber(hovered.altitudeFt)} ft</span>
          <span>{formatNumber(hovered.groundSpeedKts)} kts</span>
          <span>{formatNumber(hovered.headingDeg)} deg heading</span>
          <span>{formatTime(hovered.timestamp)}</span>
        </div>
      ) : null}
    </div>
  );
}
