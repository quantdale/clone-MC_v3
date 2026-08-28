# Spec: dimension-manager

## Contract
This capability adds the multi-dimension container: `DimensionManager` holds independently loaded
dimensions — each with its own `DimensionType` (025), `WorldAccess` (its own world/chunk state), and
`ScheduledTickQueue` (047, its own tick state). Registration order is the deterministic iteration
order; duplicate keys are rejected; `tickAll` drains each dimension's queue independently. The key
of a dimension IS its type's resource id string.

## Definitions
- **Loaded dimension**: `{ key, type, world, tickQueue }`.
- **Key**: `resourceIdToString(type.id)` (e.g. `minecraft:overworld`).

## Invariants
- The key is derived from `type.id` — there is no separate key argument.
- Every dimension has its own `tickQueue` instance (fresh unless supplied) and its own `world`.
- `tickAll` drains queues independently, in registration order; unknown-key lookups are
  `undefined`/`false`; `removeDimension` is idempotent.

## Requirements

### Requirement: registration stores a dimension keyed by its type id
`registerDimension(type, world, tickQueue?)` MUST store the dimension under
`resourceIdToString(type.id)` with its own world and its own queue (a fresh `ScheduledTickQueue`
when none is supplied), and MUST return the loaded dimension. A duplicate key MUST throw
`RegistryError` with reason `DUPLICATE_ID` and MUST NOT alter existing state.

#### Scenario: register two dimensions with independent queues
- **GIVEN** an overworld type (`minecraft:overworld`) and a nether type (`minecraft:the_nether`)
- **WHEN** both are registered with distinct fake worlds
- **THEN** the keys are `minecraft:overworld` / `minecraft:the_nether`, `size` is 2, and the two
  tick queues are different instances, both empty

#### Scenario: duplicate registration is rejected
- **GIVEN** an already-registered overworld type
- **WHEN** the same type is registered again
- **THEN** a `DUPLICATE_ID` error is thrown and `size` stays 1

### Requirement: lookups, iteration, and removal are total and deterministic
`hasDimension` MUST return whether a key is loaded; `getDimension`/`getWorld`/`getTickQueue` MUST
return the loaded values or `undefined`; `dimensions()` MUST list in registration order; `size`
MUST count; `removeDimension` MUST remove exactly the requested key and return whether it was
present (idempotent: a second removal returns `false`).

#### Scenario: round-trip and unknown keys
- **GIVEN** one registered dimension
- **WHEN** every accessor is called with the registered and an unknown key
- **THEN** registered-key accessors return the loaded values; unknown-key accessors return
  `undefined`/`false`

#### Scenario: ordered iteration and idempotent removal
- **GIVEN** overworld then nether registered
- **WHEN** `dimensions()` is called, then `removeDimension('minecraft:overworld')` twice
- **THEN** the list is `['minecraft:overworld', 'minecraft:the_nether']`; the first removal returns
  `true`, the second `false`, and `size` is 1

### Requirement: tickAll drains each dimension's queue independently
`tickAll(nowTick)` MUST drain every loaded dimension's queue at `nowTick`, in registration order,
returning a map from key to its due ticks. Draining one dimension MUST NOT affect another's
pending ticks, and identical inputs MUST produce identical results.

#### Scenario: per-dimension due ticks
- **GIVEN** a tick scheduled at 8 in the overworld queue and at 4 in the nether queue
- **WHEN** `tickAll(4)` then `tickAll(8)` are called
- **THEN** the first call yields the nether tick only; the second yields the overworld tick only

#### Scenario: deterministic across identical builds
- **GIVEN** two managers built with identical registrations and schedules
- **WHEN** `tickAll(8)` is called on both
- **THEN** the resulting maps are equal and contain both dimension keys

### Requirement: per-dimension height metadata is consulted per dimension (025)
Each loaded dimension's `type` MUST be its own `DimensionType` with correct vertical extent, and
world edits in one dimension MUST NOT appear in another's world.

#### Scenario: overworld vs nether metadata and isolation
- **GIVEN** overworld (−64/384, skylight) and nether (0/256, no skylight, ultrawarm) registered with
  distinct worlds
- **THEN** the overworld type has `minY −64`, `sectionCount 24`, `hasSkylight true`, `containsY(−64)`
  and `containsY(319)` true, `containsY(320)` false; the nether type has `minY 0`,
  `sectionCount 16`, `hasSkylight false`, `ultrawarm true`, `containsY(−1)` false; and a block
  written into the overworld world reads back `0` from the nether world

## Error and failure behavior
- Duplicate registration throws `DUPLICATE_ID`; all other paths are total.

## Performance and resource bounds
- O(1) accessors; `dimensions()` O(n); `tickAll` O(Σ due work).

## Compatibility and migration
- One new file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted-input surface.

## Observability
- `LoadedDimension` is a plain value; `dimensions()` exposes the loaded set in order.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registration + duplicate rejection | `tests/unit/DimensionManager.test.ts` › `registerDimension` |
| REQ-2 lookups/iteration/removal | › `lookups` |
| REQ-3 tickAll independence/determinism | › `tickAll` |
| REQ-4 per-dimension metadata + isolation | › `per-dimension height metadata (025)` |
