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

To run the local-only Scale Lab stress mode:

```bash
FLIGHT_DATA_SOURCE=stress npm run dev:server
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
Airplanes.live REST API, mock provider, or local stress provider
  -> Express ingest/normalization server
  -> local WebSocket stream
  -> useFlightStream hook
  -> normalized React state keyed by flightId
  -> FlightMap + OperationsPanel
  -> deck.gl aircraft overlay + D3 altitude chart
```

MapLibre owns the basemap, map style, camera, pan, zoom, and tiles. deck.gl owns high-performance geospatial overlays, so aircraft are rendered as GPU layers instead of hundreds of React DOM markers. D3 is used for chart math, scales, ticks, and SVG path generation in the altitude mini chart. React owns product UI state: selected flight, panels, lists, and event flow.

The frontend never calls public aviation APIs directly. Public REST calls happen only in the local Express server, which normalizes provider records into the app's internal `FlightPositionUpdate` shape and broadcasts updates to browser clients. This avoids CORS surprises, prevents every tab from polling public APIs independently, limits exposure to provider schema churn, and mirrors the production pattern of external feed -> backend ingest -> frontend live stream.

## Camera Modes

The map has three camera modes:

- `Free`: default manual map interaction. Selecting an aircraft does not move the camera.
- `Follow`: centers the selected aircraft with moderate zoom and pitch.
- `Chase`: centers near the selected aircraft, uses a higher pitch, and eases the MapLibre bearing toward aircraft heading when heading is available.

MapLibre owns camera movement through `easeTo`: center, zoom, pitch, and bearing. deck.gl overlays stay synced because they are rendered on top of the MapLibre camera. React only stores the selected aircraft and camera mode; it does not render aircraft markers as DOM nodes.

Follow and Chase need an explicit selected aircraft. If the user manually pans, zooms, or rotates while Follow or Chase is active, the app allows the gesture, then the next throttled selected-aircraft update recenters the camera. Camera updates are throttled so high-rate WebSocket streams do not call `easeTo` on every aircraft message.

This is not a cockpit, first-person, or full 3D scene. There is no Three.js, no glTF aircraft model, and no deck.gl `FirstPersonView` in this slice.

Future camera tickets:

1. Offset Chase mode behind the aircraft instead of keeping it centered.
2. Add deck.gl `ScenegraphLayer` aircraft models.
3. Experiment with deck.gl `FirstPersonView`.
4. Use Three.js only if the product needs a custom 3D scene.

## Real vs Simulated

- `FLIGHT_DATA_SOURCE=mock` uses local simulated flights between hardcoded airports and mock alerts.
- `FLIGHT_DATA_SOURCE=airplanes-live` polls `https://api.airplanes.live/v2/point/33.9416/-118.4085/100` every 10 seconds and streams normalized aircraft near LAX.
- `FLIGHT_DATA_SOURCE=stress` is local-only synthetic load around Southern California. It is not ADS-B data.
- Airplanes.live records may not include route facts such as origin or destination. The UI displays those fields as `unknown`; it does not fabricate them.
- Alerts remain simulated examples in mock mode only. Weather, route planning, persistence, auth, queues, and deployment are intentionally out of scope.

## Scale Lab

Scale Lab demonstrates a scalable live geospatial update pattern:

```text
high-rate simulated ingest
  -> backend latest-state cache keyed by aircraft id
  -> backend batching/coalescing
  -> WebSocket batch messages at a controlled rate
  -> frontend latest-state store
  -> deck.gl visual updates
  -> React panels at a human-readable cadence
```

deck.gl handles efficient aircraft rendering, but it is not a transport, backpressure, or data-ingest solution. The backend still needs to avoid sending every raw event to every browser tab.

Raw ingest rate is separated from WebSocket broadcast rate so high-frequency updates can be coalesced into the latest known state per aircraft. Frontend render cadence is also separated from backend event cadence: `useFlightStream` batches messages with `requestAnimationFrame` and updates React state from coalesced aircraft deltas, not once per raw event.

Stress settings are clamped to keep local runs bounded:

- `STRESS_AIRCRAFT_COUNT`, default `1000`, clamped by `STRESS_MAX_AIRCRAFT_COUNT`.
- `STRESS_INGEST_UPDATES_PER_SEC`, default `5000`, max `100000`.
- `STRESS_BROADCAST_HZ`, default `10`, max `30`.
- `STRESS_MAX_AIRCRAFT_COUNT`, default `10000`, hard max `50000`.

Examples:

```bash
FLIGHT_DATA_SOURCE=stress npm run dev:server
FLIGHT_DATA_SOURCE=stress STRESS_AIRCRAFT_COUNT=5000 STRESS_INGEST_UPDATES_PER_SEC=20000 STRESS_BROADCAST_HZ=10 npm run dev:server
```

In stress mode, the UI shows Scale Lab metrics such as ingest updates/sec, WebSocket messages/sec, aircraft updates/sec, frontend received messages/sec, approximate FPS, sequence number, and coalesced update count. The active aircraft list is capped so the app does not render thousands of React rows.

## Backend Status

The Express server exposes local-only safe metadata:

- `GET /health`: basic health check.
- `GET /api/status`: source mode, connected clients, aircraft count, last poll/broadcast timestamps, and safe Scale Lab metrics when stress mode is active.

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
- Explain why deck.gl rendering capacity does not remove the need for backend batching and coalescing.
- Explain why React state should not update once per raw live event.
- Explain sequence numbers and controlled WebSocket broadcast cadence as a live-data debugging aid.
- Explain why MapLibre controls camera motion while deck.gl aircraft overlays remain camera-synced.
- Explain why D3 is used for chart helpers, not as the map renderer.
- Explain why public REST ingestion belongs on the backend, not in browser components.
- Point out which data is real ADS-B-derived provider data and which demo behavior remains simulated.

## Known Demo Limitations

- Airplanes.live is polled conservatively and may omit callsign, altitude, heading, origin, or destination.
- Live mode has no provider caching beyond short in-memory latest-aircraft/history maps.
- Mock mode still uses linear interpolation between hardcoded airports.
- Stress mode is synthetic and local-only; it demonstrates load shape, not real traffic behavior.
- Scale metrics are in-memory process metrics, not durable observability.
- Mock alerts are static examples, not derived from real operational rules.
- The WebSocket server has no authentication, persistence, or replay.
- The public demo map style is suitable for local learning, not production.

## Next Recommended Tickets

1. Add reconnect/backoff behavior to `useFlightStream`.
2. Add tests for Airplanes.live normalization and `upsertFlight`.
3. Add stale-aircraft expiration in the backend store.
4. Add a source/filter control for callsign, altitude band, or aircraft recency.
5. Add deck.gl trail rendering from the preserved short aircraft history.
