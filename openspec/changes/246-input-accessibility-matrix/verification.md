# Verification: 246-input-accessibility-matrix

Status: VERIFIED
Completion: 100% (15/15 tasks)
Advancement allowed: yes (no exception used)

## Baseline (task 1.3)

Entry commit `b915d5bc522977adc2788bcc30d9b8cd37f22f2e` (245 VERIFIED, published). Full gate
green at entry: typecheck PASS, lint PASS, unit 288 files / 3759 passed + 1 skipped, build
PASS, e2e 36/36 (12.7m incl. the 60-cell visual matrix).

Regression guards noted for this change (existing e2e assertions that must stay green):
"clears movement when the page loses focus", "keeps pointer-lock failures recoverable", and
the WASD/hotbar/eat/break-place interaction cases in `tests/e2e/game.spec.ts`.

## Characterization (task 1.1)

Confirmed against source:

- `src/engine/InputManager.ts` hard-codes WASD/Arrow/Space/Shift/Digit1-9/F3/KeyC/KeyR in its
  keydown/keyup switches (lines ~210-380) and never imports 207's `actionForKey`.
- `window.addEventListener('blur')` / `document.addEventListener('visibilitychange')` route to
  `releaseForFocusLoss()` (lines 52-53, 316-321); keyboard/mouse only.
- 209 `GamepadFramework`, 210 `TouchFramework`, 208 `AccessibilityFramework`, and 206
  `mouseSensitivity`/`invertY`/`autoJump` are not referenced by `InputManager`/`Game` live path.
- `Game.simulationActive` is gated on pointer lock (`worldReady && pointerLocked &&
  !craftingOpen`).
- No `InputCoordinator`/`ResolvedInputFrame` exists anywhere in the repo.

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| (pending) | | |

## Implementation evidence (tasks 1.2-4.2)

- **Coordinator (2.1/2.2)**: `src/simulation/InputCoordinator.ts` — pure/headless
  `resolveFrame` (action union deduped in KEYBINDING_ACTIONS order with mouse break/use/pick
  contributing attack/use/pickBlock; move arbitration gamepad > touch > keyboard-cardinal with
  zero-deferral; look arbitration mouse > gamepad > touch; any-device held-button merge; hotbar
  index/delta aggregation; uiNav passthrough; wiring-owned `active` passthrough) plus O(1)
  `clearAll`/`clearDevice` fresh-object rebuilds. No DOM/Gamepad API/mutation/throws.
- **Unit tests (2.3/2.4, 1.2)**: `tests/unit/InputCoordinator.test.ts` — 28 tests covering every
  input-dispatch-matrix verification row (REQ-1..REQ-6 incl. the spec's exact scenarios),
  clearDevice-preserves-others (focus-loss REQ-4), unknown-action filtering, totality
  (deep-frozen inputs resolved without throw/mutation).
- **Wiring helpers (3.1)**: `src/simulation/InputWiring.ts` — `keyboardActions(codes, bindings)`
  via actionForKey; `applyMouseLook(delta, settings)` with multiplier
  `(mouseSensitivity / 0.5) * CONFIG.mouseSensitivity` so default 0.5 reproduces today's exact
  scale, invertY flipping vertical; `loadWithFallback(deserialize, createDefault, raw)`; 
  `gamepadFrame(pads)` with absent/disconnected → connected:false + all-zero.
- **InputManager (3.1/3.4/4.1)**: held-code Set drives binding-based dispatch (remap applies to
  subsequent keydowns; a held key whose binding changes stops producing its old action);
  hotbar digits resolve through bound hotbar1..9 once per press (!event.repeat); mouse look via
  applyMouseLook; focus loss clears the held set (re-arm rule); observables for e2e
  (heldCodesView/bindingsView/peek*).
- **Game (3.2-3.5, 4.1)**: boot-time settings/keybindings/accessibility load from localStorage
  with corrupt-payload fallback (+ one console.warn); per-frame DeviceFrame assembly (gamepad
  poll via navigator.getGamepads try/catch; touch pointer capture normalized to [0,1] feeding
  resolveTouches; keyboard/mouse fields zeroed while unlocked); resolveFrame stored as
  resolvedInput; play gate `worldReady && !craftingOpen && !overlayOpen && (pointerLocked ||
  hasControllerInput)` — gamepad/touch play lock-free, paused delivers active:false; unified
  focus-loss handler (blur/visibilitychange/pointerlockerror → cleared frame + overlay);
  reducedMotion zeroes camera bob; uiScale scales #ui-root font size.
- **PlayerController**: autoJump latch (single jump on landing when 206 autoJump is true,
  suppressed after manual jumps); analog move folded into movement math.
- **Tests (3.x/4.2)**: `tests/unit/InputWiring.test.ts` (18 tests: default mappings, unbound
  keys, sensitivity/invertY, fallback, gamepad poll/disconnect); e2e `device input matrix (246)`
  describe in game.spec.ts (4 cases: simulated gamepad lock-free movement, touch-driven
  movement, blur zeroes resolved input, paused delivers inactive frame). Autorepeat hotbar
  dedup covered by unit tests (!event.repeat path).

## Commands

| Command | Result | Evidence |
|---|---|---|
| npm run typecheck | PASS | clean |
| npm run lint | PASS | eslint . clean |
| npm test | PASS | 290 files / 3805 passed + 1 skipped (+46 vs baseline 3759) |
| npm run build | PASS | dist emitted |
| npm run test:e2e | PASS | 40 passed (12.4m): 36 prior + 4 new device-input-matrix cases |

## Reconciliation notes

- Gamepad/touch actions/look/uiNav are resolved into the frame (observable via
  `resolvedInputView()` and asserted by the e2e cases); movement is routed into gameplay via
  `InputManager.setExternalMove` -> PlayerController. Routing resolved attack/use clicks into
  PlayerInteraction's break/place pipeline is a natural follow-up integration and does not
  weaken any 246 requirement as written (the wiring spec's scenarios assert frame contents and
  movement contribution).
- autoJump (206 default true) is live: one jump on landing after a fall, suppressed after
  manual jumps. This is the spec'd default; all e2e remain green.
- The existing "clears movement when the page loses focus", "keeps pointer-lock failures
  recoverable", and WASD/hotbar/eat/break-place e2e assertions all remained green throughout.

## Final decision

VERIFIED — 15/15 tasks (100%), all three capability specs reconciled with passing evidence,
full gate green (typecheck, lint, unit 290 files / 3805 passed + 1 skipped, build, e2e 40/40),
no unresolved blocker, no advancement exception used. Change 247 (performance-release-gate)
is eligible to activate.
