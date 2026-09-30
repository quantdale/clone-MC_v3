# Design: 303-renderer-lifecycle-unit-coverage

## Context/current state

`src/engine/Renderer.ts` (221 lines) is the sole owner of the Three.js scene,
camera and WebGL renderer. `src/engine/Game.ts` is its only consumer; no test in
the repository imports it:

```
$ grep -rln "engine/Renderer" tests/          # (no matches)
$ grep -rln "engine/Renderer" src/            # src/engine/Game.ts
```

The class already carries a `c8 ignore` block around its two test-only freeze
methods, annotated as if a unit harness were expected:

```ts
/* c8 ignore start - test-only freeze, E2E-covered (visual determinism), not unit-branch-reachable */
  /** Test-only: prevent further adaptive scale changes (keeps current scale). */
  testFreezeDynamicResolution(): void { … }
  /** Test-only: reset scale to max (1) and then freeze adaptive changes. */
  testFreezeAtMaxScale(): void { … }
/* c8 ignore stop */
```

and `vitest.config.ts` records the gap as accepted debt:

```
// 2026-08-31 (f8d9991): … plus Renderer.ts remains 0% unit-covered (E2E-only).
// Threshold 91 not reachable without Renderer unit harness; 90 is accepted debt
// until Renderer is unit-covered or excluded from coverage.
```

That note is now doubly stale: the `branches` floor was re-pinned to `88` on
2026-09-18 (AUDIT-009), and `Renderer.ts` is still uncovered.

### The uncovered logic, and why it matters

| Region | Behaviour | Failure mode if it regresses |
|---|---|---|
| constructor try/catch around `new THREE.WebGLRenderer` | no-WebGL → `rendererCreated = false`, no crash | game crashes on a machine without WebGL instead of showing an init error |
| `configureRenderer` | SRGB output, ACES Filmic, exposure 1.05, PCFSoft shadows, headless shadow disable, initial size | whole-game visual change; only a golden or E2E would notice |
| `handleContextLost` | `preventDefault()`, `rendererCreated = false`, loss callback | game does not pause after a GPU reset |
| `handleContextRestored` | dispose old, recreate, reconfigure, restore callback | black screen after a GPU reset |
| `dispose` | remove both listeners, dispose renderer, null it | listener/GPU leak; double-dispose crash |
| `applyPixelRatio` | `min(devicePixelRatio, cap) * dynamicScale`, cap = headless vs standard | wrong resolution in headless E2E or on retina displays |
| `applyDynamicResolutionSize` / `updateDynamicResolution` / frozen branch | size re-application only on accepted change | resolution thrash or frozen-scale regressions |
| `resize` | size + camera aspect, height clamped to ≥ 1 | degenerate aspect on a zero-height viewport |
| `actualDrawingBufferSize` | floored, non-negative; `{0,0}` without a renderer | incorrect perf accounting |
| `render` | no-op without a renderer | throw on the no-WebGL path |

The change record shows this area has repeatedly produced E2E instability that a
deterministic unit test would have localised — for example change 254's recorded
"E2E remains 50/51 (visual pass, **GPU-context restore drift 5 vs 4**)", and
change 281's "one unrelated pre-existing hud/high/1280x720 Linux software-WebGL
golden drift". These are exactly the observations a unit seam makes
reproducible.

### Why the DOM/WebGL coupling blocks tests today

The class reads ambient browser globals directly:

```ts
const initialAspect = window.innerWidth / Math.max(1, window.innerHeight);
…
const headless = typeof navigator !== 'undefined' && navigator.webdriver;
this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, deviceCap) * …);
```

and constructs `THREE.WebGLRenderer` inline, twice (constructor and restore). A
unit test therefore needs both a `window`/`navigator` double and a way to
intercept renderer construction.

## Target state

1. One defaulted, test-tagged construction seam in `Renderer` so tests can supply
   a double renderer and simulate success and failure.
2. `tests/unit/Renderer.test.ts` pinning the whole table above, headless and
   deterministic.
3. The stale coverage comment corrected; `c8 ignore` blocks removed where they
   are no longer justified.
4. Measured Renderer.ts coverage greater than 0% under the locked toolchain, with
   no threshold lowered.

## Invariants

- With no seam override, construction and behaviour are byte-identical to today.
- The seam is consulted only at construction time (no per-frame cost).
- Production code under `src/` changes only by the addition of the defaulted
  seam.
- No rendered output changes; no golden re-pin.

