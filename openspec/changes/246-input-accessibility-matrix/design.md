# Design: 246-input-accessibility-matrix

## Context/current state
The four input frameworks are pure and headless but **not wired** into the live game:

- `src/simulation/KeybindingFramework.ts` (207): `KEYBINDING_ACTIONS` (23 actions), immutable
  `KeybindingState`, `actionForKey(state, key)`, `keyFor`, conflict-aware `remapKey`, resets, and
  version-1 persistence. Consumed by 209/210 but **not by `InputManager`**.
- `src/simulation/GamepadFramework.ts` (209): `applyDeadzone`, `movementVector`/`lookVector`,
  `GAMEPAD_BUTTON_MAP`, `pressedActions(buttons, actionMap?)`, `uiNav(buttons)`. **Never polled.**
- `src/simulation/TouchFramework.ts` (210): `TOUCH_ZONES` (7 zones), `zoneAt`, `dragVector`/
  `dragDelta`, `resolveTouches`. **No pointer capture, no touch HUD.**
- `src/simulation/AccessibilityFramework.ts` (208) and `src/simulation/SettingsFramework.ts`
  (206): pure validated stores with version-1 persistence. **Not applied to the input path.**
- `src/engine/InputManager.ts`: the only live input. Hard-codes WASD/Arrow/Space/Shift/Digit1-9/
  F3/KeyC/KeyR; pointer lock requested on canvas click; `blur`/`visibilitychange` →
  `releaseForFocusLoss()` clears keyboard/mouse. Uses hard-coded `CONFIG.mouseSensitivity`.
- `src/player/PlayerController.ts`: consumes `InputState` (movement booleans, `consumeMouseDelta`,
  jump, sprint). `InputState` is defined in `src/engine/InputTypes.ts`.
- `src/engine/Game.ts`: `simulationActive = worldReady && pointerLocked && !craftingOpen`
  (line ~464) — a keyboard/mouse-only gate that excludes lock-free gamepad/touch play.

**Current gaps** (the motivation): no remap application; no gamepad; no touch; no settings/
accessibility application; pointer-lock-only play; keyboard/mouse-only focus-loss recovery; no
device × action matrix; no unified arbitration; no deterministic focus-loss/restore contract.

## Target state
- A new pure `src/simulation/InputCoordinator.ts` that merges per-device input into one
  `ResolvedInputFrame` with deterministic arbitration and a deterministic focus-loss/recovery API.
- `InputManager`/`Game` wired to feed the coordinator from the browser: remap-aware keyboard,
  Gamepad-API polling, touch capture + `TOUCH_ZONES` HUD, settings/accessibility application, and a
  unified focus-loss handler that clears all four devices.
- Play state redefined: keyboard/mouse need pointer lock; gamepad/touch play lock-free.
- The 206/207/208/209/210 pure contracts are unchanged.

## Invariants
- **Pure coordinator**: `InputCoordinator` and its input/output types are headless-safe: no DOM,
  no Gamepad API, no mutation of inputs, no throws.
- **Action set**: resolved actions are the union of all devices' actions, deduped, ordered by
  `KEYBINDING_ACTIONS` (deterministic).
- **Move priority**: `gamepad > touch > keyboard`; a device whose move vector is (0,0) never
  blocks a lower-priority device that is non-zero.
- **Look priority**: `mouse > gamepad > touch`; the first non-zero source wins.
- **Held buttons**: break/use/pick are held when ANY device holds them.
- **Per-device state**: releasing one device never clears another device's held input.
- **Focus-loss**: `clearAll`/`clearDevice` produce a zero frame; a focused frame never inherits
  stale held state from a prior unfocused frame (re-arm required); movement/look/hotbar queued
  values are zeroed, not dropped silently.
- **Remap**: `actionForKey(bindings, code)` is applied at keydown; a remap applies to subsequent
  keydowns only and never re-arms a currently-held key.
- **Playability**: gamepad/touch frames are active without pointer lock; keyboard/mouse frames are
  active only while locked.

## API and data model
TypeScript sketches (intent; normative rules live in the capability specs).

