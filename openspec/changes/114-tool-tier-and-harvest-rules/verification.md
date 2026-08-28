# Verification: 114-tool-tier-and-harvest-rules

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| mining-level data model | `miningLevel?: number` on `BlockTypeDefinition`; `stone`, `coal_ore`, `iron_ore`, `cobblestone`, `bricks`, `furnace` set to `1`; all others default `0`. Test `sets miningLevel 1 on the stone-family blocks` + `leaves tool-requiring blocks at the default level 0`. | PASS |
| tool-tier data model | `toolTier?: number` on `ItemTypeDefinition`; `wooden_pickaxe`/`wooden_axe` = `1`, `stone_pickaxe` = `2`. Test `sets tool tiers on the tool items`. | PASS |
| tag-based mineability | `createDefaultBlockTags` / `createDefaultItemTags` build `minecraft:mineable/{pickaxe,axe,shovel}` and `minecraft:tools/{pickaxe,axe,shovel}` finalized against the registries. `HarvestRules.blockToolKind`/`toolKind` resolve kind from tags. Tests `declares the three mineable and three tools tags`, `places stone in mineable/pickaxe but not mineable/axe`, `resolves block and item tool kinds from tags`. | PASS |
| correct break speed | `HarvestRules.getBreakDuration` = `baseTime / toolPower` only when `isEffectiveTool`; floored at `MIN_BREAK_DURATION = 0.08`. Tests `speeds up stone with an effective pickaxe`, `keeps base speed with the wrong tool kind`, `keeps base speed with no tool`, `applies the bonus to a level-0 block with the matching kind`, `floors the duration at MIN_BREAK_DURATION`. | PASS |
| correct drop rule | `HarvestRules.canHarvest` gates drops; `PlayerInteraction.finishBreak` spawns no entity when `!canHarvest`. Tests `always harvests a level-0 block by hand`, `does not harvest stone by hand`, `does not harvest with the wrong tool kind`, `harvests with the correct kind at sufficient tier`, `harvests a level-0 block even with the wrong-kind tool`, `rejects an insufficient-tier correct-kind tool`, `coal ore is harvestable by a wooden pickaxe`, and `PlayerInteraction` integration `breaking stone with no tool removes the block but spawns no entity`. | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run` | PASS | 1354 passed (127 files); new `HarvestRules.test.ts` 24 + `PlayerInteraction.test.ts` 6 integration green |
| `npm run build` | PASS | `tsc --noEmit && vite build` clean |
| `npm run test:e2e` | PASS | 21 passed (1.4m) |

## Edge/adversarial validation

- Tag finalization rejects missing references at bootstrap (`TagRegistry.finalize` validates `hasByResourceId`); blocks/items always have a `resourceId`, so finalization cannot fail for default content.
- No `harvestRules` injected → `PlayerInteraction` retains legacy `getBreakDuration` (def-field bonus) and legacy drop-always behavior; existing `PlayerInteraction.test.ts` (no rules) stays green.
- Insufficient-tier correct-kind tool is **not** effective and does **not** harvest (e.g. mining-level-2 block vs wooden pickaxe tier 1), but still drops under legacy path only when the block is level 0 — verified via the `rejects an insufficient-tier correct-kind tool` matrix.
- `MIN_BREAK_DURATION = 0.08` floor prevents zero/instant breaks for very fast tool+block combinations.

## Migration/compatibility validation

- `miningLevel`/`toolTier` are optional and default to `0`; no persisted-data schema change (nothing serialized).
- `preferredTool` / `toolKind` retained on definitions and remain the single tag source, so existing registries are unaffected by shape.
- Additive change: new `HarvestRules` + tag factories + optional interaction wiring; no existing public signatures removed.

## Performance/resource validation

- `O(1)` tag/map lookups in the break loop; `HarvestRules` is constructed once at bootstrap and frozen tags are read-only; no per-break allocation.

## Regressions

- Full unit suite 1354 (was 1329 at 113) — net +25 from 114, no regression.
- E2E drop tests target `miningLevel 0` terrain (grass/dirt/sand/gravel); gating leaves them dropping. `player can break a block` only asserts air replacement, unaffected. All 21 e2e green.

## Incomplete tasks

None. All 7 task groups complete and checkbox-credited.

## Advancement Exception

Not applicable — completion is 100% with all MUST/SHALL requirements implemented and verified; no exception required.

## Final decision

VERIFIED at 100%. Advance to change `115-item-durability-repair`.
