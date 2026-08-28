# Design: 206-settings-persistence

## Context/current state
- No settings model exists. 206 adds the typed settings framework (189's gamerule pattern extended
  with numeric ranges); 207 remaps keybindings on top. The wiring stores the serialized payload
  under its own storage key, independent of world saves.

## Target state
- `src/simulation/SettingsFramework.ts` holding the definitions table, the immutable store,
  validation, and versioned persistence.

## Invariants
- Pure and headless-safe: no storage access, no mutation of inputs.
- Every definition has a kind and a default; integer/float kinds declare inclusive [min, max].
- `setSetting` returns the IDENTICAL store for invalid values (wrong kind, out of range,
  non-finite) and same-value sets.
- Deserialization: unknown keys and invalid values throw; MISSING known keys take their default
  (forward-compatible); nothing is partially accepted beyond the missing-key rule.

## API and data model
```ts
// src/simulation/SettingsFramework.ts (new)
export type SettingsKind = 'boolean' | 'integer' | 'float';
export interface SettingsDefinition {
  key: string;
  kind: SettingsKind;
  defaultValue: boolean | number;
  min?: number;
  max?: number;
}
export const SETTING_KEYS: readonly string[];   // 10 keys
export type SettingKey = (typeof SETTING_KEYS)[number];

export type SettingsStore = Readonly<Record<SettingKey, boolean | number>>;
export function settingDefinitions(): readonly SettingsDefinition[];
export function settingDefinition(key: string): SettingsDefinition | undefined;
export function createDefaultSettings(): SettingsStore;
export function getSetting(store: SettingsStore, key: SettingKey): boolean | number;
export function isValidSettingValue(key: string, value: unknown): value is boolean | number;
export function setSetting(store: SettingsStore, key: SettingKey, value: boolean | number): SettingsStore;

export interface SerializedSettings { version: 1; settings: Record<string, boolean | number>; }
export function serializeSettings(store: SettingsStore): SerializedSettings;
export function deserializeSettings(input: unknown): SettingsStore;
```

## Control/data flow
1. The options UI reads/writes the store via `getSetting`/`setSetting`.
2. On change, the wiring serializes and persists under the standalone settings key (localStorage,
   NOT the world database).

## Detailed behavior
- Definitions (10):
  graphics: `renderDistance` integer [2, 32] default 12; `fov` integer [30, 110] default 70;
  `brightness` float [0, 1] default 0.5.
  audio: `masterVolume` float [0, 1] default 1; `musicVolume` float [0, 1] default 1;
  `sfxVolume` float [0, 1] default 1.
  controls: `mouseSensitivity` float [0.1, 2] default 0.5; `invertY` boolean default false.
  gameplay: `autoJump` boolean default true; `showCoordinates` boolean default false.
- `isValidSettingValue(key, value)`: unknown key -> false; boolean -> typeof boolean; integer ->
  safe integer within [min, max]; float -> finite number within [min, max].
- `setSetting`: invalid or same -> IDENTICAL store; else a NEW store.
- `deserializeSettings` rejections: non-object -> `SettingsFramework: expected an object`; bad
  version -> `unsupported version <v>`; `settings` non-object -> `settings must be an object`;
  unknown key -> `unknown setting <k>`; invalid value -> `setting <k> must be <expectation>, got
  <v>` (expectation describes the kind/range). Missing known keys -> default, no error.

## Failure modes
- No throws in the store API; only `deserializeSettings` throws (invalid persisted data must not
  be silently accepted).

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no world-save-format change.
- Missing-key defaults make old payloads loadable after settings are added.

## Performance/resource constraints
- O(1) get/set; O(keys) deserialize.

## Testing seams
- Tests drive the framework directly: boundary values (min/max inclusive), out-of-range, wrong
  kind, NaN, missing keys, unknown keys.

## Observability/debugging
- The store is a plain immutable object; definition lookup is introspectable.

## Affected files/symbols
- `src/simulation/SettingsFramework.ts` (new).
- Tests: `tests/unit/SettingsFramework.test.ts` (new). No other files.

## Rejected alternatives
- **Binding to localStorage in-module**: rejected — purity keeps the framework headless-testable;
  the wiring owns the storage key, keeping settings provably independent of world saves.

## Downstream dependencies
- 207 (`keybinding-remap`) adds a controls section; the options UI binds the store; 242's e2e
  persists settings across reloads.
