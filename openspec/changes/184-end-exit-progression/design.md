# Design: 184-end-exit-progression

## Context/current state
- 182 wired the End's entry; 183's `dragonDefeated`/`dragonReturnGatewayOpen` provide the victory
  signal; 153's boss framework demonstrates the versioned serialization pattern. 184 closes the
  arc: the exit portal, the return, and the persisted completion.

## Target state
- `src/simulation/EndExitProgression.ts` holding the exit-portal geometry, spawn/persist rules,
  return destination, and the completion record + serialization.

## Invariants
- `endExitPortalCells` returns exactly 21 distinct cells (5×5 minus the four corners).
- `endExitPortalSpawns(gatewayOpen)` = `gatewayOpen`; `endExitPortalRemains(record)` is true iff a
  defeated record exists.
- `endExitDestination` returns the spawn unchanged when finite, `null` otherwise.
- `markDragonDefeated(state, tick)` returns a record iff `state.status === 'DEFEATED'`.
- `deserializeDragonCompletion` validates every field (version 1, non-empty key, boolean defeated,
  non-negative integer tick) before accepting; malformed input throws.

## API and data model
```ts
// src/simulation/EndExitProgression.ts (new)
export const END_EXIT_PORTAL_RING_SIZE = 5;
export const END_EXIT_PORTAL_VERSION = 1;
export interface DragonCompletionRecord { dragonKey: string; defeated: boolean; defeatedTick: number; }
export interface SerializedDragonCompletion { version: 1; dragonKey: string; defeated: boolean; defeatedTick: number; }

export function endExitPortalCells(centerX: number, y: number, centerZ: number): ReadonlyArray<readonly [number, number, number]>;
export function endExitPortalSpawns(gatewayOpen: boolean): boolean;
export function endExitDestination(worldSpawn: readonly [number, number, number]): readonly [number, number, number] | null;
export function markDragonDefeated(state: BossState, tick: number): DragonCompletionRecord | null;
export function dragonCompletionIsDefeated(record: DragonCompletionRecord): boolean;
export function endExitPortalRemains(record: DragonCompletionRecord | null): boolean;
export function serializeDragonCompletion(record: DragonCompletionRecord): SerializedDragonCompletion;
export function deserializeDragonCompletion(input: unknown): DragonCompletionRecord;
```

## Control/data flow
1. On `dragonReturnGatewayOpen === true`, the wiring fills `endExitPortalCells` with end-portal
   blocks at the island center.
2. Stepping into the portal teleports to `endExitDestination(worldSpawn)` (the overworld spawn).
3. On defeat, the wiring stores `markDragonDefeated(state, tick)`; on save it serializes, on load it
   deserializes, and `endExitPortalRemains` keeps the portal present.

## Detailed behavior
- The exit-portal shape is vanilla's: a 5×5 of end-portal blocks with the four corners missing (the
  classic ring the player steps into); 21 cells.
- The completion record is the post-boss state; a defeated record is the ONLY thing that keeps the
  exit portal present across reloads.

## Failure modes
- `deserializeDragonCompletion` throws descriptively on any malformed field; every other function is
  total for well-formed inputs.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change
  (the record is a new additive persistence shape, versioned for future migration).

## Performance/resource constraints
- All functions O(≤ 25); serialization O(1).

## Testing seams
- Tests use 153's real `startBossFight`/`damageBoss` and 183's definition for the defeat path.

## Observability/debugging
- `dragonCompletionIsDefeated`/`endExitPortalRemains` are explicit booleans; the record is a plain
  value.

## Affected files/symbols
- `src/simulation/EndExitProgression.ts` (new).
- Tests: `tests/unit/EndExitProgression.test.ts` (new). No other files.

## Rejected alternatives
- **Owning the world-spawn location**: rejected — the module takes it as a parameter (the wiring
  knows the spawn); `null` for non-finite inputs makes the no-destination case explicit.
- **Unvalidated persistence**: rejected — a corrupted save must not silently produce a defeated
  dragon; full validation mirrors 153's pattern.

## Downstream dependencies
- 185 (`advancement-framework`) and 186 (progression advancements) consume the completion record as
  a trigger source; 242's survival e2e runs the full loop with the exit portal as the finale.
