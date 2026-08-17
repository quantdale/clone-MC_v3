# Proposal: 246-input-accessibility-matrix

## Problem
The pure input frameworks from 207 (keybinding remap), 209 (gamepad), 210 (touch), and 208
(accessibility) exist but are **not wired into the runtime input path**. The live game still:

- hard-codes WASD/Space/Shift/Digit1-9 in `src/engine/InputManager.ts` instead of resolving keys
  through 207's remappable `KeybindingState` — a remapped binding has **no effect on actual input**;
- never polls the Gamepad API, so 209's `pressedActions`/`movementVector`/`lookVector`/`uiNav`
  drive nothing;
- never captures touch, so 210's `resolveTouches`/`TOUCH_ZONES` drive nothing and no touch HUD is
  shown;
- never applies 206's `mouseSensitivity`/`invertY`/`autoJump` or 208's input-relevant options
  (`reducedMotion`, `uiScale`) — the mouse look uses hard-coded `CONFIG.mouseSensitivity`;
- gates all play on pointer lock (`simulationActive = worldReady && pointerLocked &&
  !craftingOpen`), which is a keyboard/mouse-only assumption; gamepad/touch cannot play because
  they have no pointer lock to enter;
- recovers from focus loss for keyboard/mouse only (`blur`/`visibilitychange` in InputManager);
  there is no unified, deterministic, cross-device focus-loss/restore contract.

There is no single device × action × edge-case matrix: which device drives which action, how
simultaneous devices arbitrate, and how focus loss/recovery behaves per device are unspecified and
untested. 246 defines and implements that matrix.

## Goals
- A **pure, headless-testable input coordinator** (`src/simulation/InputCoordinator.ts`, NEW) that
  unifies keyboard/mouse/gamepad/touch onto 207's shared `KeybindingAction` model and resolves a
  single `ResolvedInputFrame` per frame, with:
  - **Action resolution**: the union of all devices' pressed actions, deduped and ordered by
    `KEYBINDING_ACTIONS`.
  - **Move arbitration**: deterministic priority `gamepad > touch > keyboard`, keyboard converting
    held movement actions to a cardinal vector; a device with a zero vector never blocks a
    lower-priority device that is non-zero.
  - **Look arbitration**: deterministic priority `mouse > gamepad > touch`; the first non-zero
    source wins.
  - **Held-button merge**: break/use/pick are held when ANY device holds them (mouse button,
    gamepad button, touch button).
  - **Hotbar aggregation**: keyboard hotbar index/wheel aggregated deterministically.
  - **Per-device state** so one device releasing never clears another device's still-held input.
  - **Focus-loss/recovery API**: `clearDevice`/`clearAll` zero a frame deterministically; a
    focused frame never inherits stale input from a previous unfocused frame (re-arm required).
- **Device wiring** so the coordinator is actually driven by the browser:
  - Keyboard resolves `KeyboardEvent.code` through `actionForKey(bindings, code)` (remap takes
    effect; a mid-session remap applies to subsequent keydown only, never re-arming held keys).
  - Gamepad polls `navigator.getGamepads()` into 209's functions; disconnect zeroes the device.
  - Touch captures pointer/touch events, normalizes to `[0,1]`, feeds `resolveTouches`, and
    renders the `TOUCH_ZONES` HUD.
  - Settings 206 (`mouseSensitivity`, `invertY`, `autoJump`) and accessibility 208 input options
    (`reducedMotion`, `uiScale`) are applied to the input/render path.
  - Play state redefined: keyboard/mouse require pointer lock; gamepad/touch do NOT (they play
    lock-free). A unified focus-loss handler clears all four devices on `blur`,
    `visibilitychange`, and `pointerlockerror`.
- A **device × action × edge-case interaction matrix** and a **focus-loss/restore** set of
  scenarios expressed as normative MUST/SHALL requirements in two capability specs.
- Corrupt/absent persisted payloads (settings, keybindings, accessibility) fall back to defaults
  at wiring load and never crash the input path.

## Non-goals
- **No change to the pure frameworks 207/208/209/210** (they are consumed as-is; 246 adds the
  coordinator and wiring, it does not modify their contracts).
- **No new bindable actions** and **no new accessibility options** — the 23-action table and the
  7-option table are fixed by 207/208.
- **No UI/rendering work beyond the input-relevant subset**: `subtitles`, `screenEffects` visuals,
  `flashLighting`, `textBackgroundOpacity`, and `chatVisibility` are rendering/audio/chat concerns
  applied by other layers and are **out of scope** here. Only `reducedMotion` (input-driven camera
  / UI motion) and `uiScale` (UI/touch-HUD scale) are in scope as input-interaction options.
