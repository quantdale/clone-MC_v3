# Design: 128-fire-block-simulation

## Context/current state
- Change 125 gave wheat an `age` property (`[0,7]`) and `World.setBlockState`/`getBlockState` with
  an in-memory state overlay; `CropBlockBehavior.onRandomTick` advances the age.
- Change 126 gave farmland `moisture` (`[0,7]`) and a `FarmlandBlockBehavior.onRandomTick` that
  reads/writes state through the overlay.
- `BlockBehaviorRegistry` (050) maps block keys to `BlockBehavior` modules; `Game.tickRandomBlocks`
  (048) selects eligible cells per 16×16×16 section via `RandomTickSelector` and invokes
  `onRandomTick` with a `BlockBehaviorContext`.
- `BlockId` last used is `Farmland = 35`; the next free block id is **36**.
- The `ScheduledTickQueue` (047) is a standalone deterministic queue but is **not** wired into the
  `Game` tick loop (no dispatch, no lifecycle/persistence integration). Fire therefore uses the
  already-wired random-tick dispatch, with the per-block `age` acting as a deterministic burn timer.

## Target state
- `BlockId.Fire = 36` with a 16-state `age` (`0..15`) schema, default `0`.
- `src/simulation/FireBehavior.ts` exposing pure, unit-testable helpers plus a `FireBlockBehavior`.
- `BlockBehaviorContext.seed` (optional) so spread rolls are deterministic from the game seed.
- `Game` registers fire behavior and passes `seed` in random-tick contexts; fire ticks in simulating
  sections exactly like crop/farmland.

## Invariants
- `FIRE_AGE_PROPERTY === 'age'`; `MAX_FIRE_AGE === 15`; a fire's age never leaves `[0, 15]` (the
  state registry rejects any out-of-domain assignment).
- `isFlammable` is `true` exactly for `{Wood, Leaves, Planks}` (the documented flammability set);
  `Grass`, `Dirt`, `Stone`, `Air`, and all other catalog blocks are non-flammable.
- `ignite` returns `true` and writes Fire `age 0` only when the target cell is Air and the block
  directly below is flammable; otherwise it writes nothing and returns `false`.
- Fire extinguishes (becomes Air) when unsupported (block below non-flammable) or adjacent to Water
  (any of the 6 orthogonal neighbors is Water). A fire that dies by unsupported/water never burns
  its support.
- At the end of a fire's life (`next = age+1 > MAX_FIRE_AGE`), the fire extinguishes AND, when its
  support is flammable, that support is consumed to Air (burn rule).
- Spread is bounded per random tick: at most `MAX_SPREAD_PER_TICK = 2` new fires, considering at
  most 6 fixed candidates; each candidate ignites only if it is ignitable and its roll is below
  `SPREAD_PROBABILITY = 0.5`.
- All randomness comes from the injected seed (via `hash32`); no global RNG, no unbounded loops.

## API and data model
`src/simulation/FireBehavior.ts` (pure; imports only `BlockId` and `hash32`):
```ts
export const FIRE_AGE_PROPERTY = 'age';
export const MAX_FIRE_AGE = 15;
export const SPREAD_PROBABILITY = 0.5;
export const MAX_SPREAD_PER_TICK = 2;

export function isFlammable(blockId: number): boolean;              // Wood | Leaves | Planks
export function parseFireAge(raw: string | undefined): number;      // invalid -> 0
export function canIgnite(world: BlockWorldAccess, x, y, z): boolean;
export function ignite(world: BlockWorldAccess, x, y, z): boolean;  // true iff placed
export function isAdjacentToWater(world: BlockWorldAccess, x, y, z): boolean;
export function spreadRoll(seed: number, x, y, z, tick, index: number): number; // [0,1)
export function spreadFire(world, x, y, z, roll: (index: number) => number): number; // # ignited
export class FireBlockBehavior implements BlockBehavior { onRandomTick(ctx): void; }
```
`BlockTypeDefinition` addition:
```ts
{ id: BlockId.Fire, resourceId: rid('fire'), key: 'fire', name: 'Fire',
  solid: false, opaque: false, breakable: false,
  renderCategory: RenderCategory.Transparent, topTile: 0, bottomTile: 0, sideTile: 0,
  hardness: Infinity, propertySchema: FIRE_SCHEMA, defaultState: { age: 0 } }
```
`FIRE_SCHEMA = new BlockPropertySchema([{ kind: 'integer', name: 'age', min: 0, max: 15 }])`.

## Control/data flow
1. A fire block is placed via `ignite` (or already present). It lives on a flammable support below.
2. `Game.tickRandomBlocks` increments `simTick`, selects eligible cells per section via
   `RandomTickSelector`, and calls `FireBlockBehavior.onRandomTick({ x, y, z, tick, seed, world })`.
