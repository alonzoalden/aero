'use client';

import type { PickingInfo } from '@deck.gl/core';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import maplibregl, { type MapLibreEvent } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { basemapStyles } from '@/lib/basemaps';
import { getDisplayHeadingDeg } from '@/lib/flightHeading';
import { formatNumber, formatRoute, formatTime } from '@/lib/format';
import type { BasemapId } from '@/lib/basemaps';
import type { CameraFraming, CameraMode, CameraSettings } from '@/types/camera';
import type { FlightState } from '@/types/flight';

type FlightMapProps = {
  basemapId: BasemapId;
  cameraMode: CameraMode;
  cameraSettings: CameraSettings;
  flights: FlightState[];
  selectedFlight: FlightState | null;
  onCameraModeChange: (mode: CameraMode) => void;
  onSelectFlight: (flightId: string) => void;
};

type CameraGestureEvent = MapLibreEvent<MouseEvent | TouchEvent | undefined>;
type CameraTarget = {
  lat: number;
  lon: number;
  bearing: number;
};

const aircraftModelUrl = '/models/airplane.glb';
const feetToMeters = 0.3048;
const altitudeVisualScale = 0.02;
const aircraftModelScale = 0.5;
const selectedAircraftModelScale = 1;
const aircraftModelMinPixels = 8;
const aircraftModelMaxPixels = 42;
const AIRCRAFT_MODEL_YAW_OFFSET_DEG = 0;
const chaseCameraOffset: [number, number] = [0, 190];
const mobileChaseCameraOffset: [number, number] = [0, 48];
const chaseCameraPitch = 72;
const chaseCameraInitialZoom = 13;
const chaseCameraEntryEaseMs = 420;
const aircraftTransitionMs = 1000;
const followCameraPitch = 42;
const followCameraSmoothingMs = 620;
const chaseCameraSmoothingMs = 520;
const cameraZoomResumeDelayMs = 140;

function getCameraOffset(flight: FlightState, framing: CameraFraming): [number, number] {
  if (framing === 'lowerThird') {
    return [0, 140];
  }

  const displayHeading = getDisplayHeadingDeg(flight);
  if (framing === 'lookAhead' && displayHeading !== null) {
    const headingRad = (displayHeading * Math.PI) / 180;
    const distancePx = 110;

    return [-Math.sin(headingRad) * distancePx, Math.cos(headingRad) * distancePx];
  }

  return [0, 0];
}

function getChaseCameraOffset(isCompactLayout: boolean): [number, number] {
  return isCompactLayout ? mobileChaseCameraOffset : chaseCameraOffset;
}

