# Design: 168-dispenser

## Context/current state
- 166's `HopperTransfer.ts` provides `transferOneItem` over 106's `MenuSlot`; 167's
  `DropperEject.ts` provides `ejectFromDropper` (container push via `transferOneItem`, or a world
  `DroppedItem` when facing no container) and the inverse-of-162 `!powered` lockout. A dispenser is
  the third member of this family and the first whose behavior *depends on which item* it holds.
- A dispenser with an ordinary item is behaviorally identical to a dropper. A dispenser with a special
  item (arrow, egg, snowball, fire charge, flint & steel, …) instead *performs an action* — the
  distinguishing, data-driven part.

## Target state
- `src/simulation/DispenserBehavior.ts` holding the data-driven behavior table, the dispense core
  (special-item `behavior` vs. plain-item delegation to 167's `ejectFromDropper`), the lockout, the
  output position, the 047 scheduling bridge, and the state projection; a `dispenser` block (10 states)
  and its placing item.

## Invariants
- `dispenseFromDispenser` consumes at most one item unit, taken from the first `source` slot (in array
  order) with `item !== null && count > 0`.
- For a **special** item (present in `DISPENSER_ITEM_BEHAVIORS`), the result is `kind: 'behavior'` with
  the matched `DispenserItemBehavior`; the source slot count is decremented by one (cleared at zero).
  The destination container / drop position are irrelevant to the action decision.
- For a **plain** item, `dispenseFromDropper` is delegated to 167's `ejectFromDropper` — identical
  container-push (merge-first, then first-empty), world-drop, and `none`-on-empty/full-container
  semantics. A full container yields `kind: 'none'` (no spill), never a `behavior`.
- `dispenserShouldTransfer(powered)` is exactly `!powered`.
- `dispenserOutputPosition(x, y, z, facing)` equals `offsetInDirection(x, y, z, facing)` for each of
  the five `DispenserFacing` values. `dispenseFromDispenser` is position-agnostic (explicit
  `dropPosition`).

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
export const DISPENSER_SCHEMA = new BlockPropertySchema([
  { kind: 'named', name: 'facing', values: ['down', 'north', 'south', 'east', 'west'] },
  { kind: 'boolean', name: 'enabled' },
]);
// BlockId.Dispenser = 52; ItemId.Dispenser = 52

// src/simulation/DispenserBehavior.ts (new)
export type DispenserFacing = 'down' | 'north' | 'south' | 'east' | 'west';
export const DISPENSER_EJECT_COOLDOWN_TICKS = 8;

export type DispenserBehaviorKind = 'shoot_projectile' | 'spawn_entity' | 'place_block';
export interface DispenserItemBehavior {
  readonly item: string;
  readonly behavior: DispenserBehaviorKind;
  readonly projectile?: string;
  readonly entity?: string;
  readonly block?: string;
}
export const DISPENSER_ITEM_BEHAVIORS: readonly DispenserItemBehavior[]; // initial vanilla set
export function getDispenserBehavior(item: string | null): DispenserItemBehavior | null;

export type DispenserAction =
  | { kind: 'behavior'; behavior: DispenserItemBehavior; source: MenuSlot[] }
  | { kind: 'container'; moved: true; source: MenuSlot[]; destination: MenuSlot[] }
  | { kind: 'drop'; moved: true; source: MenuSlot[]; drop: DroppedItem }
  | { kind: 'none'; moved: false; source: MenuSlot[] };

export function dispenseFromDispenser(
  source: readonly MenuSlot[],
  destinationContainer: readonly MenuSlot[] | null,
  dropPosition: readonly [number, number, number],
): DispenserAction;

export function dispenserShouldTransfer(powered: boolean): boolean;
export function dispenserOutputPosition(
  x: number, y: number, z: number, facing: DispenserFacing,
): [number, number, number];
export function scheduleDispenserEject(
  queue: ScheduledTickQueue, x: number, y: number, z: number, currentTick: number,
): void;
export function dueDispenserEjects(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[];
export function dispenserStateProperties(
  facing: DispenserFacing, enabled: boolean,
): Record<string, boolean | string>;
```

## Control/data flow
1. A future wiring change samples `powered`; when `dispenserShouldTransfer(powered)` is `true` and the
   dispenser's scheduled cooldown (`dueDispenserEjects`) is due, it reads the dispenser's own slot
   array (`source`) and calls `dispenseFromDispenser(source, containerSlots | null, dropPosition)`.
2. On `kind: 'behavior'` it performs the action described by `result.behavior` (fires a projectile,
   spawns an entity, or places a block — all future work) and writes `result.source` back.
3. On `kind: 'container'` it writes `result.destination` back to the container and `result.source` back
   to the dispenser, then reschedules. On `kind: 'drop'` it writes `result.source` back and spawns a
   111-style item entity at `result.drop.position` (future work). `kind: 'none'` is a no-op.
4. It updates `enabled` via `dispenserStateProperties(facing, dispenserShouldTransfer(powered))`.

## Detailed behavior
- The plain-item path is literally 167's `ejectFromDropper`, so dispenser-with-plain-item behavior is
  byte-for-byte equivalent to a dropper (merge-first, no partial depletion on failure, full container =
  no spill). The only behavioral delta versus 167 is the special-item `behavior` branch.
- `DISPENSER_ITEM_BEHAVIORS` is the single source of truth: `dispenseFromDispenser` contains *no*
  item-name branches — it only calls `getDispenserBehavior`. Adding a new dispenser action is a table
  row (and, if needed, a new `DispenserBehaviorKind`).
- A special item consumes exactly one unit and returns `behavior` regardless of what is in front; the
  action direction/payload is carried by the `DispenserItemBehavior` descriptor.

## Failure modes
- `dispenseFromDispenser` never throws for well-formed `MenuSlot` arrays; every non-dispensing outcome
  is `kind: 'none'` with `moved: false`. `getDispenserBehavior(null)` returns `null` (plain fallback).
- 007 throws at construction if the default state is missing — a test asserts the exact 10-state
  enumeration and the `{facing: 'down', enabled: true}` default.

## Compatibility/migration
- One additive block id and one additive item id; one new simulation file reusing 167's
  `ejectFromDropper`; the three documented characterization-test updates. No `Game.ts` edit; no
  schema/save-format change.

## Performance/resource constraints
- `dispenseFromDispenser` is O(`source.length + destination.length`) plus one `getDispenserBehavior`
  table scan (small, fixed); 10 new block states.

## Testing seams
- The whole module is tested with plain `MenuSlot` literals, an explicit `dropPosition`, and a real
  047 queue — no `World`/block-entity of any kind. Registration is tested against the real
  block/item/state registries.

## Observability/debugging
- `DispenserAction.kind` (`'behavior'` / `'container'` / `'drop'` / `'none'`) makes the four outcomes
  explicit; `getDispenserBehavior` makes the data-driven mapping inspectable in tests.

## Affected files/symbols
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts` (edits).
- `src/simulation/DispenserBehavior.ts` (new).
- Tests: `tests/unit/DispenserBehavior.test.ts` (new) + the three characterization updates.

## Rejected alternatives
- **Hard-coded `if (item === 'arrow') … else if (item === 'egg') …` branches inside
  `dispenseFromDispenser`**: rejected — the change exists precisely to be *data-driven*; branches
  would make "add a dispenser action" a code edit instead of a table row and would not satisfy the
  change's narrow outcome.
- **Reusing the dropper's `none`/`container`/`drop` result for special items too**: rejected — a
  special item's outcome is a distinct action, and conflating it with `drop` would hide the behavior
  from the caller (a wiring change must know it is firing a projectile, not dropping an item).
- **Modeling the action as an actual spawned entity/projectile inside this module**: rejected — it
  would force `World`/entity dependencies into a pure simulation function; a `DispenserItemBehavior`
  descriptor carries the same decision and lets a wiring change do the spawn.
- **Routing dispenser ejection through 106's `applyMenuTransaction`**: rejected for the same reason as
  166/167 — no click semantics to reuse.

## Downstream dependencies
- A future wiring change drives sampling/scheduling from real block entities and 154's power model,
  supplies real container slot arrays, and turns `DispenserItemBehavior` into a live 142-style
  projectile / 130-style entity / placed block.
- 169 (`explosion-core`) is the next change (redstone/automation continues with destruction).
