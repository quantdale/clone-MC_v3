# Tasks: 113-equipment-slots

Status: VERIFIED
Completion: 100%

## Artifacts (pre-implementation, per SPEC_AUTHORING_PROTOCOL)
- [x] Author `proposal.md`
- [x] Author `design.md`
- [x] Author `specs/equipment-slots/spec.md`
- [x] Author `tasks.md`
- [x] Author `verification.md`
- [x] Validate artifact package against the spec-quality gate

## Implementation
- [x] NEW `src/inventory/Equipment.ts`: `EquipmentSlot`, `EQUIPMENT_SLOT_ORDER`,
      `ARMOR_SLOTS`, `EquipmentSnapshot`, `PlayerEquipment` with `getEquipment`,
      `setEquipment` (returns previous), `clear`, `getArmorStacks`, `serialize`,
      `restore`, `validateSnapshot` (atomic, validating).
- [x] EDIT `src/inventory/Inventory.ts`: add `readonly equipment: PlayerEquipment`
      (ctor-initialized); add optional `equipment` to `InventorySnapshot`; include
      `this.equipment.serialize()` in `snapshot()`; validate + restore equipment
      inside `restore()` so a malformed block rejects the whole restore atomically.

## Unit tests
- [x] NEW `tests/unit/Equipment.test.ts`:
  - slot model: empty five slots; mainhand is the selected hotbar slot (not stored).
  - get: empty→null; occupied→stack.
  - set/swap: equip returns previous; re-equip swaps; null clears; components
    preserved; count clamped into `[1, MAX_STACK]`.
  - clear: empties all five slots.
  - getArmorStacks: non-null armor in Head→Chest→Legs→Feet order; Offhand excluded;
    empty slots skipped.
  - serialize/restore: round-trip; wrong version rejected atomically; wrong array
    length rejected; invalid item id rejected; non-positive/over-cap count rejected.
  - inventory integration: new inventory empty equipment; snapshot round-trips;
    absent equipment loads empty; malformed equipment rejects the whole restore
    (inventory unchanged).

## Regression / gate
- [x] Baseline regression gate green: `npm run typecheck`, `npm run lint`,
      `npx vitest run` (1329), `npm run build`, `npm run test:e2e` (21).

## Documentation / state
- [x] Update `openspec/PROGRAM_STATE.json` + `PROGRAM_STATE.md` to 113 VERIFIED.
- [x] Commit impl + tests + artifacts; push to `origin/main`; advance program.

## Final gate
- [x] Set change to VERIFYING; run full verification contract; reconcile spec vs
      implementation; mark VERIFIED at 100%.
