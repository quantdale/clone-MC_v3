# Design: 193-hardcore-mode

## Context/current state
- 192 established the canonical `GameMode` model; 188 established `DifficultyLevel`
  ('peaceful'|'easy'|'normal'|'hard') with pure level-based rules but no mutable difficulty store.
  193 adds the hardcore concept on top: a flag whose semantics lock difficulty and change death
  behavior.

## Target state
- `src/simulation/HardcoreFramework.ts` holding the immutable `HardcoreState`, get/set with
  identity no-op, the difficulty-lock rules, the death-world rules, and versioned persistence.

## Invariants
- Pure and headless-safe: no world access, no mutation of anything outside the returned state.
- `setHardcore` returns the IDENTICAL state for the same boolean; a new state otherwise.
- When `hardcore` is enabled, the effective difficulty is ALWAYS `'hard'` and the post-death mode
  is ALWAYS `'spectator'`, regardless of the configured difficulty or current game mode.
- When disabled, the configured difficulty and current mode pass through unchanged.
- Deserialization validates the whole payload before accepting anything; failures throw descriptive
  `Error`s.

## API and data model
```ts
// src/simulation/HardcoreFramework.ts (new)
export interface HardcoreState { hardcore: boolean; }

export function createDefaultHardcoreState(): HardcoreState;              // { hardcore: false }
export function setHardcore(state: HardcoreState, enabled: boolean): HardcoreState;
export function locksDifficulty(state: HardcoreState): boolean;
export function effectiveDifficulty(state: HardcoreState, level: DifficultyLevel): DifficultyLevel;
export function forcesPermanentDeath(state: HardcoreState): boolean;
export function respawnModeAfterDeath(state: HardcoreState, currentMode: GameMode): GameMode;

export interface SerializedHardcoreState { version: 1; hardcore: boolean; }
export function serializeHardcoreState(state: HardcoreState): SerializedHardcoreState;
export function deserializeHardcoreState(input: unknown): HardcoreState;
```

## Control/data flow
1. A world is created with hardcore enabled (a future world-options flow) or a flag toggles the
   state; `setHardcore` returns the new immutable state.
2. Difficulty consumers ask `effectiveDifficulty(state, level)` — the lock wins when enabled.
3. The death/respawn flow asks `respawnModeAfterDeath(state, currentMode)` — spectator when
   enabled, current mode otherwise.

## Detailed behavior
- `setHardcore`: `enabled` equals the current flag -> identical state; otherwise a new state
  object.
- `effectiveDifficulty`: enabled -> `'hard'` for every configured level (peaceful/easy/normal/hard
  all map to hard); disabled -> the configured level verbatim.
- `respawnModeAfterDeath`: enabled -> `'spectator'` for every current mode; disabled -> the current
  mode verbatim.
- `deserializeHardcoreState`: rejects non-objects (`HardcoreFramework: expected an object`), wrong
  version (`unsupported version <v>`), a non-boolean flag (`hardcore must be a boolean, got <v>`),
  and unknown extra keys (`unknown key <k>`); no partial acceptance.

## Failure modes
- No throws in the state/rules API; `setHardcore` identity-no-ops on same value.
- Only `deserializeHardcoreState` throws (invalid persisted data must not be silently accepted).

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- All operations O(1).

## Testing seams
- Tests drive the framework directly, importing `DifficultyLevel` from 188's WorldDifficulty and
  `GameMode` from 192's GameModeFramework to exercise the integration points.

## Observability/debugging
- The state is a plain immutable object; persistence failures are descriptive errors naming the
  offending field.

## Affected files/symbols
- `src/simulation/HardcoreFramework.ts` (new).
- Tests: `tests/unit/HardcoreFramework.test.ts` (new). No other files.

## Rejected alternatives
- **Extending `GameModeState` with a hardcore flag**: rejected — hardcore is a world-level setting
  orthogonal to the player's mode; a separate state keeps 192's mode model clean and lets 193's
  semantics be tested independently.
- **Modeling the difficulty lock by mutating 188's difficulty**: rejected — 188 has no store, and
  a pure `effectiveDifficulty` rule expresses the lock without hidden state.

## Downstream dependencies
- 194 (`adventure-mode`) and 195 complete the game-modes arc; the game-modes wiring applies
  `respawnModeAfterDeath` in the death/respawn flow and `effectiveDifficulty` wherever difficulty
  is consumed; 242's e2e drives hardcore worlds end to end.