```ts
// src/simulation/InputCoordinator.ts (new)
import type { KeybindingAction, KeybindingState } from './KeybindingFramework';
import type { GamepadAxisPair, UiNavState } from './GamepadFramework';

export interface AxisPair { readonly x: number; readonly y: number; }   // reuse GamepadAxisPair shape

/** Per-device raw resolutions fed to the coordinator each frame. */
export interface DeviceFrame {
  readonly keyboard: {
    readonly heldActions: readonly KeybindingAction[];  // derived via actionForKey
    readonly hotbarIndex: number;                       // -1 = none
    readonly hotbarDelta: number;                       // wheel
  };
  readonly mouse: {
    readonly look: AxisPair;                            // dyaw/dpitch after sensitivity+invertY
    readonly breakHeld: boolean;
    readonly useHeld: boolean;
    readonly pickHeld: boolean;
  };
  readonly gamepad: {
    readonly connected: boolean;
    readonly actions: readonly KeybindingAction[];      // pressedActions
    readonly move: AxisPair;                            // movementVector
    readonly look: AxisPair;                            // lookVector
    readonly uiNav: UiNavState;
  };
  readonly touch: {
    readonly actions: readonly KeybindingAction[];      // resolveTouches actions
    readonly move: AxisPair;
    readonly look: AxisPair;
  };
}

export interface ResolvedInputFrame {
  readonly actions: readonly KeybindingAction[];   // union, deduped, KEYBINDING_ACTIONS order
  readonly move: AxisPair;                         // arbitrated movement vector
  readonly look: AxisPair;                         // arbitrated look delta
  readonly breakHeld: boolean;
  readonly useHeld: boolean;
  readonly pickHeld: boolean;
  readonly hotbarIndex: number;                    // -1 when none
  readonly hotbarDelta: number;
  readonly uiNav: UiNavState;
  readonly active: boolean;                        // device present AND not paused/lost-focus
}

export function resolveFrame(frame: DeviceFrame): ResolvedInputFrame;
export function clearDevice(frame: DeviceFrame, device: 'keyboard'|'mouse'|'gamepad'|'touch'): DeviceFrame;
export function clearAll(frame: DeviceFrame): DeviceFrame;
```

Wire-adjacent constants (in `InputManager.ts` or a small wiring helper, still headless-testable):
```ts
export function keyboardActions(heldCodes: readonly string[], bindings: KeybindingState): KeybindingAction[];
// For each held code: actionForKey(bindings, code) -> push if non-null; dedupe.
```
The mouse look already applies `CONFIG.mouseSensitivity`; 246 changes that to the 206
`mouseSensitivity` and applies `invertY`, and `reducedMotion` scales camera/UI motion (defined in
the wiring spec).

## Control/data flow
1. Per frame, the wiring builds a `DeviceFrame`:
   - **Keyboard**: held `KeyboardEvent.code`s (tracked on keydown/keyup) →
     `keyboardActions(codes, bindings)`; hotbar index from digit keys via `actionForKey`;
     wheel → `hotbarDelta`.
   - **Mouse**: pointer-lock `mousemove` delta × `mouseSensitivity` (206), negated on `invertY`;
     button held flags → break/use/pick.
   - **Gamepad**: poll `navigator.getGamepads()` → `connected`; `pressedActions(buttons)`,
     `movementVector(left)`, `lookVector(right)`, `uiNav(buttons)`.
   - **Touch**: pointer/touch events normalized to `[0,1]` → `resolveTouches` → actions/move/look.
2. `resolveFrame(frame)` merges per the invariants into `ResolvedInputFrame`.
3. `Game` maps the frame onto `InputState` (movement booleans, jump/sprint/sneak, look, break/use/
   pick, hotbar, UI navigation) and the render/UI layers apply `uiScale`/`reducedMotion`.
4. On `blur`, `visibilitychange`, or `pointerlockerror`, the wiring calls `clearAll` (and drops
   DOM listener state) so the next frame is zero; on refocus/relock the player re-arms input.

## Detailed behavior
- **Action resolution**: union of `keyboard.heldActions`, `gamepad.actions`, `touch.actions`, plus
  `attack`/`use`/`pickBlock` derived from mouse/gamepad/touch held buttons; deduped, ordered by
  `KEYBINDING_ACTIONS`. Movement actions (`forward`/`back`/`left`/`right`) are unioned from all
  devices, but the **analog move vector** is arbitrated (below).
- **Move arbitration**: candidates in priority order gamepad → touch → keyboard. Keyboard converts
  held movement actions to a normalized cardinal vector in the yaw-relative convention used by
  `PlayerController` (forward/back map to the yaw axis, left/right to the strafe axis); the
  coordinator emits a unit-less direction the controller scales. The first candidate whose vector
  is not (0,0) wins; if all are zero, move is (0,0).
- **Look arbitration**: first non-zero candidate in priority mouse → gamepad → touch; mouse is the
  precise pointer and wins when non-zero. When the winner is zero, look is (0,0).
- **Held-button merge**: `breakHeld = mouse.breakHeld || gamepad has attack pressed || touch has
  attack action`; same for `useHeld` (use / place), `pickHeld` (pickBlock).
- **Hotbar**: `hotbarIndex` is the keyboard index when >= 0, else -1; `hotbarDelta` is the
  keyboard wheel delta (aggregated).
- **Active**: `active = !paused && !focusLost && (device-specific playability)`, where
  keyboard/mouse require pointer lock and gamepad/touch require only their device presence. The
  wiring composes this from its own focus/play state; the coordinator provides the primitive
  `clearAll`/`clearDevice`.
