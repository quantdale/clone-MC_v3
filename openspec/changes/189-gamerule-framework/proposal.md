# Proposal: 189-gamerule-framework

## Problem
188 added difficulty but the world's *rules* — daylight cycle, mob spawning, keepInventory,
griefing, weather, tick speeds — have no typed layer: no registry, no validation, no persistence.
Simulation systems (044 clock, 138 spawn, 196 weather, 198 sleep) have nothing to query.

## Goals
- `src/simulation/GameRuleFramework.ts` (NEW), pure and deterministic:
  - **Registry**: `GAME_RULE_KEYS` (9 vanilla rules) with `GameRuleDefinition` (`key`/`kind`/
    `defaultValue`) over `boolean`/`integer`/`string` kinds; `gameRuleDefinitions()`/
    `gameRuleDefinition(key)`.
  - **State**: `createDefaultGameRules()` (all defaults); `getGameRule`; `setGameRule` — validates
    the value against the kind; an illegal value (or unknown key) returns the IDENTICAL store
    (identity no-op); `isValidGameRuleValue` for callers.
  - **Text parsing**: `parseGameRuleValue(key, text)` — booleans true/false case-insensitively,
    integers strict (`-?\d+`), strings verbatim; `null` on failure (191's `/gamerule` entry).
  - **Persistence**: versioned `serializeGameRules`/`deserializeGameRules` — validates version, the
    exact known-key set (unknown keys rejected), and each value's kind.

## Non-goals
- **No simulation integration** (044/138/196/198 wiring changes query the store), **no command**
  (191), **no `Game`/`World` wiring**.

## Preconditions
- Change 188 (`world-difficulty`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library (a standalone framework, like 188).

## Proposed change
1. `src/simulation/GameRuleFramework.ts` (NEW): the constants, types, registry, store ops, parser,
   and persistence pair.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change (the serialized rules are a new additive shape).

## Risks
- **Wrong-kind values leaking into the store**. Mitigation: `setGameRule` validates at runtime
  (identity no-op) and deserialization rejects wrong kinds — both pinned.
- **Unknown rule keys silently accepted**. Mitigation: the store is typed over the fixed key set and
  deserialization rejects unknown keys explicitly.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All listed functions implemented per design.md/spec.md.
- Unit tests cover: the 9-rule registry (kinds + defaults); default store; set with immutability and
  identity no-ops (wrong kind, same value); `isValidGameRuleValue` per kind; parsing (booleans case/
  trim, integers strict, strings verbatim, unknown key); persistence round-trip; malformed
  rejection (null, bad version, wrong kind, unknown key).
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
