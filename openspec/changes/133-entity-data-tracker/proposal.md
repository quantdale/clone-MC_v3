# Proposal: 133-entity-data-tracker

## Problem
Nothing in the catalog exposes a per-entity, keyed, dirty-tracked property container — the
primitive real Minecraft calls `SynchedEntityData`, used to synchronize a subset of an entity's
state to rendering and (in a networked game) other clients, sending only what changed since the last
flush instead of the whole entity every frame. Neither `EntityInstance` (129) nor any other module
offers this; a future mob-rendering or networking consumer would otherwise have to invent its own
ad hoc dirty-tracking each time.

## Goals
- `DataAccessorRegistry`: assigns stable, dense, unique integer ids to named typed accessors
  (`define<T>(name): DataAccessor<T>`), preventing duplicate names.
- `EntityDataTracker`: a per-instance keyed value store built on `DataAccessor`s —
  `define(accessor, initialValue)`, `get(accessor)`, `set(accessor, value)` (marks dirty only on an
  actual change, `Object.is`-compared), `isDirty(accessor)`, `getDirty()` (changed-since-last-flush
  entries, for an incremental sync), `getAll()` (every entry, for a full/initial sync), and
  `clearDirty()` (flush).
- Fully generic and standalone: usable by any future consumer (entity rendering, networking, or
  otherwise), not hard-wired to `EntityInstance`/`EntityManager`.

## Non-goals
- **No wire/serialization format.** No packet encoding, no network transport; `getDirty()`/`getAll()`
  return plain in-memory value pairs for a caller to serialize however it needs.
- **No wiring into `EntityInstance`/`EntityManager`/`Game`/rendering.** No live entity owns an
  `EntityDataTracker` yet; that begins once a real rendering or networking consumer exists.
- **No deep-equality change detection.** `set` uses `Object.is` for the dirty check; a caller passing
  a structurally-equal-but-different object/array reference is treated as changed (documented,
  matches the "pass a new value on change" idiom used elsewhere in this codebase, e.g. defensive
  copies in 129).
- **No per-entity-type static schema registry tied to the 017 `EntityRegistry`.** A future consumer
  may build one on top of `DataAccessorRegistry`; 133 only provides the two generic primitives.

## Preconditions
- Change 132 (`entity-chunk-tracking`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond TypeScript/JS built-ins — this is a self-contained, dependency-free pair of classes.

## Proposed change
1. `src/data/EntityDataTracker.ts` (NEW):
   - `interface DataAccessor<T> { readonly id: number; readonly name: string }` (the `T` parameter is
     compile-time only, carried for type-safe `get`/`set` call sites).
   - `class DataAccessorRegistry` — `define<T>(name): DataAccessor<T>` (throws on a duplicate name),
     `has(name)`, `size`.
   - `class EntityDataTracker` — `define<T>(accessor, initialValue)` (throws on a duplicate accessor
     id), `get<T>(accessor)` (throws if undefined), `has(accessor)`, `set<T>(accessor, value)`
     (returns whether it changed; throws if undefined), `isDirty(accessor)`, `getDirty()`, `getAll()`,
     `clearDirty()`.
2. No other file is edited.

## Compatibility and migration
- One new, fully self-contained, zero-dependency file. No schema/save-format change, no registry
  change, no migration.

## Risks
- **`Object.is` dirty-detection surprising a future consumer expecting deep equality.** Mitigation:
  documented explicitly in design.md/spec.md as a deliberate, narrow contract matching this
  codebase's existing "pass a new value" idiom.
- **Scope creep into rendering/networking wiring.** Mitigation: the non-goals list is explicit; tasks
  implement only the two generic classes and their tests.

## Rollback strategy
One new file with zero consumers; deleting it fully reverts the change with no other impact.

## Definition of Done
- `DataAccessorRegistry`/`EntityDataTracker` implemented per design.md/spec.md.
- Unit tests cover: accessor definition + duplicate-name/duplicate-id rejection, get/set/dirty
  semantics (including the no-op-when-unchanged case), `getDirty()`/`getAll()`/`clearDirty()`
  behavior, and the documented `Object.is` comparison contract.
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, no consumer wiring).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
