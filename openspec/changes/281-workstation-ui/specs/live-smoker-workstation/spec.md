# Spec: live-smoker-workstation

## Contract

This capability adds one player-placed smoker workstation to the live game.
It is an additive composition over the furnace state/menu/persistence
authorities. It MUST preserve the existing furnace contract and MUST NOT
introduce villager POI behavior or a new save namespace.

## Definitions

- `smoker`: block id 64, item id 72, block-entity type key `smoker`.
- `base cook duration`: the positive tick count returned by the injected
  furnace context for an input item.
- `smoker cook duration`: `max(1, ceil(base cook duration / 2))`.
- `smoker session`: the shared furnace panel while its station kind is
  `smoker`.

## Invariants

- A smoker payload has the same validated fields as `FurnaceState` and is
  serialized through the existing `block-entities` envelope.
- Smoker processing delegates fuel, result, and XP semantics to the furnace
  context; only cook duration differs.
- One coordinate has at most one runtime block entity. Placement, hydration,
  removal, and menu writes are atomic with respect to that identity.
- Fixed-tick simulation and persistence are authoritative even when the panel
  is closed; a non-simulating chunk never advances.
- The smoker UI shares the furnace menu slot ids/transaction policy but exposes
  the active station as `Smoker`.

## Requirements

### Requirement: Stable smoker registry identity

The block and item registries MUST register smoker block id 64 and item id 72,
with matching `minecraft:smoker` resource/key references. The item MUST place
the smoker block, the block MUST drop the smoker item through the existing loot
path, and the default shape table MUST give it the same inset full-height
container shape as a furnace.

#### Scenario: Registry and placement references agree

- **GIVEN** the default block and item registries
- **WHEN** the smoker definitions are resolved by id, key, and resource id
- **THEN** block 64 is `smoker`, item 72 is `smoker`, and the item `placeBlock`
  resolves to that block
- **AND** the smoker definition is solid, opaque, breakable, and pickaxe-
  harvestable with a smoker drop

### Requirement: Deterministic twice-fast cooking context

`createSmokerContext` MUST delegate fuel burn ticks, recipe results, and recipe
experience unchanged. For a positive base duration it MUST return
`max(1, ceil(base / 2))`; unknown/non-smeltable inputs MUST remain unsmeltable.

#### Scenario: Even and odd recipe durations

- **GIVEN** a furnace context that reports 200 ticks for sand and 3 ticks for
  a test input
- **WHEN** the smoker context queries those inputs
- **THEN** it reports 100 and 2 ticks respectively
- **AND** it returns 0 for an unknown input without changing result/fuel/XP
  lookups

### Requirement: Type-safe smoker block-entity adapter

The smoker adapter MUST create, validate, serialize, deserialize, and update
the exact `FurnaceState` payload under `typeKey: "smoker"`. It MUST reject a
foreign type key and MUST preserve timers, slots, and fractional XP losslessly.

#### Scenario: Round trip and foreign record rejection

- **GIVEN** a valid state with occupied slots, active timers, and fractional XP
- **WHEN** it is created as a smoker entity, read, serialized, and read again
- **THEN** the state is field-for-field equal
- **AND** attempting to read a `furnace` entity through the smoker reader throws
  without mutating the entity

### Requirement: Authoritative host lifecycle

`LiveBlockEntityHost` MUST own smoker placement, reads, atomic menu writes,
fixed-tick advancement, hydration, XP draining, and removal. It MUST tick
smokers only when their chunk is simulating, persist changed snapshots through
the existing sink, quarantine malformed known rows, remove stale rows on a
simulating tick, and reject duplicate coordinates.

#### Scenario: Smoker processes outside the UI

- **GIVEN** a placed smoker with one sand and one valid fuel
- **WHEN** the host advances exactly 100 simulating ticks with the panel closed
- **THEN** one glass is produced using the smoker context
- **AND** the input/fuel counts, burn timers, and XP match the shared furnace
  engine for one completed cook

#### Scenario: Non-simulating and stale behavior

- **GIVEN** a smoker in a non-simulating chunk
- **WHEN** several host ticks run
- **THEN** its state and persistence snapshot do not advance
- **AND GIVEN** the world block is replaced with air before a simulating tick
- **WHEN** one smoker tick runs
- **THEN** the runtime is removed exactly once and an empty chunk snapshot is
  persisted

### Requirement: Live placement, opening, and station-labelled menu

The interaction/Game path MUST instantiate a smoker after committed placement,
open the shared furnace panel on smoker use, and expose `Smoker` in the title,
dialog/accessibility label, close label, and workstation section label. A smoker
use MUST not place or consume the held item, and only one container session may
be open at a time.

