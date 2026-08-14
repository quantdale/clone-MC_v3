# Verification: 004-block-item-registry-separation

Status: **VERIFIED**

Completion: **100% (45/45 tasks complete)**

Advancement allowed: **true**

## Entry gate

003 was VERIFIED (41/41) and program state activated 004 before implementation began.

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Independent block/item registries | `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts`; `BlockItemSeparation.test.ts` (11 tests) | PASS |
| Explicit placement relation | `ItemTypeDefinition.placeBlock: ResourceId`; `PlayerInteraction.placeBlock` resolves via `blockRegistry.getByResourceId(placeBlock)` | PASS |
| Item-owned tool metadata | `ItemTypeDefinition.toolKind/toolPower/maxDurability`; `BlockItemSeparation.test.ts` tool-metadata test | PASS |
| Item-referenced drops | `BlockTypeDefinition.dropItem: ResourceId`; drop resolves via `itemRegistry.getByResourceId` | PASS |
| Legacy numeric compatibility | `BlockItemSeparation.test.ts` full 0..24 legacy-id table | PASS |
| Duplicate/unknown legacy safety | `new BlockTypeRegistry([def, def])` throws; `inventory.restore` with id 999 + `isValidItem=(id)=>itemRegistry.has(id)` returns false | PASS |
| Current behavior preservation | unit + E2E regression (165 unit / 19 E2E) | PASS |
| Cross-reference validation | `validateItemBlockCrossReferences` rejects missing drop (test) and runs at `Game` bootstrap | PASS |

## Required regression commands

- `npm run typecheck` → PASS
- `npm run lint` → PASS
- `npm test` → PASS 165/165 (incl. 11 new separation tests)
- `npm run build` → PASS (tsc --noEmit + vite build)
- `npm run test:e2e` → PASS 19/19

## Compatibility checks

- Every current numeric id 0..24 retains its pre-change semantic resource (verified by full table test). Block-only ids (e.g. air at 0) stay in the block registry; item-only ids (apple 13, stick 19, wooden_pickaxe 20, stone_pickaxe 21, wooden_axe 22, coal 23, raw_iron 24) live only in the item registry.
- No generic runtime ID is persisted: no definition carries a `runtimeId` field (asserted for both registries), and the `InventorySnapshot` shape is unchanged.
- Snapshot version/shape unchanged in 004 (still `version: 1` with `slots/counts/storage/selected/durability?`).

## Scope audit

Diff touches only block/item registry separation: no tag behavior, no generalized block-state properties, no item-component stack migration, no recipe schema migration, no fluid separation introduced.

## Final decision

**ELIGIBLE TO ADVANCE.** 004 is fully VERIFIED at 100%. Program state advanced to 005-tag-registry.
