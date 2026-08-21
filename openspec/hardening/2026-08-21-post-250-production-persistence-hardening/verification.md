# Verification: Post-250 Production Persistence Hardening

Overall status: **VERIFYING** (implementation complete; full gate + publication pending)
Task completion: **see `tasks.md`** (sections 0-6 implemented and tested; 7-8 in progress)
Release readiness: **BLOCKED by this interlock until Gate F completes**

Historical note: Change 250's `READY`/`COMPLETE` artifacts remain as immutable historical evidence of the pre-remediation decision. For current release authority they are superseded by `CHANGE_SEQUENCE_OVERRIDES.md` and this package until this verification becomes VERIFIED.

## Baseline

- session_start_head: `471cf1eb5884a8e25c63c967cd0cf1d1ccc0a7d9` (= origin/main at session start; fast-forward from `63aae15`, clean tree)
- Baseline gates at session start (recorded 2026-08-21):
  - `npm run typecheck` PASS · `npm run lint` PASS
  - `npm test` PASS — 292 files / 3827 passed + 1 skipped
  - `npm run build` PASS (dist emitted; tsc runs inside build)
  - E2E baseline: cited from Change 250 evidence at `b56529e` (40/40) — valid because `git diff --stat b56529e..471cf1e -- src tests` is empty (byte-identical code tree; only openspec docs differ)
  - A green baseline is durability-neutral; it is recorded only to prove the starting point was healthy.
- Entry finding evidence reproduced against `471cf1e`:
  - **249-DL-001**: `src/engine/Game.ts` `saveEdits` (1523-1532) and `savePlayerState` (1534-1552) empty catches; `loadSavedEdits` (1488-1498) swallowed corrupt data. Additional latent defect found during remediation: the old `loadPlayerState` try/catch also silently swallowed a guaranteed `TypeError` (`this.experience.restore` ran before `ExperienceSystem` construction), so player-state restore had always been a silent partial failure — concrete proof the empty-catch pattern hid real breakage.
  - **249-DL-002**: `src/world/World.ts` `touchEditOverlay` (777-791) `this.editOverlay.delete(lruKey)` beyond 10,000 chunks deletes the sole authoritative copy.
  - **249-DL-005**: zero production imports of the 034-043/234 stack (repositories/queue/sink/coordinator used by tests only); shipped game wrote localStorage directly.

## Mandatory finding closure

| Finding | Entry state | Exit mechanism | Evidence | Status |
|---|---|---|---|---|
| 249-DL-001 | blocking/high/open at 249; accepted by 250 | structured failure handling via `GamePersistence` (classified errors, health monitor, persistent UI warning, bounded retry, no false success) | unit fault-injection suites + browser E2E quota/unavailable tests | RESOLVED (pending final gate) |
| 249-DL-002 | blocking/medium/open at 249; accepted by 250 | resident-cache/durability-ownership split: capture-on-edit into durable queue, eviction handoff, sync restore + async hydration on regeneration | >10,051-chunk deterministic churn test with exact per-cell equality through save/reload | RESOLVED (pending final gate) |
| 249-DL-005 | high/open at 249; accepted by 250 | live integration: `main.ts` composes + opens `GamePersistence`; `Game` consumes it; World wired via `WorldEditDurability`; localStorage write path deleted | production-composition unit tests + real-browser IndexedDB save/reload E2E | RESOLVED (pending final gate) |

Rarity, documentation-only scope, or product-decision acceptance cannot satisfy these rows.

## Remediation architecture (summary; normative details in `design-addendum.md`)

