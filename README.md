# Live Airspace Pulse

A real-time aviation dashboard built to explore modern frontend and geospatial patterns with React, TypeScript, MapLibre, deck.gl, D3, and WebSockets.

**[View the live demo](https://aero.alonzoalden.com)**

## What it demonstrates

- Live aircraft updates over WebSockets
- GPU-rendered aircraft overlays with deck.gl
- An interactive MapLibre basemap and camera controls
- D3-powered flight charts and scales
- Normalized React state for frequently changing data
- A clean boundary between the UI, map, visualization, and data layers

The project is a learning and portfolio demo, not production aviation software. It supports simulated traffic, a richer synthetic operations scenario, a local stress mode, and conservatively polled public ADS-B data from Airplanes.live. Missing route details are shown as unknown rather than invented.

## Run locally

Requires Node.js and npm.

```bash
npm install
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000). The app and local WebSocket server run together, with simulated flight data by default.

To try other data modes:

```bash
# Rich synthetic operations scenario
FLIGHT_DATA_SOURCE=demo-ops npm run dev:all

# Public ADS-B data near LAX
FLIGHT_DATA_SOURCE=airplanes-live npm run dev:all

# Local high-volume performance demo
FLIGHT_DATA_SOURCE=stress npm run dev:all
```

The Operations panel can also switch between the standard simulated feed and public ADS-B data while the app is running.

## How it works

```text
Flight provider
  -> Express ingestion and normalization
  -> WebSocket updates
  -> normalized React state
  -> deck.gl map layers and D3 charts
```

- **React and Next.js** own the app shell, controls, panels, and selected-flight state.
- **MapLibre** owns the basemap, tiles, and camera.
- **deck.gl** renders aircraft and other geospatial overlays on the GPU.
- **D3** provides chart scales, axes, and path calculations.
- **Express and WebSockets** normalize flight sources and stream updates to the browser.

For the polled Airplanes.live source, the server also derives a short-lived, filtered motion vector from authoritative ADS-B observations. The browser projects that vector between polls and lets deck.gl animate one-second-ahead display targets. These estimated positions are map presentation only: telemetry panels, charts, alerts, and track history continue to use observed samples.

Aircraft are rendered as deck.gl layers instead of React DOM markers. Fast incoming updates are coalesced before they reach the UI so React does not re-render for every raw event.

## Project layout

```text
src/app/                 Next.js app shell
src/components/map/      MapLibre and deck.gl integration
src/components/panels/   Dashboard panels and D3 charts
src/hooks/               Live data and UI hooks
src/lib/                 Pure transforms and helpers
src/types/               Shared flight types
server/                  Providers, normalization, and WebSocket server
```

## Useful commands

```bash
npm run dev          # Start the Next.js app
npm run dev:server   # Start the local data server
npm run dev:all      # Start both processes
npm run build        # Create a production build
npm run typecheck    # Check TypeScript
npm run lint         # Run ESLint
npm test             # Run tests
npm run verify:model # Validate the aircraft model
```

## Notes for Angular developers

The app offers a practical Angular-to-React comparison: JSX replaces templates, hooks and explicit modules cover work often handled by services and lifecycle methods, and normalized React state plays a role similar to an NgRx-style entity store. `useFlightStream` is the clearest place to compare RxJS stream handling with WebSocket events and React state updates.

## Demo limitations

- Public ADS-B data is REST-polled and may omit callsign, altitude, heading, origin, or destination.
- Public ADS-B map positions are estimated for at most two polling intervals, then freeze and display as stale until another observation arrives.
- Alerts, operational scenarios, and stress traffic are simulated.
- Data and metrics are held in memory; there is no authentication, persistence, or replay.
- Camera and 3D aircraft modes are map visualizations, not a flight simulator.
