# Verification: 078-water-flow-simulation

Status: VERIFIED
Completion: 100%
Advancement allowed: true

078 started only after 077 was VERIFIED (d8c9d92 / 3cdd70c).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Downward propagation | source/flowing(3)/falling(8) each spawn falling 8 below (`affected [[x,y-1,z]]`, source persists); no spawn onto existing water (below unchanged, `changed false`) | PASS |
| Falling at ground | falling with solid below converts to flowing 7 (`affected` contains the cell); the converted base spreads at cap 7 on its next step (never 8) | PASS |
| Horizontal spread | source spreads level 1; flowing 2 spreads level 3; level 7 caps at 7 with a feeder keeping it stable; worse flowing water (5) improved to 1 by a source; falling neighbor never overwritten | PASS |
| Source formation | flowing cell with two horizontal sources becomes a source (level 0) | PASS |
| Decay | isolated flowing 4 → 5; isolated flowing 7 → removed; feeder (level 3 beside 4) blocks decay; water above blocks decay | PASS |
| Non-water no-op | lava cell and empty cell → `{changed: false, affected: []}` | PASS |
| Determinism | identical worlds → identical results and snapshots; affected order deterministic (-x, +x, -z, +z) | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/WaterFlowEngine.test.ts` | PASS | 18/18 |
| `npm test` | PASS | 90 files, 886/886 (868 baseline + 18 new); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.24s |
| `npm run test:e2e` | PASS | 19/19 (1.5m) |

## Edge / adversarial validation

- Downward spawn fires for all three level classes (0, 1-7, 8-15) and never targets occupied fluid cells.
- Conversion-then-spread chaining across two steps verified (falling → flowing 7 → horizontal spread capped at 7).
- Spread improves only worse flowing water (1-7); falling cells (8-15) are structurally excluded from horizontal overwrite.
- Decay ladder verified at both ends (4 → 5 and 7 → removal) with both guards (feeder, water above) tested.
- `affected` reports exactly the written cells in deterministic neighbor order.

## Migration / compatibility validation

Additive: new `src/simulation/WaterFlowEngine.ts` + test file. 076 `FluidState` consumed unchanged; 077 dispatcher untouched (the engine is the handler implementation surface).

## Performance / resource validation

One step reads ≤ 5 cells and writes ≤ 4; allocation is the result object + affected array. Unit suite duration unchanged (~7.4s, 90 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 886/886 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 078 deterministic water flow (downward propagation, ground conversion, capped horizontal spread, source formation, decay) is in place. Advance to 079-lava-flow-simulation.
