# Verification: 009-slot-data-unification

Status: **VERIFIED**
Completion: 100%
Advancement allowed: **true**

## Requirement evidence

| Requirement | Evidence (test) | Status |
|---|---|---|
| Slot layout (9 hotbar + 27 storage, each empty or one stack) | `Inventory.slots` (9) + `storage` (≤27); CraftingPanel renders 36 cells (e2e) | PASS |
| Stack quantity (1..item max; empty slots carry no component state) | `clampCount`/`maxStackFor`; "keeps empty slots free of meaningful component state" | PASS |
| Stack compatibility (merge only when id AND components equal) | "does not merge stacks that share an id but differ in components" | PASS |
| Selection (9 hotbar slots, clamp/wraparound preserved) | "clamps out-of-range selection", "cycles forward/backward with wraparound" | PASS |
| Count/capacity queries (hotbar+storage, item-specific max, component-aware) | "merges identical plain stacks up to the item-specific maximum"; `canAddItem` | PASS |
| Add behavior (fill compatible partials, then empty slots, return remainder) | "stacks items and spills overflow into main inventory" | PASS |
| Remove/payment behavior (transactional) | "removes items across hotbar and storage transactionally" | PASS |
| Selected consumption (decrement only that stack; clear at zero) | "consumes only the selected hotbar stack" | PASS |
| Per-stack component preservation (move/merge/save/restore) | "expresses tool wear through the 008 damage component and round-trips it" | PASS |
| Legacy snapshot restore (id, qty, selected, storage, wear) | "round-trips a validated snapshot without leaking component state"; "restores a legacy snapshot that omits wear data as full tools" | PASS |
| Malformed restore atomicity (reject without partial replace) | "rejects malformed snapshot restoration atomically" | PASS |
| No runtime-ID persistence leak | snapshot persists numeric ids + legacy durability only; damage encoded via stable `minecraft:damage` resource id, never a generic-registry runtime id | PASS |

## Commands

| Command | Result | Notes |
|---|---|---|
| npm run typecheck | PASS | no errors |
| npm run lint | PASS | no errors |
| npm test (focused suite) | PASS 235/235 | prior 229 + 6 new Inventory tests |
| npm run build | PASS | `tsc --noEmit && vite build` |
| npm run test:e2e | PASS 19/19 | production build loads; break/place/craft/content green |

## Edge/adversarial validation

- Damaged tool encoded as `DAMAGE_COMPONENT` value `{damage}`; `getSlotDurability` = `max - damage`, `damageSelectedItem` accumulates damage and breaks (count 0, components cleared) at zero.
- Two stacks of the same id but different damage components do NOT merge in `addItem`/`canAddItem` (component-aware identity via `componentsCompatible`).
- Consuming a stack to zero clears its components so empty slots retain no meaningful per-stack state.
- Malformed snapshots (count > cap, invalid id, durability out of range, wrong version) are rejected and leave the live inventory unchanged.

## Migration/compatibility validation

- In-memory model unified to `ItemStack { id, count, components? }` for hotbar (9) and storage (occupied subset of 27).
- Per-stack wear moved from the old parallel `durability` array into the 008 `StackComponentMap` (damage component).
- Snapshot export keeps the pre-009 shape (`slots`/`counts`/`durability`/`storage`/`selected`) so existing saves restore verbatim; `durability` is derived from accumulated damage and decoded back on restore.
- `BlockSelector` contract unchanged; `Hotbar` and `CraftingPanel` now read `stack.id` instead of a numeric slot array.
- Item-specific max stack size (`ItemTypeDefinition.stackSize`) now governs capacity; all current items use 64, preserving prior behavior.

## Performance/resource validation

- Inventory size fixed and small; linear scans across 36 slots; `StackComponentMap` is immutable and value-frozen; one shared component registry per process.

## Regressions

- 008 component framework unchanged (StackDataComponents tests still green).
- Full unit suite 235/235 and E2E 19/19 pass; crafting, break/place, hotbar selection, and food consumption e2e scenarios green.

## Incomplete tasks

None. All 24 tasks complete.

## Advancement Exception

Not applicable; 100% completion.
