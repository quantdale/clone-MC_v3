# Design: 166-hopper-transfer

## Context/current state
- 106's `MenuTransaction.ts` already defines `MenuSlot` (`item`/`count`/`maxStack`) as the shared
  container-slot shape, reused directly by 107's `ChestBlockEntity`. A hopper transfer is not a
  player click transaction (106's `MenuTransaction` union models leftClick/rightClick/placeOne/
  quickMove, all player-driven) — it is an automatic, one-item-at-a-time move between two
  containers on a timer, so this change adds its own `transferOneItem` rather than routing through
  106's transaction types, while still reusing `MenuSlot` as the data shape both operate on.
- 162 established the "active exactly when powered" consumer rule for lamp/door/trapdoor. A
  hopper's lockout is the mirror image: it transfers exactly when **un**powered. This is the second
  inverting rule in the redstone section after 158's torch (there the inversion flips which signal
  strength is emitted; here it flips whether an action is permitted at all) — worth flagging
  explicitly since it is the opposite of the immediately-preceding pattern a reader might expect.
- A hopper's intake is always the block directly above it, regardless of `facing` — only its output
  side is configurable. `facing` therefore excludes `'up'` entirely (a hopper's own top face is
  reserved for intake, never output), making `HopperFacing` a five-value subset of 154's `Direction`
  rather than the full six.

## Target state
- `src/simulation/HopperTransfer.ts` holding the transfer core, the lockout rule, intake/output
  position derivation, the 047 scheduling bridge, and the state projection; a `hopper` block (10
  states) and its placing item.

## Invariants
- `transferOneItem` moves at most one item unit per call, taken from the first slot in `source`
  (in array order) with `item !== null && count > 0`. If no such slot exists, `moved` is `false` and
  both returned arrays are otherwise-identical fresh copies of the inputs.
- The destination slot is chosen by: first, the first `destination` slot with the same `item` and
  `count < maxStack` (merge); failing that, the first `destination` slot with `item === null`
  (empty). If neither exists, `moved` is `false` and both returned arrays are fresh copies of the
  inputs, with **no** source depletion (a failed transfer never removes the item from its source).
- `hopperShouldTransfer(powered)` is exactly `!powered` — the inverse of 162's `lampShouldBeLit`/
  `doorShouldBeOpen`/`trapdoorShouldBeOpen` shape.
- `hopperIntakePosition(x, y, z)` always equals `offsetInDirection(x, y, z, 'up')`, independent of
  `facing`. `hopperOutputPosition(x, y, z, facing)` equals `offsetInDirection(x, y, z, facing)`.
- `scheduleHopperTransfer`/`dueHopperTransfers` behave identically to every prior 047 bridge in this
  section.

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
export const HOPPER_SCHEMA = new BlockPropertySchema([
  { kind: 'named', name: 'facing', values: ['down', 'north', 'south', 'east', 'west'] },
  { kind: 'boolean', name: 'enabled' },
]);
// BlockId.Hopper = 50; ItemId.Hopper = 50

// src/simulation/HopperTransfer.ts (new)
export type HopperFacing = 'down' | 'north' | 'south' | 'east' | 'west';

export const HOPPER_TRANSFER_COOLDOWN_TICKS = 8;

export interface HopperTransferResult {
  readonly moved: boolean;
  readonly source: MenuSlot[];
  readonly destination: MenuSlot[];
}

export function transferOneItem(
  source: readonly MenuSlot[],
  destination: readonly MenuSlot[],
): HopperTransferResult;

export function hopperShouldTransfer(powered: boolean): boolean;

export function hopperIntakePosition(x: number, y: number, z: number): [number, number, number];
export function hopperOutputPosition(
  x: number, y: number, z: number, facing: HopperFacing,
): [number, number, number];

