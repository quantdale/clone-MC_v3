# Tasks: 112-item-pickup-and-despawn

Status: VERIFIED
Completion: 100%

## Artifacts (pre-implementation, per SPEC_AUTHORING_PROTOCOL)
- [x] Author `proposal.md`
- [x] Author `design.md`
- [x] Author `specs/item-pickup-and-despawn/spec.md`
- [x] Author `tasks.md`
- [x] Author `verification.md`
- [x] Validate artifact package against the spec-quality gate

## Implementation
- [x] EDIT `src/world/ItemEntity.ts`: make `count` mutable (`count: number`), update
      doc comment to mark the manager as the sole quantity mutator.
- [x] EDIT `src/simulation/ItemEntityManager.ts`: add constants
      `PICKUP_DELAY_TICKS`, `DESPAWN_AGE_TICKS`, `MERGE_RADIUS`, `PICKUP_RADIUS`
      and methods `mergeEntities(radius)`, `despawnExpired(maxAgeTicks)`,
      `collectPlayerDrops(px,py,pz, insert, pickupRadius)`.
- [x] EDIT `src/engine/Game.ts`: in the active-simulation block, after
      `tickItemEntities(dt)`, call `mergeEntities()`, `despawnExpired()`, and
      `collectPlayerDrops(player.position…, (id,n)=>inventory.addItem(id,n))`;
      re-render the hotbar when collection returns > 0.

## Unit tests
- [x] NEW `tests/unit/ItemPickup.test.ts` (16 tests):
  - pickup delay: `ageTicks < PICKUP_DELAY_TICKS` not collected (insert never called);
    `ageTicks == PICKUP_DELAY_TICKS` is the first collectible tick.
  - merge: overlapping same-item drops merge (count summed); distance 1.0 does not
    merge; cap at `stackSize` leaves both; different items never merge; idempotent
    on a static world (three overlapping drops fold into one).
  - inventory insertion: full insert removes entity; partial insert reduces `count`;
    entity outside `pickupRadius` skipped; full inventory leaves entity untouched;
    multiple drops summed.
  - despawn: `ageTicks == DESPAWN_AGE_TICKS` despawns; `ageTicks - 1` survives;
    no eligible entities is a no-op; only the aged entity is removed.

## Integration / e2e
- [x] EDIT `tests/e2e/game.spec.ts`: add "breaking a block drops an item the player
      collects" (keep the existing break→entity spawn regression test).

## Regression / gate
- [x] Baseline regression gate green: `npm run typecheck`, `npm run lint`,
      `npx vitest run` (1306 passed), `npm run build`, `npm run test:e2e` (21 passed).

## Documentation / state
- [ ] Update `openspec/PROGRAM_STATE.json` + `PROGRAM_STATE.md` to 112 VERIFIED.
- [ ] Commit impl + tests + artifacts; push to `origin/main`; advance program.

## Final gate
- [x] Set change to VERIFYING; run full verification contract; reconcile spec vs
      implementation; mark VERIFIED at 100%.
