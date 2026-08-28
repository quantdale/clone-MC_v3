# Proposal: 004-block-item-registry-separation

## Problem

`src/world/BlockRegistry.ts` currently contains both world blocks and inventory-only concepts in one `BlockId` namespace. Apple, stick, wooden/stone tools, coal, and raw iron are represented beside grass, stone, water, and lava, and block definitions also carry tool metadata. That coupling prevents block-state scaling and item-component scaling from evolving independently.

## Goals

- Create distinct block-type and item-type domain definitions backed by the generic registry from 003.
- Ensure world/block code cannot resolve inventory-only items as blocks.
- Ensure inventory/crafting/tool code resolves item metadata from the item domain rather than block definitions.
- Provide block-item links for placeable block items without equating block identity with item identity.
- Preserve current gameplay and existing persisted numeric save compatibility through an explicit temporary legacy-ID adapter.

## Non-goals

- No block property/state combinations; changes 006-007.
- No item-stack component migration; changes 008-009.
- No fluid separation; 015.
- No recipe data model migration; 010.
- No renumbering/reinterpretation of existing persisted numeric inventory/world data.
- No broad content expansion.

## Preconditions

- 003 is VERIFIED and generic registries are available.

## Proposed change

Introduce:

- `BlockTypeDefinition` containing only world-block concerns;
- `ItemTypeDefinition` containing inventory/item/tool/food concerns;
- separate typed registries keyed by ResourceId;
- explicit optional relation from an item to the block it places;
- explicit current-save legacy numeric mapping at the compatibility boundary;
- migration of current registry consumers so inventory/tool logic does not depend on `BlockRegistry` for item semantics.

The temporary compatibility layer is deliberately visible and documented for removal by later migrations; it must not become the permanent data model.

## Compatibility and migration

Existing saves/localStorage currently contain numeric item/block IDs. 004 MUST preserve their interpretation. Existing worlds must load with the same blocks, existing inventory must load equivalent items/tools, and item placement/mining/crafting must remain behaviorally equivalent.

New ResourceIds become stable domain identity, but this change does not rewrite persisted snapshots into a new format.

## Risks

- Accidentally changing the meaning of old numeric IDs can corrupt saves.
- Treating a placeable item and its block as the same registry entry would recreate the coupling under a new name.
- Some current UI code obtains icons/names through block definitions; migration must preserve display behavior for both block items and non-block items.
- Tool mining metadata must move without changing hardness/speed/durability semantics.

## Rollback strategy

Because 004 is a broad internal migration, rollback is the last verified 003 state plus existing mixed registry. Do not leave half-migrated consumers; final gate requires all current behaviors and save fixtures to pass.

## Definition of Done

- Block and item definitions/registries are structurally independent.
- Inventory-only items cannot be queried as world blocks.
- Placeable item → block linkage is explicit.
- Tool/food/item metadata is owned by the item registry.
- Block physical/render/mining-requirement metadata is owned by the block registry.
- Current saved numeric data round-trips with equivalent semantics.
- All existing unit/E2E behavior plus new separation/compatibility tests pass.

## Advancement gate

005 does not begin until 004 is 100% complete and VERIFIED. Because this migration touches persistence interpretation, any unresolved compatibility ambiguity blocks advancement regardless of completion percentage.
