# Verification: 303-renderer-lifecycle-unit-coverage

Status: NOT VERIFIED
Completion: 0% (T1 is pre-implementation evidence only; T2–T14 are open)
Advancement allowed: false

Authored by an audit campaign that is **forbidden from implementing code**. T1
records the measured baseline. No passing evidence is pre-filled.

## Pre-implementation evidence captured at base `2ecf781`

### E1 — `src/engine/Renderer.ts` has no unit test

```
$ grep -rln "engine/Renderer" tests/
(no matches)

$ grep -rln "engine/Renderer" src/
src/engine/Game.ts
```

`src/engine/Renderer.ts` is 221 lines and its only consumer is
`src/engine/Game.ts`.

### E2 — The four existing renderer tests cover a different subject

`tests/unit/` contains `PassiveMobRenderer.test.ts`, `HostileMobRenderer.test.ts`,
`RaiderRenderer.test.ts` and `SplashPotionRenderer.test.ts`. These cover the
**entity** renderers in `src/rendering/` (`PassiveMobRenderer.ts`,
`HostileMobRenderer.ts`, `RaiderRenderer.ts`, `SplashPotionRenderer.ts`), **not**
`src/engine/Renderer.ts`.

### E3 — The gap is documented as accepted debt, and the note is stale

`vitest.config.ts` (verbatim):

```
// 2026-08-31 (f8d9991): branches dip to 90.68% due to 4 new test-only hooks
// (Game.testIsWorldReady/testFreezeDynamicResolution, Renderer.testFreezeAtMaxScale/
// testFreezeDynamicResolution, DynamicResolution.setScaleForTest) that are
// E2E-covered (visual determinism, 51/51) and c8-ignored for unit branches;
// plus Renderer.ts remains 0% unit-covered (E2E-only). Threshold 91 not reachable
// without Renderer unit harness; 90 is accepted debt until Renderer is unit-covered
// or excluded from coverage. statments/lines 84 holds.
```

The note is stale in two ways: the configured floors are now
`{ statements: 91, branches: 88, functions: 94, lines: 93 }` (branches re-pinned
to 88 on 2026-09-18 per AUDIT-009), and `Renderer.ts` is still uncovered four
months later.

### E4 — The class already anticipates a unit harness

```ts
/* c8 ignore start - test-only freeze, E2E-covered (visual determinism), not unit-branch-reachable */
  /** Test-only: prevent further adaptive scale changes (keeps current scale). */
  testFreezeDynamicResolution(): void { … }
  /** Test-only: reset scale to max (1) and then freeze adaptive changes. */
  testFreezeAtMaxScale(): void { … }
/* c8 ignore stop */
```

### E5 — The uncovered logic and its failure modes

| Region | Contract | Consequence of an untested regression |
|---|---|---|
| constructor `try/catch` around `new THREE.WebGLRenderer` | no-WebGL → `rendererCreated = false`, no throw | crash on a machine without WebGL instead of the init-error state |
| `configureRenderer` | SRGB output, ACES Filmic, exposure 1.05, PCFSoft shadows, headless shadow disable, initial size | whole-game visual change, visible only to a golden/E2E |
| `handleContextLost` | `preventDefault()`, not-created, loss callback | game does not pause after a GPU reset |
| `handleContextRestored` | dispose old, recreate, reconfigure, restore callback | black screen after a GPU reset |
| `dispose` | remove both listeners, dispose, null | listener/GPU leak; double-dispose crash |
| `applyPixelRatio` | `min(devicePixelRatio, cap) * dynamicScale`, headless vs standard cap | wrong backing-store resolution |
| `updateDynamicResolution` frozen branch | `{changed:false, valid:true, effectiveFrameTimeMillis:null}`, no size re-apply | resolution thrash / frozen-scale regressions |
| `resize` | size + aspect, height clamped ≥ 1 | degenerate aspect on a zero-height viewport |
| `actualDrawingBufferSize` | floored, non-negative; `{0,0}` without a renderer | incorrect performance accounting |
| `render` | no-op without a renderer | throw on the no-WebGL path |

### E6 — This area has repeatedly destabilised the browser gate

