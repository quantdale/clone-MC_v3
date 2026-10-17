# Verification: 303-renderer-lifecycle-unit-coverage

Status: VERIFIED
Completion: 100%
Advancement allowed: true
Session start head: `95b758e7302eb1f17f4daaa848e36ceb5d41828f` (origin/main after change 302)
Published head: `88d53d897ab740d06032bb86e00716c9387356a7` (origin/main verified equal after a normal history-preserving push)

## Summary

Audit finding F-007 is closed. `src/engine/Renderer.ts` had **zero** unit coverage:
no test imported it, its only consumer was the DOM-bound `Game.ts`, and it carried
a `c8 ignore` block around its own test-only freeze methods, so **0%** of it was
executed by `npm test`. Its untested surface was exactly the part that produces a
black screen after a GPU reset — no-WebGL fail-closed construction and the
`webglcontextlost` / `webglcontextrestored` lifecycle.

A defaulted, test-tagged construction seam plus a deterministic headless suite now
measure:

| Metric | Before | After |
|---|---|---|
| Statements | **0%** | **100%** (79/79) |
| Branches | **0%** | **90.62%** |
| Functions | **0%** | **100%** |
| Lines | **0%** | **100%** |

Production behaviour is unchanged: the default is the exact shipped
`new THREE.WebGLRenderer({canvas, antialias: true, powerPreference:
'high-performance'})` call.

## The seam (`src/engine/Renderer.ts`)

```ts
export type WebGLRendererFactory = (canvas: HTMLCanvasElement) => THREE.WebGLRenderer;

export const createDefaultWebGLRenderer: WebGLRendererFactory = (canvas) =>
  new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
```

The constructor gained a fifth, **defaulted** parameter, so no caller changes:

```ts
constructor(
  canvas, onContextLost?, onContextRestored?,
  dynamicResolution = new DynamicResolutionController('medium'),
  webglFactory: WebGLRendererFactory = createDefaultWebGLRenderer,   // new, defaulted
)
```

Both construction sites (initial and `handleContextRestored`) now call
`this.webglFactory(...)` instead of `new THREE.WebGLRenderer({...})` with the
identical argument object. The diff is four surgical hunks:

| Hunk | Change |
|---|---|
| 1 | the factory type + default implementation (extracted verbatim from the old inline call) |
| 2 | one private field and one defaulted constructor parameter |
| 3 | initial construction → `this.webglFactory(canvas)` |
| 4 | restoration construction → `this.webglFactory(this.canvas)` |

No configuration, threshold, shadow/colour-management policy, resize, pixel-ratio,
dispose or context-event behaviour was touched. `Game.ts` is the only caller and
passes four arguments, so it is unaffected by construction.

**Default-path identity proof.** The default factory body is character-for-character
the object literal the constructor previously contained, and the suite asserts the
default is a real factory (a `null` canvas makes Three.js itself throw), so the
shipped path is the production call — not a stub.

## `tests/unit/Renderer.test.ts` — 27 tests, all pass

Headless (`environment: 'node'`, no jsdom). Three seams:

1. a **recording fake** standing in for `THREE.WebGLRenderer` (spies on `dispose`,
   `setPixelRatio`, `setSize`, `getDrawingBufferSize`, `render`, plus the
   colour-management/shadow fields);
2. a **canvas stub** that records `webglcontextlost` / `webglcontextrestored`
   listeners, so dispose's listener removal is observable;
3. `vi.stubGlobal` for `window`/`navigator`, because `globalThis.navigator` is a
   **getter-only** property in Node and plain assignment throws (`TypeError:
   Cannot set property navigator of #<Object> which has only a getter` — observed
   and fixed; `vi.unstubAllGlobals()` restores it).

Coverage by requirement:

| Requirement | Tests |
|---|---|
| No-WebGL fail-closed construction | factory throws → `rendererCreated === false`, `renderer === null`, scene **and** camera still constructed (so `Game` can enter its init-error state), `render()` is a no-op, `actualDrawingBufferSize()` is `{0,0}`, `resize()` still updates the camera aspect |
| Context loss | marks unusable, calls `event.preventDefault()` exactly once, notifies the callback, does not render while lost |
| Context restoration | disposes the old renderer exactly once, builds a working replacement, **re-applies** the configuration (colour space, tone mapping, shadow type), notifies, renders again |
| Restoration **failure** | stays fail-closed (`rendererCreated === false`, `renderer === null`), does not throw, **still fires** the restored callback so the game can leave its loss-pause state, and reports a zero buffer |
| Dispose completeness | disposes once, clears `renderer`, sets `rendererCreated = false`, removes **both** listeners; no-renderer path safe; no render after dispose |
| Dispose idempotency | a second `dispose()` does not re-dispose and does not throw |
| Pixel-ratio capping | standard DPR 8 → `min(8, CONFIG.maxPixelRatio)`; `navigator.webdriver` → `min(8, CONFIG.headless.maxPixelRatio)`; asserts the headless cap is never looser than the standard cap |
| Resize clamp | height `0` → `setSize(w, 1)` and `aspect === w`; normal resize applies width/height and the aspect ratio |
| Drawing-buffer size | floors fractional sizes (255.9 → 255); clamps negatives to 0 |
| Frozen dynamic resolution | both freeze hooks stop adaptive change and report `reason: 'at-bound'`; **plus** an unfrozen case that drives a sustained 900 ms overload until the controller accepts a scale change and asserts `setSize` was called (covers the `if (update.changed) applyDynamicResolutionSize()` branch); an invalid metric is ignored without resizing; `setDynamicResolutionTier` applies the new size |
| Configuration | `outputColorSpace === SRGBColorSpace`, `toneMapping === ACESFilmicToneMapping`, exposure `1.05`, `shadowMap.type === PCFSoftShadowMap`, `shadowMap.enabled === CONFIG.rendering.shadows` |

