# Build Journal

This journal records implementation decisions and evidence for later review and learning.

It is not intended to be a complete tutorial or a replacement for source code, tests, Git history, issues, or pull requests.

## Entry template

### YYYY-MM-DD — Short descriptive title

**Goal**

What outcome was being pursued?

**Decision / approach**

What was implemented or decided?

**Why**

Why was this approach selected?

Clearly distinguish documented rationale from inferred rationale.

**Alternatives considered**

List only alternatives that were actually discussed or evaluated.

If none were explicitly evaluated, say so.

**Important changes**

- `path/to/file`: relevant module, class, function, component, or configuration
- `path/to/another-file`: relevant change

**Verification**

Record the commands, tests, checks, or manual verification actually performed and their results.

**Risks, tradeoffs, assumptions, and open questions**

Record anything that may affect future work.

**References**

Include relevant branch, commit, issue, pull request, or task references when available.

---

### 2026-07-23 — Establish the build-now, learn-later workflow

**Goal**

Keep Codex execution-focused while preserving concise factual evidence for later teaching and review.

**Decision / approach**

Appended a persistent learning-handoff policy to the existing root `AGENTS.md` and created this journal with a reusable entry template. Future meaningful implementation tasks and architectural decisions must update this file before completion.

**Why**

The user explicitly requested a lightweight “build now, learn later” workflow that separates repository execution from longer tutorials.

**Alternatives considered**

No alternative was explicitly evaluated.

**Important changes**

- `AGENTS.md`: added the persistent workflow, evidence, safety, and completion-summary requirements.
- `docs/build-journal.md`: added the journal structure and initial backfill.

**Verification**

Inspected the root instructions, README, deployment notes, documentation directory, recent commits, current branch, Git status, and current diff. Documentation-only validation was performed; application tests were not rerun for this workflow setup.

**Risks, tradeoffs, assumptions, and open questions**

Journal quality depends on future entries being updated while implementation context is still available.

**References**

Branch `codex/project-live-aircraft-motion`; commit subject `Add build journal workflow`; target branch `origin/master`.

---

### 2026-07-23 — Virtualize the active-aircraft list

**Goal**

Make all active aircraft scrollable in the Operations panel without mounting one button per flight.

**Decision / approach**

Added `@tanstack/react-virtual`, extracted `ActiveFlightList`, and replaced the stress-mode 80-row truncation with a 384-pixel virtual viewport using 68-pixel slots and eight overscan rows. Rows are memoized, preserve button semantics, expose virtual-list position metadata, support keyboard scrolling, and scroll the selected aircraft into view.

**Why**

The map already requires and receives every aircraft over WebSockets. Virtualization directly reduces DOM size; adding server pagination now would duplicate already-delivered data without reducing the current transport or application-memory footprint.

**Alternatives considered**

Numbered pagination, scroll-triggered cursor pagination, and a pagination-plus-virtualization hybrid were explicitly discussed. Cursor pagination remains a documented future option if list data is separated from the lightweight map feed.

**Important changes**

- `src/components/panels/ActiveFlightList.tsx`: virtual rows, selection scrolling, accessibility metadata, and keyboard controls.
- `src/components/panels/OperationsPanel.tsx`: renders the virtual list and total aircraft count.
- `src/app/globals.css`: fixed viewport and row geometry.
- `docs/active-flight-list-scaling.md`: records the pagination/virtualization boundary and future hybrid.

**Verification**

`npm test` passed 39 tests; `npm run typecheck`, `npm run lint`, and `npm run build` passed. A live 10,000-aircraft stress run showed 10,000 logical rows, 23 mounted buttons, a 680,000-pixel scroll range, continuing telemetry updates, working selection, a valid 800-pixel responsive layout, and no browser console errors.

**Risks, tradeoffs, assumptions, and open questions**

All flight data and track history remain in browser memory, and the WebSocket payload is unchanged. `npm install` reported four high-severity dependency audit findings; no unrelated automatic audit fix was applied.

**References**

Commit `3b2d4c1` (`Virtualize active aircraft list`) on branch `codex/project-live-aircraft-motion`; target branch `origin/master`.

### 2026-07-23 — Preserve stable callsign ordering in normalized flight state

**Goal**

Keep the virtual list predictably ordered without sorting the full flight collection after every position update.

**Decision / approach**

