# Spec: focus-loss-recovery

## Contract
This capability defines how the game recovers from input focus loss and restores on refocus, across
all four devices. It specifies the pure coordinator API (`clearDevice`/`clearAll`), the unified
DOM focus-loss handler (`blur`, `visibilitychange`, `pointerlockerror`), the refocus re-arm rule,
and the failure handling for corrupt persisted payloads, gamepad disconnect, touch cancellation,
and key autorepeat. It does NOT define device-specific resolution (that is `device-input-wiring`) or
the pure arbitration of non-focus frames (`input-dispatch-matrix`).

## Definitions
- **Focus-loss event**: a `blur` on `window`, a `visibilitychange` to hidden, or a
  `pointerlockerror` (failed/forced pointer-lock release).
- **Refocus**: the page regaining focus/visibility and (for keyboard/mouse) pointer lock being
  re-entered.
- **Stale input**: a held key/button/axis that persists into a frame after it should have been
  cleared.
- **Re-arm**: the requirement that a cleared input is re-established only by a fresh physical press
  after refocus.

## Invariants
- `clearAll(frame)` MUST return a frame with every device zeroed: no actions, zero move/look, no
  held buttons, `hotbarIndex = -1`, `hotbarDelta = 0`, and `uiNav` all-false.
- `clearDevice(frame, device)` MUST zero only the named device and preserve the other devices'
  current fields.
- A focused frame MUST NOT inherit stale input from a prior unfocused frame (re-arm required).
- Every focus-loss event MUST clear all devices; the game MUST remain in a consistent, playable,
  non-crashing state and the pause overlay MUST appear as it does today for keyboard/mouse.
- Corrupt/absent persisted payloads MUST fall back to defaults at load and never crash the input
  path.

## Requirements

### Requirement: focus loss clears all devices
On `blur`, `visibilitychange` (hidden), or `pointerlockerror`, the wiring MUST invoke `clearAll`
and apply the resulting zeroed frame, so no device leaks held input into the next frame. The pause
overlay MUST appear for keyboard/mouse (as today) and the game MUST remain responsive for a
subsequent refocus/relock.

#### Scenario: blur during held movement clears all devices
- **GIVEN** keyboard holds `KeyW` (moveForward true), a gamepad holds a movement axis, and a touch
  is down in the move zone
- **WHEN** `window` dispatches `blur`
- **THEN** the next frame has no `forward` action, `move` is `{ x: 0, y: 0 }`, no held buttons, and
  the pause overlay is visible for the keyboard/mouse path

#### Scenario: visibility change to hidden clears input
- **GIVEN** the game is playing with `KeyW` held and pointer locked
- **WHEN** the document becomes hidden (`visibilitychange`, `document.hidden === true`)
- **THEN** movement stops and all device input is zeroed for the next frame

### Requirement: pointer-lock error is recoverable
On `pointerlockerror`, the wiring MUST clear input and surface the recoverable state (the existing
"Pointer lock failed. Click the canvas to try again." overlay message) so the player can re-lock.
The game MUST NOT be left with stuck movement or an unhandled error.

#### Scenario: pointerlockerror releases and is recoverable
- **GIVEN** pointer-locked gameplay holding `KeyW`
- **WHEN** the wiring dispatches a `pointerlockerror`
- **THEN** `moveForward` becomes false, the overlay shows the pointer-lock-failed message, and the
  player can click the canvas to re-lock and continue

### Requirement: refocus requires re-arm
After a focus-loss event and refocus, the wiring MUST require fresh physical presses to re-arm any
input; the auto-released state MUST NOT be silently re-applied. Releasing a key/button while
unfocused MUST NOT produce a phantom held action after refocus, and a held-through-refocus input
MUST be zeroed until re-pressed.

#### Scenario: refocus does not restore stale held input
- **GIVEN** `KeyW` is held, then `blur` fires and `KeyW` is released while unfocused
- **WHEN** focus returns and pointer lock is re-entered
- **THEN** `moveForward` is false; pressing `KeyW` again is required to move

