# Proposal: 294-bad-omen-raid-escalation-and-death-parity

## Problem

Two Bad Omen rules still diverge from vanilla (recorded as divergences by 292
in `PARITY_MATRIX.md`):

1. **Omen during an ACTIVE raid replaces the raid.** The 285 village trigger
   always calls `startRaidAt`, which throws away the running raid (its wave
   progress, remaining raiders and timeout clock) and starts a fresh wave 1.
   Vanilla instead has the running raid *absorb* the player's Bad Omen: the
   raid's omen level rises (clamped to the maximum), extra waves are added, and
   the effect is consumed.
2. **Death keeps Bad Omen.** `respawnPlayer()` clears status effects (HOTV
   etc.) but deliberately keeps the Bad Omen level (285 rule), and 292 now
   persists it, so the omen survives death and reload. Vanilla clears every
   effect, Bad Omen included, on death.

## Goals

- Pure `src/simulation/RaidEscalation.ts`:
  - `raidWavesForOmen(level)` (the existing 152 wave table:
    `min(7, 3 + max(0, level − 1))`);
  - `escalateRaid(state, playerOmenLevel)` → raid level
    `clamp(raid + player, 0..5)`, `totalWaves = max(current, table(newLevel))`,
    wave progress / remaining raiders / ticks / center unchanged; ACTIVE only;
  - `isRaidInVillage(raid, center)` (ACTIVE and 3D distance < 96 blocks);
  - `resolveVillageOmenAction(omen, village, raid)` → `ESCALATE_RAID` when an
    ACTIVE raid is in the triggering village, else the 285 decision
    (`START_RAID` / `NONE`).
- Game `evaluateBadOmenVillageTrigger()` routes `ESCALATE_RAID` through
  `escalateRaid`, dismisses any live patrol (291 rule, same as a raid start),
  consumes the omen and saves the escalated raid and the consumed omen in one
  durable flush; the raid bar refreshes (omen badge + wave total). START_RAID
  behaviour is unchanged.
- Death clears Bad Omen (level and remaining duration) in `respawnPlayer()`
  alongside the existing effects clear, covered by the same durable save, so
  a reload after death shows omen 0 (including hardcore/spectator deaths).
- HOTV after an escalated VICTORY uses the escalated raid level (existing 290
  mapping over `next.badOmenLevel`).
- Update 285/290/291/292 tests, code comments and design notes that assert
  replace-on-omen or keep-omen-on-death, and the C292 divergence notes in
  `PARITY_MATRIX.md`.
- Unit tests (level math, cap, wave count, HOTV amplifier after escalated
  victory, death clear, persistence round trip, Game source guards) and a
  browser E2E (escalation during an active raid incl. patrol dismissal, bar,
  reload and escalated HOTV; death clearing across reload).

## Non-goals

- No multiple concurrent raids: the Game keeps a single raid slot. An omen
  trigger in a village *far* from an ACTIVE raid (≥ 96 blocks) still replaces
  it (documented single-slot divergence; vanilla would run two raids).
- No Raid Omen / trial omen (1.20.5+) mechanics, no omen potion items, no
  raid celebration phase, no difficulty-dependent wave counts.
- No change to the wave composition table, raid timeout, raid persistence
  schema (`schemaVersion: 1` already stores `badOmenLevel` / `totalWaves`),
  HOTV math, patrol rules or status-effect persistence schema.
- No rendering/HUD redesign; no GPU work; Change 258 stays BLOCKED.

## Preconditions

- Changes 282–293 VERIFIED and published; `origin/main` = `6d9931e`.
- Existing seams: `grantBadOmen`, `clearBadOmen`, `getBadOmenLevel`,
  `getBadOmenRemainingSeconds`, `setVillageQuery`,
  `evaluateBadOmenVillageTrigger`, `debugStartRaid`, `debugClearRaidWave`,
  `getRaidState`, `debugSpawnPatrol`, `getPatrolState`, `debugKillPlayer`,
  `getHeroOfTheVillageAmplifier`, pagehide + `persistence.flush`.

## Dependencies

- `src/simulation/RaidStateMachine.ts` (152), `src/simulation/BadOmenRules.ts`
  (285), `src/simulation/HeroOfTheVillage.ts` (290),
  `src/simulation/PillagerPatrol.ts` (291), 292 player-state persistence,
  283 raid persistence, `src/engine/Game.ts`.

## Proposed change

1. Author this package; CHANGE_SEQUENCE row + overrides addendum; 294 sole
   ACTIVE.
2. New pure `RaidEscalation.ts` + unit tests.
3. Game: escalate branch in `evaluateBadOmenVillageTrigger`; omen clear on
   death in `respawnPlayer`.
4. Update legacy tests/comments/docs/PARITY notes; composition unit tests and
   source guards; browser E2E.
5. Full gates; VERIFIED 100%; publish.

## Compatibility and migration

No stored-data change. Raid records written before 294 load unchanged; an
escalated raid is an ordinary `schemaVersion: 1` record whose `totalWaves` may
exceed the start formula (the 283 loader only requires
`waveIndex ≤ totalWaves`). Player records keep the 292 effects payload; after
294 a record written after death carries omen level 0. Behaviour change:
existing worlds with an omen and an ACTIVE nearby raid now escalate instead of
restarting; a saved omen from before a death that already happened is not
retroactively cleared (only new deaths clear).

## Risks

- Farming/regression via repeated triggers → the omen is consumed on every
  applied escalation (also at the cap), and a trigger never runs while the
  omen is 0.
- Consumed omen resurrected after reload → escalated raid + omen 0 saved in
  one flush (same pattern as the 292 START_RAID path).
- Wave total shrinking → `totalWaves` is never reduced.
- Tests asserting the old behaviour → enumerated and updated (T7).

## Rollback strategy

Revert the 294 commits; stored data stays compatible both ways.

## Definition of Done

- Package passes the SPEC_AUTHORING_PROTOCOL quality gate.
- Implementation + unit + E2E green; full baseline gates green (visual:176
  SwiftShader drift documented, goldens untouched; enchanting:227 green).
- C294 exact; C292 divergence notes updated; VERIFIED 100%; published by
  fast-forward; 258 still BLOCKED.

## Advancement gate

Target 100% task completion with all mandatory requirements and tests passing.
Absolute floor 90% only via explicit Advancement Exception (not planned).
