# Verification: 260-live-brewing-stand-production-integration

Status: VERIFIED
Completion: 100% (19/19)
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| T1 control plane | `git diff` of overrides/sequence/state; session_start_head `a1a734c` = origin/main | PASS |
| T2 package gate | `node scripts/validate-state.mjs` PASS at `a1a734c`; proposal 11/11, design 14/14, spec MUST/SHALL scenarios, no normative placeholders | PASS |
| BREW-1 place | T3 registry unit (block 62 + placeBlock item 64) + T4 host unit (place/remove/idempotence) + T12 E2E (place 62, host size 1) | PASS |
| BREW-2 open | T8 wiring (`use`+coords, `hasBrewing` guard, exclusivity) + T12 E2E (`#brewing` visible, hotbar hidden, block still 62, held untouched) + stale-use unit | PASS |
| BREW-3 insert | T7b 106 component-carry unit (BREW-3.2 carry per op, mismatch swap/no-merge, orphan clearing) + T7 panel unit (ordered quick-move with contents) + T12 E2E (real shift-clicks, host asserts) + abort-identity unit | PASS |
| BREW-4 brew+progress | 123 engine (existing) + T4 host tick unit (real 400-tick awkward+redstone→speed 480/1, fuel gating, safe pause, non-simulating freeze) + integration B (399+1 exact) + T6 progress-width unit + T12 live E2E brew | PASS |
| BREW-5 persist | T5 persistence unit (IDB save→flush→reopen with contents/timers, empty-snapshot, furnace coexistence) + integration C (snapshot→hydrate equality) + T12 E2E pagehide+reload field-for-field | PASS |
| BREW-6 break | T4 removal unit (exactly-once, re-persist) + integration E (contents out, empty snapshot, hydrate absent) + T9 `breakBrewingStand` wiring + T12 E2E (air, host 0, drops > 0, reload no-resurrection) | PASS |
| BREW-7 lifecycle | T10 wiring (upkeep, gates, toggle, relock, focus, death, dispose, exclusivity) + T7 cursor-settle unit + T13 E2E (walk-away close+overlay, blur keeps panel unstacked, destroy closes+overlay) | PASS |
| BREW-8 E2E | `tests/e2e/brewing.spec.ts` 2/2 headed (journey 1.3m + lifecycle) + full suite 66/66 | PASS |
| BREW-9 registries/art/pins | T3 unit (ids/names/stack/place/tiles/vocabulary) + matrix-hash + fingerprint suites unchanged green + `git status` binary check (none) | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| validate-state (T2/T15/T17) | PASS | `node scripts/validate-state.mjs` → `State validation PASSED` (package gate at `a1a734c`; final at publish HEAD) |
| typecheck (T15) | PASS | `npm run typecheck` (tsc --noEmit) clean |
| lint (T15) | PASS | `npm run lint`: 0 errors (85 pre-existing-pattern warnings) |
| unit (T15) | PASS | `npm test`: 400 files, 4779 passed + 1 skipped (new: BrewingRegistry 9, LiveBrewingHost 17, BrewingPanel 13, BrewingPersistence 3, MenuTransactionComponents 12, LiveBrewingIntegration 9) |
| build (T15) | PASS | `npm run build` (tsc + vite, 2.35s) |
| file-audit manifest (T14/T15) | PASS | 14 new-file rows appended surgically (224+/0-); `validate-file-audit.mjs` PASSED (2684 rows) |
| test:e2e brewing.spec (T12/T13) | PASS | 2/2 standalone (journey 1.3m full loop; lifecycle walk-away/blur/destroy) |
| test:e2e full suite (T16) | PASS | `npm run test:e2e`: 66/66 PASS (25.8m, single worker); slow files memory-stress 12.6m / visual 7.0m as before; `test-results/.last-run.json` {"status":"passed","failedTests":[]} |
| PARITY_MATRIX C260 (T14/T17) | PASS | C260 exact/VERIFIED row + summary (exact 243, total 256); `validate-state` PASSED |

## Edge/adversarial validation

