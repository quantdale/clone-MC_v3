# Design: 189-gamerule-framework

## Context/current state
- 188 established the standalone-knob pattern (difficulty). 189 generalizes it: a typed rule set
  with validation and persistence, which simulation systems will query.

## Target state
- `src/simulation/GameRuleFramework.ts` holding the rule registry, the immutable store ops, the
  text parser, and the validated persistence pair.

## Invariants
- `GAME_RULE_KEYS` is exactly the 9-key set; each rule has a kind (`boolean`/`integer`/`string`)
  and a vanilla default.
- `setGameRule` returns a NEW store only for a legal value of the rule's kind; otherwise the
  IDENTICAL store (including setting the same value).
- `parseGameRuleValue` is case-insensitive for booleans, strict-integer for integers, verbatim for
  strings; `null` on failure or unknown key.
- `deserializeGameRules` validates version, known-key set, and per-value kinds before accepting.

## API and data model
```ts
// src/simulation/GameRuleFramework.ts (new)
export const GAMERULE_VERSION = 1;
export type GameRuleKind = 'boolean' | 'integer' | 'string';
export type GameRuleValue = boolean | number | string;
export interface GameRuleDefinition { key: string; kind: GameRuleKind; defaultValue: GameRuleValue; }
export const GAME_RULE_KEYS = ['doDaylightCycle','doMobSpawning','keepInventory','mobGriefing','doWeatherCycle','doFireTick','doImmediateRespawn','randomTickSpeed','spawnRadius'] as const;
export type GameRuleKey = (typeof GAME_RULE_KEYS)[number];
export type GameRuleStore = Readonly<Record<GameRuleKey, GameRuleValue>>;
export function gameRuleDefinitions(): readonly GameRuleDefinition[];
export function gameRuleDefinition(key: string): GameRuleDefinition | undefined;
export function createDefaultGameRules(): GameRuleStore;
export function getGameRule(store: GameRuleStore, key: GameRuleKey): GameRuleValue;
export function isValidGameRuleValue(key: string, value: unknown): value is GameRuleValue;
export function setGameRule(store: GameRuleStore, key: GameRuleKey, value: GameRuleValue): GameRuleStore;
export function parseGameRuleValue(key: string, text: string): GameRuleValue | null;
export interface SerializedGameRules { version: 1; rules: Record<string, GameRuleValue>; }
export function serializeGameRules(store: GameRuleStore): SerializedGameRules;
export function deserializeGameRules(input: unknown): GameRuleStore;
```

## Control/data flow
1. A wiring change creates a store per world, persists it via the serialization pair, and feeds it
   to the simulation systems that query rules (044 clock, 138 spawn, 196 weather, 198 sleep).
2. 191's `/gamerule` command parses text via `parseGameRuleValue` and applies `setGameRule`.

## Detailed behavior
- The registry is a module-level frozen array; kind validation is runtime (the store type is
  typed, but callers may hold untyped values — e.g. from commands — so `setGameRule` re-checks).
- The unknown-key check runs AFTER the known-key completeness check in deserialization; a payload
  missing known keys is malformed regardless of extras (both paths tested).

## Failure modes
- Deserialization throws on any malformed field; every other function is total.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; new additive versioned shape.

## Performance/resource constraints
- All operations O(rules) or O(1); stores are small fixed records.

## Testing seams
- Tests use plain store literals and the real serialization pair.

## Observability/debugging
- `gameRuleDefinitions`/`getGameRule` expose the registry and state.

## Affected files/symbols
- `src/simulation/GameRuleFramework.ts` (new).
- Tests: `tests/unit/GameRuleFramework.test.ts` (new). No other files.

## Rejected alternatives
- **A mutable rule object**: rejected — the immutable store + identity no-ops match the section's
  discipline and make change detection free.
- **Auto-creating unknown rules**: rejected — the exact-key contract keeps persistence strict.

## Downstream dependencies
- 190/191 (commands) parse and set rules; 196/198 (weather/sleep) query them; 242's e2e asserts
  rule-driven behavior (e.g. keepInventory).
