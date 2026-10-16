# Spec: device-input-wiring

## Contract
This capability defines the runtime wiring that drives the pure coordinator from the browser: the
remap-aware keyboard path (207), gamepad polling (209), touch capture + `TOUCH_ZONES` HUD (210),
application of 206 settings and 208 accessibility input options, and a playable-state rule under
which gamepad/touch play without pointer lock while keyboard/mouse require it. It does NOT define
the pure arbitration (that is `input-dispatch-matrix`), does NOT modify 207/208/209/210, and does
NOT cover rendering-only accessibility/audio options (`subtitles`, `screenEffects` visuals,
`flashLighting`, `textBackgroundOpacity`, `chatVisibility`), which are applied by other layers.

## Definitions
- **Binding**: a `KeybindingState` from 207 mapping each action to a `KeyboardEvent.code`.
- **Held code**: a `KeyboardEvent.code` currently down and not yet up.
- **Lock-free play**: a frame in which gamepad/touch drive the game without pointer lock.
- **Normalized point**: a touch position divided by the canvas size into `[0, 1]`.

## Invariants
- The wiring feeds `resolveFrame` with a `DeviceFrame`; it does not re-implement arbitration.
- Keyboard dispatch resolves codes through `actionForKey(bindings, code)`; a remap applies to
  subsequent keydowns only and never re-arms a currently-held key.
- Gamepad input is read from `navigator.getGamepads()` each frame through 209's functions; a
  disconnected or absent gamepad yields zero input.
- Touch input is normalized and fed through 210's `resolveTouches`; the `TOUCH_ZONES` HUD is
  rendered.
- `mouseSensitivity` (206) scales mouse look instead of `CONFIG.mouseSensitivity`; `invertY` (206)
  negates the vertical look component; `autoJump` (206) triggers a jump while on the ground.
- `reducedMotion` (208) reduces input-driven camera/UI motion; `uiScale` (208) scales the UI and
  touch HUD.
- Keyboard/mouse frames are active only while pointer-locked; gamepad/touch frames are active when
  the device is present.

## Requirements

### Requirement: remap-aware keyboard dispatch
The wiring MUST resolve each held `KeyboardEvent.code` through `actionForKey(bindings, code)` to
produce the keyboard action set, so a binding remapped in 207's state takes effect on live input.
The default movement/jump/hotbar keys MUST still map as before when the binding is the default
(e.g. `KeyW`→`forward`, `Space`→`jump`, `Digit1`..`9`→`hotbar1`..`9`). A key not bound to any action
MUST contribute nothing. Hotbar digit selection MUST use the bound hotbar keys.

#### Scenario: remapped binding drives movement
- **GIVEN** a `KeybindingState` where `forward` is remapped from `KeyW` to `KeyU`, and the wiring
  tracks `KeyU` as a held code
- **WHEN** the keyboard device frame is built
- **THEN** `keyboard.heldActions` contains `forward` (resolved through `actionForKey(bindings,
  'KeyU')`), and `KeyW` (no longer bound) contributes nothing

#### Scenario: unbound key contributes nothing
- **GIVEN** a held code `KeyZ` that is bound to no action in the state
- **WHEN** the keyboard device frame is built
- **THEN** `keyboard.heldActions` does not contain `KeyZ` and the frame's action set is unchanged by it

### Requirement: remap applies to subsequent input only
When a remap changes the active binding mid-session, the wiring MUST NOT re-arm a key that is
already held under the previous binding. The new binding MUST affect only keydown events that occur
after the remap. Holding a key through a remap that removes its action MUST NOT produce that action
until the key is released and re-pressed.

#### Scenario: held key is not re-armed by a remap
- **GIVEN** `KeyW` is held (producing `forward`), then `forward` is remapped to `KeyU` while `KeyW`
  is still held
- **WHEN** the next keyboard device frames are built
- **THEN** `forward` is no longer produced by the still-held `KeyW`; it is produced only after
  `KeyW` is released and `KeyU` is pressed

### Requirement: gamepad polling and disconnect
The wiring MUST poll `navigator.getGamepads()` each frame and feed `pressedActions(buttons)`,
`movementVector(leftStick)`, `lookVector(rightStick)`, and `uiNav(buttons)` into the gamepad device
field. A gamepad that is absent or `connected === false` MUST yield `connected = false` with zero
move/look/actions/uiNav. A disconnect mid-hold MUST NOT leave a stale held action in subsequent
frames.

#### Scenario: gamepad poll and disconnect
- **GIVEN** a connected gamepad whose buttons press `attack` and right stick is `{ x: 0.5, y: 0 }`
- **WHEN** the wiring builds the gamepad frame
- **THEN** `gamepad.actions` contains `attack`, `gamepad.look` is `{ x: 0.5, y: 0 }`, and
  `gamepad.connected` is true
- **AND GIVEN** the same gamepad reports `connected === false` in a later poll while the button was
  still held
- **THEN** the next gamepad frame is `connected = false` with empty actions and zero look

### Requirement: touch capture and HUD
The wiring MUST capture pointer/touch events, normalize positions to `[0, 1]`, feed 210's
`resolveTouches`, and route the resolved `actions`/`move`/`lookDelta` into the touch device field.
It MUST render the `TOUCH_ZONES` HUD while a touch-capable input mode is active. When no touch is
down, the touch device field MUST yield zero move/look and no actions.

