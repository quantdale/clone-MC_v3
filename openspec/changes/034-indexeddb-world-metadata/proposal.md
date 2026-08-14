# Proposal: 034-indexeddb-world-metadata

## Problem

Persistent world state currently lives only in seed-scoped localStorage snapshots
(`WorldEditSnapshot`, player/state keys in `Game`). There is no database, no schema
version, and no world-level metadata. The parity roadmap (persistent world storage,
034–043) requires a real IndexedDB-backed store. 034 establishes the foundation: a
typed IndexedDB database, a schema version, and a world-metadata repository boundary.

## Goals

- Introduce a named, versioned IndexedDB database for worlds.
- Define a typed `WorldMetadata` record (world id, seed, dimension, vertical extent,
  created/updated timestamps, schema version).
- Provide a typed repository boundary (`WorldMetadataRepository`) to put/get/list/delete
  world metadata, with the `IDBFactory` injectable so it is unit-testable in Node.
- Keep it additive and dependency-free (no new runtime/dev packages).

## Non-goals

- Persisting chunk sections/columns (035), block entities (036), or entities (037).
- Autosave/transaction policies (038/039) or localStorage migration (040).
- Any change to the existing localStorage edit/player/state bridge.

## Preconditions

- Change 033 (`vertical-streaming`) is VERIFIED.
- `npm test` and `npm run test:e2e` are green at the 033 baseline (485 unit / 19 e2e).

## Dependencies

- Browser `indexedDB` API (available at runtime in `Game`). `World`/dimension vertical
  extent types (025/033) inform the metadata shape.

## Proposed change

Add `src/storage/WorldMetadata.ts` (types + `WORLD_DB_NAME`/`WORLD_DB_VERSION` +
`validateWorldMetadata`) and `src/storage/WorldMetadataRepository.ts`
(`WorldMetadataRepository` class with an injectable `IDBFactory`, opening
`WORLD_DB_NAME` v`WORLD_DB_VERSION`, creating the `world-metadata` object store keyed by
`worldId`, and exposing `putMetadata`/`getMetadata`/`listMetadata`/`deleteMetadata`).
Unit tests inject an in-memory `IDBFactory` mock (no new dependency).

## Compatibility and migration

New database only. No existing localStorage data is read or migrated (that is 040).
`WORLD_DB_VERSION` starts at `1`; future schema changes bump it and run `onupgradeneeded`
migration steps.

## Risks

- Node has no `indexedDB`; tests MUST inject a mock factory, never touch the global.
- A malformed/stale record MUST be rejected by `validateWorldMetadata`, not stored.

## Rollback strategy

Revert the commit. No persisted data, public APIs, or other modules depend on it yet.

## Definition of Done

- `src/storage/WorldMetadata.ts` + `src/storage/WorldMetadataRepository.ts` implemented.
- `IDBFactory` injectable; opens the DB and creates the store on first run.
- `validateWorldMetadata` rejects invalid records.
- Unit tests (in-memory mock) cover put/get/list/delete + validation + version/store creation.
- Full gate green; 034 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`
must pass. Unit count grows by the 034 suite; E2E stays 19/19.
