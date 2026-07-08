# Repository Guidelines

## Project Purpose

This repository is a learning/showcase project for a senior frontend engineer preparing for a React + TypeScript + real-time geospatial aviation interview.

The app should demonstrate a clear mental model:

- React = product UI, panels, controls, selected state, interaction flow
- Next.js = app framework, routing, app shell
- MapLibre = base map, camera, map style, tiles
- deck.gl = high-performance geospatial overlays
- D3 = charting, math, scales, axes, timelines, legends
- WebSockets = live flight update stream

This is not production aviation software. Keep the app truthful, clean, locally runnable, and conceptually correct.

## Project Structure & Module Organization

Keep application code under `src/`.

Expected layout after scaffolding:

```text
src/app/
src/components/
src/components/map/
src/components/panels/
src/hooks/
src/lib/
src/types/
src/styles/
public/
server/
docs/
```

Use these conventions:

- `src/app/`: Next.js App Router routes and layouts.
- `src/components/`: reusable React UI components.
- `src/components/map/`: MapLibre/deck.gl map-specific components.
- `src/components/panels/`: dashboard panels, flight details, alerts, tables.
- `src/hooks/`: client-side data and state hooks.
- `src/lib/`: pure utilities, data transforms, D3 helpers, mock client utilities.
- `src/types/`: shared TypeScript domain types.
- `server/`: local mock WebSocket server and simulation logic.
- `docs/`: architecture notes, interview talking points, Angular-to-React learning notes.
- `public/`: static assets.

## Core Architecture Rules

Keep the conceptual boundaries clear:

- MapLibre owns the basemap, map style, camera, tiles, pan, zoom, and geographic context.
- deck.gl owns GPU-rendered geospatial overlays such as aircraft, paths, route lines, polygons, and animated tracks.
- D3 owns chart/math/scale logic such as altitude-over-time charts, speed charts, timelines, axes, and legends.
- React owns the app shell, panels, selected flight state, controls, user interactions, and component composition.
- WebSocket logic owns live data transport, reconnect behavior, message parsing, and update flow.

Do not render many aircraft as React DOM markers. Use deck.gl layers for geospatial rendering.

Do not use D3 as the primary map renderer for this app. Use D3 for analytical visualization and helper logic.

Do not overbuild. Build thin vertical slices first.

## Next.js Rules

Map and WebGL components must be client-only where browser APIs are required.

Use `"use client"` only where necessary. Prefer server components for static documentation or non-interactive content when practical.

Avoid referencing `window`, `document`, `WebSocket`, MapLibre, or deck.gl from server-rendered code.

## Data & State Rules

Use TypeScript throughout.

Keep shared flight/domain types in `src/types`.

Use normalized state keyed by `flightId` for live flight data.

Prefer pure transformation functions for converting raw WebSocket messages into UI state.

Avoid excessive React re-renders from every incoming socket message. When needed, batch, throttle, debounce, or isolate frequently changing map data.

Expected core types:

```ts
export type FlightPositionUpdate = {
  flightId: string;
  callsign: string;
  lat: number;
  lon: number;
  altitudeFt: number;
  groundSpeedKts: number;
  headingDeg: number;
  origin: string;
  destination: string;
  timestamp: string;
};

export type FlightAlert = {
  id: string;
  flightId: string;
  severity: 'info' | 'warning' | 'critical';
  type: 'weather' | 'delay' | 'route' | 'airport';
  message: string;
  createdAt: string;
};
```

## Learning Goal: Angular to React

This repo should help an Angular-heavy engineer transition into React.

When adding docs or comments, explain useful comparisons:

- Angular components/services/RxJS vs React components/hooks/state.
- Angular dependency injection vs explicit imports/hooks/module boundaries.
- RxJS streams vs WebSocket event handling and React state updates.
- Angular templates vs React JSX.
- Angular lifecycle hooks vs `useEffect`.
- Angular shared services vs React hooks/context/module-level utilities.
- NgRx/RxJS-style normalized state vs React local state or external stores.

Keep these notes practical and tied to this app.

## Build, Test, and Development Commands

After scaffolding, document the exact package scripts here and keep them stable.

Expected commands:

- `npm run dev`: start the Next.js development server.
- `npm run dev:server`: start the local mock WebSocket server.
- `npm run dev:all`: start both the app and mock server when available.
- `npm run build`: create a production build.
- `npm run typecheck`: run TypeScript without emitting files.
- `npm run lint`: run static analysis.
- `npm test`: run tests when a test runner is added.

Do not claim a command passed unless it was actually run.

## Coding Style & Naming Conventions

Use TypeScript for application code.

Prefer:

- 2-space indentation.
- Named exports for reusable modules.
- PascalCase for React components.
- `use` prefix for React hooks.
- camelCase for utility functions.
- Descriptive file names such as `FlightMap.tsx`, `useFlightStream.ts`, `AltitudeChart.tsx`, and `flight.ts`.

Keep comments concise. Use comments for architectural intent, learning notes, or non-obvious behavior. Do not comment every line.

## Testing Guidelines

Prioritize tests for:

- WebSocket message parsing.
- Flight state normalization.
- D3 chart data transforms.
- Alert generation.
- User-visible dashboard behavior.

Place tests alongside the code they cover or under `tests/`, depending on the selected framework.

Use names like:

```text
useFlightStream.test.ts
flightTransforms.test.ts
AltitudeChart.test.tsx
```

Do not add a heavy test framework unless it is useful for the current project stage.

## Documentation Rules

Maintain a clear `README.md` with:

- setup instructions
- architecture overview
- MapLibre vs deck.gl vs D3 explanation
- mock WebSocket data flow
- Angular-to-React learning notes
- interview talking points
- known demo limitations
- next recommended tickets

Prefer truthful explanations over hype.

## Commit & Pull Request Guidelines

Use short imperative commit messages, for example:

```text
Add flight stream hook
Render aircraft overlay
Document map architecture
Add selected flight chart
```

Pull request summaries should include:

- what changed
- why it changed
- validation commands run
- screenshots for UI changes
- known limitations or demo shortcuts

## Security & Configuration Tips

Do not commit secrets, API keys, or local `.env` files.

Prefer public demo map styles or local mocks.

Use `.env.example` when environment variables become necessary.

This project should be runnable without private aviation data, private APIs, or paid map keys.

## Execution Rules for AI Agents

- Read this file before making changes.
- Keep tasks narrowly scoped.
- Preserve existing working behavior.
- Build thin vertical slices before expanding.
- Prefer clear architecture over visual flash.
- Do not invent fake production complexity.
- Do not silently remove learning notes or architecture docs.
- Do not hide failures.
- Report files changed, commands run, pass/fail status, and known limitations.
- Stop after the requested task unless the next step is required to keep the app working.