- Corrupt/future-version brewing payloads → quarantine + sticky banner, boot continues, valid rows hydrate (LiveBrewingHost unit: future-version + malformed → {hydrated 0, quarantined 2}).
- Stale records (block ≠ 62 once simulating) → lazy removal + re-persist, no throw (host unit + integration G).
- Hostile batches: foreign typeKeys skipped, duplicate positions idempotent-skipped (not quarantined, furnace parity), bad envelopes/versions quarantined; furnace records untouched (host unit {hydrated 1, quarantined 2} + integration H cross-type independence).
- Vanished-stand menu write → `applyBrewingMenuSlots` null → panel ignores, inventory untouched (BrewingPanel unit).
- Unconvertible transaction result → whole-transaction abort, authority/inventory/cursor unchanged (panel unit with unknown-id stack).
- Full-inventory settle/spill → plain-item loot, contents-detach pinned by unit (accepted debt; follow-up = component-carrying entities).
- Water→awkward completion pause → 123 pinned behavior untouched (awkward→redstone is the live proof path).
- Mismatched-contents merges → swap (leftClick) / no-op (rightClick/placeOne) / skip (quickMove); component-less flows byte-identical (MenuTransactionComponents + 106/202/203 suites green).
- `has()` stays furnace-only (integration H pins `has(X,Y,Z) === false` for a stand).

## Migration/compatibility validation

- No stored/network format change: brewing rows reuse the 036 envelope (`typeKey 'brewing_stand'`, same version gate); old saves load via existing suites (full unit green); pre-260 builds skip unknown rows like any foreign typeKey.
- `PINNED_WORLDGEN_STATE_FINGERPRINT` unchanged by construction (closed 14-path generation-relevant set excludes the stand; suite green is the evidence); v2 matrix hash unchanged (terrain untouched).
- `has()` furnace-only preserved; no public signature changes (`brewingContext` dep optional; `MenuCursor.components` optional; AtlasGrid additive with re-exports).
- Pre-existing stands n/a (new block id 62).

## Performance/resource validation

- Open-panel frame cost: one block read + one distance check + one signature-gated render (zero-write second render pinned by unit); no timers/rAF/RNG in panel.
- Tick cost: simulating-chunk brewing instances only, equality short-circuit; fixed-tick slot shared with furnaces, stores independent.
- Atlas growth 64→80 tiles is construction-time only; existing tile UVs pixel-stable via single-sourced `AtlasGrid` (worker/main unified; float32-tolerant parity oracles).
- Headed FPS work explicitly untouched: 258 stays BLOCKED, no GPU evidence claimed here; full E2E suite run for regression confirmation (T16).

## Regressions

- Unit: full `npm test` green (400 files / 4779 passed + 1 skipped), incl. fingerprint/matrix-hash, block-state count formula, guard/furnace/interaction/inventory/worker-mesh suites — zero regressions. Characterization updates (179 precedent): BlockRegistry 51, BlockItemSeparation allowlist (+blaze_powder/potion), WorkerRegistryInitialization `ATLAS_ROWS` + float32 tolerance.
- E2E: full `npm run test:e2e` 66/66 green; brewing 2/2 standalone and in-suite.
- 258/259 files untouched (git status confirms); 123 engine semantics untouched (id-vocabulary realignment only; 123 suites symbolic-green).

## Incomplete tasks

None. 19/19 complete 2026-09-11.

## Advancement Exception

Not applicable (completion 100%).

## Final decision

VERIFIED — 19/19 tasks complete; every MUST/SHALL requirement evidenced by passing unit (63 new: registry 9 + host 17 + panel 13 + persistence 3 + components 12 + integration 9) and browser E2E (place→open→insert→brew→collect→reload→break + lifecycle); full gates green (typecheck/lint 0 errors/unit 4779+1/build 2.35s/e2e 66/66/file-audit 2684/validate-state); R-8 brewing half closed; no data-loss/corruption/determinism/compatibility/security/regression blocker; 258 untouched (stays BLOCKED, no headed work, no GPU evidence, not marked VERIFIED); 259 untouched (stays VERIFIED).
