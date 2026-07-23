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

---

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
