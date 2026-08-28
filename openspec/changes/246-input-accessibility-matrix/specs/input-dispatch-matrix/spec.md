# Spec: input-dispatch-matrix

## Contract
This capability defines the pure input coordinator (`src/simulation/InputCoordinator.ts`): a
headless-safe function that merges per-device raw resolutions (keyboard, mouse, gamepad, touch)
into a single `ResolvedInputFrame` per the device × action × edge-case matrix. It covers action
union, movement/look arbitration, held-button merge, hotbar aggregation, and simultaneous-device
(sticky) semantics. It does NOT touch the browser: the wiring feeds hand-built `DeviceFrame`s.
Rendering-only accessibility/audio options and any change to 207/208/209/210 are out of scope here
(see Contract of `device-input-wiring`).

## Definitions
- **Action**: a `KeybindingAction` from 207 (`forward`, `back`, `left`, `right`, `jump`, `sneak`,
  `sprint`, `attack`, `use`, `pickBlock`, `inventory`, `drop`, `swapOffhand`, `chat`, `hotbar1`..`9`).
- **DeviceFrame**: the per-frame raw resolutions for the four devices (`keyboard`, `mouse`,
  `gamepad`, `touch`).
- **Move vector**: an analog `{ x, y }` direction the `PlayerController` scales to a speed.
- **Look delta**: an analog `{ x, y }` camera offset (yaw/pitch).
- **Zero vector**: `{ x: 0, y: 0 }` exactly.

## Invariants
- Pure and headless-safe: no DOM access, no Gamepad API, no mutation of inputs, no throws.
- Resolved actions are the union of all devices' actions, deduped, ordered by `KEYBINDING_ACTIONS`.
- Move arbitration priority is `gamepad > touch > keyboard`; a device whose move is the zero vector
  never blocks a lower-priority device with a non-zero vector.
- Look arbitration priority is `mouse > gamepad > touch`; the first non-zero source wins.
- `breakHeld`/`useHeld`/`pickHeld` are true when ANY device holds the corresponding action.
- Releasing one device never clears another device's still-held input (per-device state).

## Requirements

### Requirement: action resolution
`resolveFrame(frame)` MUST return the union of `frame.keyboard.heldActions`, `frame.gamepad.actions`,
and `frame.touch.actions`, deduped (each action at most once) and ordered by `KEYBINDING_ACTIONS`.
Mouse/gamepad/touch held buttons MUST additionally contribute `attack`, `use`, and `pickBlock` to
the union as their held flags are true.

#### Scenario: union, dedupe, and order
- **GIVEN** a `DeviceFrame` with `keyboard.heldActions = ['sprint', 'forward']`,
  `gamepad.actions = ['forward', 'attack']`, `touch.actions = ['forward']`, `mouse.breakHeld = true`
- **WHEN** `resolveFrame(frame)` is called
- **THEN** `actions` is `['forward', 'sprint', 'attack']` in `KEYBINDING_ACTIONS` order, with
  `forward` appearing once (deduped across three devices) and `attack` present because
  `mouse.breakHeld` is true

### Requirement: move arbitration
`resolveFrame` MUST select the move vector from the first non-zero candidate in priority order
`gamepad.move`, then `touch.move`, then a cardinal vector derived from
`keyboard.heldActions`. A candidate that is the zero vector MUST be skipped, so a lower-priority
device with a non-zero vector wins. When every candidate is zero, move MUST be `{ x: 0, y: 0 }`.

#### Scenario: gamepad beats keyboard; zero gamepad defers to keyboard
- **GIVEN** `gamepad.connected = true`, `gamepad.move = { x: 1, y: 0 }`, and
  `keyboard.heldActions = ['right']`
- **WHEN** `resolveFrame(frame)` is called
- **THEN** `move` is `{ x: 1, y: 0 }` (gamepad priority)
- **AND GIVEN** the same frame but `gamepad.move = { x: 0, y: 0 }`
- **WHEN** `resolveFrame(frame)` is called
- **THEN** `move` is the keyboard cardinal vector for `right` (a zero gamepad never blocks keyboard)

#### Scenario: no device contributes movement
- **GIVEN** all devices idle (`gamepad.move` zero, `touch.move` zero, `keyboard.heldActions` empty)
- **WHEN** `resolveFrame(frame)` is called
- **THEN** `move` is `{ x: 0, y: 0 }`