The change record shows GPU-context behaviour producing E2E drift that a
deterministic unit seam would have localised — for example change 254's recorded
"E2E remains 50/51 (visual pass, **GPU-context restore drift 5 vs 4**)" and
change 281's recorded "one unrelated pre-existing hud/high/1280x720 Linux
software-WebGL golden drift".

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| WebGL-unavailable construction fails closed | E1/E5 show no test. T3/T5 unimplemented. | NOT VERIFIED |
| Context loss/restoration deterministic | E1/E5/E6 show no test. T3/T5 unimplemented. | NOT VERIFIED |
| Disposal complete and idempotent | E1/E5 show no test. T5 unimplemented. | NOT VERIFIED |
| Pixel ratio honours headless cap and scale | E1/E5 show no test. T5 unimplemented. | NOT VERIFIED |
| Presentation queries covered | E1/E5 show no test. T5 unimplemented. | NOT VERIFIED |
| Test seam defaults to production behaviour | No seam exists. T3 unimplemented. | NOT VERIFIED |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `grep -rln "engine/Renderer" tests/` | no matches | E1 |
| `grep -rln "engine/Renderer" src/` | `src/engine/Game.ts` only | E1 |
| `npm run typecheck` | PASS | see change 298 E1 |
| `npm run lint` | PASS (0 errors / 85 warnings) | see change 298 E1 |
| `npm run validate-state` | PASSED | see change 298 E1 |
| `npm test` | FAIL (2 unit tests) | see change 298; unrelated to this change |
| `npm run test:coverage` | **NOT RUN (deliberately)** | The installed provider is Vitest 3.2.7 while the thresholds were calibrated against 4.1.11 (see change 299). T2 must fix this before any coverage figure is recorded. |
| `npm run build` | NOT RUN | must PASS at T12 |
| `npm run test:e2e` | NOT RUN | must PASS at T12 |
| `git diff --numstat -- tests/visual-golden/` | NOT RUN | must be empty at T10 |

## Edge/adversarial validation (required at T5/T6/T8)

- [ ] Construction success configures colour space, tone mapping, exposure,
      shadow-map type and initial size, and attaches both listeners.
- [ ] Construction failure swallows the throw, reports not-created, leaves the
      renderer null, and **keeps both listeners attached**.
- [ ] Context loss marks not-created, fires the loss callback exactly once, and
      prevents the event default.
- [ ] Context restoration success disposes the previous renderer exactly once,
      constructs and re-configures a new one, and fires the restore callback once.
- [ ] Context restoration failure swallows the throw, reports not-created, and
      **still fires the restore callback exactly once**.
- [ ] Dispose releases the renderer and removes both listeners (proved by a
      subsequent context-restored event producing no reconstruction).
- [ ] Repeated dispose neither throws nor double-disposes.
- [ ] Pixel ratio: standard cap, headless cap, and below-cap device ratio, each
      multiplied by the dynamic-resolution scale.
- [ ] Resize clamps a zero/negative viewport height to 1 and reflects it in the
      camera aspect.
- [ ] Drawing-buffer size is floored/non-negative with a renderer and `{0,0}`
      without one.
- [ ] Frozen dynamic resolution returns no change and does not re-apply size.
- [ ] Render without a renderer does not throw.
- [ ] The seam default is restored after every test (a leak fails loudly).
- [ ] Measured Renderer.ts coverage is greater than 0% and no threshold was
      lowered.

## Migration/compatibility validation

- [ ] With no seam override, construction and behaviour are identical to before
      (asserted by T5 case 13 and by the unchanged E2E suite).
- [ ] `src/engine/Game.ts` requires no call-site change.
- [ ] `git diff --numstat -- tests/visual-golden/` is empty (no re-pin).
- [ ] No save-format or product-data change.

## Performance/resource validation

- [ ] The new tests require no GPU, no browser and no worker, and complete in
      milliseconds.
- [ ] The seam is consulted only at renderer construction, never per frame.
- [ ] `npm test` total duration is not meaningfully increased.

## Regressions

- None by design: the change adds one defaulted seam, one test-support module, one
  test file, and a coverage-comment correction.
- Known consequence to record: adding `src/engine/Renderer.ts` coverage can move
  the product coverage denominator. The measurement must be recorded honestly; if
  a figure falls below a floor, that is a finding to report, not a threshold to
  lower.

## Incomplete tasks

T2–T14 (13 of 14 tasks). Completion **0%** by checkbox count.

## Advancement Exception

Not applicable: completion is below 90%; advancement is forbidden.

## Final decision

**NOT VERIFIED.** `src/engine/Renderer.ts` — the class owning the game's scene,
camera and WebGL renderer — has zero unit tests, and its fail-closed no-WebGL
path, context-loss/restoration lifecycle, dispose semantics and headless
pixel-ratio capping are therefore verified only indirectly by a browser suite
whose own record shows GPU-context drift. The repository has carried this as a
documented coverage debt since 2026-08-31 without closing it. T2–T14 must be
implemented and the measured Renderer.ts coverage must be greater than 0% with no
threshold lowered before this change may be marked VERIFIED.
