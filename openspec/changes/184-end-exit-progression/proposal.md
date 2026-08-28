# Proposal: 184-end-exit-progression

## Problem
183 gives the dragon a defeat state but nothing *happens* on victory: no exit portal, no return
teleport, no persisted completion. The End arc's capstone — "beat the dragon, leave the End" — is
missing, and without a persisted record the victory would vanish on reload.

## Goals
- `src/simulation/EndExitProgression.ts` (NEW), pure and deterministic:
  - **Exit portal**: `endExitPortalCells(centerX, y, centerZ)` — the 21 cells of vanilla's exit
    portal (5×5 of end-portal blocks with the four corners missing);
    `endExitPortalSpawns(gatewayOpen)` — the explicit spawn condition (the wiring passes 183's
    `dragonReturnGatewayOpen`); `endExitPortalRemains(record)` — a defeated completion record keeps
    the portal present post-boss.
  - **Return**: `endExitDestination(worldSpawn)` — the overworld spawn, returned unchanged when
    finite, else `null` (the wiring applies the teleport; the inverse of 182's entry).
  - **Completion persistence**: `markDragonDefeated(state, tick)` — the `DragonCompletionRecord`
    (`dragonKey`, `defeated`, `defeatedTick`) produced exactly when the boss is `DEFEATED` (183's
    `dragonDefeated`); `dragonCompletionIsDefeated(record)`; the versioned, validated
    `serializeDragonCompletion`/`deserializeDragonCompletion` pair (mirroring 153's boss
    serialization), so the victory survives save/reload.

## Non-goals
- **No end_portal block registry entry** (215), **no actual teleportation/entity moves** (wiring),
  **no advancement/statistic hooks** (185-187), **no `Game`/`World` wiring**.

## Preconditions
- Change 183 (`ender-dragon-boss`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/BossFramework.ts` (153, `BossState`), `src/simulation/EnderDragon.ts` (183,
  `dragonDefeated`).

## Proposed change
1. `src/simulation/EndExitProgression.ts` (NEW): the constants and seven functions above.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change (the completion record is a new, additive persistence shape).

## Risks
- **Exit-portal geometry errors** (corners included, or interior missing). Mitigation: the geometry
  test asserts exactly 21 distinct cells, all four corners absent, edges and interior present.
- **Persistence corruption acceptance**. Mitigation: `deserializeDragonCompletion` validates every
  field (version, non-empty key, boolean, non-negative integer tick) and throws before accepting
  anything.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All listed functions implemented per design.md/spec.md.
- Unit tests cover: exit-portal geometry (21 cells, corners absent); spawn/persist rules;
  return destination finite/non-finite; `markDragonDefeated` exactly on defeat; serialize/
  deserialize round-trip; malformed-payload rejection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. This change closes the End arc (181-184); the
survival loop (overworld → Nether → End → exit) is now fully modeled.