Changed client flight state to `FlightCollection`, containing `flightsById` and `orderedFlightIds`. IDs are sorted by callsign with `flightId` as the tie-breaker. New aircraft and callsign changes rebuild the order; position-only updates retain the existing ID-array reference.

**Why**

The live feed can update many positions frequently. Separating record updates from membership/order changes avoids coupling every telemetry paint to a full callsign sort and retains the repository’s normalized-state model.

**Alternatives considered**

Sorting `Object.values(flightsById)` in the React component on every update, relying on object insertion order, and ordering only by `flightId` were explicitly considered. Callsign plus ID was selected for scanability and deterministic ties.

**Important changes**

- `src/lib/flightState.ts`: `FlightCollection`, collection creation, ordered replacement, and ordered upserts.
- `src/hooks/useFlightStream.ts`: stores and returns the normalized collection.
- `src/components/FlightOpsDashboard.tsx`: derives the map array from `orderedFlightIds` and `flightsById`.
- `server/flightState.test.ts`: covers ordering, insertion, callsign changes, snapshot replacement, and stable ID-array identity.

**Verification**

The final run of `npm test` passed 39 tests, including the new normalization cases. `npm run typecheck`, `npm run lint`, and `npm run build` passed.

**Risks, tradeoffs, assumptions, and open questions**

The map array is still reconstructed from all ordered IDs after collection updates. This task did not change map rendering or measure that separate cost.

**References**

Commit `3b2d4c1` (`Virtualize active aircraft list`) on branch `codex/project-live-aircraft-motion`; target branch `origin/master`.

---

### 2026-07-23 — Configure the live-aircraft quantity

**Goal**

Let users bound the Real ADS-B feed at 30, 60, or 100 aircraft, with 30 as the startup default.

**Decision / approach**

Added shared limit metadata and validation to the runtime source contract, capped valid normalized Airplanes.live records in the provider, and made live polls authoritative snapshots. The Controls dropdown exposes the three limits only for Real ADS-B and applies changes immediately through the existing source endpoint. Snapshot reconciliation now removes absent aircraft while retaining track history for aircraft that remain.

**Why**

Server-side limiting keeps the WebSocket payload, normalized UI state, list, and deck.gl map consistent. Authoritative snapshots prevent aircraft from accumulating beyond the selected limit as public-feed membership changes.

**Alternatives considered**

A free numeric input and client-only filtering were explicitly considered. Fixed choices provide bounded validation, while server-side limiting avoids transporting and storing aircraft the user did not request.

**Important changes**

The source API/types, Airplanes.live provider, flight-history and client snapshot reconciliation, Operations controls, tests, README, and deployment notes were updated.

**Verification**

`npm test` passed 45 tests. `npm run typecheck`, `npm run lint`, and `npm run build` passed. A local browser run opened Real ADS-B at 30 aircraft, changed immediately to 60 with 60 active aircraft, hid the quantity control after switching to Simulated Demo, and produced no browser console warnings or errors.

**Risks, tradeoffs, assumptions, and open questions**

Limits are maxima; sparse or partially invalid public data can produce fewer aircraft. Runtime choices are held in server memory and reset to 30 on restart. The provider preserves upstream response order when selecting the bounded set.

**References**

Working tree on branch `master`; no commit or pull request reference is available yet.

---

### 2026-07-24 — Add searchable live-aircraft areas

**Goal**

Allow Real ADS-B users to move beyond Los Angeles by searching and selecting a supported metro area.

**Decision / approach**

Added a shared curated catalog of ten metro areas with airport codes, aliases, coordinates, and fixed query radii. The source API now validates an optional `areaId`, preserves it independently from the aircraft limit, rebuilds the Airplanes.live point URL, clears the prior snapshot, and polls immediately. The Controls dropdown filters areas locally by name, code, slug, or alias. Selecting an area recenters the MapLibre camera and retains the selected quantity.

**Why**

A local catalog keeps the demo keyless and predictable while supporting useful text matching. Shared metadata prevents the UI, API validation, and provider coordinates from diverging.

**Alternatives considered**

External geocoding and an unrestricted coordinate input were considered. They were rejected for this slice because they add network dependencies, result ambiguity, validation, and attribution concerns unrelated to the core aviation-data lesson.

**Important changes**

The shared area catalog, source configuration, provider URL construction, runtime status, dashboard controls, map camera behavior, tests, README, and deployment notes were updated.

