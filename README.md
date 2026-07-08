# Flight Ops Live Map

A thin learning/showcase project for a real-time aviation geospatial UI. It demonstrates how React, Next.js, MapLibre, deck.gl, D3, and a mock WebSocket stream fit together without pretending to be production aviation software.

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

## Project Structure

```text
src/app/                 Next.js App Router shell
src/components/map/      MapLibre + deck.gl map boundary
src/components/panels/   Operations panel and D3 chart
src/hooks/               WebSocket/data hooks
src/lib/                 Pure transforms and formatting helpers
src/types/               Shared flight domain types
server/                  Local mock WebSocket flight generator
```

## Architecture

```text
server/mock-flight-server.ts
  -> WebSocket position messages
  -> useFlightStream hook
  -> normalized React state keyed by flightId
  -> FlightMap + OperationsPanel
  -> deck.gl aircraft overlay + D3 altitude chart
```

MapLibre owns the basemap, map style, camera, pan, zoom, and tiles. deck.gl owns high-performance geospatial overlays, so aircraft are rendered as GPU layers instead of hundreds of React DOM markers. D3 is used for chart math, scales, ticks, and SVG path generation in the altitude mini chart. React owns product UI state: selected flight, panels, lists, and event flow.

## Angular to React Notes

Angular components and templates map roughly to React components and JSX. Angular services or RxJS streams map here to explicit hooks and modules, especially `useFlightStream`. React state lives in `FlightOpsDashboard` for selected-flight UI state and in `useFlightStream` for live normalized flight data. The map must be client-only because MapLibre, deck.gl, WebGL, `window`, and `WebSocket` are browser APIs that cannot run during server rendering.

## Commands

- `npm run dev`: start the Next.js app.
- `npm run dev:server`: start the mock WebSocket server.
- `npm run dev:all`: start both app and server.
- `npm run build`: create a production build.
- `npm run typecheck`: run TypeScript checks.
- `npm run lint`: run ESLint.

## Interview Talking Points

- Explain why the app separates transport, map rendering, analytical charting, and UI state.
- Discuss normalized flight state keyed by `flightId`.
- Explain why deck.gl is appropriate for large geospatial overlays.
- Explain why D3 is used for chart helpers, not as the map renderer.
- Point out that the mock stream is intentionally simple and local.

## Known Demo Limitations

- Flight paths are linear interpolation between hardcoded airports.
- Alerts are static examples, not derived from real operational rules.
- The WebSocket server has no authentication, persistence, or replay.
- The public demo map style is suitable for local learning, not production.

## Next Recommended Tickets

1. Add route line rendering with a deck.gl `PathLayer`.
2. Add reconnect/backoff behavior to `useFlightStream`.
3. Add tests for `upsertFlight` and mock alert generation.
4. Add a flight filter control for airline, route, or alert severity.
5. Add Playwright smoke coverage for the dashboard shell.