- DB schema v6: new `chunk-edits` store (`ChunkEditRecord`/`ChunkEditRepository`) holding faithful per-chunk sparse diffs — chosen because the legacy air-filled column format is lossy (cannot distinguish "edited to air" from "untouched") and truncated every edit at local y ≥ 16 (capacity 4096 vs chunk volume 16,384). Both defects fixed in `LegacyLocalStorageMigrator`.
- `SaveUnitKind` extended additively with `chunk-edits` + `player-state`; `RepositorySaveSink` routes them; queue dedup keeps one full-snapshot unit per dirty key (version-safe last-write-wins).
- `GamePersistence` facade = single composition root (six repos, DirtySaveQueue, monitoring sink, RepositorySaveSink, AutosaveCoordinator, StorageHealthMonitor over `createWorldStorageProbe`, LegacyLocalStorageMigrator with copy-then-verify + read-back + completion marker). All seams constructor-injected; no release-bundle test hooks.
- `World` separates resident overlay cache from durability ownership (`captureChunkEdits` / `retainEvictedChunkEdits` / `restorePendingChunkEdits` / async hydration).
- `Game`: localStorage authoritative path deleted; pagehide/dispose flush + 5 s periodic player-state enqueue; sticky boot-degraded flag cleared only by a verified committed flush; `#save-status` persistent banner (amber degraded / red failed).

## Gate A — production composition

Status: **PASS (unit-level) + browser-verified**

- `tests/unit/GamePersistence.test.ts` (13 tests): composition, marker-gated migration idempotency, corrupt-source degradation, durable-newer-than-legacy, capture→flush→loadCommitted round-trips, player-state dedup/reload, quota fault transitions ok→degraded→failed→recovery, private-mode classification, canWrite gating, 200-cycle boundedness, pagehide flush, dispose idempotency, structural `WorldEditDurability` conformance.
- `tests/unit/ProductionComposition.test.ts` (2 tests): REAL facade over mock factory + REAL World: legacy migration incl. index ≥ 4096 cell, 600 distinct-chunk edits captured durably, flush commit, second-facade reload with canonical equality (zero loss), quota-fault retention + verified recovery.
- Browser: `tests/e2e/persistence.spec.ts` #1 proves setBlock → flush → real-Chromium IndexedDB → reload restores block; asserts no `voxel-game-edits-v1:*` localStorage regression; #3 proves SecurityError boots memory-only with visible failed banner.
- Regression guard against dead/unwired components: E2E #1 exercises the exact production bundle path (`VITE_E2E=true` build of main.ts → GamePersistence → repos → IDB).

## Gate B — data-loss adversarial matrix

Status: **PASS** (unit + browser)

- normal save/reload: unit round-trips + E2E #1/#5 (pagehide abrupt-close then reload persists).
- quota failure + visible warning + retained dirty + recovery: GamePersistence tests + ProductionComposition fault test + E2E #2 (banner visible, dirty retained, verified recovery clears banner).
- unavailable/security-equivalent: E2E #3 (SecurityError → playable memory-only + failed banner + `lastFailureKind === 'private-mode'`).
- transaction abort/partial failure: covered by queue re-queue semantics tests (DirtySaveQueue/RepositorySaveSink/facade fault tests); partial-write axis additionally covered by pre-existing Change 240 recovery matrix (still green).
- corrupt payload handling: migrator corrupt-source tests + facade degraded-open tests (observable, source retained).
- **>10,000 distinct dirty-chunk churn**: `tests/unit/WorldEditDurability.test.ts` — 10,051 chunks edited deterministically; overlay capped ≤ 10,000; every evicted chunk retained by durability layer; exact per-cell canonical equality through save/reload including repeated early/LRU-candidate edits (newest version wins). Runtime ~0.8 s.
- repeated failures boundedness: facade 200-cycle test (queue ≤ distinct keys, listener set bounded, coalesced probes).
- legacy migration success/interruption/idempotency: migrator suite (16 tests) + facade marker/idempotency tests.

## Gate C — migration compatibility

Status: **PASS**

