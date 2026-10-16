# Design: 208-accessibility-options

## Context/current state
- 206/207 cover settings and controls; accessibility options are missing. 208 adds the typed
  accessibility store (206's pattern extended with a `choice` kind); the UI layer applies the
  options, and 209's gamepad controls follow.

## Target state
- `src/simulation/AccessibilityFramework.ts` holding the option table, the immutable store,
  validation, and versioned persistence.

## Invariants
- Pure and headless-safe: no DOM access, no mutation of inputs.
- Every option has a kind and a default; float options declare inclusive [min, max]; choice
  options declare an ordered options list.
- `setOption` returns the IDENTICAL store for invalid values (wrong kind, out of range, unknown
  choice, non-finite) and same-value sets.
- Deserialization: unknown options and invalid values throw; MISSING known options take their
  default (forward-compatible); nothing else is partially accepted.

## API and data model
```ts
// src/simulation/AccessibilityFramework.ts (new)
export type AccessibilityKind = 'boolean' | 'float' | 'choice';
export interface AccessibilityOption {
  key: string;
  kind: AccessibilityKind;
  defaultValue: boolean | number | string;
  min?: number;
  max?: number;
  options?: readonly string[];
}
export const ACCESSIBILITY_OPTIONS: readonly AccessibilityOption[];   // 7 entries
export type AccessibilityKey = 'uiScale' | 'subtitles' | 'reducedMotion' | 'screenEffects' |
  'textBackgroundOpacity' | 'chatVisibility' | 'flashLighting';

export type AccessibilityStore = Readonly<Record<AccessibilityKey, boolean | number | string>>;
export function accessibilityOption(key: string): AccessibilityOption | undefined;
export function createDefaultAccessibility(): AccessibilityStore;
export function getOption(store: AccessibilityStore, key: AccessibilityKey): boolean | number | string;
export function isValidAccessibilityValue(key: string, value: unknown): boolean;
export function setOption(store: AccessibilityStore, key: AccessibilityKey, value: boolean | number | string): AccessibilityStore;

export interface SerializedAccessibility { version: 1; options: Record<string, boolean | number | string>; }
export function serializeAccessibility(store: AccessibilityStore): SerializedAccessibility;
export function deserializeAccessibility(input: unknown): AccessibilityStore;
```

## Control/data flow
1. The options UI reads/writes the store via `getOption`/`setOption`.
2. The wiring persists the serialized payload under its own key (world-independent, like 206/207).

## Detailed behavior
- Option table (7): `uiScale` choice [auto, small, normal, large] default auto; `subtitles`
  boolean default false; `reducedMotion` boolean default false; `screenEffects` choice [fade,
  flash, none] default fade; `textBackgroundOpacity` float [0, 1] default 0.5;
  `chatVisibility` choice [full, commands, hidden] default full; `flashLighting` boolean default
  true.
- `isValidAccessibilityValue(key, value)`: unknown key -> false; boolean -> typeof boolean;
  float -> finite within [min, max]; choice -> string in the options list (exact match).
- `setOption`: invalid or same -> IDENTICAL store; else a NEW store.
- `deserializeAccessibility` rejections: non-object -> `Accessibility: expected an object`; bad
  version -> `unsupported version <v>`; `options` non-object -> `options must be an object`;
  unknown option -> `unknown option <k>`; invalid value -> `option <k> must be <expectation>, got
  <v>` (expectation describes the kind/range/choices). Missing options default.

## Failure modes
- No throws in the store API; only `deserializeAccessibility` throws (invalid persisted data must
  not be silently accepted).

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no save-format change.
- Missing-option defaults make old payloads loadable after options are added.

## Performance/resource constraints
- O(1) get/set; O(options) deserialize.

## Testing seams
- Tests drive the framework directly: boundary values, unknown choices, wrong kinds, missing and
  unknown keys.

## Observability/debugging
- The store is a plain immutable object; option lookup is introspectable.

## Affected files/symbols
- `src/simulation/AccessibilityFramework.ts` (new).
- Tests: `tests/unit/AccessibilityFramework.test.ts` (new). No other files.

## Rejected alternatives
- **Extending 206's settings table in place**: rejected — 206 is published and characterized;
  accessibility stands alone (its own payload) like keybindings.

## Downstream dependencies
- 209 (`gamepad-controls`) consumes the reduced-motion/screen-effect flags; the UI layer applies
  the options; 242's e2e persists accessibility options.
