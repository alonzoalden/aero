'use client';

import { extent, line, max, scaleLinear, scaleTime } from 'd3';
import { useMemo } from 'react';
import { getHeadingTrackPoints } from '@/lib/flightHeading';
import { formatNumber } from '@/lib/format';
import type { FlightState } from '@/types/flight';

type AltitudeChartProps = {
  flight: FlightState | null;
};

const width = 320;
const height = 120;
const padding = { top: 10, right: 12, bottom: 24, left: 42 };

export function AltitudeChart({ flight }: AltitudeChartProps) {
  const chart = useMemo(() => {
    if (!flight || flight.track.length < 2) {
      return null;
    }

    const altitudePoints = flight.track
      .filter((point) => point.altitudeFt !== null)
      .map((point) => ({
        date: new Date(point.timestamp),
        altitudeFt: point.altitudeFt ?? 0
      }));
    const headingPoints = getHeadingTrackPoints(flight.track).map((point) => ({
      date: new Date(flight.track[point.index].timestamp),
      headingDeg: point.headingDeg
    }));

    if (altitudePoints.length < 2) {
      return null;
    }

    const timeExtent = extent(altitudePoints, (point) => point.date);
    const maxAltitude = max(altitudePoints, (point) => point.altitudeFt) ?? 40000;

    const x = scaleTime()
      .domain(timeExtent[0] && timeExtent[1] ? [timeExtent[0], timeExtent[1]] : [new Date(), new Date()])
      .range([padding.left, width - padding.right]);

    const y = scaleLinear()
      .domain([0, Math.max(10000, maxAltitude)])
      .nice()
      .range([height - padding.bottom, padding.top]);

    const path = line<(typeof altitudePoints)[number]>()
      .x((point) => x(point.date))
      .y((point) => y(point.altitudeFt))(altitudePoints);

    const headingY = scaleLinear()
      .domain([0, 360])
      .range([height - padding.bottom, padding.top]);
    const headingPath =
      headingPoints.length > 1
        ? line<(typeof headingPoints)[number]>()
            .x((point) => x(point.date))
            .y((point) => headingY(point.headingDeg))(headingPoints)
        : null;

    return {
      path,
      headingPath,
      latestAltitude: altitudePoints.at(-1)?.altitudeFt ?? 0,
      latestHeading: headingPoints.at(-1)?.headingDeg ?? flight.headingDeg,
      headingTicks: headingY.ticks(3).map((tick) => ({ label: `${Math.round(tick)} deg`, y: headingY(tick) })),
      yTicks: y.ticks(3).map((tick) => ({ label: `${Math.round(tick / 1000)}k`, y: y(tick) }))
    };
  }, [flight]);

  if (!flight) {
    return <div className="chart-empty">Select a flight to inspect altitude history.</div>;
  }

  if (!chart?.path) {
    return <div className="chart-empty">Waiting for more altitude samples.</div>;
  }

  return (
    <div>
      <div className="chart-heading">
        <span>Altitude trend</span>
        <strong>{formatNumber(chart.latestAltitude)} ft</strong>
      </div>
      <svg className="altitude-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Altitude over time">
        {chart.yTicks.map((tick) => (
          <g key={tick.label}>
            <line x1={padding.left} x2={width - padding.right} y1={tick.y} y2={tick.y} />
            <text x={8} y={tick.y + 4}>
              {tick.label}
            </text>
          </g>
        ))}
        <path d={chart.path} />
      </svg>
      {chart.headingPath ? (
        <>
          <div className="chart-heading chart-heading-secondary">
            <span>Heading trend</span>
            <strong>{formatNumber(chart.latestHeading)} deg</strong>
          </div>
          <svg className="altitude-chart heading-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Heading over time">
            {chart.headingTicks.map((tick) => (
              <g key={tick.label}>
                <line x1={padding.left} x2={width - padding.right} y1={tick.y} y2={tick.y} />
                <text x={2} y={tick.y + 4}>
                  {tick.label}
                </text>
              </g>
            ))}
            <path className="heading-path" d={chart.headingPath} />
          </svg>
        </>
      ) : null}
    </div>
  );
}
