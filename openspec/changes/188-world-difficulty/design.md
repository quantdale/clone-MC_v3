# Design: 188-world-difficulty

## Context/current state
- 138/141/116/124 exist as pure systems with hard-coded constants; nothing tunes them per world.
  188 adds the difficulty layer they will consult.

## Target state
- `src/simulation/WorldDifficulty.ts` holding the level set, the definition table, the accessors,
  the parser, and the persistence pair.

## Invariants
- `DIFFICULTY_LEVELS` is exactly `['peaceful','easy','normal','hard']`; `DEFAULT_DIFFICULTY` is
  `'normal'`.
- Knobs: peaceful (no spawns, 0 multipliers, no starvation); easy 0.5/0.5; normal 1/1; hard 1.5/1.5
  (spawns and starvation true except peaceful).
- `parseDifficultyLevel` trims, lowercases, and returns `null` for anything outside the set or null
  input.
- `deserializeDifficulty` rejects wrong versions and unknown levels.

## API and data model
```ts
// src/simulation/WorldDifficulty.ts (new)
export const DIFFICULTY_LEVELS = ['peaceful', 'easy', 'normal', 'hard'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];
export const DEFAULT_DIFFICULTY: DifficultyLevel = 'normal';
export interface DifficultyDefinition { level: DifficultyLevel; hostileSpawns: boolean; hostileDamageMultiplier: number; hungerDepletionMultiplier: number; canStarve: boolean; }
export function difficultyDefinition(level: DifficultyLevel): DifficultyDefinition;
export function difficultyAllowsHostileSpawns(level: DifficultyLevel): boolean;
export function difficultyHostileDamageMultiplier(level: DifficultyLevel): number;
export function difficultyHungerDepletionMultiplier(level: DifficultyLevel): number;
export function difficultyCanStarve(level: DifficultyLevel): boolean;
export function parseDifficultyLevel(input: string | null): DifficultyLevel | null;
export interface SerializedDifficulty { version: 1; level: DifficultyLevel; }
export function serializeDifficulty(level: DifficultyLevel): SerializedDifficulty;
export function deserializeDifficulty(input: unknown): DifficultyLevel;
```

## Control/data flow
1. A wiring change reads the persisted level (via `deserializeDifficulty`) and consults the
   accessors where 138/141/116/124 compute spawns, damage, and hunger.
2. 191's `/difficulty` command parses user text via `parseDifficultyLevel` and persists via
   `serializeDifficulty`.

## Detailed behavior
- The table is frozen at module load; definitions are never mutated.
- Multipliers are vanilla's exact values; peaceful's zero multipliers make damage/hunger no-ops
  without special-casing in consumers.

## Failure modes
- Deserialization throws on malformed input; every other function is total.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; new additive versioned shape.

## Performance/resource constraints
- All operations O(1).

## Testing seams
- Tests use the real table and persistence pair.

## Observability/debugging
- Definitions are plain frozen values; accessors make knobs explicit.

## Affected files/symbols
- `src/simulation/WorldDifficulty.ts` (new).
- Tests: `tests/unit/WorldDifficulty.test.ts` (new). No other files.

## Rejected alternatives
- **A single numeric difficulty**: rejected — vanilla's four named levels with distinct knob sets is
  the model consumers expect.
- **A mutable difficulty object**: rejected — an immutable frozen table plus pure accessors matches
  the section's discipline.

## Downstream dependencies
- 189 (gamerules) stores the world's difficulty as one of its rules; 191 (`/difficulty`) parses and
  sets it; 193 (hardcore) locks it; 242's e2e asserts spawn/damage behavior per level.
