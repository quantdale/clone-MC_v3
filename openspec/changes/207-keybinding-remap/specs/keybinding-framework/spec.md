# Spec: keybinding-framework

## Contract
This capability adds the remappable controls model: a fixed 23-action table with default keys,
an immutable binding state, conflict-aware remapping with vanilla swap semantics, resets, and
versioned standalone persistence — pure and headless-safe.

## Definitions
- **Action**: one of the 23 bindable controls (movement, interaction, inventory, hotbar).
- **Key**: a `KeyboardEvent.code`-style string (e.g. `KeyW`, `Space`, `Digit1`, `MouseLeft`).
- **Displaced**: the action that previously held the remapped key (swap semantics).

## Invariants
- Pure and headless-safe: no input capture, no mutation of inputs.
- Every action has exactly one key; `remapKey` NEVER unbinds (swap keeps all actions bound).
- `remapKey` MUST return `{ ok: false, reason: 'invalid_key' }` for empty/whitespace keys,
  MUST identity-no-op on same-action rebinds, MUST swap on cross-action rebinds, and MUST report
  the displaced action.
- `actionForKey` MUST return the first action bound to a key, or `null`.
- Deserialization MUST throw for unknown actions and invalid keys, MUST default MISSING actions,
  and MUST not partially accept anything else.

## Requirements

### Requirement: action table and defaults
`KEYBINDING_ACTIONS` MUST contain exactly the 23 documented actions in order; `defaultKey(action)`
MUST return the documented default for each; `createDefaultKeybindings()` MUST bind every default.

#### Scenario: table
- **GIVEN** `KEYBINDING_ACTIONS`, `defaultKey('forward')`, `defaultKey('hotbar1')`,
  `defaultKey('attack')`, and `createDefaultKeybindings()`
- **THEN** the table has 23 entries in the documented order; the defaults are `KeyW`, `Digit1`,
  `MouseLeft`; the default state binds all 23 defaults

### Requirement: queries
`keyFor(state, action)` MUST return the action's key; `actionForKey(state, key)` MUST return the
first action bound to the key, or `null` when unbound.

#### Scenario: queries
- **GIVEN** a default state
- **THEN** `keyFor(state, 'forward')` is `KeyW`; `actionForKey(state, 'KeyW')` is `forward`;
  `actionForKey(state, 'KeyZ')` is `null`

### Requirement: conflict-aware remap
`remapKey(state, action, key)` MUST return `{ ok: false, reason: 'invalid_key' }` for an
empty/whitespace key; `{ ok: true, state, displaced: null }` with the IDENTICAL state for a
same-action rebind; a NEW state binding the key for a free key; and for a key held by another
action a NEW state where the actions SWAP keys, reporting the displaced action.

#### Scenario: remap
- **GIVEN** a default state
- **THEN** `remapKey(state, 'forward', '')` is `{ ok: false, reason: 'invalid_key' }`;
  `remapKey(state, 'forward', 'KeyW')` is `{ ok: true, state, displaced: null }` (identical
  state); `remapKey(state, 'forward', 'KeyZ')` binds `forward` to `KeyZ` with no displaced
  action; `remapKey(state, 'jump', 'KeyZ')` swaps — `jump` gets `KeyZ`, `forward` gets `Space`,
  displaced is `forward`

### Requirement: resets
`resetKey(state, action)` MUST restore the action's default (identity no-op when already
default); `resetAll(state)` MUST restore every default.

#### Scenario: resets
- **GIVEN** a state with `forward` remapped to `KeyZ`
- **THEN** `resetKey(state, 'forward')` binds `KeyW`; `resetAll(state)` equals the default state;
  `resetAll(defaults)` is the identical object

### Requirement: versioned persistence
`serializeKeybindings(state)` MUST produce `{ version: 1, bindings }`; `deserializeKeybindings`
MUST round-trip it, MUST throw a descriptive `Error` for a non-object payload, an unsupported
version, a non-object `bindings`, an unknown action, an invalid (empty) key, and unknown
top-level keys, and MUST default MISSING actions.

#### Scenario: persistence
- **GIVEN** a state, its serialization, `null`, `{ version: 0, bindings: {} }`,
  `{ version: 1, bindings: 'x' }`, `{ version: 1, bindings: { nope: 'KeyW' } }`,
  `{ version: 1, bindings: { forward: '' } }`, `{ version: 1, bindings: { forward: 'KeyZ' } }`,
  and `{ version: 1, bindings: { forward: 'KeyZ' }, extra: true }`
- **THEN** the round-trip equals the original; the invalid inputs each throw mentioning
  `expected an object`, `unsupported version`, `bindings must be an object`, `unknown action`,
  `must be a non-empty string`, and `unknown key` respectively; the partial input deserializes
  with `forward` = `KeyZ` and every other action at its default

## Error and failure behavior
- `remapKey` reports invalid keys structurally; only `deserializeKeybindings` throws.

## Performance and resource bounds
- O(actions) for remap/actionForKey; O(1) otherwise.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no save-format change.

## Security and integrity
- Pure functions; swap semantics keep every action bound (no unbound actions).

## Observability
- The state is a plain immutable object; `actionForKey` exposes the dispatch view.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 table/defaults | `tests/unit/KeybindingFramework.test.ts` › table |
| REQ-2 queries | › queries |
| REQ-3 remap | › remap |
| REQ-4 resets | › resets |
| REQ-5 persistence | › persistence |
