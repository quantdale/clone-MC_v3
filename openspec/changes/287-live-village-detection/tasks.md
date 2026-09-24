# Tasks: 287-live-village-detection

## A. Control plane

- [x] T1. Author complete OpenSpec package under
  `openspec/changes/287-live-village-detection/` (proposal, design, tasks,
  verification, capability spec, OVERRIDE_DRAFT); pass SPEC_AUTHORING_PROTOCOL
  quality gate.
- [x] T2. Add CHANGE_SEQUENCE row + live OVERRIDES addendum; set PROGRAM_STATE
  so 287 is the sole ACTIVE change; 258 stays BLOCKED; 259–286 stay VERIFIED.

## B. Pure detection rules

- [x] T3. Implement `VillageDetectionRules` with pinned constants, Chebyshev
  bed scan, loaded-column-only probe, deterministic center, containsPlayer
  bound, cell cap, and `shouldResampleVillage`.
- [x] T4. Unit tests: no beds → null; one bed in range → context + contains;
  out-of-range bed → null; unloaded column skipped; determinism; invalid
  player coords; cap; resample matrix.

## C. Game wiring

- [x] T5. Wire live detector as production default behind `villageQuery`;
  `setVillageQuery(null)` restores live default; explicit override bypasses
  detector; cache with resample ticks/move threshold; pause/loading/disposed
  skip scan; probe fail-closed to null.
- [x] T6. Dispose/boot/reset clear cache and restore live default; no new
  persistence namespace.
- [x] T7. Update any 285 unit tests that assumed constant-null default so they
  inject `() => null` when absence is required; keep fixture paths green.

## D. Browser E2E

- [x] T8. Add `tests/e2e/village-detection.spec.ts`: place qualifying bed(s)
  near player, grant omen, evaluate/tick → raid starts and omen clears; with
  no beds (or forced null query) → no raid.

## E. Gates and release

- [x] T9. Focused unit + e2e green; record commands in verification.md.
- [x] T1.. Full baseline: typecheck, lint, `npm test`, build, `npm run test:e2e`,
  file-audit, validate-state; document visual SwiftShader variance honestly;
  kill hung Playwright after ~20 min no progress.
- [x] T1.. Reconcile artifacts; mark tasks [x]; VERIFIED 100%; set C287 exact;
  commit; land on main; `git push origin main` (no force); confirm local =
  origin; set nextExactAction to author 288 package (do not author/implement
  288).
