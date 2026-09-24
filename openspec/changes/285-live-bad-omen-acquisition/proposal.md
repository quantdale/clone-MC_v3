# Proposal: 285-live-bad-omen-acquisition

## Problem

The verified `RaidStateMachine` (152) accepts a `badOmenLevel` when a raid starts
and the status-effect registry already declares `bad_omen`, but nothing in the
live Game can acquire that effect, clear it, or turn a player standing in a
village with the effect into a raid. Without acquisition and a village-omen
trigger, raids remain reachable only through the 282 debug start seam.

## Goals

- Own one ephemeral Game-level Bad Omen level with total clamp/grant/clear pure
  helpers over plain numeric inputs (no entity coupling).
- Decide, from (omen level × village context), whether to start a raid at a
  village center; on success start through the 282 raid seam and clear the omen
  exactly once; on invalid/absent context fail closed without consuming the omen.
- Evaluate the trigger only on the unpaused fixed tick, behind an injectable
  village query that defaults to "no village" until a later detector exists.
- Prove invalid, duplicate, stale, pause, dispose, and reload behavior with unit
  and browser scenarios before any advancement claim.

## Non-goals

- No pillager/raider entity registration, captain kill loot, or mob spawning.
- No village/settlement structure generation or spatial boundary algorithm; the
  village context is an injected pure input (reserved for a later detector
  change).
- No new persistence namespace: Bad Omen is session-ephemeral; reload MUST
  restore level 0. No archive field, save migration, or `__badomen__` key.
- No new HUD element, toast, sound, particle, or status-effect registry edit
  (`bad_omen` stays registry-only with `maxAmplifier: 0`).
- No Change 258 headed FPS/GPU work, no GPU evidence, no 258 status change.

## Preconditions

- Change 152's `RaidStateMachine` and codec remain VERIFIED and authoritative.
- Change 282 is the immediate predecessor: its Game raid ownership and
  `debugStartRaid`/`getRaidState` seams MUST be VERIFIED before 285 production
  work; this package is authored in advance and activates only after 282.
- Change 258 remains BLOCKED; Changes 001–281 remain VERIFIED as recorded in
  program state.
- No village detector exists in `src/`; the default query therefore returns
  `null` and no raid can start from the live path until a later change injects a
  real query (tests inject fixtures).

## Dependencies

- `src/simulation/RaidStateMachine.ts` — `startRaid(x,y,z,omen)` wave contract.
- Change 282 Game seams — `debugStartRaid`, `getRaidState`, fixed-tick raid
  ownership and `#raid-feedback` projection.
- Existing Game fixed-tick/pause/dispose boundary and `__voxelGame` test seam.
- Assumed later contracts (author standalone; do not import them):
  - 283 `live-raid-persistence` may persist active/terminal raid records; 285
    MUST NOT write raid or omen persistence itself.
  - 284 (reserved, not yet authored) is expected to provide a village or
    settlement presence query; until it exists, Game accepts an injectable
    `VillageQuery` that defaults to `() => null`.

## Proposed change

1. Add `src/simulation/BadOmenRules.ts`: immutable `BadOmenState { level }`,
   `BAD_OMEN_MAX_LEVEL = 5`, total `clampBadOmenLevel`, `createBadOmen`,
   `grantBadOmen` (stacking toward the cap), `clearBadOmen`, and
   `resolveVillageRaidTrigger(state, village)` returning a discriminated
   `START_RAID` | `NONE` decision with an explicit reason.
2. Wire Game-owned `badOmen` state: `grantBadOmen` / `clearBadOmen` /
   `getBadOmenLevel` seams, one fixed-tick evaluation while unpaused/running,
   and `setVillageQuery` injection defaulting to `() => null`.
3. On `START_RAID`, call the 282 raid start path at the village center with the
   clamped omen level, then clear the omen exactly once in the same evaluation;
   a second evaluation in the same or later tick sees level 0 and no-ops.
4. Add focused unit coverage for pure rules and Game wiring (grant/clear, clamp,
   invalid village center, no-village, active-raid replacement, pause, dispose),
   plus a browser journey that injects a fixture village query, grants omen,
   observes raid feedback, and proves reload clears the omen with no
   resurrection.

## Compatibility and migration

No stored data, registry id, archive schema, or public save envelope changes.
Existing HUD/wither/trading/smoker/raid-feedback behavior remains independent.
`bad_omen` and `hero_of_the_village` registry entries are untouched. Reload and
reset see level 0 by construction (ephemeral field, never serialized).

## Risks

- Evaluating the trigger outside the fixed tick could start raids while paused
  or loading; the evaluation is gated exactly like the 282 raid tick.
- A non-finite village center could produce a broken `startRaid` call; the pure
  helper rejects it with `INVALID_CENTER` and retains the omen.
- Accidentally double-clearing or clearing before a failed start would consume
  omen without a raid; the decision returns `START_RAID` only with finite center
  + level ≥ 1, and Game clears only after a successful start call.
- Scope creep into village detection or persistence would collide with 283/284;
  those are explicit non-goals and rejected alternatives below.

## Rollback strategy

The change is additive on this branch only. Revert the 285 implementation/docs
commits together; no migration or data repair is required because neither omen
nor raid state is written by 285.

## Definition of Done

- Complete OpenSpec package (this folder + `OVERRIDE_DRAFT.md`) passes the
  SPEC_AUTHORING_PROTOCOL quality gate before any `src/` edit.
- Every MUST/SHALL has at least one scenario, including invalid/duplicate/
  stale/pause/dispose/reload/failure cases.
- Focused tests, typecheck, lint, full unit, build, exact `npm run test:e2e`,
  file-audit, and `npm run validate-state` are recorded truthfully in
  `verification.md`.
- C285 is exact and VERIFIED at 100%; 258 remains BLOCKED; no later change is
  implemented on this branch.

## Advancement gate

Advance only at 10/10 tasks with all mandatory requirements and tests passing
and the normal publication handoff. No advancement exception is planned.
