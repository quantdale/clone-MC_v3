# Proposal: 303-renderer-lifecycle-unit-coverage

## Problem

`src/engine/Renderer.ts` — the class that owns the Three.js scene, camera and
WebGL renderer for the entire game — has **zero unit tests**. It is imported
only by `src/engine/Game.ts` and by no test in the repository.

```
$ grep -rln "engine/Renderer" tests/
(no matches)

$ grep -rln "engine/Renderer\|from './Renderer'" src/
src/engine/Game.ts
```

The repository has already accepted this as debt, in its own coverage
configuration comment:

```
// 2026-08-31 (f8d9991): branches dip to 90.68% due to 4 new test-only hooks
// (Game.testIsWorldReady/testFreezeDynamicResolution, Renderer.testFreezeAtMaxScale/
// testFreezeDynamicResolution, DynamicResolution.setScaleForTest) that are
// E2E-covered (visual determinism, 51/51) and c8-ignored for unit branches;
// plus Renderer.ts remains 0% unit-covered (E2E-only). Threshold 91 not reachable
// without Renderer unit harness; 90 is accepted debt until Renderer is unit-covered
// or excluded from coverage.
```

That debt note is now stale in two ways: the `branches` floor has since been
re-pinned to `88` under Vitest 4 (change 299 / AUDIT-009), and `Renderer.ts` is
still `0%` unit-covered four months later.

The class contains genuinely testable, failure-critical logic that currently has
no fast, deterministic unit coverage:

1. **WebGL-unavailable fallback.** The constructor wraps `new THREE.WebGLRenderer`
   in try/catch and sets `rendererCreated = false` so the game can enter its
   init-error state instead of crashing. That branch is only exercised in a
   browser E2E or on a real no-WebGL machine.
2. **Context-loss / context-restore lifecycle.** `webglcontextlost` sets
   `rendererCreated = false` and invokes the callback; `webglcontextrestored`
   disposes and **recreates** the renderer, re-running `configureRenderer`, and
   invokes the restore callback. A defect here is a game-killing black screen
   after a GPU reset — precisely the class of bug the visual E2E cannot reliably
   reproduce (the change record notes GPU-context-restore drift between runs).
3. **Dispose semantics.** `dispose()` removes both canvas listeners, disposes
   the renderer, and nulls it. Double-dispose and post-dispose listener behavior
   are not unit-pinned.
4. **Headless pixel-ratio capping.** `applyPixelRatio` caps at
   `CONFIG.headless.maxPixelRatio` when `navigator.webdriver` is set and at
   `CONFIG.maxPixelRatio` otherwise, then multiplies by the dynamic-resolution
   scale. This is a correctness/performance contract that is only observable in a
   browser.
5. **`resize`, `actualDrawingBufferSize`, `render`, tier change** — all
   DOM/WebGL-coupled with no unit harness.

The coverage-threshold comment also cites `Renderer.testFreezeAtMaxScale` and
`Renderer.testFreezeDynamicResolution` as "test-only hooks … E2E-covered … and
c8-ignored for unit branches". Those are real test-only seams inside the class.

## Inspection findings (base `2ecf781`)

- `src/engine/Renderer.ts` is 221 lines and is imported only by `src/engine/Game.ts`.
  No file under `tests/` imports it.
- It contains the `c8 ignore start/stop` block around the two test-only freeze
  methods (`testFreezeDynamicResolution`, `testFreezeAtMaxScale`), confirming the
  author expected them to be unit-reachable but excluded them from branch
  counting because no unit harness existed.
- `vitest.config.ts` still carries the 2026-08-31 comment asserting
  "Renderer.ts remains 0% unit-covered (E2E-only)" while the `branches` floor is
  now `88` (re-pinned 2026-09-18), so the comment's reasoning ("Threshold 91 not
  reachable without Renderer unit harness") no longer matches the configured
  threshold set.
- The 4 existing `tests/unit/*Renderer.test.ts` files cover the **entity**
  renderers (`src/rendering/PassiveMobRenderer.ts`, `HostileMobRenderer.ts`,
  `RaiderRenderer.ts`, `SplashPotionRenderer.ts`) — **not** `src/engine/Renderer.ts`.