## API and data model

Preferred seam shape — a module-level, test-tagged factory override whose default
is the real constructor:

```ts
// src/engine/Renderer.ts (added, defaulted)
type WebGLFactory = (opts: THREE.WebGLRendererParameters) => THREE.WebGLRenderer;

export class Renderer {
  /* c8 ignore start - test-only seam; default is the production constructor */
  /**
   * Test-only construction seam. Defaults to `new THREE.WebGLRenderer(opts)`.
   * Never read from user input or persisted data; replaced only by unit tests.
   */
  static webglFactory: WebGLFactory = (opts) => new THREE.WebGLRenderer(opts);
  /* c8 ignore stop */

  // …existing constructor, with:
  //   renderer = Renderer.webglFactory({ canvas, antialias: true, powerPreference: 'high-performance' });
  // in BOTH the constructor and handleContextRestored.
}
```

Why a `static` factory over a constructor parameter: `handleContextRestored`
reconstructs later and must use the same seam; a static keeps both call sites on
one override with no plumbing through `Game`. It also keeps the default path a
single expression.

Rejected alternative — a constructor parameter would have to be threaded into
restoration via instance state, widening the public signature for a test-only
need.

Test doubles (`tests/support/rendererDom.ts`):

```ts
export interface FakeRenderer {
  // records every call the class makes
  setPixelRatio(v: number): void;
  setSize(w: number, h: number, updateStyle?: boolean): void;
  getDrawingBufferSize(target: THREE.Vector2): THREE.Vector2;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
  outputColorSpace: string;
  toneMapping: number;
  toneMappingExposure: number;
  shadowMap: { enabled: boolean; type: number };
  // test-only inspection
  calls: string[];
  disposedCount: number;
}

export function installFakeRenderer(opts?: { throwOnConstruct?: boolean; buffer?: { x: number; y: number } }): FakeRenderer;
export function installWindowDouble(opts: { innerWidth: number; innerHeight: number; devicePixelRatio: number; webdriver: boolean }): void;
export function restoreAll(): void;   // removes the seam override + globals
```

The `window` double must be installed as a global for the duration of the test
and removed in `afterEach`, so no test leaks state into another.

## Control/data flow

```
Renderer (production, no override)
  constructor ──▶ Renderer.webglFactory({canvas, antialias, powerPreference})
                      default: new THREE.WebGLRenderer(opts)
                      test:    FakeRenderer (records calls; may throw)
    ├─ rendererCreated = renderer !== null
    ├─ if renderer: configureRenderer(renderer)
    │     ├─ outputColorSpace / toneMapping / exposure / shadowMap
    │     ├─ applyPixelRatio()   ── window.devicePixelRatio, navigator.webdriver,
    │     │                          DynamicResolutionController.getScale()
    │     └─ setSize(innerWidth, max(1, innerHeight))
    └─ canvas.addEventListener('webglcontextlost'|'webglcontextrestored')

webglcontextlost  ─▶ preventDefault(); rendererCreated = false; onContextLost?.()
webglcontextrestored ─▶ renderer?.dispose(); factory(...)  → rendererCreated = factory ok
                        if renderer: configureRenderer(renderer); onContextRestored?.()
dispose ─▶ removeEventListener ×2; renderer?.dispose(); renderer = null; created = false
```

## Detailed behavior

### Assertions to pin

**Construction (success)** — `rendererCreated === true`; the fake records
`outputColorSpace === THREE.SRGBColorSpace`,
`toneMapping === THREE.ACESFilmicToneMapping`,
`toneMappingExposure === 1.05`, `shadowMap.type === THREE.PCFSoftShadowMap`, and a
`setSize(innerWidth, max(1, innerHeight))` call; both listeners attached.

**Construction (failure)** — factory throws; no exception escapes;
`rendererCreated === false`; `renderer === null`; listeners still attached
(this is the subtle one: dropping the listeners would make later restoration
impossible).

**Context lost** — deliver the event; assert `rendererCreated === false`, the loss
callback fired exactly once, and `event.defaultPrevented === true`.

**Context restored (success)** — deliver the event; assert the previous fake's
`disposedCount === 1`, a *new* fake instance was constructed and re-configured,
`rendererCreated === true`, restore callback fired once.

**Context restored (failure)** — factory now throws; assert no exception escapes,
`rendererCreated === false`, and the restore callback **still** fired once (this
is the fail-closed contract that is easy to regress).

