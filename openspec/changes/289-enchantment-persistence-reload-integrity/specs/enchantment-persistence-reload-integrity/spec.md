# Spec: enchantment-persistence-reload-integrity

## Contract

Player inventory stack data components — especially `minecraft:enchantments`
written by live enchant apply — MUST survive the durable player-state save
path across `pagehide` and reload. Concurrent flush callers MUST NOT leave a
superseded snapshot as the last durable write for a save key.

## Definitions

- **Stack component**: a typed value in a stack's `StackComponentMap` from the
  default registry (`damage`, `enchantments`, `potion_contents`, `can_destroy`,
  `can_place_on`).
- **Player-state unit**: the DirtySaveQueue unit keyed
  `player-state|<worldId>` whose payload carries `inventory` (including
  `slotComponents`).
- **Superseded payload**: a unit whose per-key epoch is less than the latest
  epoch recorded by `markDirty` for that key.
- **Drain single-flight**: at most one `drain`/`drainReport` execution makes
  progress on the queue at a time.

## Invariants

- I1. Last durable write for a key MUST NOT be a superseded payload after all
  in-flight drains complete.
- I2. `Inventory.snapshot` then `restore` MUST preserve every default stack
  component present on non-empty hotbar and storage stacks.
- I3. A successful live enchant apply MUST mark the post-apply player snapshot
  dirty (and start a flush) before returning.
- I4. This change MUST NOT add a new persistence/archive namespace unless a
  missing namespace is proven required (not expected).
- I5. Change 258 MUST remain BLOCKED; this change MUST NOT perform headed
  GPU/FPS work or fabricate GPU evidence.

## Requirements

### Requirement: Concurrent drains preserve latest payload

`DirtySaveQueue` MUST serialize drain execution (single-flight) and MUST track
a monotonic per-key epoch on each `markDirty`. A drain MUST NOT call
`sink.write` with a superseded payload. After concurrent `drain` callers and
mid-write `markDirty` updates complete, the sink's last successful write for
that key MUST equal the latest marked payload.

#### Scenario: Two concurrent drains with mid-flight newer mark

- **GIVEN** a pending unit `v1` for key `k`
- **AND** two `drainReport` calls start concurrently
- **AND** while `v1` is in flight a `markDirty` refreshes key `k` to `v2`
- **WHEN** both drains settle
- **THEN** the sink's last written payload for `k` is `v2`
- **AND** `v1` is not left as the durable value after settlement

#### Scenario: Superseded unit is skipped

- **GIVEN** epoch N pending and epoch N+1 already marked for the same key
- **WHEN** a drain considers the epoch-N unit
- **THEN** it MUST NOT write epoch N
- **AND** epoch N+1 remains eligible to write

### Requirement: Inventory codec round-trips all default components

`Inventory.snapshot` / `restore` MUST round-trip hotbar `slotComponents` and
storage embedded `components` for every default registry component type:
`enchantments`, `damage`, `potion_contents`, `can_destroy`, `can_place_on`.
Malformed component payloads MUST continue to fail closed (`restore` → false,
state unchanged).

#### Scenario: Enchantments and damage round-trip

- **GIVEN** a hotbar pickaxe with enchantments and damage components
- **WHEN** snapshot then restore into a fresh inventory
- **THEN** both component values equal the pre-snapshot values

#### Scenario: Adventure and potion components round-trip

- **GIVEN** stacks carrying `can_destroy`, `can_place_on`, and
  `potion_contents`
- **WHEN** snapshot then restore
- **THEN** each component value is preserved on the restored stack

#### Scenario: Malformed component rejected

- **GIVEN** a snapshot with an unknown component id or invalid value
- **WHEN** restore is attempted
- **THEN** restore returns false and the inventory is unchanged

### Requirement: Enchant apply persists promptly

`Game.applyEnchantingOffer` MUST, on a successful apply that mutates the
selected stack, call the same durable player-state save path used on pagehide
(`savePlayerStateDurable`: enqueue latest snapshot and start flush). When
persistence is absent or recovery-required, the existing no-op rules MUST
apply. Apply MUST NOT require a storage-layer redesign.

#### Scenario: Successful apply marks player state dirty

- **GIVEN** an open valid enchanting session and a successful offer apply
- **WHEN** `applyEnchantingOffer` returns ok
- **THEN** the persistence facade has been asked to save the post-apply
  player snapshot (durable enqueue) before the method returns

### Requirement: Live reload integrity for enchantments

After a successful enchant apply, a real `pagehide` (or equivalent flush) then
reload MUST restore the same enchantment map on the held pickaxe. Browser E2E
MUST await a real persist signal (flush completion / pendingCount 0), MUST NOT
rely on an arbitrary sleep as the sole durability wait, and MUST prove a
materially lower failure rate under `--repeat-each` than the pre-fix baseline.

#### Scenario: Enchantments survive pagehide + reload

- **GIVEN** a player who applied an enchanting offer to a pickaxe
- **WHEN** pagehide flush completes and the page reloads
- **THEN** the selected pickaxe's `enchantments` component equals the
  pre-reload applied map
- **AND** the experience level equals the post-apply level

#### Scenario: Repeat-each failure rate improves

- **GIVEN** the pre-fix enchanting:227 failure rate from ≥20 repeats
- **WHEN** the same repeat count runs after the fix
- **THEN** enchanting:227 failures are 0 (or the residual is a different,
  documented cause — not the null-enchantments clobber)

### Requirement: Scope limits

The change MUST NOT redesign the storage architecture, MUST NOT add a new
persistence namespace unless proven necessary, MUST NOT change enchanting UI
offer generation rules, and MUST NOT perform Change 258 headed GPU/FPS work
or mark 258 VERIFIED.

#### Scenario: No new namespace without proof

- **GIVEN** inventory components already travel inside player-state
- **WHEN** this change ships
- **THEN** no new `__*__` metadata namespace is introduced for enchantments
