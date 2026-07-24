'use client';

import type { PickingInfo } from '@deck.gl/core';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import maplibregl, { type MapLibreEvent } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { basemapStyles } from '@/lib/basemaps';
import {
  retargetFlightDisplayTransition,
  sampleFlightDisplayTransition,
  type FlightDisplayTransition
} from '@/lib/flightDisplayTransition';
import { getDisplayHeadingDeg } from '@/lib/flightHeading';
import {
  createObservedFlightDisplay,
  getServerAlignedNowMs,
  projectFlightForDisplay,
  type FlightDisplayState
} from '@/lib/flightProjection';
import { formatMeasurement, formatRoute, formatTime } from '@/lib/format';
import type { LiveAircraftArea } from '@/lib/liveAircraftAreas';
import type { BasemapId } from '@/lib/basemaps';
import type { CameraFraming, CameraMode, CameraSettings } from '@/types/camera';
import type { FlightState } from '@/types/flight';

type FlightMapProps = {
  basemapId: BasemapId;
  cameraMode: CameraMode;
  cameraSettings: CameraSettings;
  flights: FlightState[];
  liveArea: LiveAircraftArea;
  selectedFlight: FlightState | null;
  predictionEnabled: boolean;
  serverTimeOffsetMs: number;
  onCameraModeChange: (mode: CameraMode) => void;
  onSelectFlight: (flightId: string) => void;
};

type CameraGestureEvent = MapLibreEvent<MouseEvent | TouchEvent | undefined>;
type CameraTarget = {
  lat: number;
  lon: number;
  bearing: number;
};
type CameraBlend = {
  startedAtMs: number;
  durationMs: number;
  fromCenter: Pick<CameraTarget, 'lat' | 'lon'>;
  fromBearing: number;
  fromPitch: number;
  fromZoom: number;
  fromOffset: [number, number];
  targetZoom: number;
};
type CameraBlendOptions = {
  durationMs: number;
  targetZoom?: number;
};
type FlightLayer =
  | ScatterplotLayer<FlightDisplayState>
  | ScenegraphLayer<FlightDisplayState>
  | TextLayer<FlightDisplayState>;

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
const cameraReacquireMs = 250;
const cameraZoomResumeDelayMs = 140;