- Copy-then-verify: migrator writes faithful `chunk-edits` records + player state, reads back and verifies semantic equivalence; mismatch → error + record deleted; legacy localStorage never mutated; completion marker written only after error-free migration (facade), making repeats no-ops (MIGRATE-2) and interruption-safe (partial records overwritten identically on retry; source retained).
- Truncation regression fixed + tested: index ≥ 4096 cells survive (unit regression test at index 16000; E2E #4 seeds index 12000).
- Representative pre-hardening saves: E2E #4 loads a genuine v1 legacy edit+player snapshot in a real browser (blocks restored at decoded coords, yaw/pitch/position restored, keys retained).
- Corrupt/partial/repeated/already-migrated/durable-newer states: covered in migrator + facade suites.

## Gate D — regression/performance

Status: **PARTIAL — final run pending publication tree**

Recorded so far:
- `npm run validate-state` — **PASS** after fixing a discovered pre-existing defect: Change 250's terminal rewrite of `PROGRAM_STATE.md` dropped three bullets the validator parses (`Active implementation change`, `Next change`, `240 advancement allowed`), so the gate failed on the published tree at `471cf1e` too. Restored with validator-compatible truthful bullets (`None (hardening interlock …)` sanctioned form); nothing else altered.
- `npm run typecheck` PASS (post-integration tree, multiple runs)
- `npm run lint` PASS (post-integration tree)
- `npm test` PASS — 297 files / 3877 passed + 1 skipped (pre-E2E-fix tree)
- `npm run build` PASS (plain release build; also rebuilt under VITE_E2E=true by playwright webServer)
- `npm audit --omit=dev` / `npm audit` — pending final run
- `npm run test:e2e` — first full run 42/45 (39 pre-existing specs all green; 3 persistence specs blocked by the boot-order defect below); post-fix targeted re-run 5/6 — the 300-chunk churn test exhausted its 240 s budget on `page.evaluate` round-trip overhead (300 individual edits), not game work; spec restructured to a single in-page edit batch. Fresh full-suite run pending.
- Coverage thresholds (statements 85 / branches 91 / functions 95 / lines 85): pending final `npm run test:coverage`
- Change 247 release-performance gate: pending final run (suite included in `npm test`; dedicated confirmation at final gate)

Liveness hardening added during diagnosis: `AutosaveCoordinator.flush()` gained a hard
`FLUSH_MAX_ROUNDS = 128` cap so continuous concurrent `markDirty` traffic can never extend a
close-time flush indefinitely (progress-positive rounds previously reset the zero-progress guard
without bound). Unit test added (`flush is hard-bounded under continuous concurrent marking`).

Defect found by Gate B/C dynamic testing and FIXED at root:
- `Game.applyInitialPlayerState` consumed `this.experience` before its construction (injected-persistence path). Historically masked by the DL-001 empty catch (silent partial restore); after removing the silent catch it became a loud boot crash whenever persisted player state existed. Fix: `ExperienceSystem` constructed before any player-state application (`src/engine/Game.ts`). This is exactly the class of hidden failure the campaign exists to surface.

## Gate E — re-audit

Status: **PASS** — code audit + independent adversarial pass complete (`post-hardening-audit.md`).
DL-001/DL-002/DL-005 confirmed `resolved` with current-tree citations; DL-003 resolved; DL-004
preserved-unreachable; SEC-001 resolved (CI-enforced); REL-004 unchanged/non-blocking;
REL-006/PE-004 strengthened. Five new non-blocking findings surfaced by the independent pass were
all fixed or documented in-tree before publication (NEW-1..NEW-5 in `post-hardening-audit.md`).

## Gate F — publication/canonical proof

Status: **NOT RUN**

- [ ] intended remediation commit published to `origin/main`
- [ ] refetch proves exact published SHA
- [ ] canonical GitHub Actions run for exact SHA completes SUCCESS
- [ ] run/job IDs and results recorded here
- [ ] post-hardening release-readiness artifact names exact published SHA and supersedes historical Change 250 READY decision

SEC-001 interim evidence: plain `npm run build` + `node scripts/check-release-bundle.mjs` → "3 assets checked; no E2E hook found" (exit 0).

## Final verdict

**NOT VERIFIED.** Do not mark release READY while any mandatory finding or gate above is incomplete.
