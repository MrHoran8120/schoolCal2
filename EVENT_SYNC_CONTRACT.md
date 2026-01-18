# Event sync contract

## Event object shape


| field | type | description |
| --- | --- | --- |
| id | string | deterministic identifier combining source/title/date (models.js:55-107). |
| title | string | user-visible title. |
| date | string | ISO date placement (required). |
| startDate | string | ISO start bound (defaults to `date`). |
| endDate | string | ISO end bound (defaults to `date`). |
| subject | string | category/year grouping. |
| notes | string | description/reminders. |
| color | string | UI accent hex. |
| type | string (event/ term/ recurring) | display context. |
| yearTags | string[] | normalized Year 7-12 tags from imported text. |
| source | string | importer key (e.g., sw-doe, personal). |
| origin | string | canonical enum (NSWDOE, Sentral, personal). |
| createdAt | string | ISO timestamp first saved. |
| lastModified | number | Numeric UTC timestamp (ms since epoch) used exclusively for sync ordering and conflict resolution; ISO formatting is a presentation concern only. |
| deleted | boolean | Tombstone flag; true means the record represents a delete. |
| syncStatus | string (local/synced/conflict) | sync metadata used by UI badges. |


## Identity and ID Authority

The id field is a client-generated, deterministic identifier derived from event semantics (e.g., source, title, date).

The frontend is the sole authority for ID generation. The backend must treat id as an immutable primary key and must never generate, modify, or reinterpret event IDs.

Once created, an event's id must not change. If a user action would require changing identity-defining attributes, the frontend must create a new event record rather than mutating the existing ID.

If multiple clients independently generate the same id, they are considered to refer to the same logical event and are reconciled using last-write-wins semantics.

## Client-only vs. synced fields
- **Shared** (should round-trip with backend): id, title, date, startDate, endDate, subject, notes, color, type, yearTags, source, origin, createdAt, lastModified, deleted, syncStatus (client-managed metadata; backend must not modify).
- **Client-only**: generally none; the UI derives rendering state solely from these shared fields so backend implementations can rely on the same shape.

## lastModified usage
dataStore.saveEvent always sets lastModified = getCurrentTimestamp() before writing to IndexedDB (db.js:43-57). Legacy rows missing the key are backfilled by migrateSyncMetadata during reads (db.js:85-118). This allows backends to detect changed records by comparing timestamps, and any ISO formatting is treated as a presentation concern only.

## syncStatus transitions
- New events default to local (models.js:91-142, db.js:43-57). 
- syncStatus can be kept in sync with the backend: once the server confirms a record, it should rewrite the event with syncStatus = synced and refresh lastModified.
- A stub (handlePotentialConflicts) already exists for later conflict detection and would mark records as conflict when implemented; the UI supports all three values via badges (ui.js). 

## Deletes
Deletes are state transitions performed by setting `deleted = true`, bumping `lastModified` (numeric UTC ms), and writing `syncStatus = local`; they are not physical removals. Deleted records continue to round-trip through every backend change feed so each device observes tombstones and converges, and physical purging is out of scope for this initial sync design.

Last-write-wins treats deletes and updates identically: whichever record (delete or mutation) has the newest `lastModified` survives. When timestamps are equal, the server record wins the deterministic tie-break.

This contract keeps the frontend/backend vocabulary aligned while allowing a backend to implement syncing according to these fields and lifecycle notes.

Last-write-wins is evaluated per id independently; no transactional or cross-record ordering guarantees are provided.
