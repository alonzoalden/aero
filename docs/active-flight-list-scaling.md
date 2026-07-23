# Active aircraft list scaling

The dashboard currently receives the complete active-aircraft set over WebSockets because deck.gl needs every position for the map. The right-panel list therefore uses virtualization to solve its immediate scaling problem: too many React buttons and DOM elements.

TanStack Virtual treats the list as one 384-pixel scroll viewport with 68-pixel row slots. It calculates the full scroll height but mounts only the visible rows and eight overscan rows on either side. Overscan makes fast scrolling feel continuous without letting the DOM grow with the aircraft count.

The flight store keeps two normalized structures:

- `flightsById` holds the current live record for each aircraft.
- `orderedFlightIds` holds callsign-and-ID display order.

Position updates replace records in `flightsById` without rebuilding `orderedFlightIds`. The order changes only when an aircraft joins or its callsign changes. This resembles an NgRx entity dictionary plus its ordered ID collection: React components select records explicitly, while high-frequency position updates stay separate from list membership.

## Pagination versus virtualization

Pagination limits how much data the client retrieves. Virtualization limits how many retrieved records become DOM nodes. Numbered pagination can keep both counts small by replacing the current page, but it interrupts the continuous monitoring workflow. Infinite scrolling appends pages as the user moves down, so its DOM still grows unless it is paired with virtualization.

Adding a paged list API now would duplicate data already delivered for the map. It becomes useful when list rows contain richer data that the map does not need. At that point the intended hybrid is:

1. Stream lightweight positions for all map aircraft.
2. Fetch detailed list rows in cursor-based batches of 100.
3. Prefetch when the virtual range reaches within 20 rows of the loaded boundary.
4. Keep the accumulated pages available for backward scrolling while virtualizing their DOM rows.

A live dataset should use an opaque keyset cursor and snapshot token rather than numeric offsets. Aircraft can join, leave, or reorder between requests; a snapshot token gives one scrolling session stable membership and prevents skipped or duplicated rows.