export function scheduleHopperTransfer(
  queue: ScheduledTickQueue, x: number, y: number, z: number, currentTick: number,
): void;
export function dueHopperTransfers(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[];

export function hopperStateProperties(
  facing: HopperFacing, enabled: boolean,
): Record<string, boolean | string>;
```

## Control/data flow
1. A future wiring change samples `powered` and, when `hopperShouldTransfer(powered)` is `true` and
   the hopper's scheduled cooldown (`dueHopperTransfers`) is due, reads the source container's slots
   (from `hopperIntakePosition`) and the destination container's slots (from
   `hopperOutputPosition(facing)`).
2. It calls `transferOneItem(sourceSlots, destinationSlots)`. If `moved` is `true`, it writes the
   returned `source`/`destination` arrays back to their respective containers and reschedules via
   `scheduleHopperTransfer` for the next cooldown window.
3. It updates the hopper's own `enabled` state via `hopperStateProperties(facing,
   hopperShouldTransfer(powered))`.

## Detailed behavior
- `transferOneItem` never removes an item from `source` without a place to put it: the source slot
  is only decremented once a valid destination slot has been chosen. A failed transfer (no source
  item, or no room at the destination) is a true no-op on both sides, with `moved: false` making
  that explicit to the caller.
- The destination search prefers merging into an existing same-item stack over using an empty slot,
  matching vanilla's own item-conservation behavior (spreading a stack across fewer slots rather
  than fragmenting it across more than necessary).
- `hopperShouldTransfer`'s inversion is deliberate and total: `!powered`, nothing more nuanced. Any
  additional real-vanilla nuance (a hopper immediately re-attempting on a shorter cooldown after a
  successful transfer vs. a longer one after failing to move anything) is left to a future wiring
  change, since it requires tracking per-hopper history only a real caller with the live world has
  reason to own.
- `HopperFacing` excludes `'up'` because a hopper's intake is fixed to its top face; modeling `'up'`
  as a legal output facing would contradict that fixed intake and is not how vanilla's own
  blockstate is shaped.
- `enabled` (not `powered`) is the property name, matching vanilla's own hopper blockstate exactly —
  the same "name the state for what it *is*" reasoning 158 used for the torch's `lit`.

## Failure modes
- `transferOneItem` never throws for well-formed `MenuSlot` arrays; a failed transfer is
  represented by `moved: false`, not an exception.
- 007 throws at construction if the default state is missing — a test asserts the exact 10-state
  enumeration and the `{facing: 'down', enabled: true}` default (vanilla's hopper defaults to
  enabled, since a freshly-placed hopper is normally unpowered).

## Compatibility/migration
- One additive block id and one additive item id; one new simulation file; the four documented
  characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- `transferOneItem` is O(`source.length + destination.length`) — one linear scan of each. 10 new
  block states.

## Testing seams
- The whole module is tested with plain `MenuSlot` object literals and a real 047 queue — no
  `World`/block-entity of any kind.
- Registration is tested against the real block/item/state registries.

## Observability/debugging
- `HopperTransferResult.moved` makes a no-op transfer explicit rather than requiring the caller to
  diff the before/after slot arrays themselves.
- `hopperStateProperties` is the standard stateful-block record.

## Affected files/symbols
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts` (edits).
- `src/simulation/HopperTransfer.ts` (new).
- Tests: `tests/unit/HopperTransfer.test.ts` (new) + the four characterization updates.

## Rejected alternatives
- **Routing hopper transfers through 106's `applyMenuTransaction`**: rejected — 106's transaction
  union models player clicks (leftClick/rightClick/placeOne/quickMove); a hopper's automatic
  one-item move on a timer has no click semantics to reuse, and forcing it through that API would
  require synthesizing a fake click sequence for no benefit over a small dedicated function.
- **Modeling `'up'` as a legal `HopperFacing`**: rejected — see Detailed behavior; a hopper's intake
  is always fixed above it, so an "up-facing" hopper is not a concept vanilla itself models.
- **Naming the lockout property `powered` instead of `enabled`**: rejected — vanilla's own
  blockstate uses `enabled`; matching it directly avoids a confusing double-negative
  (`powered: false` meaning "can transfer" reads worse than `enabled: true` meaning the same thing).

## Downstream dependencies
- A future wiring change drives sampling/scheduling from real block entities and 154's power model,
  and supplies real container slot arrays to `transferOneItem`.
- A future container-signal bridge for 160's comparator `sideInput` (reading a hopper's own
  fullness) is a plausible consumer of this module's `MenuSlot` shape, not built here.
- 167 (`dropper`) is the next change in this "item-moving redstone consumer" family.
