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

To run the richer synthetic operations demo around Southern California/LAX:

```bash
FLIGHT_DATA_SOURCE=demo-ops npm run dev:all
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
Airplanes.live REST API, demo-ops provider, mock provider, or local stress provider
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
- `Follow`: centers the selected aircraft with moderate pitch while preserving the user's current zoom.
- `Chase`: centers near the selected aircraft, uses a higher pitch, and eases the MapLibre bearing toward aircraft heading when heading is available.

MapLibre owns camera movement through `easeTo`: center, pitch, bearing, and offset. deck.gl overlays stay synced because they are rendered on top of the MapLibre camera. React only stores the selected aircraft, camera mode, and camera settings; it does not render aircraft markers as DOM nodes.

Follow and Chase need an explicit selected aircraft. If the user manually pans, zooms, or rotates while Follow or Chase is active, the app allows the gesture, then the next throttled selected-aircraft update recenters the camera without changing the user's zoom. Camera updates are throttled so high-rate WebSocket streams do not call `easeTo` on every aircraft message.

This is still MapLibre camera control, not a cockpit, first-person, or full 3D scene. The 3D aircraft model mode is a deck.gl overlay, not a separate Three.js scene or deck.gl `FirstPersonView`.

Future camera tickets:

1. Polish selected-aircraft model framing and scale.
2. Build a standalone deck.gl `FirstPersonView` experiment.
3. Use Three.js only if the product needs a full custom 3D scene.

## 3D Aircraft Models

Aircraft can render in three visual modes:

- `Dots`: the original deck.gl `ScatterplotLayer` circle markers plus labels when density is low. This remains the best view for stress mode and very high aircraft counts.
- `Models`: a deck.gl `ScenegraphLayer` renders a local glTF/GLB airplane model for every aircraft.
- `Hybrid`: the selected aircraft renders as a 3D model and the rest remain dots. This is the default because it gives a clear selected-aircraft visual without paying the cost of thousands of model instances.

The model asset is `public/models/airplane.glb`, a generated low-poly demo aircraft created for this repo by `scripts/create-airplane-glb.mjs`. It is not downloaded from a third-party model site and has no external license dependency. The generated shape intentionally includes a fuselage, nose, broad wings, horizontal stabilizer, and vertical tail so ScenegraphLayer draws something recognizable at map scale.

Use this verification command after changing the model:

```bash
npm run verify:model
```

The verifier checks the GLB magic/version, mesh and primitive counts, vertex and index counts, triangle count, and accessor bounds. It fails if the file has no mesh geometry. This matters because a technically valid GLB can still be too tiny or too abstract to prove the aircraft overlay is working.

glTF/GLB is the model format because deck.gl `ScenegraphLayer` can load it directly. MapLibre still owns the basemap, map style, pan, zoom, pitch, bearing, and camera easing. deck.gl remains the geospatial overlay renderer, and its aircraft layers stay synced to the MapLibre camera through `MapboxOverlay`.

This does not require Three.js yet because the app is not building a standalone 3D scene. The goal is still a map-first operational dashboard: MapLibre provides geographic context, deck.gl renders GPU overlays, and React owns the controls and selected-flight state. A future Three.js slice would only make sense if the product needed a full custom 3D world, cockpit view, hangar scene, or non-map camera system.

The model layer uses aircraft `headingDeg` for orientation and keeps the correction in `AIRCRAFT_MODEL_YAW_OFFSET_DEG` because model forward axes vary by asset. The generated model points along local `+Y`, so the current offset is `0`. ADS-B altitude is feet, while deck.gl elevation is meters; the implementation converts feet to meters and applies a small readability scale with clamps so aircraft remain visible over the map instead of trying to be a precise flight simulator.

Models intentionally stay in the airplane-model path when selected. Dots remain useful because high-density geospatial views need legibility and predictable local performance more than per-aircraft 3D detail.

The default `Hybrid` mode auto-selects the first arriving aircraft, then renders that selected aircraft as the dominant ScenegraphLayer model while keeping smaller, fainter dots for surrounding context.

Known limitations:

- Model orientation may need tuning per asset.
- This is not a true cockpit, first-person, or flight-simulator scene.
- Altitude scaling is simplified for readability.
- High model counts can be expensive; switch to `Dots` or `Hybrid` for dense stress-mode views.

Future 3D tickets:

1. Polish selected-aircraft-only model styling and hover affordances.
2. Scale model size by zoom level and camera pitch.
3. Add a surface/true-altitude/exaggerated-altitude toggle.
4. Try a deck.gl `FirstPersonView` experiment as a separate slice.
5. Add Three.js only if a full custom 3D scene becomes the actual goal.

## Real vs Simulated

- `FLIGHT_DATA_SOURCE=mock` uses a small, simple, predictable local sample with hardcoded airport pairs and mock alerts.
- `FLIGHT_DATA_SOURCE=airplanes-live` polls `https://api.airplanes.live/v2/point/33.9416/-118.4085/100` every 10 seconds and streams normalized public ADS-B-derived aircraft near LAX. It is real provider data, but intentionally conservative and REST-polled.
- `FLIGHT_DATA_SOURCE=demo-ops` is synthetic operational demo data around Southern California/LAX. It simulates faster WebSocket updates, route context, departures, arrivals, regional traffic, cargo callsigns, holding patterns, low-altitude tracks, and demo-only alerts.
- `FLIGHT_DATA_SOURCE=stress` is local-only scale/load simulation around Southern California. It is not ADS-B data and is meant to demonstrate backend coalescing and frontend rendering behavior.
- Airplanes.live records may not include route facts such as origin or destination. The UI displays those fields as `unknown`; it does not fabricate them.
- Alerts in `mock` and `demo-ops` are simulated examples only. Weather, route planning, persistence, auth, queues, and deployment are intentionally out of scope.

