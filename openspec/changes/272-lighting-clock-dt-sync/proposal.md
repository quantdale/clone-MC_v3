# Proposal: 272-lighting-clock-dt-sync

## Problem

In `src/rendering/Lighting.ts` `update()`, `worldSeconds` advances with the
clamped `effectiveDt` (`frozen ? 0 : clamp(dt, 0, CONFIG.maxDeltaTime)`), but
sun rotation uses the **raw** `dt`
(`this.sunDirection.applyAxisAngle(this.dayNightAxis, -anglePerSecond * dt)`).
After frame hitches (dt > `maxDeltaTime = 0.1 s`), the clock and the sun
desync: the sun jumps ahead of the time-of-day the clock reports. This is
certification debt **R-9** (risk-register: cosmetic desync after hitches).

## Goals

- Use the same effective (clamped / frozen-aware) dt for both `worldSeconds`
  and sun rotation in `Lighting.update()`.
- Preserve frozen-test behavior (245): when frozen, neither advances.
- Unit tests covering hitch-sized dt proving clock phase and sun angle stay
  consistent (same effective dt).
- Close risk-register R-9.
- Prefer no visual-golden churn: the fix is behaviorally invisible at normal
  frame pacing (dt <= maxDeltaTime is unchanged); re-pin goldens only with
  justification if they shift.

## Non-goals

- Gameplay/systems retune (no simulation, tick, physics, or lighting-model
  change beyond the dt sync).
- Day-length, clock-phase, or daylight-factor curve changes.
- 258 headed FPS certification (no headed work, no GPU evidence).
- Reopening 259–271 (untouched unless a lighting-clock regression blocks 272).

## Preconditions

- 258 stays **BLOCKED** (40/100, headed hardware-WebGL deferred by owner).
- 259–271 stand **VERIFIED** (271 VERIFIED 14/14 at `8e7df1a`, checkpoint
  `3098d37` = session start).
- 272 is the sole ACTIVE implementation change per
  `CHANGE_SEQUENCE_OVERRIDES.md`.

## Dependencies

- `src/rendering/Lighting.ts` (`update`, `freezeDayNight`, clock/sun
  accessors) — the only production file touched.
- `tests/unit/Lighting.test.ts` — extended with hitch/frozen consistency
  proofs; existing tests must stay green unchanged.
- 245 frozen-daylight hook (`freezeDayNight`) — behavior preserved
  byte-for-byte.
- 245 visual-regression matrix (`tests/e2e/visual-regression.spec.ts`) —
  regression surface for golden churn (expected: none).

## Proposed change

1. `src/rendering/Lighting.ts` `update()`: replace raw `dt` with the already
   computed `effectiveDt` in the `applyAxisAngle` call. One-line fix; the
   `CONFIG.dayNight.enabled && !this.frozen` guard is unchanged.
2. `tests/unit/Lighting.test.ts`: add hitch-sized-dt tests proving
   `worldSeconds`-derived clock phase and sun angle advance by exactly the
   clamped dt (e.g. `update(5)` ≡ 50 × `update(0.1)`; frozen + hitch advances
   nothing; negative dt advances nothing on either axis).
3. `risk-register.md`: R-9 marked CLOSED by Change 272 with closure evidence
   pointer.
4. `PARITY_MATRIX.md`: C272 exact row.

## Compatibility and migration

- No stored/public data changes. No migration. Saves, goldens, and the 245
  freeze contract are unaffected by construction (normal pacing dt is
  bit-identical; only hitch-sized dt changes, toward consistency).
- If visual goldens shift, re-pin only with per-cell justification in
  `verification.md` (expected: no shift — freeze pins direction analytically
  and normal pacing is unchanged).

## Risks

- Visual-golden churn (mitigated: freeze path untouched; normal-pacing math
  identical; full visual cell re-run proves no shift).
- Over-correction temptation (e.g. "fixing" the daylight curve or day length
  — forbidden by non-goals; the diff stays one line + tests).

## Rollback strategy

Revert the 272 commits; the pre-fix behavior (raw-dt sun) returns with no
data residue (no persisted state involved).

## Definition of Done

- All 10 tasks `[x]` with evidence; every MUST/SHALL verified.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e` green; `validate-state` PASS; file-audit clean.
- R-9 CLOSED; `PARITY_MATRIX.md` C272 row exact; PROGRAM_STATE 272 VERIFIED.
- Published to `origin/main`; final report with SHAs.

## Advancement gate

100% tasks (floor 90% only via explicit Advancement Exception proving
non-blocking + no MUST/SHALL gap). 258 MUST NOT be marked VERIFIED; no
headed work; 259–271 stay VERIFIED.