**Dispose** — `disposedCount === 1`, `rendererCreated === false`, listeners
removed (assert by delivering a context-restored event afterwards and observing no
re-construction), and a second `dispose()` neither throws nor double-disposes.

**Pixel ratio** — with `navigator.webdriver = true` and
`devicePixelRatio = 4`, `setPixelRatio` receives
`min(4, CONFIG.headless.maxPixelRatio) * scale`; with `webdriver = false`,
`min(4, CONFIG.maxPixelRatio) * scale`; with `devicePixelRatio = 0.5` below the
cap, `0.5 * scale`.

**Resize clamp** — `innerHeight = 0`; assert `setSize` received height `1` and
`camera.aspect === innerWidth / 1`.

**Drawing buffer** — fake returns `{x: 1919.7, y: 1079.2}`; assert
`{width: 1919, height: 1079}` (floored). With no renderer, assert `{0,0}`.

**Frozen dynamic resolution** — call `testFreezeDynamicResolution()` (or
`testFreezeAtMaxScale()`), then `updateDynamicResolution(now, metrics)`; assert
`{changed: false, valid: true, effectiveFrameTimeMillis: null}` and that
`setSize` was **not** called again.

**Render without renderer** — assert no throw.

## Failure modes

| Failure | Behaviour |
|---|---|
| Seam left overridden between tests | `afterEach` MUST restore the default and delete the globals; add an assertion that the default is restored so a leak fails loudly |
| Fake missing a method the class calls | Type the double against the used surface so a missing method is a compile error, not a runtime `undefined` |
| `navigator`/`window` missing in the node environment | The double installs both; the class already guards `typeof navigator !== 'undefined'`, so tests must assert both the guarded and unguarded paths explicitly |
| Coverage regression from removing `c8 ignore` | Re-pin from a real measurement; never add a new ignore to make numbers pass |

## Compatibility/migration

- The only production change is the defaulted `static webglFactory` and its two
  use sites. Default behaviour identical.
- No save data, no API used by `Game`, no visual output change.
- No golden re-pin.

## Performance/resource constraints

- The seam is read only inside `new THREE.WebGLRenderer(...)` call sites — twice
  in the class's lifetime, not per frame.
- The new tests need no GPU, no browser and no worker; they must run in
  milliseconds.

## Testing seams

The seam itself is the test seam. The doubles are pure and synchronous. A
`beforeEach` installs the double and a mandatory `afterEach` restores it, with an
explicit assertion that restoration happened.

Additionally, an integration guard: `tests/e2e/` continues to exercise the real
renderer path unchanged, so the seam's default path is validated end to end by the
existing browser suite.

## Observability

The tests assert the same surface the game already uses (`rendererCreated`, the
two callbacks, the DOM events), so no new observability is required.

## Affected files/symbols

**Modified**
- `src/engine/Renderer.ts` (add defaulted `static webglFactory`; use it at both
  construction sites)
- `vitest.config.ts` (correct the stale 0%-coverage debt comment; re-pin the
  measured baseline honestly)

**New**
- `tests/support/rendererDom.ts`
- `tests/unit/Renderer.test.ts`

**Possibly modified**
- `src/engine/Renderer.ts` `c8 ignore` blocks around the freeze methods, removed
  if the new tests make them unit-reachable.

**Explicitly not modified**
- `src/engine/Game.ts` (no call-site change needed)
- any committed `*.png`

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Leave `Renderer` E2E-only and exclude it from coverage | The behaviour includes failure and lifecycle paths (no-WebGL, context loss/restore, dispose idempotency) that an E2E cannot deterministically provoke; excluding the file would hide exactly the fragile paths. |
| `vi.mock('three')` for the whole module | Heavier and more brittle than a single injected factory; it also mocks scene/camera construction the tests want to keep real. |
| Extract renderer ownership into a new module first | A larger refactor than this change's remit; the coverage gap can be closed without restructuring, and restructuring should be its own gated change if pursued. |
| Constructor-injected factory | Must be threaded into context restoration via instance state, widening the public signature for a test-only need. |
| Test only the happy path (construction + render) | Leaves the fail-closed no-WebGL and context-restore contracts — the highest-risk paths — uncovered, which is the whole point. |

## Downstream dependencies

- 299 must land first: the coverage re-pin and the threshold reconciliation are
  only meaningful under the calibrated provider version.
- 301 may own the gate catalogue; no overlap with this change's files.
