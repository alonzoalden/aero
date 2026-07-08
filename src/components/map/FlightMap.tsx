'use client';

import type { PickingInfo } from '@deck.gl/core';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import maplibregl from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatNumber, formatTime } from '@/lib/format';
import type { FlightState } from '@/types/flight';

type FlightMapProps = {
  flights: FlightState[];
  selectedFlightId: string | null;
  onSelectFlight: (flightId: string) => void;
};

const mapStyle = 'https://demotiles.maplibre.org/style.json';

export function FlightMap({ flights, selectedFlightId, onSelectFlight }: FlightMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [hovered, setHovered] = useState<FlightState | null>(null);

  const layers = useMemo(
    () => [
      new ScatterplotLayer<FlightState>({
        id: 'aircraft-positions',
        data: flights,
        pickable: true,
        stroked: true,
        getPosition: (flight) => [flight.lon, flight.lat],
        getRadius: (flight) => (flight.flightId === selectedFlightId ? 70000 : 45000),
        radiusMinPixels: 5,
        radiusMaxPixels: 16,
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
      }),
      new TextLayer<FlightState>({
        id: 'aircraft-labels',
        data: flights,
        getPosition: (flight) => [flight.lon, flight.lat],
        getText: (flight) => flight.callsign,
        getSize: 12,
        getPixelOffset: [0, -18],
        getColor: [226, 232, 240, 240]
      })
    ],
    [flights, onSelectFlight, selectedFlightId]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [-98.58, 39.83],
      zoom: 3.2,
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

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map-canvas" />
      <div className="map-title">
        <span>Flight Ops Live Map</span>
        <small>MapLibre basemap + deck.gl aircraft overlay</small>
      </div>
      {hovered ? (
        <div className="map-hover-card">
          <strong>{hovered.callsign}</strong>
          <span>
            {hovered.origin} to {hovered.destination}
          </span>
          <span>{formatNumber(hovered.altitudeFt)} ft</span>
          <span>{formatNumber(hovered.groundSpeedKts)} kts</span>
          <span>{formatNumber(hovered.headingDeg)} deg heading</span>
          <span>{formatTime(hovered.timestamp)}</span>
        </div>
      ) : null}
    </div>
  );
}