#### Scenario: Place and open smoker

- **GIVEN** the player holds a smoker item and targets an air cell
- **WHEN** a real place action commits, then the player uses that block
- **THEN** the world contains block 64 and the host has one smoker entity
- **AND** the shared panel is visible with title/labels containing `Smoker`
- **AND** the held non-smoker stack is unchanged by use

### Requirement: Atomic menu, live progress, and lifecycle safety

The smoker session MUST use the furnace panel's validated 39-slot transactions,
extraction-only output, cursor settlement, live progress rendering, and
one-container close/walk-away/focus/dispose behavior. A vanished smoker MUST
cause a failed write rather than a partial inventory mutation.

#### Scenario: Menu transaction and close

- **GIVEN** an open smoker and player inventory containing sand and coal
- **WHEN** both stacks are quick-moved into the panel and the output is later
  extracted
- **THEN** the authoritative smoker slots reflect each atomic transaction and
  the output slot cannot be inserted into
- **AND** closing returns any cursor stack and leaves the live timers intact
- **AND** opening crafting or another container closes/settles the smoker first

### Requirement: Persistence, break, and no duplication

Smoker rows MUST survive the existing save/reload boundary with all state
fields unchanged. Breaking a smoker MUST close its session first, remove its
row exactly once, return/drop every occupied input/fuel/output stack, spawn
only the floored XP, and never resurrect the row after reload.

#### Scenario: Reload and break cleanup

- **GIVEN** a smoker with mid-cook timers saved through the existing persistence
  facade
- **WHEN** a new host hydrates the committed chunk and then the smoker is broken
- **THEN** the restored state is field-for-field equal before further ticks
- **AND** the break produces the smoker block drop plus all contained stacks and
  floored XP exactly once
- **AND** a later reload contains no smoker row at that coordinate

### Requirement: Scope and compatibility guard

The implementation MUST NOT add a smoker-specific persistence namespace, mutate
villager/POI/raid systems, add GPU/headed-FPS work, or change Change 258's
BLOCKED status. Existing furnace/brewing/death/shield/trading journeys MUST
remain green.

#### Scenario: Existing save and feature isolation

- **GIVEN** an existing world containing furnace and brewing rows but no smoker
- **WHEN** it is opened, saved, archived, and restored through the normal path
- **THEN** existing rows remain valid and no `__smoker__`/parallel store is
  created
- **AND** no villager assignment or raid state changes as a side effect of
  smoker placement

## Error and failure behavior

Malformed smoker envelopes or payloads MUST follow the existing block-entity
quarantine/degraded-save path and MUST NOT crash boot or tick invalid data.
Unknown station coordinates, stale identity, failed persistence, and missing
optional panel title elements MUST fail closed without deleting unrelated
inventory or state. Repeated removal, close, or hydration of an occupied
coordinate MUST be idempotent.

## Performance and resource bounds

Smoker ticking MUST be one bounded resident-manager pass per fixed tick with no
render/worldgen/worker/GPU changes. Panel writes MUST remain signature-gated;
no per-frame DOM churn or unbounded queue may be introduced. The new procedural
tile MUST fit the existing atlas dimensions.

## Compatibility and migration

The existing block-entity schema version, chunk snapshot store, archive format,
player inventory snapshot, and furnace rows are unchanged. Smoker records are
additive `typeKey: "smoker"` rows in the already supported block-entity array.

## Security and integrity

The host MUST validate type keys and state payloads before use, reject duplicate
coordinates, and never convert an unknown menu resource id into an inventory
item. Smoker UI writes MUST commit slots atomically after the existing menu
validator succeeds; raw DOM text or item ids MUST NOT bypass registry checks.

## Observability

The existing host size/state/session accessors and persistence snapshots MUST
show smoker state for tests. The active panel's DOM ids and text MUST be stable
enough for accessibility and browser assertions. Existing degraded-save status
remains the only corruption banner.

## Verification mapping

| Requirement | Primary evidence |
|---|---|
| Stable identity | `BlockRegistry`, `ItemRegistry`, `VoxelShape`, loot and registry unit tests |
| Twice-fast context | `SmokerRecipes` unit tests |
| Adapter | `SmokerBlockEntity` unit tests |
| Host lifecycle | `LiveSmokerIntegration` unit tests |
| Live menu/lifecycle | `FurnacePanel`/Game-focused tests and `tests/e2e/smoker.spec.ts` |
| Persistence/break | host integration plus exact browser reload/break journey |
| Isolation/regression | full unit, build, full E2E, file-audit, state validation, C281 row |