- **Focus-loss/recovery**: `clearAll` returns a frame with every device zeroed (no actions, zero
  move/look, no held buttons, hotbar cleared, uiNav all-false). `clearDevice` zeroes only the named
  device and preserves the others. The wiring, after a focus-loss event, uses the cleared frame so
  no stale input leaks; after refocus, held keys/buttons must be physically re-pressed (keyup
  during the unfocused window must not re-arm, and a re-issued keydown is required).

## Failure modes
- **Corrupt/absent persisted payloads**: `deserializeSettings`/`deserializeKeybindings`/
  `deserializeAccessibility` throw on a corrupt payload; the wiring MUST catch at load and fall
  back to defaults, never crashing the input path.
- **Invalid remap target**: 207 returns `{ ok:false, reason:'invalid_key' }` structurally; the
  wiring never persists or applies an invalid key.
- **Gamepad disconnect**: `connected=false` → zero move/look/actions/uiNav; a disconnect mid-hold
  must not leave a stale held action.
- **Touch pointercancel / all-fingers-up**: no active touches → zero move/look/actions.
- **Repeated keydown autorepeat**: a repeated keydown for an already-held key must not queue
  duplicate hotbar/UI signals (dispatch is idempotent for held state).

## Compatibility/migration
- No registry, world-save, or 206-210 format changes.
- `InputState` interface preserved; `PlayerController`/`PlayerInteraction` keep compiling. Additive
  coordinator/wiring only.
- Corrupt payload fallback is additive (load-time catch); valid payloads load identically to
  206/207/208 semantics.

## Performance/resource constraints
- `resolveFrame` is O(actions × devices) with constant device count (4) — a few dozen operations
  per frame; `clearAll`/`clearDevice` are O(1) object rebuilds.
- Gamepad polling and touch capture run once per frame in the wiring; no allocations beyond the
  per-frame `ResolvedInputFrame` and any DOM normalization buffers.
- No changes to tick/simulation hot paths.

## Testing seams
- **Coordinator**: unit tests feed hand-built `DeviceFrame`s and assert `ResolvedInputFrame` for
  every arbitration/merge/focus-loss rule (pure, no DOM).
- **`keyboardActions`**: unit tests feed code arrays + `KeybindingState` and assert mapped actions,
  including a remapped binding and a key absent from the state.
- **Wiring**: e2e drives the real DOM — `page.keyboard` for remapped keys, a `navigator.getGamepads`
  stub for gamepad, dispatched pointer events for touch, and `blur`/`visibilitychange`/
  `pointerlockerror` for focus-loss.

## Observability/debugging
- The `ResolvedInputFrame` is a plain object; a debug overlay can print the resolved action list
  and arbitration winner.
- The existing `__voxelGame` e2e test hook exposes `input` for assertions (the current
  `clears movement when the page loses focus` test reads `game.input.moveForward`); 246 keeps that
  shape and adds read-only observables (e.g. resolved frame) without enabling them in release.

## Affected files/symbols
- `src/simulation/InputCoordinator.ts` (NEW): `DeviceFrame`, `ResolvedInputFrame`, `resolveFrame`,
  `clearDevice`, `clearAll`.
- `src/engine/InputManager.ts`: remap-aware keyboard dispatch (`keyboardActions`), gamepad polling,
  touch capture, settings/accessibility application, unified focus-loss handler.
- `src/engine/InputTypes.ts`: additive fields if needed (e.g. expose resolved frame read-only).
- `src/engine/Game.ts`: feed the coordinator, redefine play state (`simulationActive`) for
  lock-free gamepad/touch, render `TOUCH_ZONES` HUD, apply `uiScale`/`reducedMotion`.
- `src/player/PlayerController.ts`: consume the resolved movement/look (interface preserved).
- Tests: `tests/unit/InputCoordinator.test.ts`, `tests/unit/InputManager.test.ts` (extended if a
  harness exists), `tests/e2e/game.spec.ts` (new input-matrix + focus-loss cases).

## Rejected alternatives
- **Blending move/look vectors across devices**: rejected — deterministic priority is simpler to
  specify, test, and reason about than weighted blends, and matches "the active device wins".
- **Putting arbitration inside `PlayerController`**: rejected — the controller consumes `InputState`;
  arbitration belongs in the pure coordinator so it is headless-testable and device-agnostic.
- **Gating gamepad/touch behind pointer lock**: rejected — gamepad/touch have no pointer lock;
  246 requires lock-free play for them.
- **Modifying 207/208/209/210 to add wiring**: rejected — the frameworks stay pure; the coordinator
  composes them.

## Downstream dependencies
- 247 (`performance-release-gate`) may measure the per-frame coordinator cost; 246 keeps it bounded
  and documents the O(actions) bound.
- 248 (`parity-matrix-reconciliation`) categorizes the interaction matrix against Minecraft parity.
- 242 (`survival-progression-e2e`) and 241 (`deterministic-replay-suite`) can drive the game via
  the coordinated input path and recorded frames.
