# Design: 294-bad-omen-raid-escalation-and-death-parity

## Context/current state

On `origin/main` `6d9931e` (293 VERIFIED):

- 152 `RaidStateMachine`: `startRaid(x, y, z, omen)` sets
  `totalWaves = min(RAID_MAX_WAVES 7, RAID_BASE_WAVES 3 + max(0, omen − 1))`;
  `waveComposition(waveIndex, omen)` adds a witch when omen ≥ 3; `tickRaid`
  spawns the next wave when `raidersRemaining = 0` and
  `waveIndex < totalWaves`, else VICTORY; timeout 12000 ticks → DEFEAT.
- 285 `BadOmenRules`: level 0..5 (`BAD_OMEN_MAX_LEVEL`),
  `resolveVillageRaidTrigger(omen, village)` → `START_RAID` (clamped level +
  village center) or `NONE` (`NO_OMEN` → `NO_VILLAGE` → `NOT_INSIDE` →
  `INVALID_CENTER`).
- Game fixed tick step 5.8 calls `evaluateBadOmenVillageTrigger()` once per
  unpaused tick after the raid tick. On `START_RAID` it calls
  `startRaidAt(center, level)` — which dismisses the patrol (291), clears the
  wave controller/combat (**replacing any ACTIVE raid**) and spawns wave 1 —
  then clears the omen and saves the raid + player state together (292).
- `respawnPlayer()` (the only death path, called from `onSurvivalEvent('death')`
  for normal and hardcore deaths) runs `playerEffects.clear()` then
  `savePlayerStateDurable()`; its comment says "Bad Omen is retained on death,
  per 285". `buildPlayerSnapshot()` persists the omen level and remaining
  seconds (292).
- 290 `maybeGrantHeroOfTheVillage(prev, next)` grants HOTV with
  `heroAmplifierFromBadOmen(next.badOmenLevel)` on non-VICTORY → VICTORY.
- 283 raid persistence: `serializeRaid` stores `badOmenLevel` and
  `totalWaves`; the loader validates non-negative integer counters and
  `waveIndex ≤ totalWaves` (no formula check).
- Raid bar (282/286) renders `badOmenLevel` (omen badge) and
  `waveIndex/totalWaves` from `raidState` via `syncRaidFeedbackHud()`.

## Target state

A Bad Omen trigger inside a village whose ACTIVE raid is nearby escalates that
raid in place; death clears Bad Omen durably.

## Invariants

- I1. Escalation applies only to an ACTIVE raid; it never changes `status`,
  center, `waveIndex`, `raidersRemaining` or `ticks`.
- I2. Escalated `badOmenLevel = clampBadOmenLevel(raid + player)` ∈ [0, 5].
- I3. Escalated `totalWaves = max(before, raidWavesForOmen(newLevel))`; it is
  never reduced and never exceeds `RAID_MAX_WAVES` unless it already did.
- I4. Every applied escalation consumes the player's omen (level 0,
  remaining 0), including at the cap; a failed/non-applied escalation keeps it.
- I5. An applied escalation dismisses any live patrol (291 raid-start rule).
- I6. The escalated raid record and the consumed omen are saved in the same
  durable flush (`saveRaid()` then `savePlayerStateDurable()`).
- I7. Every death clears the omen (level 0, remaining 0) before the existing
  durable player save in `respawnPlayer()`.
- I8. START_RAID (no ACTIVE raid in the village) behaves exactly as before.
- I9. Change 258 stays BLOCKED; no stored-schema change.

## API and data model

```ts
// src/simulation/RaidEscalation.ts (pure; imports 152 + 285 only)
export const RAID_ESCALATION_RADIUS = 96; // blocks, 3D, strict <
export function raidWavesForOmen(level: number): number;
export interface RaidEscalationResult {
  readonly state: RaidState;
  readonly applied: boolean;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly wavesBefore: number;
  readonly wavesAfter: number;
}
export function escalateRaid(state: RaidState, playerOmenLevel: number): RaidEscalationResult;
export function isRaidInVillage(raid: RaidState | null | undefined,
  center: { centerX: number; centerY: number; centerZ: number }): boolean;
export type VillageOmenAction =
  | OmenTriggerDecision
  | { readonly kind: 'ESCALATE_RAID'; readonly centerX: number;
      readonly centerY: number; readonly centerZ: number;
      readonly badOmenLevel: number; // player's consumed level
      readonly raidLevelBefore: number; readonly raidLevelAfter: number;
      readonly totalWavesBefore: number; readonly totalWavesAfter: number };
export function resolveVillageOmenAction(omen: BadOmenState,
  village: VillageContext | null | undefined,
  raid: RaidState | null | undefined): VillageOmenAction;
```

