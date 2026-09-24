# Tasks: 289-enchantment-persistence-reload-integrity

## A. Control plane

- [x] T1. Author complete OpenSpec package under
  `openspec/changes/289-enchantment-persistence-reload-integrity/` (proposal,
  design, tasks, verification, capability spec, OVERRIDE_DRAFT); pass
  SPEC_AUTHORING_PROTOCOL quality gate.
- [x] T2. Add CHANGE_SEQUENCE row + live OVERRIDES addendum; set PROGRAM_STATE
  so 289 is the sole ACTIVE change; 258 stays BLOCKED; 259–288 stay VERIFIED.

## B. Reproduce + root cause

- [x] T3. Reproduce: run enchanting e2e with `--repeat-each` (target ≥20) and
  record baseline failure rate; add a failing-first unit that demonstrates
  concurrent drain clobber (stale write wins) before the product fix.
- [x] T4. Confirm inventory codec round-trip is not the sole cause; document
  whether real players are affected and which components share the risk.

## C. Product fix

- [x] T5. Fix `DirtySaveQueue` with drain single-flight mutex + per-key epoch
  so concurrent drains cannot leave a superseded payload as the last durable
  write; skip superseded writes.
- [x] T6. On successful `applyEnchantingOffer`, call `savePlayerStateDurable()`.
- [x] T7. Unit regressions: concurrent latest-wins; round-trip every default
  stack component (enchantments, damage, potion_contents, can_destroy,
  can_place_on) on hotbar + storage.

## D. E2E integrity

- [x] T8. Harden `enchanting.spec.ts` reload leg to await a real persist
  signal (`persistence.flush` / pendingCount), not a sleep; keep product fix
  as the primary remedy.
- [x] T9. Re-run enchanting with `--repeat-each` (≥20); record after rate
  (goal: 0 failures on :227).

## E. Gates and release

- [x] T10. Focused unit + e2e green; record commands in verification.md.
- [x] T11. Full baseline: typecheck, lint, `npm test`, build, `npm run test:e2e`,
  file-audit, validate-state; document visual SwiftShader variance honestly;
  kill hung Playwright after ~20 min no progress. Do not claim VERIFIED if
  enchanting:227 still fails unless a different documented cause is proven.
- [x] T12. Reconcile artifacts; mark tasks [x]; VERIFIED 100%; set C289 exact;
  commit; land on main; `git push origin main` (no force); confirm local =
  origin; set nextExactAction to author 290 package (do not author/implement
  290) with 3–5 candidate topics.