### Requirement: per-device clear preserves other devices
`clearDevice(frame, device)` MUST zero only the named device's fields and MUST preserve the other
devices' current actions/move/look/held buttons. A focus-loss handler MAY clear a single device
without affecting the others, and `clearAll` clears every device.

#### Scenario: clearing the gamepad leaves keyboard input intact
- **GIVEN** a frame with `gamepad.actions = ['jump']` and `keyboard.heldActions = ['forward']`
- **WHEN** `clearDevice(frame, 'gamepad')` is called
- **THEN** the result has empty `gamepad.actions` but `keyboard.heldActions` still contains
  `forward`

### Requirement: corrupt persisted payloads fall back to defaults
The wiring MUST catch a throwing `deserializeSettings`/`deserializeKeybindings`/
`deserializeAccessibility` at load and fall back to the framework default store/state. A corrupt
payload MUST NOT crash input initialization and MUST NOT prevent the game from receiving input.

#### Scenario: corrupt keybinding payload defaults
- **GIVEN** a stored keybinding payload that fails `deserializeKeybindings` (e.g. a non-object or
  an unknown action)
- **WHEN** the wiring loads input configuration at boot
- **THEN** the wiring uses `createDefaultKeybindings()` and the game accepts input normally, with
  the corrupt payload logged but not fatal

### Requirement: disconnect and cancellation zero the device
A gamepad reporting `connected === false` and a touch `touchcancel`/all-fingers-up MUST zero their
device fields on the next frame, leaving no stale held action.

#### Scenario: touchcancel zeroes the touch device
- **GIVEN** a touch is down in the `attack` zone
- **WHEN** a `touchcancel` fires and no touch remains
- **THEN** the next touch device field has no `attack` action and zero move/look

### Requirement: autorepeat does not duplicate edge-triggered signals
A repeated `keydown` (OS autorepeat) for an already-held key MUST NOT queue duplicate
edge-triggered signals (hotbar selection, UI navigation, break-click). Held-state dispatch is
idempotent per frame.

#### Scenario: autorepeat does not re-trigger hotbar
- **GIVEN** `Digit3` is held and the OS repeats `keydown`
- **WHEN** the keyboard device frame is built across repeated events
- **THEN** `hotbarIndex` is `2` exactly once (not repeated), and no duplicate hotbar signal is
  produced

## Error and failure behavior
- Every focus-loss handler path is defensive: a missing Gamepad API, a missing `document.hidden`,
  or a re-entrant focus event MUST NOT throw or corrupt state.
- The cleared frame is used verbatim; the wiring never synthesizes a "recovered" held input.

## Performance and resource bounds
- `clearAll`/`clearDevice` are O(1) object rebuilds; focus-loss handling runs only on the rare
  event, with no per-frame cost when focused.

## Compatibility and migration
- The existing keyboard/mouse focus-loss behavior ("clears movement when the page loses focus") is
  preserved as a regression guard and extended to gamepad/touch and to the unified handler.
- No 206-210 format or contract changes; corrupt-payload default fallback is additive.

## Security and integrity
- Cleared frames never feed stale input into the simulation; a hostile/rapid focus toggle cannot
  wedge held input across a focus boundary.

## Observability
- The overlay state, focus flags, and the cleared frame are observable via the `__voxelGame` E2E
  hook so tests assert per-device clearing and re-arm without enabling debug UI in release.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 focus loss clears all devices | `tests/e2e/game.spec.ts` › blur/visibility clears keyboard+gamepad+touch |
| REQ-2 pointerlockerror recoverable | `tests/e2e/game.spec.ts` › pointerlockerror overlay + relock |
| REQ-3 refocus re-arm | `tests/e2e/game.spec.ts` › refocus requires re-press |
| REQ-4 per-device clear | `tests/unit/InputCoordinator.test.ts` › clearDevice preserves others |
| REQ-5 corrupt payload defaults | unit › corrupt settings/keybindings/accessibility → defaults |
| REQ-6 disconnect/cancellation zero | unit/e2e › gamepad disconnect, touchcancel zero the device |
| REQ-7 autorepeat no duplication | unit › repeated keydown yields one hotbar signal |
