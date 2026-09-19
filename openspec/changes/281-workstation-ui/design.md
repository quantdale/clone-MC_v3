# Design: 281-workstation-ui

## Context/current state

`FurnaceBlockEntity` owns the validated three-slot `FurnaceState`, immutable
menu transactions, serialization, timer engine, and fractional XP. `FurnaceRecipes`
builds a real processing/fuel context. `LiveBlockEntityHost` currently owns
one runtime instance per coordinate for furnaces and brewing stands, hydrates
the shared `block-entities` envelope, ticks only simulating chunks, and writes
full chunk snapshots after observable changes.

`Game` has one furnace panel/session (`furnaceOpen`, `furnacePos`) and the
interaction path treats a furnace as a container before placement. The panel
already has safe extraction-only output and atomic inventory write-back. The
block/item registries have stable ids through bed/shield, while the block
entity type registry already contains a tickable `smoker` definition. The
procedural atlas has unused capacity after the existing 260/274 additions.

## Target state

The smoker is a first-class placeable block at stable ids 64/72. Its runtime
instance has `typeKey: "smoker"` and the exact furnace payload shape. The host
can place/read/write/tick/hydrate/remove it independently from a furnace while
sharing all state validation and menu rules. The smoker context delegates fuel,
result, and XP to the furnace context and changes only cook duration:

```ts
createSmokerContext(furnace): FurnaceContext // cookTicks = ceil(furnace / 2)
```

`Game.openSmoker` opens the existing furnace panel with station kind `smoker`.
The panel title, dialog label, close label, and inventory-section heading say
`Smoker`; all slot ids and transactions remain the furnace-compatible 39-slot
contract. Existing furnace sessions keep saying `Furnace`.

## Invariants

- `FurnaceState` validation and `FurnacePanel` transaction atomicity remain the
  only menu/state authorities; smoker code cannot create a second slot schema.
- Exactly one host instance may occupy a coordinate, regardless of whether the
  row is furnace or smoker; hydration and placement dedupe through the manager.
- A smoker changes only cooking duration. Fuel values, burn timers, result item,
  output merge, XP accumulation, pause-on-blocked-output, and chunk simulation
  rules remain the furnace engine's rules.
- A smoker persistence row is removed when its block is stale or broken; break
  returns all occupied slots and floored XP through existing drop/XP paths.
- UI state is transient. No smoker-specific save key, archive field, or schema
  migration is introduced.
- No villager/POI/raid code is called by smoker placement or use.

## API and data model

New constants and adapter:

```ts
const SMOKER_BLOCK_ID = 64;
const SMOKER_ITEM_ID = 72;
const SMOKER_TYPE_KEY = 'smoker';
createSmokerBlockEntity(x, y, z, state?): BlockEntityInstance;
readSmokerState(instance): FurnaceState;
updateSmokerState(instance, state): BlockEntityInstance;
createSmokerContext(furnace: FurnaceContext): FurnaceContext;
```

Host additions are `placeSmoker`, `removeSmoker`, `hasSmoker`,
`getSmokerState`, `applySmokerMenuSlots`, `takeSmokerExperience`, and
`tickSmokers`. Hydration accepts both `furnace` and `smoker`; unknown types
remain ignored, and malformed known rows are quarantined using the existing
warning/degraded-save path.

The shared panel gains an optional station-name setter. Game stores one
`furnaceStation: 'furnace' | 'smoker'` alongside the existing open/position
fields and selects the corresponding host method at the panel boundary.

## Control/data flow

1. Registry resolution maps the smoker item to the smoker block on placement.
2. `PlayerInteraction` recognizes a targeted smoker as `use`; Game creates or
   reads its host instance and opens the shared panel.
3. Panel transactions derive a furnace-compatible menu, validate it, write the
   smoker's three slots atomically, and return cursor/inventory changes exactly
   as the furnace path does.
4. Each fixed tick calls `tickSmokers`; only simulating chunks advance, and the
   wrapper makes a 200-tick base recipe complete in 100 smoker ticks.
5. Host changes persist through the existing chunk snapshot. Hydration restores
   `smoker` rows before the first active tick.
6. Closing, walking away, focus/dispose, stale removal, and breaking settle the
   shared cursor and drain/drop state according to the existing furnace rules.