#### Scenario: touch drives movement and a button
- **GIVEN** a move-zone drag from `(0.2, 0.5)` to `(0.3, 0.5)` and a touch in the `jump` zone
- **WHEN** the wiring normalizes and calls `resolveTouches`
- **THEN** `touch.actions` contains `jump` and `touch.move` is `{ x: 0.4, y: 0 }` (the 210 drag
  math result), routed into the touch device field

#### Scenario: no active touch yields zero
- **GIVEN** no touches are down
- **WHEN** the wiring builds the touch device field
- **THEN** `touch.actions` is empty and `touch.move`/`touch.look` are `{ x: 0, y: 0 }`

### Requirement: settings application
The wiring MUST scale mouse look by the 206 `mouseSensitivity` (not the hard-coded
`CONFIG.mouseSensitivity`), MUST negate the vertical look component when `invertY` is true, and MUST
trigger a jump on the ground when `autoJump` is true. These MUST read from the loaded
`SettingsStore`.

#### Scenario: sensitivity and invertY applied to mouse look
- **GIVEN** `mouseSensitivity = 1`, `invertY = true`, and a raw `mousemove` delta
  `(movementX=10, movementY=4)`
- **WHEN** the wiring builds the mouse device field
- **THEN** `mouse.look.x` is `10` and `mouse.look.y` is `-4` (inverted); with `invertY = false`,
  `mouse.look.y` is `+4`

### Requirement: accessibility input application
The wiring MUST apply 208's `reducedMotion` by reducing input-driven camera/UI motion, and MUST
apply `uiScale` by scaling the UI and touch HUD. These MUST read from the loaded
`AccessibilityStore`. Rendering-only options (`subtitles`, `screenEffects`, `flashLighting`,
`textBackgroundOpacity`, `chatVisibility`) MUST NOT change input resolution and are applied by other
layers.

#### Scenario: reducedMotion and uiScale applied
- **GIVEN** a loaded `AccessibilityStore` with `reducedMotion = true` and `uiScale = 'large'`
- **WHEN** the render/UI layer reads the options for the input-driven camera and touch HUD
- **THEN** camera/UI motion is reduced per `reducedMotion`, and the UI/touch HUD is scaled per
  `uiScale`; the resolved action/move/look values are unchanged by these options

### Requirement: playable state
The wiring MUST mark a frame active under the rule: keyboard/mouse input is active only while
pointer-locked and the game is not paused/overlaid; gamepad input is active when a connected
gamepad is present and the game is not paused/overlaid; touch input is active when a touch is
down and the game is not paused/overlaid. A non-active frame MUST NOT deliver actions, movement,
look, or held buttons to the game.

#### Scenario: gamepad plays without pointer lock
- **GIVEN** a connected gamepad pressing `forward` and no pointer lock (keyboard/mouse inactive)
- **WHEN** the frame's `active` is evaluated and the game state is not paused/overlaid
- **THEN** the gamepad contributes its action/movement (lock-free play), while the keyboard/mouse
  devices contribute nothing

#### Scenario: paused game delivers no input
- **GIVEN** the pause overlay is open
- **WHEN** any device supplies input
- **THEN** the frame is not active and delivers no actions/movement/look/held buttons to the game

## Error and failure behavior
- Corrupt/absent persisted payloads: loading `deserializeSettings`/`deserializeKeybindings`/
  `deserializeAccessibility` that throw MUST be caught at load and fall back to defaults, so a
  corrupt payload never crashes the input path.
- A missing/unavailable `navigator.getGamepads()` or Gamepad API MUST degrade to a zero gamepad
  frame (no crash).
- Touch pointer cancellation or `touchcancel` MUST zero the touch device field.

## Performance and resource bounds
- Per frame: one `getGamepads()` poll, one `resolveTouches` over active touches (O(touches × 7)),
  one `resolveFrame`. Bounded and small; no per-frame DOM allocations beyond normalized buffers.

## Compatibility and migration
- 206/207/208/209/210 formats and contracts unchanged; `InputState` interface preserved.
- Corrupt-payload default fallback is additive at load; valid payloads load identically.

## Security and integrity
- DOM event data is reduced to primitive frames before entering the pure coordinator; no untrusted
  object survives into simulation state.
- `event.preventDefault()` is applied for consumed game keys/buttons so browser default actions
  (context menu, page scroll on Space) do not interfere.

## Observability
- The resolved frame is exposed read-only (via `__voxelGame` in the E2E build) so tests can assert
  per-device contributions and arbitration without enabling debug UI in release.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 remap-aware keyboard | `tests/unit/InputManager` (or keyboard helper) › remapped binding drives movement |
| REQ-2 remap subsequent-only | › held key not re-armed by remap |
| REQ-3 gamepad poll/disconnect | `tests/e2e/game.spec.ts` › simulated gamepad drives movement/actions |
| REQ-4 touch capture/HUD | `tests/e2e/game.spec.ts` › simulated touch drives movement/actions |
| REQ-5 settings application | unit › sensitivity/invertY/autoJump; e2e › sensitivity affects look |
| REQ-6 accessibility application | unit/e2e › reducedMotion/uiScale applied without changing resolution |
| REQ-7 playable state | `tests/e2e/game.spec.ts` › gamepad/touch lock-free; paused delivers none |