**Verification**

`npm test` passed 49 tests. `npm run typecheck`, `npm run lint`, and `npm run build` passed. In a local browser run, searching `LGA` reduced the list to New York; selecting it preserved the 30-aircraft limit, updated server status to `new-york`, replaced the live snapshot, recentered the map over New York, and produced no browser console warnings or errors.

**Risks, tradeoffs, assumptions, and open questions**

Search covers the curated catalog rather than arbitrary places. Each region uses the same fixed radius. Public coverage and returned aircraft counts vary by region.

**References**

Working tree on branch `master`; no commit or pull request reference is available yet.

---

### 2026-07-24 — Replace curated areas with a worldwide airport index

**Goal**

Expand live-area selection from ten curated metros to keyless worldwide airport search without loading the raw OurAirports dataset into the initial client bundle.

**Decision / approach**

Added a reproducible generator that downloads the public OurAirports airport, region, and country CSV files; retains scheduled medium and large airports with valid coordinates; joins readable region and country names; and emits a compact checked-in JSON index. The backend imports that artifact for identifier validation and Airplanes.live coordinates. Controls fetches it only when the Real ADS-B panel opens, validates it, defers text matching, reports total matches, and renders at most 50 results. Search covers city, airport name, IATA/ICAO code, region, country, and keywords. KLAX remains the default.

**Why**

One generated artifact keeps server and client data consistent, works without runtime API keys, and provides broad coverage while avoiding the 12.7 MB raw CSV. Lazy loading keeps the airport catalog out of the initial application bundle.

**Alternatives considered**

MapTiler geocoding, public Nominatim autocomplete, shipping the complete raw CSV, and keeping the ten-area catalog were considered. The generated index avoids paid credentials, prohibited public autocomplete usage, unnecessary fields, and limited coverage.

**Important changes**

The generator/package script, generated airport index, server catalog and source validation, shared search helpers, Controls UI, tests, README, deployment notes, and generated-file metadata were updated.

**Verification**

`npm test` passed 50 tests. `npm run typecheck`, `npm run lint`, and `npm run build` passed. A local browser run loaded 3,299 airports when Controls opened, matched `RJTT` to Tokyo Haneda, selected it while preserving the 30-aircraft limit, recentered the map over Tokyo, and produced no browser console warnings or errors. Server status reported `areaId: "RJTT"` and 30 active aircraft.

**Risks, tradeoffs, assumptions, and open questions**

The checked-in index is a snapshot and must be regenerated to receive upstream changes. Search is airport-centered rather than arbitrary-place geocoding. All Airplanes.live queries retain the existing 100-nautical-mile radius.

**References**

Working tree on branch `master`; no commit or pull request reference is available yet.

---

### 2026-07-24 — Filter stationary real ADS-B aircraft at ingestion

**Goal**

Keep aircraft reporting exactly zero ground speed out of the Real ADS-B map, list, server state, and WebSocket payload while preserving other valid telemetry.

**Decision / approach**

The Airplanes.live provider now uses one type-guard filter pass to remove invalid normalized records and records whose `groundSpeedKts` is exactly `0`, before the configured aircraft limit and motion enrichment. Unknown speed (`null`), low positive speed, and zero altitude remain valid. Other providers are unchanged. Existing authoritative live snapshots remove an aircraft from server and browser state if it later reports zero speed.

**Why**

The provider is the source-specific ingestion boundary. Filtering there keeps server counts, history, transport, and client state consistent without turning a valid telemetry value into a parsing error.

**Alternatives considered**

WebSocket-layer filtering, client-side filtering, altitude filtering, and treating zero speed as invalid normalization were explicitly considered. They were rejected because they would create inconsistent state, duplicate policy, or hide valid zero-altitude records.

**Important changes**

Updated `server/airplanesLiveProvider.ts` and its provider tests.

**Verification**

`npm test` passed 52 tests. `npm run typecheck` and `npm run lint` passed. The focused provider test passed 4 tests.

**Risks, tradeoffs, assumptions, and open questions**

Only exact zero is filtered; `null` and small positive speeds remain visible. This policy applies only to Airplanes.live. No runtime browser check was performed because the change is isolated to provider output and covered by automated tests.

**References**

Working tree on branch `master`; no commit or pull request reference is available yet.
