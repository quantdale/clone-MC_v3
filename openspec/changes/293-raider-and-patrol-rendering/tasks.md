# Tasks: 293-raider-and-patrol-rendering

## A. Control plane

- [x] T1. Author complete OpenSpec package under
  `openspec/changes/293-raider-and-patrol-rendering/` (proposal, design,
  tasks, verification, capability spec, OVERRIDE_DRAFT); pass
  SPEC_AUTHORING_PROTOCOL quality gate.
- [x] T2. Add CHANGE_SEQUENCE row + live OVERRIDES addendum; set PROGRAM_STATE
  so 293 is the sole ACTIVE change; 258 stays BLOCKED; 259–292 stay VERIFIED.

## B. Renderer

- [ ] T3. Implement `src/rendering/RaiderRenderer.ts`: kinds, `raiderKindOf`,
  `raiderFacing`, `projectRaiderRenderEntries`, shared resources, per-key
  group pool `sync` (add/update/rebuild/remove), `setVisible`, `getMeshes`,
  `resourceCounts`, idempotent `dispose`.
- [ ] T4. Unit tests `tests/unit/RaiderRenderer.test.ts`: projection (keys,
  captain, unknown/non-finite skipped), sync add/update/remove/rebuild, part
  counts + ravager size + captain marker, facing, visibility, 200-sync
  resource constancy, dispose-once/idempotent, empty ⇒ no children, module
  touches no lights/fog/atlas.

## C. Game wiring

- [ ] T5. Game: construct + `resources.track` the renderer; `syncRaiderRenderer()`
  once per rendered frame before `renderer.render()` over overworld ACTIVE
  raid + patrol entities and the patrol captain id; seams
  `getRaiderRenderState`, `debugSetRaiderMeshesVisible`; Game source guards in
  unit tests.

## D. Browser E2E

- [ ] T6. `tests/e2e/raider-rendering.spec.ts`: fresh world 0 groups; raid +
  forced patrol → groups = entities with matching kinds, one captain,
  rotation = expected facing; kill → removed; raid start dismisses patrol →
  patrol groups gone; clear to VICTORY → 0; dispose → 0; non-golden
  screenshot sanity (visible vs hidden differ more than a hidden baseline).

## E. Gates and release

- [ ] T7. Focused unit + e2e green; record commands in verification.md.
- [ ] T8. Full baseline: typecheck, lint, `npm test`, build,
  `npm run test:e2e`, file-audit, validate-state; document visual:176
  SwiftShader variance honestly (no golden churn); enchanting:227 green.
- [ ] T9. Reconcile design/spec with implementation facts (part/resource
  counts); file-audit rows; C293 exact in PARITY_MATRIX.
- [ ] T10. VERIFIED 100%; fast-forward onto main; `git push origin HEAD:main`
  (no force); confirm local = origin; sync localHead/publishedHead;
  nextExactAction → author 294 package with candidate topics (not started).