## Demo Ops

Demo Ops is the interview/demo source for showing a more alive live-ops experience without pretending to be FAA or ATC data. It keeps the same backend contract as every other source:

```text
synthetic route simulation
  -> Express latest-state cache
  -> WebSocket batch messages
  -> useFlightStream hook
  -> React selected-flight state + deck.gl aircraft overlays + D3 chart
```

It defaults to about 30 aircraft and broadcasts several times per second:

```bash
FLIGHT_DATA_SOURCE=demo-ops npm run dev:all
```

Optional settings are clamped for local safety:

- `DEMO_OPS_AIRCRAFT_COUNT`, default `30`, range `5`-`80`.
- `DEMO_OPS_BROADCAST_HZ`, default `3`, range `1`-`10`.
- `DEMO_OPS_SCENARIO`, default `socal`.

The simulated traffic includes LAX departures toward JFK, ORD, ATL, DFW, SEA, SFO, LAS, PHX, and DEN; arrivals back into LAX; regional LAX/SFO/LAS/SAN/PHX traffic; FDX/UPS-style cargo flights; holding patterns near coastal and inland approach corridors; and a few low-altitude general aviation or helicopter-like tracks. Callsigns, origins, destinations, headings, altitude, speed, vertical rate, source, and last-seen values are all populated through the same `FlightPositionUpdate` model consumed by the frontend.

Demo Ops alerts are clearly labeled demo-only and exist to make the operations panel useful during a walkthrough: holding pattern, descent monitor, route deviation, lost update simulation, altitude conflict warning when one is detected, and flow-control/weather-style info.

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
- `npm test`: run Node tests for pure backend/provider logic.
- `npm run verify:model`: inspect `public/models/airplane.glb` and fail if it has no mesh geometry.

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
- Explain why real public ADS-B REST polling is kept as proof of real-data integration, while `demo-ops` demonstrates how the frontend behaves with a richer operational stream.

## Known Demo Limitations

- Airplanes.live is polled conservatively and may omit callsign, altitude, heading, origin, or destination.
- Live mode has no provider caching beyond short in-memory latest-aircraft/history maps.
- Mock mode still uses linear interpolation between hardcoded airports.
- Demo Ops is synthetic and demo-only. It uses plausible route shapes and alerts, not real FAA, ATC, airline, weather, or flow-control data.
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
