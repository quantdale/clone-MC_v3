# Tasks: 185-advancement-framework

## Implementation
- [x] `src/simulation/AdvancementFramework.ts`: `AdvancementCriterion` typed union (kill_mob/
      obtain_item/dimension_enter/boss_defeat); `AdvancementReward` (none/experience/item).
- [x] `AdvancementDefinition` / `AdvancementProgress` / `SerializedAdvancementProgress`;
      `ADVANCEMENT_PROGRESS_VERSION` (1).
- [x] `createAdvancementProgress` (unachieved, no criteria met).
- [x] `applyAdvancementTrigger` (first matching criterion; completion at last criterion with tick;
      identity no-op otherwise).
- [x] `advancementIsComplete` / `advancementCriteriaRemaining`.
- [x] `serializeAdvancementProgress` / `deserializeAdvancementProgress` (validated).

## Tests
- [x] `tests/unit/AdvancementFramework.test.ts`: fresh progress (no criteria, remaining = 2).
- [x] Matching trigger marks only the matching criterion; remaining decrements.
- [x] Completion exactly at the last criterion with the tick recorded; post-completion trigger is
      an identity no-op.
- [x] Non-matching trigger is an identity no-op.
- [x] 184 integration: `markDragonDefeated` record drives the `boss_defeat` trigger to completion.
- [x] Serialize/deserialize round-trip.
- [x] Malformed payloads rejected (null, bad version, empty key, non-boolean achieved, negative
      tick, non-boolean array).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2460/2460 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      186-core-progression-advancements).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