`Game.evaluateBadOmenVillageTrigger(): VillageOmenAction` (return type widened;
START_RAID/NONE payloads unchanged).

## Control/data flow

```
fixed tick 5.8 → evaluateBadOmenVillageTrigger()
  action = resolveVillageOmenAction(badOmen, villageQuery(), raidState)
  NONE          → return (omen kept)
  START_RAID    → startRaidAt(...) ; consume omen ; saveRaid ; savePlayerStateDurable   (unchanged)
  ESCALATE_RAID → r = escalateRaid(raidState, level)
                  !r.applied → return (omen kept, fail closed)
                  pillagerPatrol.clear('raid-start') ; raidState = r.state
                  consume omen ; syncRaidFeedbackHud ; toast
                  saveRaid ; savePlayerStateDurable
death → onSurvivalEvent('death') → [ACTIVE raid → DEFEAT, saveRaid] → respawnPlayer()
  playerEffects.clear() ; badOmen = 0 ; remaining = 0 ; savePlayerStateDurable()
```

## Detailed behavior

### Escalation math

`raidWavesForOmen(l) = min(7, 3 + max(0, clamp(l) − 1))`: 1→3, 2→4, 3→5,
4→6, 5→7, 0→3 (identical to `startRaid`). Examples:

| raid level | player level | after | waves before → after |
|---|---|---|---|
| 1 | 1 | 2 | 3 → 4 |
| 1 | 2 | 3 | 3 → 5 |
| 2 | 5 | 5 | 4 → 7 |
| 5 | 3 | 5 (cap) | 7 → 7 (omen still consumed) |

Future waves use the new level through the unchanged `waveComposition` (e.g.
a witch joins from level 3). The current wave's raiders are untouched.

### Village match

`isRaidInVillage`: raid ACTIVE, finite center, and
`dx² + dy² + dz² < 96²` between the raid center and the triggering village
center (vanilla looks up a nearby raid within 96 blocks). No ACTIVE raid, a
terminal raid, or a raid ≥ 96 blocks away → `START_RAID` as before
(single-slot replacement is the documented divergence for the far case).

### Death

`respawnPlayer()` sets `badOmen = createBadOmen()` and
`badOmenRemainingSeconds = 0` right after `playerEffects.clear()`; the existing
`savePlayerStateDurable()` persists it. This runs for normal, creative and
hardcore (spectating) deaths. A death during an ACTIVE raid still forces
DEFEAT first (288) — no HOTV.

## Failure modes

- Raid not ACTIVE / invalid player level → `applied: false`, omen kept.
- Village query throws → `null` → `NO_VILLAGE` (285 behaviour).
- Persistence unavailable/recovery-required → saves are no-ops as today; the
  in-memory state is still consistent.
- Non-finite raid center → not "in village" → START_RAID path (replacement).

## Compatibility/migration

No schema change (raid `schemaVersion: 1`, player effects payload 292).
Pre-294 records load unchanged.

## Performance/resource constraints

O(1) per tick; no allocation beyond one immutable raid state per escalation.

## Testing seams

Existing only: `grantBadOmen`, `setVillageQuery`,
`evaluateBadOmenVillageTrigger`, `debugStartRaid`, `debugClearRaidWave`,
`getRaidState`, `debugSpawnPatrol`, `getPatrolState`, `debugKillPlayer`,
`getBadOmenLevel`, `getBadOmenRemainingSeconds`,
`getHeroOfTheVillageAmplifier`, pagehide + `persistence.flush`, `#raid-bar-omen`.

## Observability/debugging

The returned `ESCALATE_RAID` action carries before/after level and wave totals;
a toast "The raid grows stronger — Bad Omen N" is shown.

## Affected files/symbols

- New: `src/simulation/RaidEscalation.ts`, `tests/unit/RaidEscalation.test.ts`,
  `tests/unit/LiveRaidEscalation.test.ts`,
  `tests/e2e/bad-omen-raid-escalation.spec.ts`.
- Changed: `src/engine/Game.ts` (`evaluateBadOmenVillageTrigger`,
  `respawnPlayer`, imports/comments); `tests/unit/LiveBadOmen.test.ts`
  (replacement case → escalation); design notes in the 285/291/292 packages
  (superseded annotations); `PARITY_MATRIX.md` C292 notes.

## Rejected alternatives

- Adding escalation to `RaidStateMachine.ts`: that module is deliberately
  zero-import (152); the level clamp lives in 285 rules.
- Blocking the trigger during an ACTIVE raid (keep omen until it ends): not
  vanilla.
- Recomputing `totalWaves` purely from the new level: could shrink a raid
  whose total was already larger (e.g. restored records).
- Concurrent raids for far villages: out of scope (single raid slot, HUD,
  persistence).

## Downstream dependencies

None required; future concurrent-raid support would replace the far-village
replacement rule.
