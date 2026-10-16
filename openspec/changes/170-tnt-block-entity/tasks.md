# Tasks: 170-tnt-block-entity

## Implementation
- [x] `src/world/BlockRegistry.ts`: `BlockId.Tnt = 53` with a stateless def (no `propertySchema`).
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.Tnt = 53` with `placeBlock`.
- [x] `src/simulation/TntPriming.ts`: `TntPrimingCause`; `PrimedTnt`; `TNT_STRENGTH`;
      `TNT_FUSE_TICKS_REDSTONE` (80) / `TNT_FUSE_TICKS_FIRE` (20).
- [x] `tntFuseTicks(cause)` (80 | 20).
- [x] `tntShouldPrime(powered, fireAdjacent)` (162-style `powered || fireAdjacent`).
- [x] `primeTnt(x, y, z, cause)` descriptor.
- [x] `tickPrimedTnt` (clamp at 0; ignore non-finite/negative elapsed).
- [x] `primedTntIsDue` (`fuseTicks <= 0`).
- [x] `explodePrimedTnt` (169 integration: center = block center + 0.5, strength default 4).

## Tests
- [x] `tests/unit/TntPriming.test.ts`: block carries no schema (isEmpty) and enumerates exactly 1
      state.
- [x] Item places the block; cross-reference passes.
- [x] Fuse ticks are 80 for redstone and 20 for fire.
- [x] `tntShouldPrime` at all four input combinations (powered consumer, not inverted).
- [x] `primeTnt` descriptor shape (position, fuse, strength 4).
- [x] `tickPrimedTnt` decrements by exactly the elapsed ticks.
- [x] `tickPrimedTnt` clamps at zero; non-finite/negative elapsed are no-ops.
- [x] `primedTntIsDue` flips exactly when the fuse reaches zero.
- [x] `explodePrimedTnt` destroys a stone block one block east (block-center resolution).
- [x] All-air world destroys nothing; repeated calls are identical.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2310/2310 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 171-rail-block-states).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
