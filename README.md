# Live Airspace Pulse

A thin learning/showcase project for a live-ish aviation geospatial UI around Los Angeles/LAX. It demonstrates how React, Next.js, MapLibre, deck.gl, D3, and a local Express/WebSocket backend fit together without pretending to be production aviation software.

## Setup

```bash
npm install
npm run dev:server
npm run dev
```

Or run both processes together:

```bash
npm run dev:all
```

Open `http://localhost:3000`. The app expects flight updates from `ws://localhost:8787`. Override with `NEXT_PUBLIC_FLIGHT_WS_URL` if needed.

The backend defaults to simulated mock data. To use public ADS-B data from Airplanes.live:

```bash
FLIGHT_DATA_SOURCE=airplanes-live npm run dev:server
```

## Project Structure

```text
src/app/                 Next.js App Router shell
src/components/map/      MapLibre + deck.gl map boundary
src/components/panels/   Operations panel and D3 chart
src/hooks/               WebSocket/data hooks
src/lib/                 Pure transforms and formatting helpers
src/types/               Shared flight domain types
server/                  Express ingest server, providers, normalization, WebSocket
```

## Architecture

```text
Airplanes.live REST API or mock provider
  -> Express ingest/normalization server
  -> local WebSocket stream
  -> useFlightStream hook
  -> normalized React state keyed by flightId
  -> FlightMap + OperationsPanel
  -> deck.gl aircraft overlay + D3 altitude chart
```

MapLibre owns the basemap, map style, camera, pan, zoom, and tiles. deck.gl owns high-performance geospatial overlays, so aircraft are rendered as GPU layers instead of hundreds of React DOM markers. D3 is used for chart math, scales, ticks, and SVG path generation in the altitude mini chart. React owns product UI state: selected flight, panels, lists, and event flow.

The frontend never calls public aviation APIs directly. Public REST calls happen only in the local Express server, which normalizes provider records into the app's internal `FlightPositionUpdate` shape and broadcasts updates to browser clients. This avoids CORS surprises, prevents every tab from polling public APIs independently, limits exposure to provider schema churn, and mirrors the production pattern of external feed -> backend ingest -> frontend live stream.

## Real vs Simulated

- `FLIGHT_DATA_SOURCE=mock` uses local simulated flights between hardcoded airports and mock alerts.
- `FLIGHT_DATA_SOURCE=airplanes-live` polls `https://api.airplanes.live/v2/point/33.9416/-118.4085/100` every 10 seconds and streams normalized aircraft near LAX.
- Airplanes.live records may not include route facts such as origin or destination. The UI displays those fields as `unknown`; it does not fabricate them.
- Alerts remain simulated examples in mock mode only. Weather, route planning, persistence, auth, queues, and deployment are intentionally out of scope.

## Backend Status

The Express server exposes local-only safe metadata:

- `GET /health`: basic health check.
- `GET /api/status`: source mode, connected clients, aircraft count, and last poll/broadcast timestamps.

Do not poll Airplanes.live faster than every 5 seconds. The default live poll interval is 10 seconds.

## Angular to React Notes

Angular components and templates map roughly to React components and JSX. Angular services or RxJS streams map here to explicit hooks and modules, especially `useFlightStream`. React state lives in `FlightOpsDashboard` for selected-flight UI state and in `useFlightStream` for live normalized flight data. The map must be client-only because MapLibre, deck.gl, WebGL, `window`, and `WebSocket` are browser APIs that cannot run during server rendering.

## Commands

- `npm run dev`: start the Next.js app.
- `npm run dev:server`: start the Express/WebSocket backend.
- `npm run dev:all`: start both app and server.
- `npm run build`: create a production build.
- `npm run typecheck`: run TypeScript checks.
- `npm run lint`: run ESLint.

## Interview Talking Points

- Explain why the app separates transport, map rendering, analytical charting, and UI state.
- Discuss normalized flight state keyed by `flightId`.
- Explain why deck.gl is appropriate for large geospatial overlays.
- Explain why D3 is used for chart helpers, not as the map renderer.
- Explain why public REST ingestion belongs on the backend, not in browser components.
- Point out which data is real ADS-B-derived provider data and which demo behavior remains simulated.

## Known Demo Limitations

- Airplanes.live is polled conservatively and may omit callsign, altitude, heading, origin, or destination.
- Live mode has no provider caching beyond short in-memory latest-aircraft/history maps.
- Mock mode still uses linear interpolation between hardcoded airports.
- Mock alerts are static examples, not derived from real operational rules.
- The WebSocket server has no authentication, persistence, or replay.
- The public demo map style is suitable for local learning, not production.

## Next Recommended Tickets

1. Add reconnect/backoff behavior to `useFlightStream`.
2. Add tests for Airplanes.live normalization and `upsertFlight`.
3. Add stale-aircraft expiration in the backend store.
4. Add a source/filter control for callsign, altitude band, or aircraft recency.
5. Add deck.gl trail rendering from the preserved short aircraft history.