function getCameraOffset(flight: FlightDisplayState, framing: CameraFraming): [number, number] {
  if (framing === 'lowerThird') {
    return [0, 140];
  }

  const displayHeading = flight.headingDeg;
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
  flight: FlightDisplayState,
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

function getChaseCameraBearing(flight: FlightDisplayState) {
  // Match MapLibre bearing to the compass heading so the corrected aircraft nose renders screen-up.
  return normalizeBearing(flight.headingDeg ?? 0);
}

function getReadableAltitudeMeters(flight: FlightDisplayState) {
  if (flight.altitudeFt === null || flight.altitudeFt === undefined) {
    return 80;
  }

  const altitudeMeters = flight.altitudeFt * feetToMeters;

  return Math.min(Math.max(altitudeMeters * altitudeVisualScale, 20), 500);
}

function getAircraftOrientation(flight: FlightDisplayState): [number, number, number] {
  const heading = flight.headingDeg ?? 0;

  // headingDeg is a compass bearing: 0=north, 90=east. deck.gl yaw is positive counter-clockwise
  // from the model's local +Y nose axis, so invert heading before applying any asset-specific offset.
  return [0, -heading + AIRCRAFT_MODEL_YAW_OFFSET_DEG, 0];
}

function getBulkAircraftScale(
  flight: FlightDisplayState,
  selectedFlightId: string | null
): [number, number, number] {
  const scale = flight.flight.flightId === selectedFlightId ? 0 : aircraftModelScale;

  return [scale, scale, scale];
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

function easeOutCubic(progress: number) {
  return 1 - (1 - progress) ** 3;
}

function lerpOffset(from: [number, number], to: [number, number], progress: number): [number, number] {
  return [lerp(from[0], to[0], progress), lerp(from[1], to[1], progress)];
}

export function FlightMap({
  basemapId,
  cameraMode,
  cameraSettings,
  flights,
  liveArea,
  selectedFlight,
  predictionEnabled,
  serverTimeOffsetMs,
  onCameraModeChange,
  onSelectFlight
}: FlightMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const selectedAnimationFrameRef = useRef<number | null>(null);
  const animateSelectedFlightRef = useRef<(frameTime: number) => void>(() => undefined);
  const selectedTransitionRef = useRef<FlightDisplayTransition | null>(null);
  const selectedPoseRef = useRef<FlightDisplayState | null>(null);
  const baseLayersRef = useRef<FlightLayer[]>([]);
  const applyOverlayLayersRef = useRef<(pose: FlightDisplayState | null) => void>(() => undefined);
  const cameraZoomResumeTimeoutRef = useRef<number | null>(null);
  const cameraZoomingRef = useRef(false);
  const cameraGesturePendingRef = useRef(false);
  const cameraBlendRef = useRef<CameraBlend | null>(null);
  const cameraOffsetRef = useRef<[number, number]>([0, 0]);
  const applyingTrackedCameraRef = useRef(false);
  const startCameraBlendRef = useRef<(options: CameraBlendOptions) => void>(() => undefined);
  const cameraModeRef = useRef(cameraMode);
  const cameraSettingsRef = useRef(cameraSettings);
  const onCameraModeChangeRef = useRef(onCameraModeChange);
  const isCompactCameraLayoutRef = useRef(false);
  const basemapStyleInitializedRef = useRef(false);
  const previousCameraModeRef = useRef(cameraMode);
  const previousCameraFlightIdRef = useRef(selectedFlight?.flightId ?? null);
  const [hoveredFlightId, setHoveredFlightId] = useState<string | null>(null);
  const [displayTick, setDisplayTick] = useState(() => Date.now());
  const isDense = flights.length > 250;
  const selectedBasemap = basemapStyles.find((style) => style.id === basemapId) ?? basemapStyles[0];
  const initialBasemapRef = useRef(selectedBasemap);
  const initialLiveAreaRef = useRef(liveArea);
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
    if (!predictionEnabled) {
      return;
    }

    function updateDisplayTick() {
      setDisplayTick(Date.now());
    }

    const initialTimeoutId = window.setTimeout(updateDisplayTick, 0);
    const intervalId = window.setInterval(updateDisplayTick, aircraftTransitionMs);
    document.addEventListener('visibilitychange', updateDisplayTick);

    return () => {
      window.clearTimeout(initialTimeoutId);
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', updateDisplayTick);
    };
  }, [predictionEnabled]);

  const displayFlights = useMemo(() => {
    const evaluatedAtMs = getServerAlignedNowMs(
      displayTick + aircraftTransitionMs,
      serverTimeOffsetMs
    );
    return flights.map((flight) =>
      predictionEnabled
        ? projectFlightForDisplay(flight, evaluatedAtMs)
        : createObservedFlightDisplay(flight)
    );
  }, [displayTick, flights, predictionEnabled, serverTimeOffsetMs]);
  const selectedModelFlight = selectedFlight
    ? displayFlights.find((flight) => flight.flight.flightId === selectedFlight.flightId) ?? null
    : null;
  const selectedModelFlightId = selectedModelFlight?.flight.flightId ?? null;
  const hovered = hoveredFlightId
    ? displayFlights.find((flight) => flight.flight.flightId === hoveredFlightId) ?? null
    : null;
  const hoveredRoute = hovered ? formatRoute(hovered.flight.origin, hovered.flight.destination) : null;
  const hoveredAltitude = hovered ? formatMeasurement(hovered.flight.altitudeFt, 'ft observed') : null;
  const hoveredSpeed = hovered ? formatMeasurement(hovered.flight.groundSpeedKts, 'kts observed') : null;
  const hoveredHeading = hovered ? formatMeasurement(getDisplayHeadingDeg(hovered.flight), 'deg heading') : null;

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

    cameraBlendRef.current = null;
    cameraZoomingRef.current = false;
    cameraGesturePendingRef.current = false;
    cameraOffsetRef.current = [0, 0];
    cameraModeRef.current = 'free';
    onCameraModeChangeRef.current('free');
  }, []);

  const baseLayers = useMemo<FlightLayer[]>(
    () => {
      const transitionsEnabled = predictionEnabled || !isDense;
      const modelTransitions = !transitionsEnabled
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
      // Attribute transitions match GPU rows, not flight IDs. Preserve every row when selection changes.
      const aircraftModelLayer = displayFlights.length
        ? new ScenegraphLayer<FlightDisplayState>({
            id: 'aircraft-models',
            data: displayFlights,
            scenegraph: aircraftModelUrl,
            pickable: true,
            sizeScale: 1,
            sizeMinPixels: aircraftModelMinPixels,
            sizeMaxPixels: aircraftModelMaxPixels,
            _lighting: 'pbr',
            getPosition: (flight) => [flight.lon, flight.lat, getReadableAltitudeMeters(flight)],
            getOrientation: getAircraftOrientation,
            transitions: modelTransitions,
            getScale: (flight) => getBulkAircraftScale(flight, selectedModelFlightId),
            getColor: (flight) =>
              flight.flight.flightId === selectedModelFlightId
                ? [255, 255, 255, 0]
                : flight.status === 'stale'
                  ? [180, 190, 204, 120]
                  : [255, 255, 255, 250],
            updateTriggers: {
              getColor: selectedModelFlightId,
              getScale: selectedModelFlightId
            },
            onError: (error) => {
              console.warn('Aircraft model layer failed to load.', error);
              return true;
            },
            onHover: (info: PickingInfo<FlightDisplayState>) =>
              setHoveredFlightId(info.object?.flight.flightId ?? null),
            onClick: (info: PickingInfo<FlightDisplayState>) => {
              if (info.object) {
                onSelectFlight(info.object.flight.flightId);
              }
            }
          })
        : null;

      return aircraftModelLayer ? [aircraftModelLayer] : [];
    },
    [displayFlights, isDense, onSelectFlight, predictionEnabled, selectedModelFlightId]
  );

  const createSelectedLayers = useCallback(
    (pose: FlightDisplayState): FlightLayer[] => {
      const flightId = pose.flight.flightId;
      const selectedAircraftHaloLayer = new ScatterplotLayer<FlightDisplayState>({
        id: `selected-aircraft-halo-${flightId}`,
        data: [pose],
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
      });
      const selectedAircraftModelLayer = new ScenegraphLayer<FlightDisplayState>({
        id: `selected-aircraft-model-${flightId}`,
        data: [pose],
        scenegraph: aircraftModelUrl,
        pickable: true,
        sizeScale: 1,
        sizeMinPixels: 18,
        sizeMaxPixels: 58,
        _lighting: 'pbr',
        getPosition: (flight) => [flight.lon, flight.lat, getReadableAltitudeMeters(flight)],
        getOrientation: getAircraftOrientation,
        getScale: () => [selectedAircraftModelScale, selectedAircraftModelScale, selectedAircraftModelScale],
        getColor: (flight) =>
          flight.status === 'stale' ? [180, 190, 204, 120] : [255, 255, 255, 250],
        onError: (error) => {
          console.warn('Selected aircraft model layer failed to load.', error);
          return true;
        },
        onHover: (info: PickingInfo<FlightDisplayState>) =>
          setHoveredFlightId(info.object?.flight.flightId ?? null),
        onClick: () => onSelectFlight(flightId)
      });
      const aircraftLabelLayer = new TextLayer<FlightDisplayState>({
        id: `selected-aircraft-label-${flightId}`,
        data: [pose],
        getPosition: (flight) => [flight.lon, flight.lat],
        getText: (flight) => flight.flight.callsign,
        getSize: 12,
        getPixelOffset: [0, -22],
        background: aircraftLabelStyle.useBackground,
        backgroundPadding: [5, 3],
        getBackgroundColor: aircraftLabelStyle.backgroundColor,
        getColor: (flight) =>
          flight.status === 'stale' ? [100, 116, 139, 190] : aircraftLabelStyle.color
      });

      return [selectedAircraftHaloLayer, selectedAircraftModelLayer, aircraftLabelLayer];
    },
    [aircraftLabelStyle, onSelectFlight]
  );

  const applyOverlayLayers = useCallback(
    (pose: FlightDisplayState | null) => {
      overlayRef.current?.setProps({
        layers: pose ? [...baseLayersRef.current, ...createSelectedLayers(pose)] : baseLayersRef.current
      });
    },
    [createSelectedLayers]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: initialBasemapRef.current.createStyle(),
      center: [initialLiveAreaRef.current.longitude, initialLiveAreaRef.current.latitude],
      zoom: 7,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
    map.on('dragstart', releaseCameraToFree);
    map.on('rotatestart', releaseCameraToFree);

    function pauseCameraForZoom() {
      if (cameraModeRef.current === 'free' || applyingTrackedCameraRef.current) {
        return;
      }

      cameraZoomingRef.current = true;
      if (cameraZoomResumeTimeoutRef.current) {
        window.clearTimeout(cameraZoomResumeTimeoutRef.current);
        cameraZoomResumeTimeoutRef.current = null;
      }
    }

    function resumeCameraAfterZoom() {
      if (applyingTrackedCameraRef.current) {
        return;
      }

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
          cameraZoomingRef.current = false;
          startCameraBlendRef.current({
            durationMs: cameraReacquireMs,
            targetZoom: activeMap.getZoom()
          });
        } else {
          cameraZoomingRef.current = false;
        }

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

    function pauseCameraForMapGesture(event: PointerEvent) {
      const target = event.target;

      if (
        cameraModeRef.current === 'free' ||
        (target instanceof Element && target.closest('.maplibregl-control-container'))
      ) {
        return;
      }

      cameraGesturePendingRef.current = true;
    }

    function resumeCameraAfterMapGesture() {
      cameraGesturePendingRef.current = false;
    }

    const mapContainer = map.getContainer();
    mapContainer.addEventListener('wheel', pauseCameraForZoom, { capture: true, passive: true });
    mapContainer.addEventListener('pointerdown', pauseCameraForZoomControl, { capture: true });
    mapContainer.addEventListener('pointerdown', pauseCameraForMapGesture, { capture: true });
    window.addEventListener('pointerup', resumeCameraAfterMapGesture, { capture: true });
    window.addEventListener('pointercancel', resumeCameraAfterMapGesture, { capture: true });
    map.on('zoomstart', pauseCameraForZoom);
    map.on('zoomend', resumeCameraAfterZoom);

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      if (selectedAnimationFrameRef.current) {
        window.cancelAnimationFrame(selectedAnimationFrameRef.current);
        selectedAnimationFrameRef.current = null;
      }
      if (cameraZoomResumeTimeoutRef.current) {
        window.clearTimeout(cameraZoomResumeTimeoutRef.current);
        cameraZoomResumeTimeoutRef.current = null;
      }
      map.off('dragstart', releaseCameraToFree);
      map.off('rotatestart', releaseCameraToFree);
      mapContainer.removeEventListener('wheel', pauseCameraForZoom, { capture: true });
      mapContainer.removeEventListener('pointerdown', pauseCameraForZoomControl, { capture: true });
      mapContainer.removeEventListener('pointerdown', pauseCameraForMapGesture, { capture: true });
      window.removeEventListener('pointerup', resumeCameraAfterMapGesture, { capture: true });
      window.removeEventListener('pointercancel', resumeCameraAfterMapGesture, { capture: true });
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

    map.easeTo({
      center: [liveArea.longitude, liveArea.latitude],
      zoom: 7,
      bearing: 0,
      pitch: 0,
      duration: 600,
      essential: true
    });
  }, [liveArea.id, liveArea.latitude, liveArea.longitude]);

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
    applyOverlayLayersRef.current = applyOverlayLayers;
    applyOverlayLayers(selectedPoseRef.current);
  }, [applyOverlayLayers]);

  useEffect(() => {
    baseLayersRef.current = baseLayers;
    applyOverlayLayersRef.current(selectedPoseRef.current);
  }, [baseLayers]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
    cameraSettingsRef.current = cameraSettings;
    onCameraModeChangeRef.current = onCameraModeChange;
  }, [cameraMode, cameraSettings, onCameraModeChange]);

  const ensureSelectedAnimation = useCallback(() => {
    if (selectedAnimationFrameRef.current !== null || !selectedTransitionRef.current) {
      return;
    }

    selectedAnimationFrameRef.current = window.requestAnimationFrame((frameTime) => {
      animateSelectedFlightRef.current(frameTime);
    });
  }, []);

  const startCameraBlend = useCallback(
    ({ durationMs, targetZoom }: CameraBlendOptions) => {
      const activeMap = mapRef.current;
      const activePose = selectedPoseRef.current;

      if (!activeMap || cameraModeRef.current === 'free' || !activePose) {
        return;
      }

      const center = activeMap.getCenter();
      cameraBlendRef.current = {
        startedAtMs: window.performance.now(),
        durationMs: Math.max(0, durationMs),
        fromCenter: { lat: center.lat, lon: center.lng },
        fromBearing: activeMap.getBearing(),
        fromPitch: activeMap.getPitch(),
        fromZoom: activeMap.getZoom(),
        fromOffset: cameraOffsetRef.current,
        targetZoom: targetZoom ?? activeMap.getZoom()
      };
      ensureSelectedAnimation();
    },
    [ensureSelectedAnimation]
  );

  useEffect(() => {
    startCameraBlendRef.current = startCameraBlend;
  }, [startCameraBlend]);

  const animateSelectedFlight = useCallback((frameTime: number) => {
    const transition = selectedTransitionRef.current;

    if (!transition) {
      selectedAnimationFrameRef.current = null;
      selectedPoseRef.current = null;
      applyOverlayLayersRef.current(null);
      return;
    }

    const pose = sampleFlightDisplayTransition(transition, frameTime);
    selectedPoseRef.current = pose;

    const activeMap = mapRef.current;
    const activeMode = cameraModeRef.current;
    if (
      activeMap &&
      activeMode !== 'free' &&
      !cameraZoomingRef.current &&
      !cameraGesturePendingRef.current
    ) {
      const activeSettings = cameraSettingsRef.current;
      const targetOffset = getActiveCameraOffset(
        pose,
        activeMode,
        activeSettings.framing,
        isCompactCameraLayoutRef.current
      );
      const targetPitch = activeMode === 'chase' ? chaseCameraPitch : followCameraPitch;
      const targetBearing =
        activeMode === 'chase' ? getChaseCameraBearing(pose) : activeMap.getBearing();
      const blend = cameraBlendRef.current;
      let center = { lat: pose.lat, lon: pose.lon };
      let bearing = targetBearing;
      let pitch = targetPitch;
      let offset = targetOffset;
      let zoom: number | undefined;

      if (blend) {
        const linearProgress =
          blend.durationMs <= 0
            ? 1
            : Math.min(Math.max((frameTime - blend.startedAtMs) / blend.durationMs, 0), 1);
        const progress = easeOutCubic(linearProgress);
        center = {
          lat: lerp(blend.fromCenter.lat, pose.lat, progress),
          lon: lerp(blend.fromCenter.lon, pose.lon, progress)
        };
        bearing = normalizeBearing(lerpBearing(blend.fromBearing, targetBearing, progress));
        pitch = lerp(blend.fromPitch, targetPitch, progress);
        offset = lerpOffset(blend.fromOffset, targetOffset, progress);
        zoom = lerp(blend.fromZoom, blend.targetZoom, progress);

        if (linearProgress >= 1) {
          cameraBlendRef.current = null;
        }
      }

      applyingTrackedCameraRef.current = true;
      try {
        activeMap.easeTo({
          center: [center.lon, center.lat],
          pitch,
          bearing,
          offset,
          ...(zoom === undefined ? {} : { zoom }),
          duration: 0,
          essential: true
        });
      } finally {
        applyingTrackedCameraRef.current = false;
      }
      cameraOffsetRef.current = offset;
    }

    // Update deck.gl after MapLibre so both render the same sampled pose and camera transform.
    applyOverlayLayersRef.current(pose);

    selectedAnimationFrameRef.current = window.requestAnimationFrame((nextFrameTime) => {
      animateSelectedFlightRef.current(nextFrameTime);
    });
  }, []);

  useEffect(() => {
    animateSelectedFlightRef.current = animateSelectedFlight;
  }, [animateSelectedFlight]);

  useEffect(() => {
    const now = window.performance.now();

    if (!selectedModelFlight) {
      selectedTransitionRef.current = null;
      selectedPoseRef.current = null;
      applyOverlayLayersRef.current(null);
      if (selectedAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(selectedAnimationFrameRef.current);
        selectedAnimationFrameRef.current = null;
      }
      return;
    }

    const transition = retargetFlightDisplayTransition(
      selectedTransitionRef.current,
      selectedModelFlight,
      now,
      aircraftTransitionMs
    );
    selectedTransitionRef.current = transition;
    selectedPoseRef.current = sampleFlightDisplayTransition(transition, now);
    applyOverlayLayersRef.current(selectedPoseRef.current);
    ensureSelectedAnimation();
  }, [ensureSelectedAnimation, selectedModelFlight]);

  const resetChaseCameraZoom = useCallback(() => {
    const activeMap = mapRef.current;

    if (!activeMap || cameraModeRef.current !== 'chase' || !selectedPoseRef.current) {
      return;
    }

    startCameraBlend({
      durationMs: chaseCameraEntryEaseMs,
      targetZoom: Math.min(activeMap.getMaxZoom(), chaseCameraInitialZoom)
    });
  }, [startCameraBlend]);

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
    const selectedFlightId = selectedModelFlight?.flight.flightId ?? null;

    if (!map || cameraMode === 'free' || !selectedFlightId) {
      if (cameraZoomResumeTimeoutRef.current) {
        window.clearTimeout(cameraZoomResumeTimeoutRef.current);
        cameraZoomResumeTimeoutRef.current = null;
      }
      cameraZoomingRef.current = false;
      cameraGesturePendingRef.current = false;
      cameraBlendRef.current = null;
      cameraOffsetRef.current = [0, 0];
      previousCameraModeRef.current = cameraMode;
      previousCameraFlightIdRef.current = selectedFlightId;
      return;
    }

    const enteringChaseMode = cameraMode === 'chase' && previousCameraModeRef.current !== 'chase';
    const modeChanged = previousCameraModeRef.current !== cameraMode;
    const selectionChanged = previousCameraFlightIdRef.current !== selectedFlightId;

    if (modeChanged || selectionChanged) {
      startCameraBlend({
        durationMs: chaseCameraEntryEaseMs,
        targetZoom: enteringChaseMode
          ? Math.min(map.getMaxZoom(), chaseCameraInitialZoom)
          : map.getZoom()
      });
    }

    previousCameraModeRef.current = cameraMode;
    previousCameraFlightIdRef.current = selectedFlightId;

    return undefined;
  }, [cameraMode, cameraSettings.framing, selectedModelFlight?.flight.flightId, startCameraBlend]);

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map-canvas" />
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
                  : 'MapLibre is holding the aircraft at the selected screen framing.'
                : 'Cinematic controls are inactive until an aircraft is selected.'}
          </p>
        )}
      </div>
      {hovered ? (
        <div className="map-hover-card">
          <strong>{hovered.flight.callsign}</strong>
          {hoveredRoute ? <span>{hoveredRoute}</span> : null}
          {hoveredAltitude ? <span>{hoveredAltitude}</span> : null}
          {hoveredSpeed ? <span>{hoveredSpeed}</span> : null}
          {hoveredHeading ? <span>{hoveredHeading}</span> : null}
          <span>Observed {formatTime(hovered.flight.observedAt ?? hovered.flight.timestamp)}</span>
          <span className={`prediction-status status-${hovered.status}`}>
            {hovered.status === 'stale'
              ? 'Prediction expired — last observed'
              : hovered.status === 'estimated'
                ? 'Map position estimated'
                : 'Map position observed'}
          </span>
        </div>
      ) : null}
    </div>
  );
}
