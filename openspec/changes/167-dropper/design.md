# Design: 167-dropper

## Context/current state
- 166's `HopperTransfer.ts` already provides `transferOneItem(source, destination)` over 106's
  `MenuSlot` shape, and 162 established the inverse-of-its-consumer `!powered` lockout (166's
  `hopperShouldTransfer`). A dropper is the same lockout and the same five-way `facing` × boolean
  `enabled` blockstate, but its *ejection target* differs: a hopper only ever moves between two
  containers, whereas a dropper, when it faces no container, drops the item into the world.
- This change is the first place 166's model meets a real *container write-back* (`transferOneItem`
  is called with a destination the caller supplies) **and** the first place a *world drop* is modeled.

## Target state
- `src/simulation/DropperEject.ts` holding the ejection core (container push via 166's
  `transferOneItem`, or a world-drop descriptor when facing no container), the lockout, the output
  position, the 047 scheduling bridge, and the state projection; a `dropper` block (10 states) and
  its placing item.

## Invariants
- `ejectFromDropper` ejects at most one item unit, taken from the first `source` slot (in array
  order) with `item !== null && count > 0`.
- When `destinationContainer` is a `MenuSlot[]`, ejection reuses `transferOneItem` exactly (merge-
  first, then first-empty); if that returns `moved: false` (container full / no room), the dropper
  does **not** spill — `kind` is `'none'` and `source` is left unchanged.
- When `destinationContainer` is `null`, ejection produces a `DroppedItem` at `dropPosition` and
  decrements `source` by exactly one (clearing the slot when it reaches zero).
- `dropperShouldTransfer(powered)` is exactly `!powered`.
- `dropperOutputPosition(x, y, z, facing)` equals `offsetInDirection(x, y, z, facing)` for each of
  the five `DropperFacing` values. `ejectFromDropper` itself is position-agnostic (it takes an
  explicit `dropPosition`), matching 166's `transferOneItem` never touching coordinates.

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
export const DROPPER_SCHEMA = new BlockPropertySchema([
  { kind: 'named', name: 'facing', values: ['down', 'north', 'south', 'east', 'west'] },
  { kind: 'boolean', name: 'enabled' },
]);
// BlockId.Dropper = 51; ItemId.Dropper = 51

// src/simulation/DropperEject.ts (new)
export type DropperFacing = 'down' | 'north' | 'south' | 'east' | 'west';

export const DROPPER_EJECT_COOLDOWN_TICKS = 8;

export interface DroppedItem {
  readonly item: string;
  readonly count: number;
  readonly position: readonly [number, number, number];
}

export type DropperEjectResult =
  | { kind: 'container'; moved: true; source: MenuSlot[]; destination: MenuSlot[] }
  | { kind: 'drop'; moved: true; source: MenuSlot[]; drop: DroppedItem }
  | { kind: 'none'; moved: false; source: MenuSlot[] };

export function ejectFromDropper(
  source: readonly MenuSlot[],
  destinationContainer: readonly MenuSlot[] | null,
  dropPosition: readonly [number, number, number],
): DropperEjectResult;

export function dropperShouldTransfer(powered: boolean): boolean;
export function dropperOutputPosition(
  x: number, y: number, z: number, facing: DropperFacing,
): [number, number, number];
export function scheduleDropperEject(
  queue: ScheduledTickQueue, x: number, y: number, z: number, currentTick: number,
): void;
export function dueDropperEjects(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[];
export function dropperStateProperties(
  facing: DropperFacing, enabled: boolean,
): Record<string, boolean | string>;
```

## Control/data flow
1. A future wiring change samples `powered`; when `dropperShouldTransfer(powered)` is `true` and the
   dropper's scheduled cooldown (`dueDropperEjects`) is due, it reads the dropper's own slot array
   (`source`) and probes the block in `dropperOutputPosition(facing)`.
2. If that block is a container, it calls `ejectFromDropper(source, containerSlots, _)`; on
   `kind: 'container'` it writes `result.destination` back to the container and `result.source` back
   to the dropper, then reschedules.
3. If that block is not a container, it calls `ejectFromDropper(source, null, dropPosition)`; on
   `kind: 'drop'` it writes `result.source` back to the dropper and spawns a real 111-style item
   entity at `result.drop.position` (the spawn is future work, not this change).
4. It updates `enabled` via `dropperStateProperties(facing, dropperShouldTransfer(powered))`.

## Detailed behavior
- The container push path is literally 166's `transferOneItem`, so dropper→container behavior is
  identical to hopper→container behavior (merge-first, no partial depletion on failure). The only
  behavioral delta versus 166 is the `null`-destination branch producing a `DroppedItem`.
- A full container yields `kind: 'none'`, never `'drop'`. This matches vanilla (a dropper facing a
  full container simply does nothing) and is the single most error-prone invariant, hence a dedicated
  test.
- `DroppedItem.count` is always `1`: a dropper ejects exactly one item unit per activation.
- `DropperFacing` excludes `'up'` for the same reason 166's `HopperFacing` does — a dropper's output
  is its faced side, never its own top.

## Failure modes
- `ejectFromDropper` never throws for well-formed `MenuSlot` arrays; every non-ejection outcome is
  represented by `kind: 'none'` with `moved: false`, not an exception.
- 007 throws at construction if the default state is missing — a test asserts the exact 10-state
  enumeration and the `{facing: 'down', enabled: true}` default.

## Compatibility/migration
- One additive block id and one additive item id; one new simulation file reusing 166's
  `transferOneItem`; the three documented characterization-test updates. No `Game.ts` edit; no
  schema/save-format change.

## Performance/resource constraints
- `ejectFromDropper` is O(`source.length + destination.length`) (one `transferOneItem` call, itself
  that bound); 10 new block states.

## Testing seams
- The whole module is tested with plain `MenuSlot` literals, an explicit `dropPosition`, and a real
  047 queue — no `World`/block-entity of any kind. Registration is tested against the real
  block/item/state registries.

## Observability/debugging
- `DropperEjectResult.kind` (`'container'` / `'drop'`□ / `'none'`) makes the three ejection outcomes
  explicit to the caller without diffing slot arrays.

## Affected files/symbols
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts` (edits).
- `src/simulation/DropperEject.ts` (new).
- Tests: `tests/unit/DropperEject.test.ts` (new) + the three characterization updates.

## Rejected alternatives
- **Spilling into the world when facing a full container**: rejected — vanilla does not do this; a
  dropper facing a full container is a no-op. Modeling it as a `drop` would be a behavior bug, not a
  simplification.
- **Modeling the world drop as an actual spawned entity inside this module**: rejected — it would
  force a `World`/entity dependency into a pure simulation function, breaking the section's
  "caller samples, this module computes" discipline; a `DroppedItem` descriptor carries the same
  decision and lets a wiring change do the spawn.
- **Routing dropper ejection through 106's `applyMenuTransaction`**: rejected for the same reason as
  166 — no click semantics to reuse.

## Downstream dependencies
- A future wiring change drives sampling/scheduling from real block entities and 154's power model,
  supplies real container slot arrays, and turns `DroppedItem` into a live 111-style entity.
- 168 (`dispenser`) is the next change in this "item-moving redstone consumer" family.
