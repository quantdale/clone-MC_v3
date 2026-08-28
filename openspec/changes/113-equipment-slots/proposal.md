# Proposal: 113-equipment-slots

## Problem

The inventory (009/011) holds only hotbar and main-storage `ItemStack`s. There is
no representation of the player's worn equipment — helmet, chestplate, leggings,
boots, and offhand item — so parity features that depend on equipment state
(armor protection math in 116, offhand shield blocking in 144, the equipment HUD
in 205) have nowhere to read from or write to. The selected hotbar slot already
serves as the player's *mainhand*; only the four armor slots and the offhand need
new, durable state.

This change introduces a small, self-contained equipment model and integrates it
with the existing `Inventory` so it is constructed, queried, and saved/restored
together with the rest of the player's items. It is state + integration only: no
protection math, no shield logic, no HUD.

## Goals

- Add a `PlayerEquipment` model owning exactly five slots: `Head`, `Chest`,
  `Legs`, `Feet`, `Offhand`, each holding an `ItemStack | null` (null = empty) so
  armor durability and tool components survive equipping.
- Provide clean get/set/clear/swap and serialize/restore APIs with atomic,
  validating restore.
- Integrate equipment into `Inventory` as an `equipment` field so it is
  constructed automatically and round-trips through `Inventory.snapshot()` /
  `Inventory.restore()` with the existing browser-save envelope (no new envelope).
- Expose the four armor stacks in a fixed, documented order for the 116 protection
  math to consume; document that *mainhand* is the selected hotbar slot and is not
  a stored equipment slot.
- Cover the model and the integration with unit tests; keep the full regression
  gate green.

## Non-goals

- **Armor protection / attribute math** — 116. This change stores stacks; it does
  not reduce incoming damage or modify attributes.
- **Offhand shield blocking** — 144. The offhand slot accepts and stores any
  `ItemStack` but has no blocking behavior yet.
- **Equipment HUD / rendering** — 205. No DOM, icon, or durability bar for slots.
- **Strict armor-type validation (only helmets in Head, etc.)** — 116. The
  `ItemTypeDefinition` model has no slot/armor-type field, so 113 accepts any
  `ItemStack` in any slot; 116 may add placement rules. Restore still rejects
  unknown item ids via the injected `isValidItem` validator.
- **Mainhand as a stored slot** — the selected hotbar slot is the mainhand; 113
  does not duplicate it into equipment state.
- **Equip/unequip input bindings or swap-with-hotbar interaction** — consumed by
  later UI/interaction changes; 113 exposes the primitives only.

## Preconditions

- 112 VERIFIED; `Inventory` (`src/inventory/Inventory.ts`) exists with
  `ItemStack`, `InventorySnapshot`, `snapshot()`, and `restore(isValidItem,
  maxDurabilityForItem)` semantics.
- `Game` persists the inventory through `InventorySnapshot` (save at
  `Game.ts:755`, restore at `Game.ts:722`); equipment rides on that envelope.
- `StackDataComponents` provides `StackComponentMap` / `DAMAGE_COMPONENT` so armor
  and tool components are preserved verbatim across equip/serialize/restore.

## Dependencies

- 009 inventory stack model (`ItemStack`, `StackComponentMap`).
- 037 persistence envelope (unchanged; equipment serializes within it).
- 112 verified (baseline regression gate must stay green).

## Proposed change

1. `src/inventory/Equipment.ts` (NEW): `PlayerEquipment` class with the five slots,
   `getEquipment`, `setEquipment` (returns previous), `clear`,
   `getArmorStacks` (fixed order, non-null only), `serialize`, and
   `restore`/`validateSnapshot` (atomic, validating).
2. `src/inventory/Inventory.ts` (EDIT): add `readonly equipment: PlayerEquipment`
   (constructed in the ctor); add optional `equipment` to `InventorySnapshot`;
   include `this.equipment.serialize()` in `snapshot()`; validate and restore
   equipment inside `restore()` so a malformed equipment block rejects the whole
   restore atomically (matching the inventory block's own atomicity).
3. `tests/unit/Equipment.test.ts` (NEW): unit coverage of the model and the
   `Inventory` integration (construction, snapshot/restore round-trip, atomic
   rejection, mainhand delegation contract).

## Compatibility and migration

- `InventorySnapshot` gains an optional `equipment` field. Existing saves without
  it restore with empty equipment (backward compatible). New saves include it; the
  037 envelope and `GameSaveSnapshot` shape are unchanged.
- `EquipmentSnapshot` is a fresh, version-tagged (`version: 1`) payload inside the
  inventory snapshot; no registry/codec churn.
- No public/in-memory API beyond `Inventory.equipment` is added; callers that do
  not read it are unaffected.

## Risks

- **Atomicity of `Inventory.restore`**: if equipment validation were applied *after*
  inventory mutation, a bad equipment block could leave the inventory half-mutated.
  Mitigation: equipment is validated in the same early-return block as the rest of
  the snapshot, before any mutation, so a bad block rejects the whole restore.
- **Component preservation**: equipping a damaged tool must keep its damage
  component. Mitigation: `setEquipment`/`restore` copy the `components` reference
  verbatim (same immutable `StackComponentMap` the inventory uses).
- **Baseline regression**: adding a field to `Inventory` and an optional field to
  `InventorySnapshot` must not break existing snapshot tests. Mitigation: the field
  is optional and defaults to empty; existing tests are untouched.

## Rollback strategy

`PlayerEquipment` is additive; removing `this.equipment` and the `equipment`
snapshot field (and the one `restore` call) returns to the 112 state. No persisted
data depends on equipment yet — old saves simply load empty equipment.

## Definition of Done

- `PlayerEquipment` implemented with get/set/clear/swap, armor-stack accessor, and
  atomic validating serialize/restore; covered by unit tests.
- `Inventory` integrates equipment; `snapshot()`/`restore()` round-trip it; invalid
  equipment blocks the whole restore.
- Full gate green: typecheck, lint, unit tests, build, e2e.
- Artifacts updated; program state advanced to 113 VERIFIED.

## Advancement gate

Target 100%. No MUST/SHALL requirement may fail. Required tests: the new equipment
unit suite and the unchanged baseline (unit + e2e). Below 100% advancement is
forbidden.
