'use client';

import type { PickingInfo } from '@deck.gl/core';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import maplibregl, { type MapLibreEvent, type StyleSpecification } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type CameraGestureEvent = MapLibreEvent<MouseEvent | TouchEvent | undefined>;

const aircraftModelUrl = '/models/airplane.glb';
const feetToMeters = 0.3048;
const altitudeVisualScale = 0.02;
const aircraftModelScale = 0.5;
const selectedAircraftModelScale = 1;
const aircraftModelMinPixels = 8;
const aircraftModelMaxPixels = 42;
const AIRCRAFT_MODEL_YAW_OFFSET_DEG = 0;
const followCameraUpdateMs = 700;
const chaseCameraUpdateMs = 180;
const chaseCameraOffset: [number, number] = [0, 190];
const chaseCameraPitch = 72;
const chaseCameraInitialZoom = 15;
const chaseCameraEaseMs = 520;
const followCameraEaseMs = 650;
const followCameraPitch = 42;
const cartoAttribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type BasemapStyle = {
  id: 'voyager' | 'positron' | 'dark' | 'osm' | 'demo';
  label: string;
  description: string;
  createStyle: () => string | StyleSpecification;
};

function createRasterBasemapStyle(name: string, tileUrl: string, attribution: string): StyleSpecification {
  return {
    version: 8,
    name,
    sources: {
      rasterBasemap: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution
      }
    },
    layers: [
      {
        id: 'raster-basemap',
        type: 'raster',
        source: 'rasterBasemap',
        minzoom: 0,
        maxzoom: 19
      }
    ]
  };
}

