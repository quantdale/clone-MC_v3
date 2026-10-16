# Tasks: 217-structure-content-expansion

## Implementation
- [x] `src/data/StructureExpansion.ts`: `StructurePlacement` / `StructureDefinition` +
      `createStructureDefinition` (id incl. `structure/` prefix rule, name, template, categories
      from 216, spacing/separation/rarity/yRange rules; defaults 0/1).
- [x] `StructureExpansion` / `createStructureExpansion` (duplicate rejection, registration
      order) / `structureById` / `structuresInCategory`.

## Tests
- [x] `tests/unit/StructureExpansion.test.ts`: creation incl. defaults.
- [x] Every rejection with exact messages.
- [x] Expansion order; duplicate; lookups; category filter; empty expansion.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2814/2814 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      218-mob-content-expansion).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
