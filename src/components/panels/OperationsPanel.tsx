'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ActiveFlightList } from '@/components/panels/ActiveFlightList';
import { AltitudeChart } from '@/components/panels/AltitudeChart';
import { getDisplayHeadingDeg } from '@/lib/flightHeading';
import { basemapStyles } from '@/lib/basemaps';
import { formatMeasurement, formatNumber, formatRoute, formatTime, hasDisplayText } from '@/lib/format';
import {
  defaultLiveAircraftArea,
  getLiveAircraftAreaCode,
  getLiveAircraftAreaLabel,
  isLiveAircraftAreaCatalog,
  searchLiveAircraftAreas,
  type LiveAircraftAreaCatalog,
  type LiveAircraftAreaId
} from '@/lib/liveAircraftAreas';
import type { ConnectionStatus, FrontendStreamMetrics } from '@/hooks/useFlightStream';
import type { BasemapId } from '@/lib/basemaps';
import type {
  FlightAlert,
  FlightServerStatus,
  FlightState,
  LiveAircraftLimit,
  RuntimeSwitchableFlightDataSource
} from '@/types/flight';

type OperationsPanelProps = {
  alerts: FlightAlert[];
  basemapId: BasemapId;
  connectionStatus: ConnectionStatus;
  flightsById: Record<string, FlightState>;
  frontendMetrics: FrontendStreamMetrics;
  orderedFlightIds: string[];
  serverStatus: FlightServerStatus | null;
  selectedFlight: FlightState | null;
  sourceSwitchError: string | null;
  switchingSource: RuntimeSwitchableFlightDataSource | null;
  onBasemapChange: (basemapId: BasemapId) => void;
  onSourceChange: (
    source: RuntimeSwitchableFlightDataSource,
    options?: { aircraftLimit?: LiveAircraftLimit; areaId?: LiveAircraftAreaId }
  ) => void;
  onSelectFlight: (flightId: string) => void;
};

function DetailItem({ label, value }: { label: string; value: string | null | undefined }) {
  if (!hasDisplayText(value)) {
    return null;
  }

  return (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  );
}

