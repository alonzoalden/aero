'use client';

import type { PickingInfo } from '@deck.gl/core';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import maplibregl from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { formatNumber, formatRoute, formatTime } from '@/lib/format';
import type { CameraFraming, CameraMode, CameraSettings } from '@/types/camera';
import type { FlightState } from '@/types/flight';

type FlightMapProps = {
  cameraMode: CameraMode;
  cameraSettings: CameraSettings;
  flights: FlightState[];
  selectedFlight: FlightState | null;
  selectedFlightId: string | null;
  onCameraModeChange: (mode: CameraMode) => void;
  onCameraSettingsChange: Dispatch<SetStateAction<CameraSettings>>;
  onSelectFlight: (flightId: string) => void;
};

const mapStyle = 'https://demotiles.maplibre.org/style.json';
const minCameraUpdateMs = 700;
const minOrbitUpdateMs = 900;

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

export function FlightMap({
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
  const isDense = flights.length > 250;
  const cameraNeedsSelection = cameraMode !== 'free' && !selectedFlight;
  const orbitIsActive = cameraMode !== 'free' && cameraSettings.orbitEnabled && Boolean(selectedFlight);

  const layers = useMemo(
    () => {
      const aircraftLayer = new ScatterplotLayer<FlightState>({
        id: 'aircraft-positions',
        data: flights,
        pickable: true,
        stroked: true,
        getPosition: (flight) => [flight.lon, flight.lat],
        getRadius: (flight) => (flight.flightId === selectedFlightId ? 70000 : isDense ? 25000 : 45000),
        radiusMinPixels: isDense ? 2 : 5,
        radiusMaxPixels: isDense ? 9 : 16,
        getFillColor: (flight) =>
          flight.flightId === selectedFlightId ? [250, 204, 21, 235] : [56, 189, 248, 220],
        getLineColor: [8, 15, 30, 245],
        lineWidthMinPixels: 1,
        onHover: (info: PickingInfo<FlightState>) => setHovered(info.object ?? null),
        onClick: (info: PickingInfo<FlightState>) => {
          if (info.object) {
            onSelectFlight(info.object.flightId);
          }
        }
      });

      if (isDense) {
        return [aircraftLayer];
      }

      return [
        aircraftLayer,
        new TextLayer<FlightState>({
          id: 'aircraft-labels',
          data: flights,
          getPosition: (flight) => [flight.lon, flight.lat],
          getText: (flight) => flight.callsign,
          getSize: 12,
          getPixelOffset: [0, -18],
          getColor: [226, 232, 240, 240]
        })
      ];
    },
    [flights, isDense, onSelectFlight, selectedFlightId]
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
