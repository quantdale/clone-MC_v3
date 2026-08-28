# Tasks: 179-nether-content-baseline

## Implementation
- [x] `src/world/BlockRegistry.ts`: `BlockId.Netherrack/Obsidian/SoulSand/NetherWart = 56..59`;
      `NETHER_WART_SCHEMA` (`age` 0..3).
- [x] Block defs: netherrack (pickaxe, miningLevel 0), obsidian (hardness 50, miningLevel 3),
      soul_sand (shovel), nether_wart (4 states, default age 0).
- [x] `src/inventory/ItemRegistry.ts`: the four placing items (56..59).
- [x] `src/worldgen/NetherTerrain.ts`: `DEFAULT_NETHER_TERRAIN_BLOCK_IDS.netherrack` 1 → 56
      (the 176 handoff).

## Tests
- [x] `tests/unit/NetherContent.test.ts`: all four blocks/items registered with keys and
      placeBlock ids.
- [x] Obsidian hardness 50 and miningLevel 3.
- [x] Netherrack/obsidian/soul_sand stateless single-state; nether_wart exactly 4 states
      (age 0..3, default 0).
- [x] `validateItemBlockCrossReferences` passes.
- [x] Default nether terrain writes `BlockId.Netherrack` in the band (handoff).
- [x] Characterization: BlockRegistry 44→48, BlockStateRegistry total + nether_wart branch,
      BlockPropertySchema STATEFUL set adds nether_wart.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2418/2418 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 180-end-dimension-type).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
