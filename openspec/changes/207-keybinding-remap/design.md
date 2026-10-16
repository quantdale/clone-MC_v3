# Design: 207-keybinding-remap

## Context/current state
- 206 provides typed settings; controls are fixed. 207 adds the keybinding model with conflict-
  aware remapping and standalone persistence; the input wiring maps pressed keys through
  `actionForKey`.

## Target state
- `src/simulation/KeybindingFramework.ts` holding the action table, the immutable binding state,
  the remap/reset operations, and versioned persistence.

## Invariants
- Pure and headless-safe: no input capture, no mutation of inputs.
- Every action has exactly one key; every action is present in the state.
- `remapKey` never throws: invalid keys yield `{ ok: false, reason: 'invalid_key' }`; same-action
  rebinds are identity no-ops; cross-action rebinds SWAP (the displaced action receives the
  remapped action's previous key).
- `actionForKey` returns the FIRST action bound to a key (binding order), or null.
- Deserialization: unknown actions and invalid (empty) keys throw; MISSING actions default;
  nothing else is partially accepted.

## API and data model
```ts
// src/simulation/KeybindingFramework.ts (new)
export const KEYBINDING_ACTIONS: readonly string[];   // 23 actions in order
export type KeybindingAction = (typeof KEYBINDING_ACTIONS)[number];

export interface KeybindingState { bindings: Readonly<Record<KeybindingAction, string>>; }
export function createDefaultKeybindings(): KeybindingState;
export function defaultKey(action: KeybindingAction): string;
export function keyFor(state: KeybindingState, action: KeybindingAction): string;
export function actionForKey(state: KeybindingState, key: string): KeybindingAction | null;

export type RemapResult =
  | { ok: true; state: KeybindingState; displaced: KeybindingAction | null }
  | { ok: false; reason: 'invalid_key' };
export function remapKey(state: KeybindingState, action: KeybindingAction, key: string): RemapResult;
export function resetKey(state: KeybindingState, action: KeybindingAction): KeybindingState;
export function resetAll(state: KeybindingState): KeybindingState;

export interface SerializedKeybindings { version: 1; bindings: Record<string, string>; }
export function serializeKeybindings(state: KeybindingState): SerializedKeybindings;
export function deserializeKeybindings(input: unknown): KeybindingState;
```

## Control/data flow
1. The options UI calls `remapKey` (e.g. pressing a key while an action is selected).
2. The input wiring calls `actionForKey(state, pressedKey)` to dispatch input.

## Detailed behavior
- Action table (23, with defaults): forward KeyW, back KeyS, left KeyA, right KeyD, jump Space,
  sneak ShiftLeft, sprint ControlLeft, attack MouseLeft, use MouseRight, pickBlock MouseMiddle,
  inventory KeyE, drop KeyQ, swapOffhand KeyF, chat KeyT, hotbar1..hotbar9 = Digit1..Digit9.
- `remapKey(state, action, key)`:
  - `key.trim().length === 0` -> `{ ok: false, reason: 'invalid_key' }`.
  - `keyFor(state, action) === key` -> `{ ok: true, state, displaced: null }` (identity).
  - `holder = actionForKey(state, key)`: `holder === null` -> rebind, `{ ok: true, state:
    bindings + { action: key }, displaced: null }`.
  - else swap: `old = keyFor(state, action)`; new bindings `{ [action]: key, [holder]: old }`;
    `{ ok: true, state, displaced: holder }`.
- `resetKey`: `keyFor === default` -> identity; else bind the default.
- `resetAll`: identical to the default state when already default; else defaults.
- `deserializeKeybindings` rejections: non-object -> `Keybindings: expected an object`; bad
  version -> `unsupported version <v>`; `bindings` non-object -> `bindings must be an object`;
  unknown action -> `unknown action <a>`; invalid key -> `binding <a> must be a non-empty
  string`; unknown top-level keys -> `unknown key <k>`. Missing actions default.

## Failure modes
- `remapKey` reports invalid keys structurally (no throw).
- Only `deserializeKeybindings` throws (invalid persisted data must not be silently accepted).

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no save-format change.
- Missing-action defaults make old payloads loadable after actions are added.

## Performance/resource constraints
- O(actions) for remap/actionForKey; O(1) otherwise.

## Testing seams
- Tests drive the framework directly with exact key strings and assert swap results including
  the displaced action.

## Observability/debugging
- The state is a plain immutable object; `actionForKey` exposes the dispatch view.

## Affected files/symbols
- `src/simulation/KeybindingFramework.ts` (new).
- Tests: `tests/unit/KeybindingFramework.test.ts` (new). No other files.

## Rejected alternatives
- **Unbinding on conflict (no swap)**: rejected — vanilla swaps, and swapping keeps every action
  bound (the state invariant "every action has exactly one key" holds).

## Downstream dependencies
- 208 (`accessibility-options`) extends settings; the options UI binds remap; the input wiring
  dispatches via `actionForKey`; 242's e2e remaps and persists keybindings.
