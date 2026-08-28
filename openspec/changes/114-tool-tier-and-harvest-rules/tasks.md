# Tasks: 114-tool-tier-and-harvest-rules

## 1. Data model

- [x] Add `miningLevel?: number` to `BlockTypeDefinition` (default `0`).
- [x] Set `miningLevel: 1` on `stone`, `coal_ore`, `iron_ore`, `cobblestone`,
      `bricks`, `furnace` block definitions.
- [x] Add `toolTier?: number` to `ItemTypeDefinition` (default `0`).
- [x] Set `toolTier: 1` on `wooden_pickaxe` and `wooden_axe`;
      `toolTier: 2` on `stone_pickaxe`.

## 2. Tag factories

- [x] Add `createDefaultBlockTags(blockRegistry): TagRegistry` building
      `minecraft:mineable/pickaxe|axe|shovel` from each block's `preferredTool`,
      finalized against the block registry's `hasByResourceId`.
- [x] Add `createDefaultItemTags(itemRegistry): TagRegistry` building
      `minecraft:tools/pickaxe|axe|shovel` from each item's `toolKind`,
      finalized against the item registry's `hasByResourceId`.

## 3. HarvestRules module

- [x] Create `src/world/HarvestRules.ts` with `HarvestRules` constructed from the
      block and item tag registries.
- [x] Implement `blockToolKind`, `toolKind`, `isEffectiveTool`, `canHarvest`,
      `getBreakDuration` per the spec (tag-driven kind, tier gate, 0.08 floor).

## 4. Integration

- [x] Add optional `harvestRules` to `PlayerInteraction` constructor opts.
- [x] Delegate `getBreakDuration` to `HarvestRules` when present; retain legacy
      def-field fallback otherwise.
- [x] Gate drops in `finishBreak` on `canHarvest` (no drop when not harvestable).
- [x] Build and inject the tag registries + `HarvestRules` in `Game.ts`.

## 5. Tests

- [x] `tests/unit/HarvestRules.test.ts`: data-model defaults, tag membership,
      effective tool, wrong kind, no tool, insufficient tier, break-speed floor,
      canHarvest matrix.
- [x] `tests/unit/PlayerInteraction.test.ts`: integration test that breaking
      `stone` with no tool (rules injected) removes the block but spawns no
      entity.

## 6. Gate

- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] `npx vitest run` passes (new + existing green).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes.

## 7. State / handoff

- [x] Mark tasks complete; finalize `verification.md` with evidence.
- [x] Checkpoint `PROGRAM_STATE`; commit impl + artifacts; push to `origin/main`;
      advance to change `115-item-durability-repair`.