- **No new options UI, no settings/keybinding/accessibility settings panels.**
- **No performance budget / release hardware tier** (change 247) and **no parity categorization**
  (change 248).
- **No vibration / haptics, no pinch gestures, no analog trigger movement.**
- **No network input** (multiplayer input flows in changes 223-237, not here).

## Preconditions
- Changes 206, 207, 208, 209, 210 are VERIFIED (the pure frameworks exist).
- This change is authored before it becomes ACTIVE; per `CHANGE_SEQUENCE.md`, 246 is implemented
  only when the preceding change (245) is eligible to advance.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 207 `KeybindingFramework` (`KeybindingState`, `KeybindingAction`, `KEYBINDING_ACTIONS`,
  `actionForKey`, `keyFor`).
- 209 `GamepadFramework` (`pressedActions`, `movementVector`, `lookVector`, `uiNav`,
  `GAMEPAD_BUTTON_MAP`, `GamepadAxisPair`, `UiNavState`).
- 210 `TouchFramework` (`resolveTouches`, `TOUCH_ZONES`, `zoneAt`, `TouchInputState`,
  `TouchPoint`, `TouchInput`).
- 206 `SettingsFramework` (`SettingsStore`, `getSetting`, `deserializeSettings`).
- 208 `AccessibilityFramework` (`AccessibilityStore`, `getOption`, `deserializeAccessibility`).
- Existing `InputManager` / `InputState` / `PlayerController` / `Game` wiring in `src/engine/`.

## Proposed change
1. `src/simulation/InputCoordinator.ts` (NEW) — the pure dispatch/arbitration + focus-loss model.
2. `src/engine/InputManager.ts` and `src/engine/Game.ts` — wire the coordinator into the live input
   path: remap-aware keyboard, gamepad polling, touch capture + HUD, settings/accessibility
   application, and unified focus-loss/restore.
3. Capability specs (below) and the OpenSpec artifact package.

## Compatibility and migration
- New pure module + wiring edits; **no registry change, no world-save-format change.**
- Settings/keybindings/accessibility payloads keep their version-1 format (206/207/208 unchanged);
  only the wiring that reads them changes. Corrupt/absent payloads default at load.
- The public `InputState` interface (consumed by `PlayerController`/`PlayerInteraction`) is
  preserved; the coordinator feeds it. Any new fields are additive.

## Risks
- **Arbitration drift**. Mitigation: the move/look priority order, the union/order of actions, and
  the held-button merge are pinned as exact scenarios in `input-dispatch-matrix`.
- **Focus-loss regression on the existing keyboard path**. Mitigation: `focus-loss-recovery`
  requires the existing "clears movement when the page loses focus" behavior to remain green and
  extends it to all devices; the existing e2e assertion stays a regression guard.
- **Pointer-lock independence for gamepad/touch** could let input fire outside the expected
  "active" state. Mitigation: a single `active` flag per frame derived from whether the device is
  present and the game is not paused; playable-state is deterministic and tested.
- **Corrupt persisted payloads** crashing the input path. Mitigation: load-time default fallback
  is required and failure-tested.

## Rollback strategy
The coordinator is one new pure file; the wiring edits are isolated to `InputManager.ts`/`Game.ts`.
Reverting the wiring edits and the new file removes the feature cleanly without touching 206-210.

## Definition of Done
- `InputCoordinator.ts` implements every normative requirement of `input-dispatch-matrix` and the
  focus-loss/recovery API of `focus-loss-recovery`.
- `InputManager`/`Game` wire the coordinator into the live input path per `device-input-wiring`.
- Unit tests cover: action union/order/dedupe; move and look arbitration (priorities, zero-vs-nonzero,
  simultaneous, sticky-across-devices); held-button merge; hotbar aggregation; `clearDevice`/
  `clearAll`; focus-loss/refocus re-arm; corrupt-payload defaults; gamepad disconnect; touch
  pointercancel; remap-applies-to-subsequent-only.
- E2E covers: remapped binding drives movement; simulated gamepad drives movement/actions; simulated
  touch drives movement/actions; focus loss clears all devices; refocus/relock restores cleanly;
  simultaneous-device release-one-keep-other; `pointerlockerror` recovery.
- Full gate green: typecheck, lint, unit, build, e2e.

## Advancement gate
Target 100% task completion and the full baseline gate green. No MUST/SHALL requirement unmet; no
regression on the existing keyboard/mouse/focus e2e assertions.
