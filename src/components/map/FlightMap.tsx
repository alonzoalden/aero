'use client';

import type { PickingInfo } from '@deck.gl/core';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import maplibregl from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  onSelectFlight: (flightId: string) => void;
};

const mapStyle = 'https://demotiles.maplibre.org/style.json';
const aircraftModelUrl = '/models/airplane.glb';
const feetToMeters = 0.3048;
const altitudeVisualScale = 0.02;
const aircraftModelScale = 0.5;
const selectedAircraftModelScale = 0.85;
const aircraftModelMinPixels = 7;
const aircraftModelMaxPixels = 24;
const AIRCRAFT_MODEL_YAW_OFFSET_DEG = 0;
const minCameraUpdateMs = 700;

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

export function FlightMap({
  aircraftVisualMode,
  cameraMode,
  cameraSettings,
  flights,
  selectedFlight,
  selectedFlightId,
  onCameraModeChange,
  onSelectFlight
}: FlightMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const cameraTimeoutRef = useRef<number | null>(null);
  const lastCameraUpdateRef = useRef(0);
  const cameraModeRef = useRef(cameraMode);
  const cameraSettingsRef = useRef(cameraSettings);
  const selectedFlightRef = useRef(selectedFlight);
  const [hovered, setHovered] = useState<FlightState | null>(null);
  const isDense = flights.length > 250;
  const effectiveVisualMode = aircraftVisualMode;
  const cameraNeedsSelection = cameraMode !== 'free' && !selectedFlight;
  const modelFlights = useMemo(() => {
    if (effectiveVisualMode === 'models') {
      return flights;
    }

    if (effectiveVisualMode === 'hybrid') {
      return selectedFlight ? [selectedFlight] : [];
    }

    return [];
  }, [effectiveVisualMode, flights, selectedFlight]);
  const modelLayerActiveCount = modelFlights.length;

  const layers = useMemo(
    () => {
      const modelOnlyIsActive = effectiveVisualMode === 'models' && modelLayerActiveCount > 0;
      const dotFlights = modelOnlyIsActive ? [] : flights;
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
                const scale = flight.flightId === selectedFlightId ? selectedAircraftModelScale : aircraftModelScale;

                return [scale, scale, scale];
              },
              getColor: (flight) =>
                flight.flightId === selectedFlightId ? [250, 204, 21, 255] : [125, 211, 252, 245],
              onError: (error) => {
                console.warn('Aircraft model layer failed to load.', error);
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
      const selectedLabelFlights = effectiveVisualMode !== 'dots' && selectedFlight ? [selectedFlight] : [];
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
    let bearing = activeMap.getBearing();

    if (activeMode === 'chase' && hasHeading(activeFlight)) {
      bearing = activeFlight.headingDeg;
    }

    lastCameraUpdateRef.current = now;
    activeMap.easeTo({
      center: [activeFlight.lon, activeFlight.lat],
      pitch: activeMode === 'chase' ? 65 : 42,
      bearing,
      offset: getCameraOffset(activeFlight, activeSettings.framing),
      duration: durationMs ?? (activeMode === 'chase' ? 800 : 650),
      essential: true
    });
  }

  useEffect(() => {
    const map = mapRef.current;

    if (!map || cameraMode === 'free' || !selectedFlight) {
      return;
    }

    const minUpdateMs = minCameraUpdateMs;
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