function getActiveCameraOffset(
  flight: FlightState,
  mode: CameraMode,
  framing: CameraFraming,
  isCompactLayout: boolean
): [number, number] {
  if (mode === 'chase') {
    return getChaseCameraOffset(isCompactLayout);
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
  return normalizeBearing(getDisplayHeadingDeg(flight) ?? 0);
}

function getCameraBearing(flight: FlightState, mode: CameraMode) {
  return mode === 'chase' ? getChaseCameraBearing(flight) : 0;
}

function getFlightCameraTarget(flight: FlightState, mode: CameraMode): CameraTarget {
  return {
    lat: flight.lat,
    lon: flight.lon,
    bearing: getCameraBearing(flight, mode)
  };
}

function getReadableAltitudeMeters(flight: FlightState) {
  if (flight.altitudeFt === null || flight.altitudeFt === undefined) {
    return 80;
  }

  const altitudeMeters = flight.altitudeFt * feetToMeters;

  return Math.min(Math.max(altitudeMeters * altitudeVisualScale, 20), 500);
}

function getAircraftOrientation(flight: FlightState): [number, number, number] {
  const heading = getDisplayHeadingDeg(flight) ?? 0;

  // headingDeg is a compass bearing: 0=north, 90=east. deck.gl yaw is positive counter-clockwise
  // from the model's local +Y nose axis, so invert heading before applying any asset-specific offset.
  return [0, -heading + AIRCRAFT_MODEL_YAW_OFFSET_DEG, 0];
}

function constantSpeedTransitionEasing(t: number) {
  return t;
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function lerpBearing(currentBearing: number, targetBearing: number, progress: number) {
  return lerp(currentBearing, getNearestBearingEquivalent(currentBearing, targetBearing), progress);
}

function smoothingAlpha(deltaMs: number, smoothingMs: number) {
  return 1 - Math.exp(-deltaMs / smoothingMs);
}

export function FlightMap({
  basemapId,
  cameraMode,
  cameraSettings,
  flights,
  selectedFlight,
  onCameraModeChange,
  onSelectFlight
}: FlightMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const cameraAnimationFrameRef = useRef<number | null>(null);
  const animateSelectedCameraRef = useRef<(frameTime: number) => void>(() => undefined);
  const cameraTargetRef = useRef<CameraTarget | null>(null);
  const cameraZoomResumeTimeoutRef = useRef<number | null>(null);
  const cameraZoomingRef = useRef(false);
  const lastCameraFrameTimeRef = useRef(0);
  const cameraModeRef = useRef(cameraMode);
  const cameraSettingsRef = useRef(cameraSettings);
  const selectedFlightRef = useRef(selectedFlight);
  const onCameraModeChangeRef = useRef(onCameraModeChange);
  const isCompactCameraLayoutRef = useRef(false);
  const basemapStyleInitializedRef = useRef(false);
  const previousCameraModeRef = useRef(cameraMode);
  const [hovered, setHovered] = useState<FlightState | null>(null);
  const isDense = flights.length > 250;
  const selectedBasemap = basemapStyles.find((style) => style.id === basemapId) ?? basemapStyles[0];
  const initialBasemapRef = useRef(selectedBasemap);
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
  const cameraNeedsSelection = cameraMode !== 'free' && !selectedFlight;

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const observedContainer = container;

    function updateCompactCameraLayout() {
      isCompactCameraLayoutRef.current = observedContainer.clientWidth <= 900;
    }

    updateCompactCameraLayout();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateCompactCameraLayout);

      return () => {
        window.removeEventListener('resize', updateCompactCameraLayout);
      };
    }

    const resizeObserver = new ResizeObserver(updateCompactCameraLayout);
    resizeObserver.observe(observedContainer);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const releaseCameraToFree = useCallback((event?: CameraGestureEvent) => {
    if (!event?.originalEvent) {
      return;
    }

    if (cameraModeRef.current === 'free') {
      return;
    }

    if (cameraZoomResumeTimeoutRef.current) {
      window.clearTimeout(cameraZoomResumeTimeoutRef.current);
      cameraZoomResumeTimeoutRef.current = null;
    }

    if (cameraAnimationFrameRef.current) {
      window.cancelAnimationFrame(cameraAnimationFrameRef.current);
      cameraAnimationFrameRef.current = null;
    }

    cameraModeRef.current = 'free';
    onCameraModeChangeRef.current('free');
  }, []);
  const selectedModelFlight = selectedFlight;
  const modelFlights = flights;

  const layers = useMemo(
    () => {
      const positionTransitions = isDense
        ? undefined
        : {
            getPosition: {
              duration: aircraftTransitionMs,
              easing: constantSpeedTransitionEasing
            }
          };
      const modelTransitions =
        modelFlights.length > 250
          ? undefined
          : {
              getPosition: {
                duration: aircraftTransitionMs,
                easing: constantSpeedTransitionEasing
              },
              getOrientation: {
                duration: aircraftTransitionMs,
                easing: constantSpeedTransitionEasing
              }
            };
      const selectedAircraftHaloLayer =
        selectedModelFlight
          ? new ScatterplotLayer<FlightState>({
              id: `selected-aircraft-halo-${selectedModelFlight.flightId}`,
              data: [selectedModelFlight],
              pickable: false,
              stroked: true,
              filled: true,
              getPosition: (flight) => [flight.lon, flight.lat],
              transitions: positionTransitions,
              getRadius: 95000,
              radiusMinPixels: 18,
              radiusMaxPixels: 34,
              getFillColor: [250, 204, 21, 46],
              getLineColor: [250, 204, 21, 230],
              lineWidthMinPixels: 2
            })
          : null;

      function createAircraftModelLayer(
        id: string,
        data: FlightState[],
        options?: {
          selected: boolean;
        }
      ) {
        return new ScenegraphLayer<FlightState>({
          id,
          data,
          scenegraph: aircraftModelUrl,
          pickable: true,
          // Keep the GLB in model units; ScenegraphLayer pixel clamps own screen readability.
          sizeScale: 1,
          sizeMinPixels: options?.selected ? 18 : aircraftModelMinPixels,
          sizeMaxPixels: options?.selected ? 58 : aircraftModelMaxPixels,
          _lighting: 'pbr',
          getPosition: (flight) => [flight.lon, flight.lat, getReadableAltitudeMeters(flight)],
          getOrientation: getAircraftOrientation,
          transitions: modelTransitions,
          getScale: () => {
            const scale = options?.selected ? selectedAircraftModelScale : aircraftModelScale;

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
        });
      }

      const aircraftModelLayer =
        modelFlights.length > 0 ? createAircraftModelLayer('aircraft-models', modelFlights) : null;
      const selectedAircraftModelLayer =
        selectedModelFlight
          ? createAircraftModelLayer(`selected-aircraft-model-${selectedModelFlight.flightId}`, [selectedModelFlight], {
              selected: true
            })
          : null;

      const labelFlights = selectedFlight ? [selectedFlight] : [];
      const aircraftLabelLayer = new TextLayer<FlightState>({
        id: `selected-aircraft-label-${selectedFlight?.flightId ?? 'none'}`,
        data: labelFlights,
        getPosition: (flight) => [flight.lon, flight.lat],
        transitions: positionTransitions,
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
          return selectedAircraftModelLayer
            ? [...layersWithHalo, aircraftModelLayer, selectedAircraftModelLayer, aircraftLabelLayer]
            : [...layersWithHalo, aircraftModelLayer, aircraftLabelLayer];
        }

        return selectedAircraftModelLayer
          ? [...layersWithHalo, selectedAircraftModelLayer, aircraftLabelLayer]
          : [...layersWithHalo, aircraftLabelLayer];
      }

      return withModelLayer([]);
    },
    [
      isDense,
      modelFlights,
      onSelectFlight,
      aircraftLabelStyle,
      selectedFlight,
      selectedModelFlight
    ]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: initialBasemapRef.current.createStyle(),
      center: [-118.4085, 33.9416],
      zoom: 7,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
    map.on('dragstart', releaseCameraToFree);
    map.on('rotatestart', releaseCameraToFree);

    function pauseCameraForZoom() {
      if (cameraModeRef.current === 'free') {
        return;
      }

      cameraZoomingRef.current = true;
      if (cameraZoomResumeTimeoutRef.current) {
        window.clearTimeout(cameraZoomResumeTimeoutRef.current);
        cameraZoomResumeTimeoutRef.current = null;
      }
    }

    function resumeCameraAfterZoom() {
      if (cameraModeRef.current === 'free') {
        cameraZoomingRef.current = false;
        return;
      }

      if (cameraZoomResumeTimeoutRef.current) {
        window.clearTimeout(cameraZoomResumeTimeoutRef.current);
      }

      cameraZoomResumeTimeoutRef.current = window.setTimeout(() => {
        const activeMap = mapRef.current;

        if (activeMap) {
          const center = activeMap.getCenter();
          cameraTargetRef.current = {
            lat: center.lat,
            lon: center.lng,
            bearing: activeMap.getBearing()
          };
        }

        cameraZoomingRef.current = false;
        cameraZoomResumeTimeoutRef.current = null;
      }, cameraZoomResumeDelayMs);
    }

    function pauseCameraForZoomControl(event: Event) {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest('.maplibregl-ctrl-zoom-in, .maplibregl-ctrl-zoom-out')) {
        pauseCameraForZoom();
      }
    }

    const mapContainer = map.getContainer();
    mapContainer.addEventListener('wheel', pauseCameraForZoom, { capture: true, passive: true });
    mapContainer.addEventListener('pointerdown', pauseCameraForZoomControl, { capture: true });
    map.on('zoomstart', pauseCameraForZoom);
    map.on('zoomend', resumeCameraAfterZoom);

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      if (cameraAnimationFrameRef.current) {
        window.cancelAnimationFrame(cameraAnimationFrameRef.current);
        cameraAnimationFrameRef.current = null;
      }
      if (cameraZoomResumeTimeoutRef.current) {
        window.clearTimeout(cameraZoomResumeTimeoutRef.current);
        cameraZoomResumeTimeoutRef.current = null;
      }
      map.off('dragstart', releaseCameraToFree);
      map.off('rotatestart', releaseCameraToFree);
      mapContainer.removeEventListener('wheel', pauseCameraForZoom, { capture: true });
      mapContainer.removeEventListener('pointerdown', pauseCameraForZoomControl, { capture: true });
      map.off('zoomstart', pauseCameraForZoom);
      map.off('zoomend', resumeCameraAfterZoom);
      overlay.finalize();
      map.remove();
      overlayRef.current = null;
      mapRef.current = null;
    };
  }, [releaseCameraToFree]);

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

  const animateSelectedCamera = useCallback((frameTime: number) => {
    const activeMap = mapRef.current;
    const activeMode = cameraModeRef.current;
    const activeSettings = cameraSettingsRef.current;
    const activeFlight = selectedFlightRef.current;

    if (!activeMap || activeMode === 'free' || !activeFlight) {
      cameraAnimationFrameRef.current = null;
      return;
    }

    const previousFrameTime = lastCameraFrameTimeRef.current || frameTime;
    const deltaMs = Math.min(Math.max(frameTime - previousFrameTime, 0), 100);

    if (cameraZoomingRef.current) {
      lastCameraFrameTimeRef.current = frameTime;
      cameraAnimationFrameRef.current = window.requestAnimationFrame((nextFrameTime) => {
        animateSelectedCameraRef.current(nextFrameTime);
      });
      return;
    }

    const target = getFlightCameraTarget(activeFlight, activeMode);
    const currentTarget = cameraTargetRef.current ?? target;
    const alpha = smoothingAlpha(
      deltaMs,
      activeMode === 'chase' ? chaseCameraSmoothingMs : followCameraSmoothingMs
    );
    const nextTarget = {
      lat: lerp(currentTarget.lat, target.lat, alpha),
      lon: lerp(currentTarget.lon, target.lon, alpha),
      bearing:
        activeMode === 'chase'
          ? normalizeBearing(lerpBearing(currentTarget.bearing, target.bearing, alpha))
          : activeMap.getBearing()
    };

    cameraTargetRef.current = nextTarget;
    lastCameraFrameTimeRef.current = frameTime;
    activeMap.easeTo({
      center: [nextTarget.lon, nextTarget.lat],
      pitch: activeMode === 'chase' ? chaseCameraPitch : followCameraPitch,
      bearing: activeMode === 'chase' ? nextTarget.bearing : activeMap.getBearing(),
      offset: getActiveCameraOffset(
        activeFlight,
        activeMode,
        activeSettings.framing,
        isCompactCameraLayoutRef.current
      ),
      duration: 0,
      essential: true
    });

    cameraAnimationFrameRef.current = window.requestAnimationFrame((nextFrameTime) => {
      animateSelectedCameraRef.current(nextFrameTime);
    });
  }, []);

  useEffect(() => {
    animateSelectedCameraRef.current = animateSelectedCamera;
  }, [animateSelectedCamera]);

  const startSelectedCamera = useCallback((options?: { applyChaseMinZoom?: boolean }) => {
    const activeMap = mapRef.current;
    const activeMode = cameraModeRef.current;
    const activeFlight = selectedFlightRef.current;

    if (!activeMap || activeMode === 'free' || !activeFlight) {
      return;
    }

    if (cameraAnimationFrameRef.current) {
      return;
    }

    cameraTargetRef.current = getFlightCameraTarget(activeFlight, activeMode);
    lastCameraFrameTimeRef.current = window.performance.now();

    if (activeMode === 'chase' && options?.applyChaseMinZoom) {
      activeMap.easeTo({
        center: [activeFlight.lon, activeFlight.lat],
        zoom: Math.min(activeMap.getMaxZoom(), chaseCameraInitialZoom),
        pitch: chaseCameraPitch,
        bearing: getNearestBearingEquivalent(activeMap.getBearing(), getChaseCameraBearing(activeFlight)),
        offset: getChaseCameraOffset(isCompactCameraLayoutRef.current),
        duration: chaseCameraEntryEaseMs,
        essential: true
      });
    } else {
      activeMap.easeTo({
        center: [activeFlight.lon, activeFlight.lat],
        pitch: activeMode === 'chase' ? chaseCameraPitch : followCameraPitch,
        bearing: activeMode === 'chase' ? getChaseCameraBearing(activeFlight) : activeMap.getBearing(),
        offset: getActiveCameraOffset(
          activeFlight,
          activeMode,
          cameraSettingsRef.current.framing,
          isCompactCameraLayoutRef.current
        ),
        duration: 0,
        essential: true
      });
    }

    cameraAnimationFrameRef.current = window.requestAnimationFrame((frameTime) => {
      animateSelectedCameraRef.current(frameTime);
    });
  }, []);

  const resetChaseCameraZoom = useCallback(() => {
    const activeMap = mapRef.current;
    const activeFlight = selectedFlightRef.current;

    if (!activeMap || cameraModeRef.current !== 'chase' || !activeFlight) {
      return;
    }

    activeMap.easeTo({
      center: [activeFlight.lon, activeFlight.lat],
      zoom: Math.min(activeMap.getMaxZoom(), chaseCameraInitialZoom),
      pitch: chaseCameraPitch,
      bearing: getNearestBearingEquivalent(activeMap.getBearing(), getChaseCameraBearing(activeFlight)),
      offset: getChaseCameraOffset(isCompactCameraLayoutRef.current),
      duration: chaseCameraEntryEaseMs,
      essential: true
    });
  }, []);

  const handleCameraModeClick = useCallback(
    (mode: CameraMode) => {
      if (mode === 'chase' && cameraModeRef.current === 'chase') {
        resetChaseCameraZoom();
      }

      onCameraModeChange(mode);
    },
    [onCameraModeChange, resetChaseCameraZoom]
  );

  useEffect(() => {
    const map = mapRef.current;

    if (!map || cameraMode === 'free' || !selectedFlight) {
      if (cameraAnimationFrameRef.current) {
        window.cancelAnimationFrame(cameraAnimationFrameRef.current);
        cameraAnimationFrameRef.current = null;
      }
      if (cameraZoomResumeTimeoutRef.current) {
        window.clearTimeout(cameraZoomResumeTimeoutRef.current);
        cameraZoomResumeTimeoutRef.current = null;
      }
      cameraZoomingRef.current = false;
      cameraTargetRef.current = null;
      previousCameraModeRef.current = cameraMode;
      return;
    }

    const enteringChaseMode = cameraMode === 'chase' && previousCameraModeRef.current !== 'chase';
    startSelectedCamera({ applyChaseMinZoom: enteringChaseMode });
    previousCameraModeRef.current = cameraMode;

    return undefined;
  }, [cameraMode, cameraSettings, selectedFlight, startSelectedCamera]);

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
              onClick={() => handleCameraModeClick(mode)}
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
          <span>{formatNumber(getDisplayHeadingDeg(hovered))} deg heading</span>
          <span>{formatTime(hovered.timestamp)}</span>
        </div>
      ) : null}
    </div>
  );
}