An early draft used the wrong metric field (`averageFrameTimeMillis` instead of
`p95FrameTimeMillis`), which silently routed every update through the
`invalid-metric` path and left the changed-scale branch uncovered. That was
caught by re-measuring per-file coverage (94.93% → then 100%) rather than trusting
the green suite, and fixed.

## `vitest.config.ts` stale note corrected

The config carried, since 2026-08-31, the claim:

> plus Renderer.ts remains 0% unit-covered (E2E-only). Threshold 91 not reachable
> without Renderer unit harness; 90 is accepted debt until Renderer is unit-covered
> or excluded from coverage. statments/lines 84 holds.

That note is now stale on two counts: the thresholds were re-pinned for Vitest 4
(91/88/94/93) after it was written, and Renderer.ts is fully covered. It is
replaced with an explicit closure note recording the new measurements. **No
threshold was lowered** — the floors remain 91/88/94/93.

## Effect on the repository coverage gate

All four aggregate metrics improved, which is the direct consequence of removing a
0%-covered 221-line product file from the denominator:

| Metric | Before 303 | After 303 | Floor |
|---|---|---|---|
| Statements | 91.82 | **91.84** | 91 |
| Branches | 88.61 | **88.62** | 88 |
| Functions | 94.65 | **94.66** | 94 |
| Lines | 93.15 | **93.17** | 93 |

## Commands (final, `303` candidate tree)

| Command | Result |
|---|---|
| `npx vitest run tests/unit/Renderer.test.ts` | **PASS — 27 tests** |
| per-file coverage of `src/engine/Renderer.ts` | **100 / 90.62 / 100 / 100** (statements/branches/functions/lines) |
| `npm run verify:deps` | **PASS** — 171 packages verified |
| `npm run verify:file-audit` | **PASS** — 3081 rows |
| `npm run validate-state` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS — 0 errors / 85 warnings** (unchanged) |
| `npm test` | **PASS — 483 files, 5793 passed + 1 skipped, exit 0** |
| `npm run test:coverage` | **PASS — 91.84 / 88.62 / 94.66 / 93.17** vs 91/88/94/93 |
| `npm run test:perf:multiplayer` | **PASS** (unchanged by this change) |
| `npm run build` | **PASS — 2.29 s** |
| `node scripts/check-release-bundle.mjs` | **PASS — 4 assets checked; no E2E hook found** |
| `npm run test:e2e` | **PASS — 137/137, exit 0**, including the 60-cell visual matrix |
| `node scripts/validate-file-audit.mjs <manifest>` | **PASSED — 3081 rows** |

## Edge/adversarial validation

- [x] Construction failure leaves the object usable (scene/camera built).
- [x] Restoration failure does not throw and does not leave a dangling renderer.
- [x] The restored callback fires on **both** success and failure (no hang).
- [x] `dispose()` is idempotent and removes both listeners.
- [x] Rendering is impossible while lost, after dispose, or without a renderer.
- [x] Pixel-ratio capping respects the headless cap and never exceeds the standard one.
- [x] Zero/negative viewport heights and negative buffer dimensions never produce
      invalid numbers.
- [x] An invalid resolution metric does not resize.
- [x] `globalThis.navigator` restoration is handled via `vi.unstubAllGlobals`.

## Migration/compatibility

- [x] The constructor's new parameter is **defaulted and trailing**, so the only
      production caller (`Game.ts`) compiles and behaves unchanged.
- [x] No rendering behaviour, configuration, threshold, golden, dependency or
      product-visible change.
- [x] `git diff --numstat -- tests/visual-golden/` is empty (no golden churn).
- [x] No DOM-emulation dependency added (the suite runs in the existing `node`
      environment with fakes).

## Performance/resource validation

- [x] The suite runs in ~0.3 s and adds no measurable cost to `npm test`.
- [x] No production bundle impact (`check-release-bundle.mjs` passes; the seam is a
      const arrow that Three.js already called through the same object literal).

## Regression / debt status

- No regression introduced. R-8/R-9-era debt is unaffected.
- Remaining audit finding: **304** (modal focus and keyboard accessibility).
- `258-real-world-runtime-performance-fps-recovery` remains **BLOCKED** at
  40/100. No headed FPS work, no GPU evidence, no 258 status change.

## Advancement Exception

Not required: every task is complete, every MUST/SHALL requirement in
`specs/renderer-lifecycle-coverage/spec.md` has passing evidence above, all
mandatory tests pass, and no unresolved data-loss, corruption, determinism,
compatibility, security, or regression blocker remains.

## Final decision

**VERIFIED.** `Renderer.ts` moved from 0% to 100% statement / 90.62% branch / 100%
function / 100% line coverage through a defaulted seam whose default path is the
shipped call, with the no-WebGL, context-loss, restoration-failure, dispose and
pixel-ratio branches now pinned deterministically headlessly.
