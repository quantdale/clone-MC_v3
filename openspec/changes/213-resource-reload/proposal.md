# Proposal: 213-resource-reload

## Problem
211/212 defined the manifest formats but nothing reloads them safely: a bad reload could corrupt
runtime registries mid-game. Development needs a validate-then-commit transaction: proposals
that never touch live state until fully validated.

## Goals
- `src/data/ResourceReload.ts` (NEW), pure and headless-safe:
  - **State**: `ResourceState { version, resources, data }` — the loaded resource-pack and
    data-pack manifests with a monotonically increasing version; `createInitialResourceState()`
    (version 0, no manifests).
  - **Propose**: `proposeReload(current, input)` — validates the incoming manifests (211/212
    constructed; a defensive `formatVersion` check) and resolves the data entries through the
    injected `hasEntry` registry check (212). No manifests provided -> `{ ok: false, reason:
    'no resources or data provided' }`; unresolved data entries -> `{ ok: false, reason:
    'unresolved data entries: <ids>' }`; otherwise `{ ok: true, proposal }`.
  - **Commit/abort**: `commitReload(current, proposal)` — stamps `version = current.version + 1`
    and returns the NEW state (the only mutation point); `abortReload(current)` — returns the
    current state (failed proposals NEVER touch runtime state; the abort documents the contract).

## Non-goals
- **No registry mutation** (the wiring applies committed manifests to the registries), **no file
  watching/IO** (development tooling), **no change to 211/212**, **no `Game.ts` edit**, **no
  save-format change**.

## Preconditions
- Change 212 (`internal-data-pack-format`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 211's `ResourcePackManifest`, 212's `DataPackManifest` / `resolveEntries` / `DataKind`
  (imported types/functions; both modules untouched).

## Proposed change
1. `src/data/ResourceReload.ts` (NEW): the resource state, proposal validation, and the
   commit/abort transaction.

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Commit without validation**. Mitigation: `commitReload` accepts ONLY the structured
  `{ ok: true }` proposal (type-level); failed proposals are unreachable.

## Rollback strategy
One new data file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: the initial state; propose success (resources only, data only, both);
  propose failures (nothing provided, unresolved entries with the exact ids); commit version
  math and manifest application; abort identity; input immutability.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