3. `onRandomTick`:
   a. Returns if the cell no longer holds Fire.
   b. Extinguishes (Fire → Air) if unsupported or water-adjacent; returns.
   c. Reads `age`; computes `next = age + 1`.
   d. If `next > MAX_FIRE_AGE`: Fire → Air; if the support below is flammable, support → Air; returns
      (no spread from a dead fire).
   e. Else writes `age = next` via `setBlockState`.
   f. Attempts bounded spread via `spreadFire` with a seeded per-candidate roll.
4. `spreadFire` iterates the 6 fixed neighbors; for each ignitable one, `roll(i) < SPREAD_PROBABILITY`
   and the per-tick cap permits, calls `ignite`.

## Detailed behavior
- `parseFireAge`: `undefined`, non-integer, or out-of-range normalize to `0` (mirrors crop-age
  parsing in 125). A throwing state read is caught by `onRandomTick` and treated as a skip.
- Access without `getBlockState`/`setBlockState`: fire cannot age, so it stays at its current age but
  still extinguishes when unsupported/water-adjacent and still spreads (ignition needs only
  `getBlockId`/`setBlockId` or `setBlockState`). In practice the `WorldBlockAccess` provides state.
- The death check uses `next = age + 1 > MAX_FIRE_AGE`, so a fire placed at age 0 burns for 15
  random ticks (reaching live age 15 once) and dies on the 16th tick that selects it. All 16 age
  states are live-reachable.
- Burn consumes the flammable support *below the fire* when the fire reaches the end of its life —
  this is the single, tested burn rule ("fire's age reaching MAX on the flammable block's own fire").

## Failure modes
- Throwing `getBlockState`: `onRandomTick` catches and skips the tick (no crash, no write).
- Cell no longer Fire: no-op.
- Ignite on a non-air or unsupported cell: returns `false`, no write, no throw.
- Access lacking state capability: fire ages not at all but extinguish/spread still work.
- Spread candidate beyond bounds / already Fire / not ignitable: skipped without error.

## Compatibility/migration
- Additive block id 36; no existing block id, state id, or save-format change; no migration.
- Fire's `age` persists in memory through the existing state overlay (125/126) and does not enter
  the `WorldEditSnapshot` edit format, so there is no persistence change.
- `BlockItemSeparation.test.ts` table gains `[36, 'fire', null]`; `BlockStateRegistry.test.ts`
  state-count formula (`blockRegistry.all().length - 2 + 8 + 8`) becomes
  `blockRegistry.all().length - 3 + 8 + 8 + 16` and the enumeration branch covers fire.

## Performance/resource constraints
- `onRandomTick` is O(1) amortized: a constant number of neighbor reads (≤ 6 for spread, ≤ 6 for
  water adjacency), one state read, one state write, and at most 6 hash rolls. Spread ignites at
  most 2 cells. No unbounded loops; no per-frame/per-tick global cost beyond the already-scheduled
  random-tick dispatch.
- The fire block adds 16 states to the state registry (well under `MAX_STATES_PER_BLOCK`).

## Testing seams
- All helpers are pure against a fake `BlockWorldAccess` (no `Game`), mirroring the `Bonemeal`/
  `FarmlandBehavior` test style.
- `spreadFire` takes an injectable `roll` so tests force deterministic spread outcomes (e.g.
  `() => 0` always ignites, `() => 1` never) without depending on a specific seed.

## Observability/debugging
- Fire state is inspectable via `World.getBlockState` (`age`) and `BlockState.debugString()`
  (`minecraft:fire[age=n]`).
- `ignite`/`spreadFire` return values distinguish placement/no-op and ignition counts.

## Affected files/symbols
- `src/world/BlockRegistry.ts` (`BlockId.Fire`, `FIRE_SCHEMA`, fire definition).
- `src/simulation/BlockBehavior.ts` (`BlockBehaviorContext.seed?`).
- `src/simulation/FireBehavior.ts` (new module).
- `src/engine/Game.ts` (import/register fire behavior; pass `seed` in random-tick context).
- Tests: `tests/unit/FireBehavior.test.ts` (new), `tests/unit/BlockItemSeparation.test.ts`,
  `tests/unit/BlockStateRegistry.test.ts`.

## Rejected alternatives
- **Scheduled-tick burn timers via `ScheduledTickQueue`**: rejected — the queue is not wired into
  the `Game` loop; integrating dispatch + lifecycle + persistence is broader scope. The already-wired
  random-tick dispatch with the deterministic `age` counter is the burn timer.
- **Per-block burn timer separate from the fire's age**: rejected — the scope's "fire's age reaching
  MAX on the flammable block's own fire" is the single, simpler, testable rule.
- **Adding a Flint & Steel item**: rejected — no such item exists; the pure `ignite` API is the
  testable seam and a tool item is deferred to a later content change.
- **Random spread without a cap**: rejected — `MAX_SPREAD_PER_TICK` and `SPREAD_PROBABILITY` bound
  growth and keep the simulation deterministic and cheap.

## Downstream dependencies
- Later changes can call `ignite` (e.g. a Flint & Steel item, TNT, lava) without interface change.
- Fire's block, behavior registration, and state overlay are the seam for future burn/damage, light
  emission, particles, and nether-portal ignition, all deferred.