export function OperationsPanel({
  alerts,
  basemapId,
  connectionStatus,
  flightsById,
  frontendMetrics,
  orderedFlightIds,
  serverStatus,
  selectedFlight,
  sourceSwitchError,
  switchingSource,
  onBasemapChange,
  onSourceChange,
  onSelectFlight
}: OperationsPanelProps) {
  const isStressMode = serverStatus?.source === 'stress';
  const flightCount = orderedFlightIds.length;
  const scaleMetrics = serverStatus?.scaleMetrics;
  const selectedHeadingDeg = selectedFlight ? getDisplayHeadingDeg(selectedFlight) : null;
  const sourceOptions = serverStatus?.availableSources ?? [];
  const liveAircraftLimitOptions =
    sourceOptions.find((option) => option.source === 'airplanes-live')?.aircraftLimits ?? [];
  const selectedBasemap = basemapStyles.find((style) => style.id === basemapId) ?? basemapStyles[0];
  const selectedLiveArea = serverStatus?.area ?? defaultLiveAircraftArea;
  const sourceNote =
    serverStatus?.sourceDescription ??
    (serverStatus?.source === 'airplanes-live'
      ? 'Real public ADS-B-derived data; updates are externally polled and may be slower.'
      : 'Simulated data for smoother demo behavior.');
  const [controlsOpen, setControlsOpen] = useState(false);
  const [areaFilter, setAreaFilter] = useState('');
  const [areaCatalog, setAreaCatalog] = useState<LiveAircraftAreaCatalog | null>(null);
  const [areaCatalogStatus, setAreaCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const deferredAreaFilter = useDeferredValue(areaFilter);
  const controlsMenuRef = useRef<HTMLDivElement | null>(null);
  const controlsButtonRef = useRef<HTMLButtonElement | null>(null);
  const areaSearchResults = useMemo(
    () =>
      areaCatalog
        ? searchLiveAircraftAreas(areaCatalog.airports, deferredAreaFilter)
        : { areas: [], total: 0 },
    [areaCatalog, deferredAreaFilter]
  );

  function handleControlsToggle() {
    const nextControlsOpen = !controlsOpen;
    if (nextControlsOpen && !areaCatalog) {
      setAreaCatalogStatus('loading');
    }
    setControlsOpen(nextControlsOpen);
  }

  useEffect(() => {
    if (!controlsOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !controlsMenuRef.current?.contains(event.target)) {
        setControlsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setControlsOpen(false);
        controlsButtonRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [controlsOpen]);

  useEffect(() => {
    if (!controlsOpen || serverStatus?.source !== 'airplanes-live' || areaCatalog) {
      return;
    }

    const abortController = new AbortController();
    void fetch('/data/live-airports.json', { signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Airport index request failed with ${response.status}`);
        }

        const payload: unknown = await response.json();
        if (!isLiveAircraftAreaCatalog(payload)) {
          throw new Error('Airport index response was invalid');
        }

        setAreaCatalog(payload);
        setAreaCatalogStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setAreaCatalogStatus('error');
      });

    return () => abortController.abort();
  }, [areaCatalog, controlsOpen, serverStatus?.source]);

  return (
    <aside className="ops-panel">
      <header className="panel-header">
        <div>
          <p>Operations</p>
          <h1>Live Airspace Pulse</h1>
        </div>
        <div className="panel-header-actions">
          <span className={`status-pill status-${connectionStatus}`}>{connectionStatus}</span>
          <div className="controls-menu" ref={controlsMenuRef}>
            <button
              aria-controls="operations-controls-dropdown"
              aria-expanded={controlsOpen}
              aria-haspopup="dialog"
              className={controlsOpen ? 'controls-menu-button active' : 'controls-menu-button'}
              onClick={handleControlsToggle}
              ref={controlsButtonRef}
              type="button"
            >
              Controls
              <span aria-hidden="true" className="controls-menu-chevron">
                ▾
              </span>
            </button>
            {controlsOpen ? (
              <div
                aria-label="Map and data controls"
                className="controls-dropdown"
                id="operations-controls-dropdown"
                role="dialog"
              >
                <section className="controls-dropdown-section">
                  <div className="section-heading-row">
                    <h2>Data Source</h2>
                    {switchingSource || serverStatus?.source ? (
                      <strong>{switchingSource ? 'switching' : serverStatus?.source}</strong>
                    ) : null}
                  </div>
                  {sourceOptions.length > 0 ? (
                    <div className="source-segment" aria-label="Data source">
                      {sourceOptions.map((option) => (
                        <button
                          aria-pressed={serverStatus?.source === option.source}
                          className={serverStatus?.source === option.source ? 'mode-button active' : 'mode-button'}
                          disabled={Boolean(switchingSource)}
                          key={option.source}
                          onClick={() => onSourceChange(option.source)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="muted source-note">This source is startup-only for this demo slice.</p>
                  )}
                  {serverStatus?.source === 'airplanes-live' && liveAircraftLimitOptions.length > 0 ? (
                    <div className="aircraft-limit-control">
                      <div className="section-heading-row">
                        <h2>Aircraft quantity</h2>
                        <strong>{serverStatus.aircraftLimit ?? liveAircraftLimitOptions[0]}</strong>
                      </div>
                      <div className="aircraft-limit-segment" aria-label="Live aircraft quantity">
                        {liveAircraftLimitOptions.map((aircraftLimit) => (
                          <button
                            aria-pressed={serverStatus.aircraftLimit === aircraftLimit}
                            className={serverStatus.aircraftLimit === aircraftLimit ? 'mode-button active' : 'mode-button'}
                            disabled={Boolean(switchingSource)}
                            key={aircraftLimit}
                            onClick={() => onSourceChange('airplanes-live', { aircraftLimit })}
                            type="button"
                          >
                            {aircraftLimit}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {serverStatus?.source === 'airplanes-live' ? (
                    <div className="aircraft-area-control">
                      <div className="section-heading-row">
                        <h2>Area</h2>
                        <strong>{getLiveAircraftAreaCode(selectedLiveArea)}</strong>
                      </div>
                      <label className="area-search-label" htmlFor="live-aircraft-area-search">
                        Search worldwide airports
                      </label>
                      <input
                        autoComplete="off"
                        className="area-search-input"
                        disabled={Boolean(switchingSource)}
                        id="live-aircraft-area-search"
                        onChange={(event) => setAreaFilter(event.target.value)}
                        placeholder="City, region, airport, or code"
                        type="search"
                        value={areaFilter}
                      />
                      <div className="area-options" aria-label="Live data area">
                        {areaSearchResults.areas.map((area) => (
                          <button
                            aria-pressed={serverStatus.areaId === area.id}
                            className={serverStatus.areaId === area.id ? 'area-option active' : 'area-option'}
                            disabled={Boolean(switchingSource)}
                            key={area.id}
                            onClick={() => {
                              setAreaFilter('');
                              onSourceChange('airplanes-live', { areaId: area.id });
                            }}
                            type="button"
                          >
                            <span className="area-option-copy">
                              <strong>{area.municipality ?? area.name}</strong>
                              <small>{getLiveAircraftAreaLabel(area)}</small>
                              <small>
                                {area.region}, {area.country}
                              </small>
                            </span>
                            <small className="area-option-code">{getLiveAircraftAreaCode(area)}</small>
                          </button>
                        ))}
                        {areaCatalogStatus === 'loading' ? (
                          <p className="muted area-options-empty">Loading worldwide airport index…</p>
                        ) : null}
                        {areaCatalogStatus === 'error' ? (
                          <p className="source-error area-options-empty">
                            Airport index unavailable. Close and reopen Controls to retry.
                          </p>
                        ) : null}
                        {areaCatalogStatus === 'ready' && areaSearchResults.total === 0 ? (
                          <p className="muted area-options-empty">No matching areas.</p>
                        ) : null}
                      </div>
                      {areaCatalogStatus === 'ready' && areaSearchResults.total > 0 ? (
                        <p className="muted area-results-note">
                          {areaSearchResults.total > areaSearchResults.areas.length
                            ? `Showing ${areaSearchResults.areas.length} of ${formatNumber(areaSearchResults.total)} ${deferredAreaFilter.trim() ? 'matches' : 'airports'}.`
                            : `${formatNumber(areaSearchResults.total)} ${deferredAreaFilter.trim() ? (areaSearchResults.total === 1 ? 'match' : 'matches') : areaSearchResults.total === 1 ? 'airport' : 'airports'}.`}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="muted source-note">{sourceNote}</p>
                  {sourceSwitchError ? <p className="source-error">{sourceSwitchError}</p> : null}
                </section>

                <section className="controls-dropdown-section">
                  <div className="section-heading-row">
                    <h2>Basemap</h2>
                    <strong>{selectedBasemap.label}</strong>
                  </div>
                  <div className="basemap-control" aria-label="Basemap style">
                    <div className="basemap-buttons">
                      {basemapStyles.map((style) => (
                        <button
                          aria-pressed={basemapId === style.id}
                          className={basemapId === style.id ? 'basemap-button active' : 'basemap-button'}
                          key={style.id}
                          onClick={() => onBasemapChange(style.id)}
                          title={style.description}
                          type="button"
                        >
                          {style.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="muted source-note">{selectedBasemap.description}</p>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {isStressMode ? (
        <section className="panel-section scale-lab">
          <h2>Scale Lab</h2>
          <div className="detail-grid">
            <DetailItem label="Source" value={serverStatus.source} />
            <DetailItem
              label="Aircraft"
              value={formatNumber(scaleMetrics?.activeAircraftCount ?? serverStatus.aircraftCount)}
            />
            <DetailItem
              label="Clients"
              value={formatNumber(scaleMetrics?.connectedClients ?? serverStatus.connectedClients)}
            />
            <DetailItem label="Ingest/sec" value={formatNumber(scaleMetrics?.ingestUpdatesPerSec)} />
            <DetailItem label="WS msg/sec" value={formatNumber(scaleMetrics?.webSocketMessagesPerSec)} />
            <DetailItem label="Broadcast/sec" value={formatNumber(scaleMetrics?.aircraftUpdatesBroadcastPerSec)} />
            <DetailItem label="Received/sec" value={formatNumber(frontendMetrics.aircraftUpdatesReceivedPerSec)} />
            <DetailItem label="Frontend msg/sec" value={formatNumber(frontendMetrics.receivedMessagesPerSec)} />
            <DetailItem label="Approx FPS" value={formatNumber(frontendMetrics.renderFps)} />
            <DetailItem label="Coalesced" value={formatNumber(scaleMetrics?.coalescedUpdateCount)} />
            <DetailItem
              label="Sequence"
              value={formatNumber(frontendMetrics.lastSequence ?? scaleMetrics?.sequence)}
            />
            <DetailItem
              label="Server time"
              value={
                frontendMetrics.lastServerTimestamp
                  ? formatTime(frontendMetrics.lastServerTimestamp)
                  : scaleMetrics?.lastBroadcastTimestamp
                    ? formatTime(scaleMetrics.lastBroadcastTimestamp)
                    : null
              }
            />
          </div>
        </section>
      ) : null}

      <section className="panel-section">
        <h2>Selected aircraft</h2>
        {selectedFlight ? (
          <div className="detail-grid">
            <DetailItem label="Callsign" value={selectedFlight.callsign} />
            <DetailItem label="Route" value={formatRoute(selectedFlight.origin, selectedFlight.destination)} />
            <DetailItem label="Altitude" value={formatMeasurement(selectedFlight.altitudeFt, 'ft')} />
            <DetailItem label="Speed" value={formatMeasurement(selectedFlight.groundSpeedKts, 'kts')} />
            <DetailItem label="Heading" value={formatMeasurement(selectedHeadingDeg, 'deg')} />
            <DetailItem label="Vertical rate" value={formatMeasurement(selectedFlight.verticalRateFpm, 'fpm')} />
            <DetailItem label="Source" value={selectedFlight.source} />
            <DetailItem label="Last seen" value={formatMeasurement(selectedFlight.lastSeenSeconds, 'sec')} />
            <DetailItem label="Observed" value={formatTime(selectedFlight.observedAt ?? selectedFlight.timestamp)} />
          </div>
        ) : (
          <p className="muted">
            {flightCount > 0
              ? 'The first aircraft is selected automatically; select another aircraft from the map or list.'
              : 'Start the local backend to receive aircraft.'}
          </p>
        )}
      </section>

      <section className="panel-section">
        <AltitudeChart flight={selectedFlight} />
      </section>

      <section className="panel-section active-flights-section">
        <div className="section-heading-row">
          <h2>Active aircraft</h2>
          <strong>{formatNumber(flightCount)}</strong>
        </div>
        <ActiveFlightList
          flightsById={flightsById}
          orderedFlightIds={orderedFlightIds}
          selectedFlightId={selectedFlight?.flightId ?? null}
          onSelectFlight={onSelectFlight}
        />
      </section>

      <section className="panel-section">
        <h2>Alerts</h2>
        <div className="alert-list">
          {alerts.map((alert) => (
            <article className={`alert alert-${alert.severity}`} key={alert.id}>
              <strong>{alert.type}</strong>
              <span>{alert.message}</span>
            </article>
          ))}
        </div>
      </section>

      <footer className="panel-footer">
        <small>
          MapLibre basemap + deck.gl aircraft overlay
          {isStressMode ? ' + reduced labels for Scale Lab' : ''}
        </small>
        {serverStatus?.source === 'airplanes-live' ? (
          <span className="prediction-badge">
            Estimated between {Math.max(1, Math.round((serverStatus.pollIntervalMs ?? 10_000) / 1000))}s ADS-B polls
          </span>
        ) : null}
      </footer>
    </aside>
  );
}
