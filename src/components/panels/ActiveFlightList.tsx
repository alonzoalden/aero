'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { formatMeasurement, formatRoute } from '@/lib/format';
import type { FlightState } from '@/types/flight';

type ActiveFlightListProps = {
  flightsById: Record<string, FlightState>;
  orderedFlightIds: string[];
  selectedFlightId: string | null;
  onSelectFlight: (flightId: string) => void;
};

type ActiveFlightRowProps = {
  flight: FlightState;
  isSelected: boolean;
  onSelectFlight: (flightId: string) => void;
};

const flightRowSlotHeight = 68;
const flightListOverscan = 8;

const ActiveFlightRow = memo(function ActiveFlightRow({
  flight,
  isSelected,
  onSelectFlight
}: ActiveFlightRowProps) {
  const route = formatRoute(flight.origin, flight.destination);
  const altitude = formatMeasurement(flight.altitudeFt, 'ft');
  const speed = formatMeasurement(flight.groundSpeedKts, 'kts');

  return (
    <button
      aria-pressed={isSelected}
      className={isSelected ? 'flight-row selected' : 'flight-row'}
      onClick={() => onSelectFlight(flight.flightId)}
      type="button"
    >
      <span>
        <strong>{flight.callsign}</strong>
        {route ? <small>{route}</small> : null}
      </span>
      {altitude || speed ? (
        <span className="flight-row-metrics">
          {altitude ? <span>{altitude}</span> : null}
          {speed ? <small>{speed}</small> : null}
        </span>
      ) : null}
    </button>
  );
});

export function ActiveFlightList({
  flightsById,
  orderedFlightIds,
  selectedFlightId,
  onSelectFlight
}: ActiveFlightListProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  // TanStack Virtual owns mutable measurements that React Compiler cannot safely memoize.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: orderedFlightIds.length,
    estimateSize: () => flightRowSlotHeight,
    getItemKey: (index) => orderedFlightIds[index],
    getScrollElement: () => viewportRef.current,
    overscan: flightListOverscan
  });
  const selectedIndex = useMemo(
    () => (selectedFlightId ? orderedFlightIds.indexOf(selectedFlightId) : -1),
    [orderedFlightIds, selectedFlightId]
  );

  useEffect(() => {
    if (selectedIndex >= 0) {
      rowVirtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
    }
  }, [rowVirtualizer, selectedIndex]);

  function handleViewportKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      rowVirtualizer.scrollToIndex(event.key === 'Home' ? 0 : orderedFlightIds.length - 1, {
        align: event.key === 'Home' ? 'start' : 'end'
      });
      return;
    }

    const scrollDelta =
      event.key === 'ArrowDown'
        ? flightRowSlotHeight
        : event.key === 'ArrowUp'
          ? -flightRowSlotHeight
          : event.key === 'PageDown'
            ? viewport.clientHeight - flightRowSlotHeight
            : event.key === 'PageUp'
              ? -(viewport.clientHeight - flightRowSlotHeight)
              : 0;

    if (scrollDelta !== 0) {
      event.preventDefault();
      rowVirtualizer.scrollToOffset(Math.max(0, viewport.scrollTop + scrollDelta));
    }
  }

  if (orderedFlightIds.length === 0) {
    return <p className="muted flight-list-empty">No active aircraft.</p>;
  }

  return (
    <div
      aria-label={`${orderedFlightIds.length} active aircraft`}
      className="flight-list-viewport"
      onKeyDown={handleViewportKeyDown}
      ref={viewportRef}
      tabIndex={0}
    >
      <div
        aria-label="Active aircraft"
        className="flight-list-spacer"
        role="list"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const flightId = orderedFlightIds[virtualRow.index];
          const flight = flightsById[flightId];

          if (!flight) {
            return null;
          }

          return (
            <div
              aria-posinset={virtualRow.index + 1}
              aria-setsize={orderedFlightIds.length}
              className="flight-list-item"
              key={flightId}
              role="listitem"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              <ActiveFlightRow
                flight={flight}
                isSelected={flightId === selectedFlightId}
                onSelectFlight={onSelectFlight}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