## Detailed behavior

The smoker context returns 0 for an unknown/non-smeltable item. For a positive
finite base cook duration it returns `Math.max(1, Math.ceil(base / 2))`.
Consequently an odd duration is deterministic and never rounds to zero. The
wrapper delegates `fuelBurnTicks`, `resultOf`, and `experienceOf` without
alteration.

Smoker block identity is checked at every live host operation. A smoker record
whose world block is furnace, air, or another block is removed on the first
simulating tick and an empty chunk snapshot is written. A block entity payload
that fails validation is quarantined and never ticked. A second placement at an
occupied coordinate returns false.

On break, the open session is closed first. The state is removed exactly once,
all input/fuel/output stacks are sent through the same item/drop conversion,
and the integer XP floor is spawned as XP orbs. The generic block loot path
also drops the smoker item once; the block-entity removal does not create a
second block item.

## Failure modes

- Missing/unknown smoker registry references fail construction through existing
  registry validation.
- Missing optional title elements in old panel fixtures do not fail the panel;
  station behavior still functions.
- Missing host record or wrong station type makes reads/writes/open no-ops;
  no inventory transaction is committed against a foreign entity.
- Malformed smoker envelopes/payloads are quarantined, set the existing degraded
  save status, and do not crash boot.
- A persistence sink failure follows the existing save facade behavior; runtime
  state remains authoritative and no fake success is recorded by 281.

## Compatibility/migration

The existing furnace schema version and `SerializedBlockEntity` envelope are
used unchanged. `smoker` is already present in the block-entity type registry,
so no registry migration is required. Existing worlds simply have no smoker
rows until a player places one. Furnace records and furnace UI behavior are
covered by the full regression suite.

## Performance/resource constraints

The host adds one bounded pass over the already resident block-entity manager
per fixed tick, like the existing furnace and brewing passes. No render worker,
world-generation, GPU, or per-frame allocation path is added. Panel DOM writes
remain signature-gated. The only new atlas work is one small procedural tile.

## Testing seams

- Smoker context tests cover zero/unknown, even, odd, and one-tick durations.
- Adapter tests cover type-key validation, lossless payload round-trip, and
  wrong-type rejection.
- Host integration covers speed, blocked output, non-simulating pause,
  hydrate/reload, stale cleanup, exact-once removal, XP, and dedupe.
- Registry/shape/panel tests cover stable ids, placement, collision/selection,
  title labels, and atomic transaction behavior.
- Browser E2E places a smoker, opens the real panel, verifies the label,
  inserts sand/coal, observes a completed cook faster than furnace timing,
  reloads the committed state, and breaks it without resurrection.

## Observability/debugging

The host `size`, station state readers, session position, panel visibility,
persisted chunk snapshots, and existing save-degraded banner remain the test
surfaces. E2E uses only inventory setup and read-only state observations beyond
real pointer/input/menu actions.

## Affected files/symbols

- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts`,
  `src/rendering/TextureAtlas.ts`, `src/world/VoxelShape.ts`.
- `src/world/SmokerBlockEntity.ts`, `src/inventory/SmokerRecipes.ts`.
- `src/engine/LiveBlockEntityHost.ts`, `src/engine/Game.ts`,
  `src/player/PlayerInteraction.ts`, `src/ui/FurnacePanel.ts`, `index.html`,
  `src/styles.css`.
- Focused unit tests and `tests/e2e/smoker.spec.ts`; control-plane and audit
  artifacts for Change 281.

## Rejected alternatives

- A second `SmokerPanel` was rejected because it would duplicate the already
  certified 39-slot transaction and cursor logic.
- Encoding `station: "smoker"` into the payload was rejected because the
  existing `typeKey` envelope already identifies the entity and a new field
  would create needless migration burden.
- Reusing `typeKey: "furnace"` was rejected because stale/block identity checks
  and persistence would be unable to distinguish a replaced block safely.
- Adding villager workstation claims was rejected as it belongs to a later
  live-villager/raid change and was explicitly out of 278.

## Downstream dependencies

Future blast-furnace or additional workstation changes may reuse the same
adapter/panel pattern, but must add their own type/block identity and speed
contracts. Future villager/raid work must not infer POI claims from this
player-placed smoker.
