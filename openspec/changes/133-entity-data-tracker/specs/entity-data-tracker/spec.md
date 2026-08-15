# Spec: entity-data-tracker

## Contract
This capability adds a generic, standalone dirty-property container mirroring real Minecraft's
`SynchedEntityData`: `DataAccessorRegistry` assigns dense typed-key ids, and `EntityDataTracker`
stores/tracks per-instance values against those keys, exposing incremental (`getDirty`) and full
(`getAll`) reads plus a `clearDirty` flush. No wire format, no `EntityInstance`/`Game`/rendering
wiring — see the proposal's Non-goals.

## Definitions
- **Data accessor**: a `DataAccessor<T>` — an immutable `{ id, name }` pair identifying one typed
  property slot; `id` is a dense, unique, non-negative integer assigned by a `DataAccessorRegistry`.
- **Tracker**: an `EntityDataTracker` instance holding zero or more defined accessor→value entries,
  each with a dirty flag.
- **Dirty entry**: a tracker entry whose value has changed (per `Object.is`) since the tracker's
  construction or the last `clearDirty()` call, whichever is more recent.
- **Full sync**: `getAll()` — every defined entry, dirty or not.
- **Incremental sync**: `getDirty()` — only the currently-dirty entries.

## Invariants
- `DataAccessorRegistry.define` never assigns the same `id` twice and never accepts a duplicate
  `name` on one registry instance.
- `EntityDataTracker.define` may be called at most once per accessor `id` on a given tracker.
- `set(accessor, value)` marks the entry dirty if and only if `!Object.is(previousValue, value)`; it
  always stores `value` (dirty or not).
- `clearDirty()` never changes any stored value, only dirty flags.
- `get`/`set`/`isDirty` on an accessor never `define`d on that tracker always throw.

## Requirements

### Requirement: DataAccessorRegistry assigns dense unique ids and rejects duplicate names
`DataAccessorRegistry.define<T>(name)` MUST return a `DataAccessor<T>` whose `id` is unique and
strictly increasing across calls on that registry instance, and MUST throw when `name` has already
been used on that registry, without consuming an id.

#### Scenario: sequential define calls assign increasing ids
- **GIVEN** a fresh `DataAccessorRegistry`
- **WHEN** `define('health')` then `define('isBaby')` are called
- **THEN** the second accessor's `id` is greater than the first's, and `has('health')`/
  `has('isBaby')` are both `true`

#### Scenario: a duplicate name is rejected
- **GIVEN** a registry with `'health'` already defined
- **WHEN** `define('health')` is called again
- **THEN** it throws, and `registry.size` is unchanged

### Requirement: EntityDataTracker.define seeds a value once per accessor
`EntityDataTracker.define(accessor, initialValue)` MUST store `initialValue` under `accessor.id`,
readable via `get(accessor)`, not marked dirty. Calling `define` again with an accessor whose `id`
was already defined on that tracker MUST throw and MUST NOT change the existing stored value.

#### Scenario: a freshly defined entry is readable and not dirty
- **GIVEN** a fresh `EntityDataTracker` and a `health` accessor
- **WHEN** `define(health, 20)` is called
- **THEN** `get(health)` returns `20` and `isDirty(health)` is `false`

#### Scenario: redefining the same accessor id throws without changing the value
- **GIVEN** a tracker with `health` already defined as `20`
- **WHEN** `define(health, 99)` is called again
- **THEN** it throws, and `get(health)` still returns `20`

### Requirement: set marks dirty only on an actual (Object.is) change, and always stores the new value
`EntityDataTracker.set(accessor, value)` MUST return `true` and mark the entry dirty when
`!Object.is(currentValue, value)`, and MUST return `false` without marking it dirty when
`Object.is(currentValue, value)`. In both cases the stored value afterward MUST equal `value`. `set`
on an undefined accessor MUST throw.

#### Scenario: setting a different value marks it dirty and returns true
- **GIVEN** a tracker with `health` defined as `20`
- **WHEN** `set(health, 15)` is called
- **THEN** it returns `true`, `get(health)` is `15`, and `isDirty(health)` is `true`

#### Scenario: setting the same value does not mark it dirty and returns false
- **GIVEN** a tracker with `health` defined as `20`
- **WHEN** `set(health, 20)` is called
- **THEN** it returns `false` and `isDirty(health)` is `false`

#### Scenario: setting an undefined accessor throws
- **GIVEN** a fresh tracker and an accessor never `define`d on it
- **WHEN** `set(accessor, 1)` is called
- **THEN** it throws

### Requirement: getDirty/getAll/clearDirty implement the incremental-vs-full sync contract
`getDirty()` MUST return exactly the currently-dirty entries (in accessor-id order); `getAll()` MUST
return every defined entry (in accessor-id order) regardless of dirty state; `clearDirty()` MUST
clear every dirty flag without changing any stored value, so a subsequent `getDirty()` call returns
empty until another `set` actually changes a value.

#### Scenario: getDirty returns only changed entries; getAll returns everything
- **GIVEN** a tracker with `health` (changed via `set`) and `isBaby` (never changed since definition)
  both defined
- **WHEN** `getDirty()` and `getAll()` are called
- **THEN** `getDirty()` contains only the `health` entry, and `getAll()` contains both

#### Scenario: clearDirty empties getDirty without altering values
- **GIVEN** a tracker with a dirty `health` entry at value `15`
- **WHEN** `clearDirty()` is called
- **THEN** `getDirty()` is now empty, `isDirty(health)` is `false`, and `get(health)` is still `15`

## Error and failure behavior
- `DataAccessorRegistry.define` throws on a duplicate `name`, consuming no id.
- `EntityDataTracker.define` throws on a duplicate accessor `id`, leaving the existing entry
  unchanged.
- `EntityDataTracker.get`/`set`/`isDirty` throw for an accessor never `define`d on that tracker.

## Performance and resource bounds
- `define`/`get`/`set`/`isDirty`/`has` are O(1) (`Map` operations). `getDirty()`/`getAll()` are O(n)
  in the number of defined accessors on that tracker.

## Compatibility and migration
- One new, dependency-free file (`src/data/EntityDataTracker.ts`); no edits to any existing module.
  No schema/save-format change; no migration.

## Security and integrity
- Values are stored exactly as provided (no coercion); dirty detection is deterministic
  (`Object.is`), so sync output never silently drops or fabricates a change.

## Observability
- `DataAccessor.name` is retained for debugging/error messages even though lookup is always by
  dense `id`.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registry assigns dense unique ids, rejects duplicate names | `tests/unit/EntityDataTracker.test.ts` DataAccessorRegistry cases |
| REQ-2 tracker.define seeds once per accessor | `tests/unit/EntityDataTracker.test.ts` define cases |
| REQ-3 set marks dirty only on Object.is change | `tests/unit/EntityDataTracker.test.ts` set cases |
| REQ-4 getDirty/getAll/clearDirty sync contract | `tests/unit/EntityDataTracker.test.ts` sync cases |
