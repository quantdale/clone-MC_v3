# Tasks: 256-production-readiness-hardening

## Audit

- [ ] 1. Run baseline gates at `4c7d2a4` and record counts: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `node scripts/validate-state.mjs`, `node scripts/gen-file-audit.mjs`, `node scripts/orphan-check.mjs`; grep `TODO|FIXME|as any|@ts-ignore|void [a-z]` — triage into verification.md.
- [ ] 2. Produce audited dead-code/YAGNI/magic-number/hardening backlog with file:line and disposition.

## Hardening — constants and helpers

- [ ] 3. Extract named constants in `src/engine/Game.ts`: `WITHER_XP_REWARD=50`, `WITHER_SKULL_CAP=12`, `WITHER_MELEE_COOLDOWN_TICKS=10`, `WITHER_EFFECT_PERIOD_TICKS=40`, `TOAST_DURATION_MS=1500`, `FPS_SAMPLE_INTERVAL_S=0.5`, `WITHER_TARGET_PLAYER_ID=9999` with JSDoc.
- [ ] 4. Consolidate headless check: add `isHeadlessSession()` helper and make `runtimeRenderDistance()`/`runtimeSimulationDistance()` delegate to it.
- [ ] 5. Typecheck after constants/helpers slice.

## Hardening — presentation and noise

- [ ] 6. Extract wither boss-bar styling from `style.cssText` to `src/styles.css` (`#wither-boss-bar`, `#wither-boss-bar-fill`); update `Game.ts` to use `classList` and bounded `fill` width mutation only.
- [ ] 7. Remove `void message;` noise and harden floating promises: `void this.selfOpenPromise.then(...).catch(...)` and `void this.selfOpenPromise.then(...).catch(...)` in `start()` with failure fallback.
- [ ] 8. Typecheck after presentation/noise slice.

## Hardening — type safety and error handling

- [ ] 9. Remove double cast `(this.persistenceImpl as unknown as { initialWithers: unknown[] })` — read `initialWithers` via typed accessor with `?? []` fallback.
- [ ] 10. Remove `as unknown as import('../world/CollisionResolver').ShapeWorld` — type `shapeWorld` via imported `ShapeWorld` and correctly implement `getCollisionShape` via `VoxelShape.EMPTY` + `blockShapes.getCollisionShape`.
- [ ] 11. Clarify `src/main.ts` `persistence.open()` catch comment to state degraded memory-only play and health banner surfacing.
- [ ] 12. Typecheck and lint after type/error slice.

## YAGNI pruning

- [ ] 13. Delete or justify every orphan/YAGNI finding from the audit; prove every retained export has a live importer or registry-driven test; typecheck must stay green.
- [ ] 14. Grep final sweep: `TODO|FIXME|as any|@ts-ignore|void [a-z]` must be 0 or triaged.

## Optimization and docs

- [ ] 15. Measure or justify any optimization; if bundle warning is addressed, add `manualChunks` with before/after sizes; otherwise acknowledge and keep 195 modules.
- [ ] 16. Update `CHANGE_SEQUENCE.md` post-terminal row for 256 and reconcile `openspec/PROGRAM_STATE.md` bullets.

## Verification

- [ ] 17. Run `npm run typecheck` — PASS.
- [ ] 18. Run `npm run lint` — PASS.
- [ ] 19. Run `npm test` — 377 files, 4559+1 PASS.
- [ ] 20. Run `npm run build` — 195 modules PASS.
- [ ] 21. Run `node scripts/validate-state.mjs` and file-audit — PASS.
- [ ] 22. Smoke the production bundle (preview or headless E2E smoke) — `worldReady` and HUD/boss-bar present.
- [ ] 23. Record all requirement evidence, command outputs, Git HEAD, and blockers in `verification.md`; mark `PROGRAM_STATE.json` VERIFIED and advancement allowed when all MUST/SHALL pass.
