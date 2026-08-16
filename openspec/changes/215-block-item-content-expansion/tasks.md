# Tasks: 215-block-item-content-expansion

## Implementation
- [x] `src/data/ContentExpansion.ts`: `ContentKind` / `ContentDefinition` +
      `createContentDefinition` (id validation incl. prefix rule, name, stackSize [1,64],
      hardness >= 0, tags; defaults 64/0/[]).
- [x] `ContentExpansion` / `createContentExpansion` (duplicate rejection, order-preserving
      grouping) / `contentById` / `contentsOfKind`.

## Tests
- [x] `tests/unit/ContentExpansion.test.ts`: creation incl. defaults.
- [x] Every rejection with exact messages (id, prefix, name, stackSize, hardness, tags).
- [x] Expansion grouping/order; duplicate; lookups; empty expansion.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2797/2797 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      216-biome-content-expansion).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