### Requirement: look arbitration
`resolveFrame` MUST select the look delta from the first non-zero candidate in priority order
`mouse.look`, then `gamepad.look`, then `touch.look`. The mouse is the precise pointer and wins
when its look is non-zero. When every candidate is zero, look MUST be `{ x: 0, y: 0 }`.

#### Scenario: mouse beats gamepad and touch
- **GIVEN** `mouse.look = { x: 0.02, y: 0 }`, `gamepad.look = { x: 0.4, y: 0.1 }`,
  `touch.look = { x: 0.3, y: 0 }`
- **WHEN** `resolveFrame(frame)` is called
- **THEN** `look` is `{ x: 0.02, y: 0 }` (mouse wins)

#### Scenario: idle mouse defers to gamepad
- **GIVEN** `mouse.look = { x: 0, y: 0 }`, `gamepad.look = { x: 0.4, y: 0.1 }`,
  `touch.look = { x: 0.3, y: 0 }`
- **WHEN** `resolveFrame(frame)` is called
- **THEN** `look` is `{ x: 0.4, y: 0.1 }` (gamepad wins over the zero mouse and the touch)

### Requirement: held-button merge
`resolveFrame` MUST set `breakHeld` true when `mouse.breakHeld`, `gamepad.actions` contains
`attack`, or `touch.actions` contains `attack`; `useHeld` true when `mouse.useHeld`,
`gamepad.actions` contains `use`, or `touch.actions` contains `use`; and `pickHeld` true when
`mouse.pickHeld` or the corresponding pick action is held on any device. A device releasing its
button MUST NOT clear the merge while another device still holds it.

#### Scenario: any device holds break
- **GIVEN** `mouse.breakHeld = false`, `gamepad.actions = ['attack']`, `touch.actions = []`
- **WHEN** `resolveFrame(frame)` is called
- **THEN** `breakHeld` is true (gamepad holds it despite the mouse not holding it)

### Requirement: hotbar aggregation
`resolveFrame` MUST set `hotbarIndex` to `frame.keyboard.hotbarIndex` when it is in `[0, 8]`, else
`-1`, and MUST set `hotbarDelta` to `frame.keyboard.hotbarDelta`. A repeated `keydown` for an
already-selected hotbar slot MUST NOT change the aggregated result more than once per frame.

#### Scenario: keyboard hotbar index and wheel
- **GIVEN** `keyboard.hotbarIndex = 2`, `keyboard.hotbarDelta = 1`
- **WHEN** `resolveFrame(frame)` is called
- **THEN** `hotbarIndex` is `2` and `hotbarDelta` is `1`

### Requirement: sticky across devices
Releasing one device MUST NOT clear another device's still-held input. `resolveFrame` MUST compute
each output from the CURRENT per-device fields independently, so an action held on gamepad remains
in `actions` after the keyboard and touch devices go idle.

#### Scenario: gamepad hold survives other-device release
- **GIVEN** `gamepad.actions = ['jump']`, `touch.actions = ['jump']`, then a frame where
  `touch.actions = []` while `gamepad.actions` stays `['jump']`
- **WHEN** `resolveFrame` is called on both frames
- **THEN** `actions` contains `'jump'` in both results (the gamepad hold persists)

## Error and failure behavior
- `resolveFrame` is a total function over `DeviceFrame`; it MUST NOT throw for any input, including
  empty device fields, `connected = false` gamepads, negative/out-of-range hotbar indices (treated
  as no selection), or partially-populated frames. Unknown/invalid per-device data is ignored.

## Performance and resource bounds
- O(actions × 4) per `resolveFrame` with constant device count; O(1) object rebuild for the result.
- No allocations beyond the returned `ResolvedInputFrame` and the internal dedupe array.

## Compatibility and migration
- New pure module; no registry, world-save, or 206-210 contract changes. `InputState` remains the
  public interface consumed by `PlayerController`/`PlayerInteraction`.

## Security and integrity
- Pure functions over caller-supplied frames; inputs are never mutated; a malicious/overflowing
  per-device action list cannot crash resolution.

## Observability
- `ResolvedInputFrame` is a plain object; the debug overlay can print `actions`, `move`, `look`,
  and the held-button flags without enabling them in release.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 action resolution | `tests/unit/InputCoordinator.test.ts` › action union/dedupe/order |
| REQ-2 move arbitration | › move priority and zero-deferral |
| REQ-3 look arbitration | › look priority and zero-deferral |
| REQ-4 held-button merge | › held-button merge across devices |
| REQ-5 hotbar aggregation | › hotbar index/wheel |
| REQ-6 sticky across devices | › per-device release keeps others held |
