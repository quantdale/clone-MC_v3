# Tasks: 292-player-status-effect-persistence

## A. Control plane

- [x] T1. Author complete OpenSpec package under
  `openspec/changes/292-player-status-effect-persistence/` (proposal, design,
  tasks, verification, capability spec, OVERRIDE_DRAFT); pass
  SPEC_AUTHORING_PROTOCOL quality gate.
- [x] T2. Add CHANGE_SEQUENCE row + live OVERRIDES addendum; set PROGRAM_STATE
  so 292 is the sole ACTIVE change; 258 stays BLOCKED; 259–291 stay VERIFIED.

## B. Codec + storage

- [x] T3. Implement `src/simulation/PlayerEffectsPersistence.ts`: constants,
  `normalizeBadOmen`, `refreshBadOmenDuration`, `tickBadOmen`,
  `serializePlayerEffects`, `parsePlayerEffects` (tolerant, clamped, dedupe,
  64-entry cap, never throws).
- [x] T4. Unit tests `tests/unit/PlayerEffectsPersistence.test.ts`: round
  trip, resume (no reset to full), caps/clamps, backward compat (absent),
  malformed/wrong version, mixed entries, dedupe, omen tick/expiry/refresh.
- [x] T5. Optional `effects` on `PlayerStateRecord` + `GamePlayerSnapshot`;
  passthrough in `validatePlayerStateRecord`, `savePlayerState`,
  `playerRecordToSnapshot`; unit tests for passthrough and absence.

## C. Game wiring

- [x] T6. Game: payload in `buildPlayerSnapshot`; `restorePlayerEffects` in
  `applyInitialPlayerState`; omen remaining counter (grant refresh, clear,
  consume, fixed-tick expiry); durable save points (HOTV grant + saveRaid,
  omen grant/clear, trigger consumption + saveRaid, expiry, respawn, HOTV
  debug clear); dispose resets omen after the final durable save; seams
  `getBadOmenRemainingSeconds`, `debugTickStatusEffects`,
  `getStatusEffectRestoreReport`.
- [x] T7. Live composition unit tests
  `tests/unit/LiveStatusEffectPersistence.test.ts` (real manager + codec +
  BadOmenRules; save→reload round trip; restored omen + village → raid start,
  patrol dismissed, omen consumed; Game source guards for save points and
  dispose ordering).

## D. Browser E2E

- [x] T8. New `tests/e2e/status-effect-persistence.spec.ts` (HOTV + omen
  survive pagehide/reload with resumed durations; restored omen inside a
  fixture village starts a raid next tick, dismisses patrol, consumed omen
  stays 0 after another reload); update reload assertions in
  `hero-of-the-village.spec.ts`, `pillager-patrol.spec.ts`,
  `bad-omen-acquisition.spec.ts`.

## E. Gates and release

- [x] T9. Focused unit + e2e green; record commands in verification.md.
- [x] T10. Full baseline: typecheck, lint, `npm test`, build,
  `npm run test:e2e`, file-audit, validate-state; document visual:176
  SwiftShader variance honestly (no golden churn); enchanting:227 green.
- [x] T11. Reconcile artifacts; C292 exact in PARITY_MATRIX; file-audit rows;
  VERIFIED 100%; fast-forward onto main; `git push origin HEAD:main` (no
  force); confirm local = origin; sync localHead/publishedHead;
  nextExactAction → author 293 package with candidate topics (not started).
