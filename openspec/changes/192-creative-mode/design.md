# Design: 192-creative-mode

## Context/current state
- 191 can produce a `set_gamemode` effect but there is no mode model: no state, no rules, no text
  entry, no persistence. 193-195 (hardcore, spectator, adventure) will extend the same model, so
  192 must define the canonical mode set and behavior rules cleanly.

## Target state
- `src/simulation/GameModeFramework.ts` holding the canonical `GAME_MODES` tuple, immutable
  `GameModeState`, `parseGameMode`, the four creative-behavior predicates, and versioned
  persistence.

## Invariants
- Pure and headless-safe: no world access, no mutation of anything outside the returned state.
- The mode set is exactly `['survival', 'creative', 'adventure', 'spectator']` and MUST stay equal
  to 191's `CoreCommands.GAMEMODES` (pinned by a test).
- `setGameMode` returns the IDENTICAL state for same-mode or invalid input; a new state otherwise.
- `parseGameMode` is case-insensitive and trims; anything outside the set is `null`.
- Deserialization validates the whole payload before accepting anything; failures throw descriptive
  `Error`s.
- Behavior predicates are pure functions of mode with vanilla semantics:
  `canFly` = creative, spectator; `instantBlockBreak` = creative only; `depletesItems` = survival,
  adventure; `survivalStatsDeplete` = survival, adventure.

## API and data model
```ts
// src/simulation/GameModeFramework.ts (new)
export const GAME_MODES = ['survival', 'creative', 'adventure', 'spectator'] as const;
export type GameMode = (typeof GAME_MODES)[number];

export interface GameModeState { mode: GameMode; }

export function createDefaultGameModeState(): GameModeState;         // { mode: 'survival' }
export function setGameMode(state: GameModeState, mode: GameMode): GameModeState;
export function parseGameMode(text: string): GameMode | null;
export function canFly(mode: GameMode): boolean;
export function instantBlockBreak(mode: GameMode): boolean;
export function depletesItems(mode: GameMode): boolean;
export function survivalStatsDeplete(mode: GameMode): boolean;

export interface SerializedGameModeState { version: 1; mode: GameMode; }
export function serializeGameModeState(state: GameModeState): SerializedGameModeState;
export function deserializeGameModeState(input: unknown): GameModeState;
```

## Control/data flow
1. A mode change originates as text (191's `/gamemode` → `parseGameMode`) or directly as a
   `GameMode`.
2. `setGameMode` returns the new immutable state; a future wiring pushes it to the player/world.
3. Behavior consumers (flight, block breaking, inventory, survival systems) query the predicates
   with the current mode; each is a pure function, so consumers stay deterministic.

## Detailed behavior
- `setGameMode`: mode not in `GAME_MODES` (type-wise impossible at compile time, guarded at
  runtime for untyped callers) or equal to the current mode -> identical state; otherwise a new
  state object.
- `parseGameMode`: `'  CREATIVE '` -> `'creative'`; `'hard'` / `''` -> `null`.
- Predicates (mode -> result):
  `survival`: canFly F, instant F, depletesItems T, survivalStatsDeplete T;
  `creative`: canFly T, instant T, depletesItems F, survivalStatsDeplete F;
  `adventure`: canFly F, instant F, depletesItems T, survivalStatsDeplete T;
  `spectator`: canFly T, instant F, depletesItems F, survivalStatsDeplete F.
- `deserializeGameModeState`: rejects non-objects (`GameModeFramework: expected an object`), wrong
  version (`unsupported version <v>`), a mode outside the set (`unknown mode <m>`), and unknown
  extra keys (`unknown key <k>`); each rejection throws; no partial acceptance.

## Failure modes
- No throws in the state/rules API; `parseGameMode` returns `null`, `setGameMode` identity-no-ops.
- Only `deserializeGameModeState` throws (invalid persisted data must not be silently accepted).

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- All operations O(1); predicate lookups are member checks on a 4-element tuple.

## Testing seams
- Tests drive the framework directly; the consistency test imports `GAMEMODES` from
  `CoreCommands.ts` and deep-equals it with `GAME_MODES`.

## Observability/debugging
- The state is a plain immutable object; `parseGameMode` failures are `null`; persistence failures
  are descriptive errors naming the field.

## Affected files/symbols
- `src/simulation/GameModeFramework.ts` (new).
- Tests: `tests/unit/GameModeFramework.test.ts` (new). No other files.

## Rejected alternatives
- **Wiring flight/instant-break into the engine now**: rejected — matches the pure-module arc
  (188-191) and keeps 192 bounded; consumers land with the game-modes wiring change.
- **Importing `GAMEMODES` from CoreCommands**: rejected — the command layer is downstream of the
  framework; the asserted-equality test keeps one canonical set without inverting dependencies.

## Downstream dependencies
- 193 (`hardcore-mode`) extends the model with difficulty-lock/death semantics; 194-195 complete
  the arc; the game-modes wiring applies `setGameMode` states and queries the predicates (flight,
  instant break, inventory depletion, survival stats); 242's e2e drives mode changes via commands.