- The change record shows GPU-context-restore behaviour was a recurring source of
  E2E instability (e.g. change 254's "GPU-context restore drift 5 vs 4"), which
  is precisely the behaviour that a deterministic unit test could pin.

## Goals

1. Give `src/engine/Renderer.ts` deterministic unit coverage of its
   lifecycle and failure behaviour by introducing a headless test seam (a
   DOM/WebGL double) rather than a real WebGL context.
2. Pin the behaviours that are currently only observable in a browser:
   WebGL-unavailable fallback, context-loss/restore, dispose idempotency,
   headless pixel-ratio capping, resize, drawing-buffer size, and the
   dynamic-resolution integration.
3. Remove the stale 0%-coverage debt note and re-pin the comment to the current
   threshold reality.
4. Make the WebGL/context handling testable **without weakening production
   behaviour** (the production path must stay identical; only the *construction
   seam* becomes injectable for tests).

## Non-goals

- No change to production rendering behaviour, colours, tone mapping, camera
  parameters, or pixel-ratio policy.
- No change to coverage thresholds (the measurement may rise; this change does
  not lower any floor).
- No new coverage for other DOM/Three-coupled classes beyond what is needed to
  exercise `Renderer`.
- No 258 headed hardware-WebGL work; these tests are headless/deterministic.
- No change to the visual goldens (no rendered output changes).

## Preconditions

- 299 (matching toolchain) recommended so the coverage measurement is valid on
  the locked provider.

## Dependencies

- 299: the coverage re-pin and the "c8 ignore" review are only meaningful under
  the calibrated provider. Land 299 first.

## Proposed change

### 1. Introduce a minimal WebGL/DOM test seam (test-only, no production behaviour change)

Add a test-only module `tests/support/rendererDom.ts` providing a
`HTMLCanvasElement`-shaped double and a controllable `THREE.WebGLRenderer`
factory. Because `Renderer.ts` constructs `THREE.WebGLRenderer` directly, the
production code needs one injectable seam. Two options:

* **Preferred:** add an optional, defaulted static/constructor injection point on
  `Renderer` — e.g. a module-level, `test`-tagged `Renderer.webglFactory`
  override defaulting to `(opts) => new THREE.WebGLRenderer(opts)`. The default
  path is byte-identical to today; tests replace the factory. This keeps the seam
  tiny and does not change any call site in `Game`.
* Acceptable: `vi.mock('three', …)` in the test file. Heavier and more brittle;
  prefer the factory seam.

Also provide a `window`/`navigator` double (the class reads
`window.innerWidth/innerHeight`, `window.devicePixelRatio`, and
`navigator.webdriver`).

### 2. Add `tests/unit/Renderer.test.ts` covering the pinned behaviours

Deterministic, no real WebGL required:

* **Construction success**: renderer created, `rendererCreated === true`,
  `configureRenderer` applied (SRGB output colour space, ACES Filmic tone
  mapping, exposure 1.05, shadow-map type, initial size).
* **Construction failure (no WebGL)**: factory throws → `renderer === null`,
  `rendererCreated === false`, no uncaught exception, both listeners still
  attached (so a later restore can attach).
* **Context lost**: dispatch `webglcontextlost` → `rendererCreated === false`,
  `onContextLost` callback fired, event default-prevented.
* **Context restored (success)**: dispatch `webglcontextrestored` → previous
  renderer disposed, a new renderer created, `configureRenderer` re-applied,
  `rendererCreated === true`, `onContextRestored` fired.
* **Context restored (failure)**: new factory throws → `rendererCreated === false`,
  `onContextRestored` still fired, no crash.
* **Dispose**: renderer disposed, both listeners removed, `rendererCreated`
  false; a second `dispose()` is a safe no-op (idempotent).
* **Headless pixel-ratio capping**: with `navigator.webdriver` true, pixel ratio
  is capped at `CONFIG.headless.maxPixelRatio`; with it false, at
  `CONFIG.maxPixelRatio`; both multiplied by the dynamic-resolution scale.
* **Tier change / dynamic resolution**: `setDynamicResolutionTier` updates the
  controller and re-applies size; `updateDynamicResolution` when frozen returns
  `{ changed: false, valid: true, effectiveFrameTimeMillis: null }` and does not
  re-apply size.
* **Resize**: renderer size and camera aspect update, height clamped to ≥ 1.
* **Drawing-buffer size**: returns the physical buffer size (floored, ≥ 0), and
  `{0,0}` when the renderer is null.

### 3. Reconcile the coverage configuration comment

Replace the stale 2026-08-31 `Renderer.ts remains 0%` debt note with the current,
accurate statement and the new measurement, and remove any now-unnecessary
`c8 ignore` blocks if the freeze methods become unit-reachable.

### 4. Re-pin the coverage comment honestly

After the coverage run under the locked toolchain, update the measured baseline
and any threshold note to reflect reality. Do not relax any floor to make the
run pass.

## Compatibility and migration

- The only production edit is a **defaulted, test-tagged injection point** whose
  default is exactly today's behaviour. No saved data, no API used by `Game`
  changes.
- No visual output change → no golden re-pin.
- No product behaviour change.

## Risks

- **Injection seam leaks into production.** Mitigation: the seam defaults to the
  real factory and is clearly marked test-only; the factory override is set only
  in tests. A unit test asserts the default path constructs a real renderer.
- **`vi.mock('three')` brittleness.** Mitigation: prefer the factory seam; if
  mocking is unavoidable, mock only `THREE.WebGLRenderer` and keep the rest real.
- **Coverage thresholds moving.** Adding covered code can *raise* coverage, but
  if the new `Renderer` coverage exposes previously-uncovered branches elsewhere,
  the numbers can shift. Record the actual measurement; never lower a floor to
  pass.

## Rollback strategy

Revert the seam and the test file. The coverage comment can be restored. No
product behaviour to roll back.

## Definition of Done

- `src/engine/Renderer.ts` has deterministic unit coverage of construction
  (success + no-WebGL), context-loss/restore (success + failure), dispose
  (incl. idempotency), headless pixel-ratio capping, resize, drawing-buffer size,
  and the dynamic-resolution integration.
- `npm run test:coverage` (under the locked toolchain) reports a Renderer.ts
  coverage strictly greater than 0%, with no threshold relaxed.
- The stale "Renderer.ts remains 0% unit-covered" debt note is corrected.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run validate-state`, `npm run test:e2e` all PASS.
- No committed golden PNG changes.

## Advancement gate

All mandatory gates PASS on the candidate SHA, and the measured Renderer.ts
coverage is greater than 0%. Completion target 100%; below 90% advancement is
forbidden. A run that only adds the tests but leaves the stale coverage comment
or fails to improve the measurement is not complete.
