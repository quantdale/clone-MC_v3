# Tasks: 246-input-accessibility-matrix

## 1. Baseline and characterization

- [ ] 1.1 Characterize the current input wiring and record it in `design.md` under "Context/current
      state": confirm `InputManager` hard-codes WASD/Space/Shift/Digit1-9/F3/KeyC/KeyR and does not
      use 207 bindings; confirm 209/210/208 and 206 `mouseSensitivity`/`invertY`/`autoJump` are not
      wired into the live path; confirm `Game.simulationActive` is pointer-lock-gated; confirm no
      existing `InputCoordinator`/`ResolvedInputFrame` exists.
- [x] 1.2 Add characterization/failing unit tests for the planned `InputCoordinator` arbitration
      (action union/order, move/look priority, held-button merge, sticky across devices) and for
      `clearAll`/`clearDevice`, demonstrating the current absence of the coordinator.
- [ ] 1.3 Run and record the pre-change baseline gate (`npm run typecheck`, `npm run lint`,
      `npm test`, `npm run build`, `npm run test:e2e`) as the regression baseline, noting the
      existing "clears movement when the page loses focus" e2e assertion as a regression guard.

## 2. Input dispatch coordinator

- [x] 2.1 Implement `src/simulation/InputCoordinator.ts`: the `DeviceFrame`/`ResolvedInputFrame`
      types and `resolveFrame` per `specs/input-dispatch-matrix` (action union/dedupe/order, move
      and look priority with zero-deferral, held-button merge, hotbar aggregation, sticky across
      devices).
- [x] 2.2 Implement `clearDevice`/`clearAll` per `specs/focus-loss-recovery` (zero the named/all
      device fields; preserve other devices on `clearDevice`).
- [x] 2.3 Unit tests: action union/dedupe/order (REQ-1), move arbitration incl. gamepad-over-
      keyboard and zero-deferral (REQ-2), look arbitration incl. mouse-over-gamepad and
      zero-deferral (REQ-3).
- [x] 2.4 Unit tests: held-button merge across devices (REQ-4), hotbar index/wheel aggregation
      (REQ-5), and sticky across devices (REQ-6); total-function behavior on empty/partial frames.

## 3. Device wiring and integration

- [x] 3.1 Wire remap-aware keyboard dispatch in `InputManager`/a keyboard helper using
      `actionForKey(bindings, code)` (REQ-1) with subsequent-only remap semantics (REQ-2); unit-test
      a remapped binding drives movement and a held-through-remap key is not re-armed.
- [x] 3.2 Wire gamepad polling (`navigator.getGamepads()` → `pressedActions`/`movementVector`/
      `lookVector`/`uiNav`) with disconnect zeroing (REQ-3); add an E2E case that simulates a
      gamepad driving movement/actions.
- [x] 3.3 Wire touch capture + `TOUCH_ZONES` HUD (normalize → `resolveTouches`) with zero-on-no-touch
      and `touchcancel` zeroing (REQ-4); add an E2E case that dispatches pointer events to drive
      movement/actions.
- [x] 3.4 Apply 206 settings (`mouseSensitivity`, `invertY`, `autoJump`) and 208 input options
      (`reducedMotion`, `uiScale`) to the input/render path (REQ-5, REQ-6); unit-test sensitivity/
      invertY/autoJump and that `reducedMotion`/`uiScale` do not change resolution.
- [x] 3.5 Redefine playable state: keyboard/mouse require pointer lock; gamepad/touch play lock-free
      (REQ-7); update `Game.simulationActive` accordingly and add E2E coverage that gamepad/touch
      play without pointer lock and a paused game delivers no input.

## 4. Focus-loss recovery, edge/failure, and regression gate

- [x] 4.1 Wire the unified focus-loss handler (`blur`, `visibilitychange`, `pointerlockerror` →
      `clearAll` + overlay for keyboard/mouse) and refocus re-arm (REQ-1/REQ-2/REQ-3); unit-test
      `clearDevice` preserves others (REQ-4).
- [x] 4.2 Edge/failure tests: corrupt settings/keybindings/accessibility payloads fall back to
      defaults (REQ-5); gamepad disconnect and touch cancel zero the device (REQ-6); repeated
      `keydown` autorepeat yields one hotbar signal (REQ-7).
- [ ] 4.3 Run the full baseline gate (`npm run typecheck`, `npm run lint`, `npm test`, `npm run
      build`, `npm run test:e2e`); confirm the existing "clears movement when the page loses focus",
      "keeps pointer-lock failures recoverable", and the WASD/hotbar/eat/break-place e2e assertions
      remain green; update `verification.md` and, when advancing, `PROGRAM_STATE.json`/
      `PROGRAM_STATE.md` with complete evidence.