const basemapStyles: BasemapStyle[] = [
  {
    id: 'voyager',
    label: 'Detail',
    description: 'CARTO Voyager labels roads, places, borders, and state context.',
    createStyle: () =>
      createRasterBasemapStyle(
        'CARTO Voyager',
        'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        cartoAttribution
      )
  },
  {
    id: 'positron',
    label: 'Light',
    description: 'A quieter labeled basemap for reading dense aircraft overlays.',
    createStyle: () =>
      createRasterBasemapStyle(
        'CARTO Positron',
        'https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png',
        cartoAttribution
      )
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'A dark labeled basemap that matches the operations panel.',
    createStyle: () =>
      createRasterBasemapStyle(
        'CARTO Dark Matter',
        'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
        cartoAttribution
      )
  },
  {
    id: 'osm',
    label: 'OSM',
    description: 'OpenStreetMap standard tiles with familiar road and place detail.',
    createStyle: () =>
      createRasterBasemapStyle('OpenStreetMap Standard', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', osmAttribution)
  },
  {
    id: 'demo',
    label: 'Demo',
    description: 'The original MapLibre demo vector style.',
    createStyle: () => 'https://demotiles.maplibre.org/style.json'
  }
];

const defaultBasemapId: BasemapStyle['id'] = 'voyager';

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

function getActiveCameraOffset(flight: FlightState, mode: CameraMode, framing: CameraFraming): [number, number] {
  if (mode === 'chase') {
    return chaseCameraOffset;
  }

  return getCameraOffset(flight, framing);
}

function normalizeBearing(bearing: number) {
  return ((bearing % 360) + 360) % 360;
}

function getNearestBearingEquivalent(currentBearing: number, targetBearing: number) {
  const delta = ((targetBearing - currentBearing + 540) % 360) - 180;

  return currentBearing + delta;
}

function getChaseCameraBearing(flight: FlightState) {
  // Match MapLibre bearing to the compass heading so the corrected aircraft nose renders screen-up.
  return hasHeading(flight) ? normalizeBearing(flight.headingDeg) : 0;
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

  // headingDeg is a compass bearing: 0=north, 90=east. deck.gl yaw is positive counter-clockwise
  // from the model's local +Y nose axis, so invert heading before applying any asset-specific offset.
  return [0, -heading + AIRCRAFT_MODEL_YAW_OFFSET_DEG, 0];
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
  const onCameraModeChangeRef = useRef(onCameraModeChange);
  const basemapStyleInitializedRef = useRef(false);
  const previousCameraModeRef = useRef(cameraMode);
  const [hovered, setHovered] = useState<FlightState | null>(null);
  const [basemapId, setBasemapId] = useState<BasemapStyle['id']>(defaultBasemapId);
  const isDense = flights.length > 250;
  const selectedBasemap = basemapStyles.find((style) => style.id === basemapId) ?? basemapStyles[0];
  const aircraftLabelStyle = useMemo(
    () =>
      basemapId === 'dark'
        ? {
            backgroundColor: [248, 250, 252, 232] as [number, number, number, number],
            color: [15, 23, 42, 245] as [number, number, number, number],
            useBackground: true
          }
        : {
            backgroundColor: [248, 250, 252, 0] as [number, number, number, number],
            color: [15, 23, 42, 245] as [number, number, number, number],
            useBackground: false
          },
    [basemapId]
  );
  const effectiveVisualMode = aircraftVisualMode;
  const cameraNeedsSelection = cameraMode !== 'free' && !selectedFlight;
  const releaseCameraToFree = useCallback((event?: CameraGestureEvent) => {
    if (!event?.originalEvent) {
      return;
    }

    if (cameraModeRef.current === 'free') {
      return;
    }

    if (cameraTimeoutRef.current) {
      window.clearTimeout(cameraTimeoutRef.current);
      cameraTimeoutRef.current = null;
    }

    cameraModeRef.current = 'free';
    onCameraModeChangeRef.current('free');
  }, []);
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
      const dotFlights =
        effectiveVisualMode === 'hybrid' && selectedFlightId
          ? flights.filter((flight) => flight.flightId !== selectedFlightId)
          : modelOnlyIsActive
            ? []
            : flights;
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

      const selectedAircraftHaloLayer =
        effectiveVisualMode === 'hybrid' && selectedFlight
          ? new ScatterplotLayer<FlightState>({
              id: 'selected-aircraft-halo',
              data: [selectedFlight],
              pickable: false,
              stroked: true,
              filled: true,
              getPosition: (flight) => [flight.lon, flight.lat],
              getRadius: 95000,
              radiusMinPixels: 18,
              radiusMaxPixels: 34,
              getFillColor: [250, 204, 21, 46],
              getLineColor: [250, 204, 21, 230],
              lineWidthMinPixels: 2
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
              sizeMinPixels: effectiveVisualMode === 'hybrid' ? 18 : aircraftModelMinPixels,
              sizeMaxPixels: effectiveVisualMode === 'hybrid' ? 58 : aircraftModelMaxPixels,
              _lighting: 'pbr',
              getPosition: (flight) => [flight.lon, flight.lat, getReadableAltitudeMeters(flight)],
              getOrientation: getAircraftOrientation,
              getScale: (flight) => {
                const scale = flight.flightId === selectedFlightId ? selectedAircraftModelScale : aircraftModelScale;

                return [scale, scale, scale];
              },
              getColor: [255, 255, 255, 250],
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
        background: aircraftLabelStyle.useBackground,
        backgroundPadding: [5, 3],
        getBackgroundColor: aircraftLabelStyle.backgroundColor,
        getColor: aircraftLabelStyle.color
      });

      function withModelLayer(
        baseLayers: Array<ScatterplotLayer<FlightState> | ScenegraphLayer<FlightState> | TextLayer<FlightState>>
      ) {
        const layersWithHalo = selectedAircraftHaloLayer ? [...baseLayers, selectedAircraftHaloLayer] : baseLayers;

        if (aircraftModelLayer) {
          return [...layersWithHalo, aircraftModelLayer, aircraftLabelLayer];
        }

        return [...layersWithHalo, aircraftLabelLayer];
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
      aircraftLabelStyle,
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
      style: selectedBasemap.createStyle(),
      center: [-118.4085, 33.9416],
      zoom: 7,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
    map.on('dragstart', releaseCameraToFree);
    map.on('rotatestart', releaseCameraToFree);

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      map.off('dragstart', releaseCameraToFree);
      map.off('rotatestart', releaseCameraToFree);
      overlay.finalize();
      map.remove();
      overlayRef.current = null;
      mapRef.current = null;
    };
  }, [releaseCameraToFree, selectedBasemap]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    if (!basemapStyleInitializedRef.current) {
      basemapStyleInitializedRef.current = true;
      return;
    }

    map.setStyle(selectedBasemap.createStyle());
  }, [selectedBasemap]);

  useEffect(() => {
    overlayRef.current?.setProps({ layers });
  }, [layers]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
    cameraSettingsRef.current = cameraSettings;
    selectedFlightRef.current = selectedFlight;
    onCameraModeChangeRef.current = onCameraModeChange;
  }, [cameraMode, cameraSettings, onCameraModeChange, selectedFlight]);

  function easeSelectedCamera(durationMs?: number, options?: { applyChaseMinZoom?: boolean }) {
    const activeMap = mapRef.current;
    const activeMode = cameraModeRef.current;
    const activeSettings = cameraSettingsRef.current;
    const activeFlight = selectedFlightRef.current;

    if (!activeMap || activeMode === 'free' || !activeFlight) {
      return;
    }

    const now = window.performance.now();
    let bearing = activeMap.getBearing();
    const zoom =
      activeMode === 'chase' && options?.applyChaseMinZoom
        ? Math.min(activeMap.getMaxZoom(), chaseCameraInitialZoom)
        : activeMap.getZoom();

    if (activeMode === 'chase' && hasHeading(activeFlight)) {
      bearing = getNearestBearingEquivalent(bearing, getChaseCameraBearing(activeFlight));
    }

    lastCameraUpdateRef.current = now;
    activeMap.easeTo({
      center: [activeFlight.lon, activeFlight.lat],
      zoom,
      pitch: activeMode === 'chase' ? chaseCameraPitch : followCameraPitch,
      bearing,
      offset: getActiveCameraOffset(activeFlight, activeMode, activeSettings.framing),
      duration: durationMs ?? (activeMode === 'chase' ? chaseCameraEaseMs : followCameraEaseMs),
      essential: true
    });
  }

  useEffect(() => {
    const map = mapRef.current;

    if (!map || cameraMode === 'free' || !selectedFlight) {
      previousCameraModeRef.current = cameraMode;
      return;
    }

    const enteringChaseMode = cameraMode === 'chase' && previousCameraModeRef.current !== 'chase';
    const minUpdateMs = cameraMode === 'chase' ? chaseCameraUpdateMs : followCameraUpdateMs;
    if (enteringChaseMode) {
      easeSelectedCamera(undefined, { applyChaseMinZoom: true });
      previousCameraModeRef.current = cameraMode;
      return;
    }

    const elapsedMs = window.performance.now() - lastCameraUpdateRef.current;
    if (elapsedMs >= minUpdateMs) {
      easeSelectedCamera();
      previousCameraModeRef.current = cameraMode;
      return;
    }

    if (cameraTimeoutRef.current) {
      window.clearTimeout(cameraTimeoutRef.current);
    }
    cameraTimeoutRef.current = window.setTimeout(easeSelectedCamera, minUpdateMs - elapsedMs);
    previousCameraModeRef.current = cameraMode;

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
      <div className="basemap-control" aria-label="Basemap style">
        <div className="basemap-control-header">
          <span>Basemap</span>
          <strong>{selectedBasemap.label}</strong>
        </div>
        <div className="basemap-buttons">
          {basemapStyles.map((style) => (
            <button
              aria-pressed={basemapId === style.id}
              className={basemapId === style.id ? 'basemap-button active' : 'basemap-button'}
              key={style.id}
              onClick={() => setBasemapId(style.id)}
              title={style.description}
              type="button"
            >
              {style.label}
            </button>
          ))}
        </div>
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
                ? cameraMode === 'chase'
                  ? 'MapLibre is matching aircraft heading and holding the camera behind it.'
                  : 'MapLibre is easing center, bearing, pitch, and offset.'
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
