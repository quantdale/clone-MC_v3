# Tasks: 303-renderer-lifecycle-unit-coverage

- [x] **T1.** Record the coverage-gap evidence. Attach to `verification.md`:
  `grep -rln "engine/Renderer" tests/` returning no matches;
  `grep -rln "engine/Renderer" src/` returning only `src/engine/Game.ts`;
  `src/engine/Renderer.ts` being 221 lines; the four existing
  `tests/unit/*Renderer.test.ts` files covering `src/rendering/*` entity renderers
  and **not** `src/engine/Renderer.ts`; the `c8 ignore start/stop` block around
  `testFreezeDynamicResolution` / `testFreezeAtMaxScale`; and the stale
  `vitest.config.ts` comment asserting "Renderer.ts remains 0% unit-covered
  (E2E-only)" and "Threshold 91 not reachable" while the configured `branches`
  floor is now `88`. **Evidence already captured at base `2ecf781`.**

- [ ] **T2.** Re-run the dependency check and, if 299 has landed, `npm ci` so the
  coverage measurement is taken under the locked toolchain. Record the installed
  Vitest/coverage provider version alongside the measurement; a figure produced
  under a drifted provider MUST be labelled as such and is not repository
  evidence.

- [ ] **T3.** Add the defaulted construction seam to `src/engine/Renderer.ts`:
  `static webglFactory: (opts: THREE.WebGLRendererParameters) => THREE.WebGLRenderer`
  defaulting to `(opts) => new THREE.WebGLRenderer(opts)`, used at BOTH
  construction sites (constructor and `handleContextRestored`). The default path
  MUST be byte-identical to today's behaviour.

- [ ] **T4.** Add `tests/support/rendererDom.ts`: a typed fake renderer recording
  `setPixelRatio` / `setSize` / `getDrawingBufferSize` / `render` / `dispose`,
  configurable `outputColorSpace` / `toneMapping` / `toneMappingExposure` /
  `shadowMap`, an optional construct-time throw, and a configurable drawing-buffer
  size; plus a `window`/`navigator` double installer and a `restoreAll()` that
  removes the seam override and the globals.

- [ ] **T5.** Add `tests/unit/Renderer.test.ts` with a mandatory
  `beforeEach`/`afterEach` that installs and restores the doubles, and an
  explicit assertion that the seam default is restored after each test so a leak
  fails loudly. Cases:
  1. construction success — configured colour space, tone mapping, exposure,
     shadow-map type, initial size, both listeners attached;
  2. construction failure — factory throws, no exception escapes,
     `rendererCreated === false`, `renderer === null`, **listeners still
     attached**;
  3. context lost — `rendererCreated === false`, loss callback once,
     `defaultPrevented === true`;
  4. context restored (success) — previous fake disposed exactly once, new fake
     constructed and re-configured, `rendererCreated === true`, restore callback
     once;
  5. context restored (failure) — factory throws, no exception escapes,
     `rendererCreated === false`, **restore callback still fires once**;
  6. dispose — renderer disposed, listeners removed (proved by delivering a
     context-restored event afterwards and observing no reconstruction), state
     not-created;
  7. repeated dispose — no throw, no double dispose;
  8. pixel ratio — standard cap, headless cap (`navigator.webdriver === true`),
     and a device pixel ratio below the cap, each multiplied by the dynamic scale;
  9. resize clamp — `innerHeight = 0` yields `setSize(w, 1)` and
     `camera.aspect === w / 1`;
  10. drawing-buffer size — floored/non-negative with a renderer, `{0,0}` without;
  11. frozen dynamic resolution — returns `{changed:false, valid:true,
      effectiveFrameTimeMillis:null}` and does **not** call `setSize` again;
  12. render without a renderer — no throw;
  13. default-path assertion — with no override, the real factory is used.

- [ ] **T6.** Re-run `npm test` and confirm the new suite passes, that the total
  test count increased by exactly the new cases, and that no previously passing
  test changed status.

- [ ] **T7.** Re-evaluate the `c8 ignore` blocks around
  `testFreezeDynamicResolution` / `testFreezeAtMaxScale`. If the new tests make
  them unit-reachable, remove the ignore; if not, keep it and record why.

- [ ] **T8.** Run `npm run test:coverage` and record the measured
  statements/branches/functions/lines plus the per-file Renderer.ts figures.
  Confirm Renderer.ts coverage is greater than 0%. Confirm **no threshold was
  lowered** to achieve the result; if a figure falls below a pinned floor, that is
  a finding to report, not a threshold to edit.

- [ ] **T9.** Update `vitest.config.ts`: correct the stale
  "Renderer.ts remains 0% unit-covered (E2E-only)" debt note to the current
  measured reality and the current threshold set, keeping the full audit trail of
  previous measurements in the comment as the file's existing style does.

- [ ] **T10.** Confirm no committed `*.png` changed: `git diff --numstat` over
  `tests/visual-golden/` must be empty.

- [ ] **T11.** Update the file-audit manifest for the two new files and the
  modified `src/engine/Renderer.ts` / `vitest.config.ts` rows, then run
  `node scripts/validate-file-audit.mjs …` (or `npm run verify:file-audit` if
  301 landed) to PASS.

- [ ] **T12.** Full mandatory gate on the candidate SHA: `npm run validate-state`,
  `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `node scripts/check-release-bundle.mjs`, `npm run test:e2e`. Lint MUST stay at
  0 errors; the 85 pre-existing warnings MUST NOT increase.

- [ ] **T13.** Documentation and state: add the post-terminal row to
  `CHANGE_SEQUENCE.md`; record the measured coverage before/after in
  `verification.md`; update `openspec/PROGRAM_STATE.json` / `.md` at activation
  with `session_start_head` / `published_head`.

- [ ] **T14.** Final reconciliation and publication: re-read all artifacts
  against the implemented result, confirm every MUST/SHALL in
  `specs/renderer-lifecycle-coverage/spec.md` has evidence (especially T5's
  thirteen cases and T8's measured Renderer.ts coverage being greater than 0%),
  confirm 100% checkbox completion, inspect the diff for unrelated changes,
  commit, push to `origin/main`, verify the remote head, report `published_head`.
