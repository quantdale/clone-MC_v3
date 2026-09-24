# Proposal: 287-live-village-detection

## Problem

Change 285 ships a fail-closed Bad Omen × village trigger through an injectable
`VillageQuery` that **defaults to `() => null`**. In normal play a player with
Bad Omen never starts a raid because no production detector exists — only
fixture queries in tests. Changes 282–286 already deliver raid feedback,
persistence, wave spawning, omen acquisition, and bar parity; the missing live
seam is real spatial settlement detection backed by blocks the world can
actually place today (274 beds; optional 281 smoker as a non-required
workstation signal).

## Goals

- Define and implement the narrowest honest village definition the current
  codebase can produce: a bounded, deterministic, chunk-loaded-only scan for
  **qualifying bed blocks** near the player.
- Wire that detector as the production default behind `Game.setVillageQuery`,
  so Bad Omen + enter-village starts a raid without fixtures.
- Bound per-tick cost (rate-limit / move-threshold cache; hard cell cap);
  keep pause/dispose/reload safety.
- Prove with pure unit rules + a browser journey (place beds → grant omen →
  walk in → raid starts; no beds → no raid).
- Keep 258 BLOCKED; do not reopen 282–286 contracts beyond the intentional
  default-query change.

## Non-goals

- No raider AI/combat redesign; no pillager outposts or patrols.
- No Hero of the Village rewards; no villager entity spawning.
- No village structure worldgen unless detection is impossible without it
  (it is not — beds are placeable).
- No new persistence / archive namespace; no PointOfInterest live wiring
  campaign; no 258 headed FPS/GPU work or fake evidence.
- Do not start Change 288 implementation in this session.

## Preconditions

- Changes 282–286 are VERIFIED and published on `origin/main`.
- `BadOmenRules.resolveVillageRaidTrigger` + `VillageContext` remain the
  decision contract; `Game.evaluateBadOmenVillageTrigger` remains the start
  seam.
- Live `BlockId.Bed` (63) from 274 is placeable; world columns expose
  `storage.hasColumn` / `getBlock` for loaded-only reads.
- Change 258 remains BLOCKED; Changes 259–286 remain VERIFIED.

## Dependencies

- `src/simulation/BadOmenRules.ts` (`VillageContext`, trigger decision).
- `src/engine/Game.ts` (`setVillageQuery`, fixed-tick omen evaluate).
- `src/world/World.ts` + `CanonicalWorldStorage.hasColumn` / `getBlock`.
- `src/world/BlockRegistry.ts` (`BlockId.Bed`).

## Proposed change

1. Author this complete OpenSpec package under
   `openspec/changes/287-live-village-detection/`.
2. Add the CHANGE_SEQUENCE row + override ADDENDUM; make 287 the sole ACTIVE
   change.
3. Implement pure `VillageDetectionRules` (scan/bounds/determinism) plus Game
   wiring: production default query = live detector; `setVillageQuery(null)`
   restores the live default (fixtures still override via explicit callback).
4. Unit + browser E2E evidence; full baseline gates; mark VERIFIED at 100%;
   publish to `origin/main`.

## Compatibility and migration

No stored data, registry id, or archive schema changes. Existing saves remain
valid. Behavioral change: production default village query is no longer a
constant `null` — it reflects nearby loaded beds. Explicit
`setVillageQuery(() => null)` still forces no-village for tests. Dispose /
reload still clear ephemeral omen/raid state per 285.

## Risks

- Over-broad scan cost on the fixed tick → mitigated by radius, Y window,
  loaded-column skip, resample interval, move threshold, and hard cell cap.
- Treating smokers-only or air columns as villages → rejected; beds are the
  sole qualifier.
- Breaking 285 tests that assumed default-null → update those tests to inject
  `() => null` when they need absence; fixture paths unchanged.

## Rollback strategy

Revert the 287 commits together. No migration repair (nothing persisted).
Restoring default `() => null` returns to the 285 fail-closed production
behavior.

## Definition of Done

- Package passes SPEC_AUTHORING_PROTOCOL quality gate.
- Implementation + unit + E2E green; baseline gates green (document known
  SwiftShader visual drift honestly).
- C287 exact; VERIFIED 100%; published to `origin/main`; 258 still BLOCKED.
- `nextExactAction` points at authoring a spec-first package for 288 (not
  started).

## Advancement gate

Advance only at 100% task completion with all MUST/SHALL requirements passing
and required gates green. No advancement exception planned.
