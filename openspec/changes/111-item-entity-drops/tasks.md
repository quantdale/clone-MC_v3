# Tasks: 111-item-entity-drops

Status: VERIFIED
Completion: 100%

## Artifacts (pre-implementation, per SPEC_AUTHORING_PROTOCOL)
- [x] Author `proposal.md`
- [x] Author `design.md`
- [x] Author `specs/item-entity-drops/spec.md`
- [x] Author `tasks.md`
- [x] Author `verification.md`
- [x] Validate artifact package against the spec-quality gate

## Implementation
- [x] Add `src/world/ItemEntity.ts`: `ItemEntity` type, `ITEM_ENTITY_TYPE_KEY`,
      `createSpawnPosition`, strict `createItemEntity` constructor.
- [x] Add `src/simulation/ItemEntityManager.ts`: id minting, `spawnItemEntity`,
      `spawnLootStacks` (splitting + jitter), `removeItemEntity`, `getItemEntity(s)`,
      `getItemEntitiesInChunk`, `tickItemEntities`, `clear`, `serializeAll` /
      `deserializeAll` to the 037 envelope.
- [x] Route `PlayerInteraction.finishBreak` drops through `itemEntities.spawnLootStacks`
      at the block center; remove the `selector.addItem` drop path. Add `itemEntities?`
      to the constructor.
- [x] Construct + tick + expose `ItemEntityManager` in `src/engine/Game.ts`.

## Unit tests
- [x] `tests/unit/ItemEntityManager.test.ts`: id minting + deserialize continuation.
- [x] Validation: unknown item, oversize count, non-finite coordinates/velocity.
- [x] Stack splitting: 200→64/64/64/8, multi-stack.
- [x] Block-break integration via the manager (loot + leaves→apple + fallback).
- [x] Deterministic no-rng exact spawn positions.
- [x] `tickItemEntities` ages entities by `round(dt*20)`; dt<=0 no-op.
- [x] Query/removal + chunk grouping (floor x/16, floor z/16).
- [x] 037 round-trip preserves fractional position/velocity; foreign `typeKey`
      rejects atomically.

## Integration / e2e
- [x] `tests/e2e/game.spec.ts`: breaking a block spawns a world item entity
      (`window.__voxelGame.itemEntities.size > 0`).

## Regression / gate
- [x] Baseline regression gate green: `npm run typecheck`, `npm run lint`,
      `npm test`, `npm run build`, `npm run test:e2e`.

## Documentation / state
- [x] Update `openspec/PROGRAM_STATE.json` + `PROGRAM_STATE.md` to 111 VERIFIED.
- [x] Commit impl + tests + artifacts; push to `origin/main`; advance program.

## Final gate
- [x] Set change to VERIFYING; run full verification contract; reconcile spec vs
      implementation; mark VERIFIED at 100%.
