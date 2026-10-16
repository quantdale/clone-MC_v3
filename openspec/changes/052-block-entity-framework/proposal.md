# Proposal: 052-block-entity-framework

## Problem

036 defined a persistence envelope for block entities, and 050 defined behavior dispatch, but there is
no runtime block-entity *instance*: an object with position, type, opaque data, a tickable flag, and a
lifecycle that lives per chunk. Chests, furnaces, signs, etc. cannot exist in the world yet.

## Goals

- Provide `BlockEntityInstance`: position, `typeKey`, opaque `data`, `tickable` flag, optional
  `onTick` callback, and a `tick(tick)` method (no-op unless tickable).
- Provide `BlockEntityManager`: add/remove/get by position, chunk-grouped access
  (`getForChunk`/`removeChunk` for unload), deterministic `tickAll` (insertion order, tickable only),
  and `size`/`clear`.
- Persistence wiring: `serializeChunk(cx, cz)` produces 036 `SerializedBlockEntity[]`;
  `deserializeChunk(cx, cz, entities)` restores instances — the framework and the 036 store speak the
  same shape.

## Non-goals

- Concrete block entities (chests/furnaces — later changes 107/109+).
- The per-instance *behavior* (blocks own behavior via 050; instances carry data + tick hook).
- Wiring the manager into `World`/`ChunkColumn` (a later consumer change).

## Preconditions

- Change 051 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 051 baseline (644 unit / 19 e2e).

## Dependencies

- 036 `SerializedBlockEntity` / `validateSerializedBlockEntity` for the persistence shape.
- 021 section math for chunk keys (world block coords → chunk coords).

## Proposed change

- `src/simulation/BlockEntityManager.ts` (NEW): `BlockEntityInstance`, `BlockEntityManager`
  (add/remove/get/getForChunk/removeChunk/tickAll/serializeChunk/deserializeChunk/size/clear).
- `tests/unit/BlockEntityManager.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet. The serialized shape is exactly the 036 envelope, so 040-style imports
and 036 stores interoperate.

## Risks

- One instance per position: `add` rejects a duplicate position (`false`), documented.
- Tick order determinism: insertion order, which is stable for a fixed event sequence.

## Rollback strategy

Revert the commit; the framework is additive.

## Definition of Done

- `BlockEntityInstance.tick` invokes `onTick` only when tickable; `setTickable` toggles.
- `BlockEntityManager` enforces one instance per position, groups by chunk, and `removeChunk` cleans an
  unloaded chunk.
- `tickAll(tick)` ticks tickable instances in insertion order and returns the count.
- `serializeChunk`/`deserializeChunk` round-trip through the 036 envelope (validated).
- Unit tests cover lifecycle, chunk grouping, determinism, duplicate rejection, and persistence.
- Full gate green; 052 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 052 suite; E2E stays 19/19.
