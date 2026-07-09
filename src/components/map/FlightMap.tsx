'use client';

import type { PickingInfo } from '@deck.gl/core';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import maplibregl from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatNumber, formatRoute, formatTime } from '@/lib/format';
import type { CameraMode } from '@/types/camera';
import type { FlightState } from '@/types/flight';

type FlightMapProps = {
  cameraMode: CameraMode;
  flights: FlightState[];
  selectedFlight: FlightState | null;
  selectedFlightId: string | null;
  onCameraModeChange: (mode: CameraMode) => void;
  onSelectFlight: (flightId: string) => void;
};

const mapStyle = 'https://demotiles.maplibre.org/style.json';
const minCameraUpdateMs = 700;

export function FlightMap({
  cameraMode,
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
  const [hovered, setHovered] = useState<FlightState | null>(null);
  const isDense = flights.length > 250;
  const cameraNeedsSelection = cameraMode !== 'free' && !selectedFlight;

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
    const map = mapRef.current;

    if (!map || cameraMode === 'free' || !selectedFlight) {
      return;
    }

    function easeCamera() {
      const activeMap = mapRef.current;
      if (!activeMap || !selectedFlight) {
        return;
      }

      lastCameraUpdateRef.current = window.performance.now();
      activeMap.easeTo({
        center: [selectedFlight.lon, selectedFlight.lat],
        zoom: cameraMode === 'chase' ? 10 : 8.8,
        pitch: cameraMode === 'chase' ? 65 : 42,
        bearing:
          cameraMode === 'chase' && selectedFlight.headingDeg !== null && selectedFlight.headingDeg !== undefined
            ? selectedFlight.headingDeg
            : activeMap.getBearing(),
        duration: cameraMode === 'chase' ? 800 : 650,
        essential: true
      });
    }

    const elapsedMs = window.performance.now() - lastCameraUpdateRef.current;
    if (elapsedMs >= minCameraUpdateMs) {
      easeCamera();
      return;
    }

    if (cameraTimeoutRef.current) {
      window.clearTimeout(cameraTimeoutRef.current);
    }
    cameraTimeoutRef.current = window.setTimeout(easeCamera, minCameraUpdateMs - elapsedMs);

    return () => {
      if (cameraTimeoutRef.current) {
        window.clearTimeout(cameraTimeoutRef.current);
        cameraTimeoutRef.current = null;
      }
    };
  }, [cameraMode, selectedFlight]);

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
        {cameraNeedsSelection ? (
          <p className="camera-note">Select an aircraft to activate {cameraMode} camera.</p>
        ) : (
          <p className="camera-note">
            {cameraMode === 'free' ? 'Manual pan, zoom, pitch, and bearing.' : 'MapLibre is easing the camera.'}
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
