# Proposal: 284-live-raid-wave-spawning

## Problem

Change 152's verified `RaidStateMachine` already produces deterministic wave
rosters (`RaidWaveEntry[]` with plain `typeKey` strings) on `tickRaid`/`spawnWave`,
and Change 282 owns ephemeral live raid state plus feedback. Nothing yet turns
those rosters into live entities: `createDefaultEntityRegistry()` has no
`pillager`/`vindicator`/`ravager`/`witch` types, no wave-scoped spawn/despawn
path exists, and headless CI has no injectable backend that can prove wave
population without a browser GPU path. Bad-omen acquisition and settlement
detection remain intentionally absent.

## Goals

- Register raider entity types whose keys exactly match the 152 wave roster
  `typeKey` vocabulary (`pillager`, `vindicator`, `ravager`, `witch`).
- Map each `tickRaid` spawn roster into a bounded, deterministic spawn plan
  around the raid center with no RNG and no wall-clock.
- Spawn wave entities through an injectable `RaidEntityBackend` so production
  can use the live entity manager while headless CI uses a recording fake.
- Despawn tracked wave entities on wave replacement, terminal outcome, debug
  clear, dispose, and reload (no resurrection).
- Record each wave-entity death into `recordRaiderDeath` exactly once so the
  machine's remaining count stays aligned with live entities.
- Prove invalid, duplicate, stale-handle, partial-failure, pause, and reload
  behavior with unit and headless-friendly evidence before any parity claim.

## Non-goals

- No bad-omen status effect, raid-captain kill grant, or effect-runtime wiring.
- No village/settlement boundary detection, structure generation, or raid
  trigger beyond the existing 282 test/debug start seam.
- No new IndexedDB namespace, archive field, or migration for raid entities or
  raid state (283 owns persistence sequencing separately).
- No raider AI/combat redesign, loot tables beyond optional identity-safe
  defaults, HUD redesign, or second feedback bar.
- No Change 258 headed FPS/GPU work, fake GPU evidence, or 258 status change.
- No bad-omen status effect, raid-captain kill grant, or effect-runtime wiring.
- No village/settlement boundary detection, structure generation, or raid
  trigger beyond the existing 282 test/debug start seam.
- No new IndexedDB namespace, archive field, or migration for raid entities or
  raid state (283 owns persistence sequencing separately).
- No raider AI/combat redesign, loot tables beyond optional identity-safe
  defaults, HUD redesign, or second feedback bar.

## Preconditions

- Change 152 `RaidStateMachine` remains the sole lifecycle authority and is
  VERIFIED.
- Change 282 is VERIFIED: Game owns ephemeral `raidState`, fixed-tick
  `tickRaid` (including the first-wave spawn roster), inspect/clear/replay
  seams, and `#raid-feedback` projection.
- Change 283 is VERIFIED and published: world-scoped `__raid__` persistence
  is the sole raid persistence authority; this change adds no new namespace.
- Change 258 remains BLOCKED; Changes 259–283 remain VERIFIED.
- This package is the sole ACTIVE change after live `CHANGE_SEQUENCE.md` 284
  activation; implementation proceeds under the one-active-change contract.
- No 285 activation until 284 is VERIFIED and published.

## Dependencies

- `src/simulation/RaidStateMachine.ts` — `tickRaid`, `spawnWave`,
  `waveComposition`, `recordRaiderDeath`, `RaidWaveEntry`, `RaidState`.
- `src/data/EntityType.ts` — `EntityRegistry` / `createDefaultEntityRegistry`
  for raider type registration and `getByKey` resolution.
- `src/simulation/EntityManager.ts` — production spawn/remove primitives behind
  the injectable backend adapter.
- Change 282 Game seams — `getRaidState`, fixed-tick raid advance, debug
  start/clear/replay (exact symbol names as shipped by 282).
- Existing fixed-tick, pause, dispose, and `__voxelGame` test handles.

## Proposed change

1. Add a pure wave→spawn-plan module: given a finite raid center, dimension
   key, and `RaidWaveEntry[]`, emit an ordered list of
   `{ typeKey, x, y, z, yaw }` placements with deterministic ring offsets and
   fail-closed rejection of non-finite centers or non-positive counts.
2. Add `RaidEntityBackend` with `spawn`, `despawn`, and `listActive` (or
   equivalent) so Game never hard-codes a concrete manager. Provide a
   headless recording fake for CI and a thin production adapter over
   `EntityRegistry` + `EntityManager`.
3. Register the four raider entity types (MONSTER category, finite health,
   summonable, non-persistent by default) without altering existing entity
   ids or keys.
4. Wire Game (after 282's raid tick) so a non-null `spawned` roster from
   `tickRaid` spawns exactly that wave once, tags handles with the resulting
   `waveIndex`, and despawns any prior-wave leftovers before the new wave is
   considered live.
5. On `VICTORY`/`DEFEAT`, debug clear, replacement start, and dispose:
   despawn all tracked wave handles idempotently and clear tracking.
6. On confirmed death of a tracked wave entity, call `recordRaiderDeath`
   exactly once per entity id; unknown/stale deaths are identity no-ops.
7. Add unit coverage for plan determinism, backend contract, duplicate wave
   spawn refusal, partial backend failure rollback, death exactly-once,
   stale despawn, pause freeze, and reload non-resurrection; add a
   headless-friendly integration journey using the fake backend.

## Compatibility and migration

No stored data, save envelope, registry id renumbering, or archive schema
change. Raider types are additive keys in the default entity registry.
Wave entities are non-persistent for this change: reload MUST NOT resurrect
them or a raid. Existing furnace/brewing/shield/trading/death/HUD/wither
paths remain the regression boundary. Old saves without raider types are
unaffected because nothing hydrates raid entities.

## Risks

- Partial backend failure could leave `raidersRemaining` higher than live
  entities; mitigated by all-or-nothing per-wave spawn with despawn of
  partial successes and a structured failure result that does not throw on
  the fixed tick.
- Double-counting deaths would stall waves; mitigated by a per-raid
  `Set<number>` of consumed entity ids cleared with wave/raid lifecycle.
- Accidental persistence would conflict with 283's sequencing; mitigated by
  non-persistent raider flags and an explicit no-namespace audit task.
- Unknown `typeKey` in a future roster must not crash the tick; resolution
  happens before spawn and skips with a recorded skip list.
- Scope creep into bad omen or villages is blocked by Non-goals and
  verification regression checks.

## Rollback strategy

Additive package and, when implemented, additive modules/registration/tests.
Revert the 284 implementation/docs commits together. No migration or data
repair is required because no persistent raid-entity store is added.

## Definition of Done

- Complete OpenSpec package (`proposal`, `design`, `tasks`, `verification`,
  `specs/live-raid-wave-spawning/spec.md`, `OVERRIDE_DRAFT.md`) passes the
  SPEC_AUTHORING_PROTOCOL quality gate before any production edit.
- Every MUST/SHALL has at least one scenario covering boundary, invalid,
  duplicate, stale, reload, and failure behavior where applicable.
- Tasks are sequenced control-plane → pure plan → backend → Game lifecycle →
  death alignment → tests → regression/audit → full gate → state/parity.
- When activated and implemented: focused unit + headless fake-backend
  evidence green; baseline gates recorded truthfully; C284 exact; 258 still
  BLOCKED; 282 remains the feedback authority and 283 remains the persistence
  authority.
- This session (activated): package + production implementation + main
  publication per REVIEW_HANDOFF; no 285 work in this package.

## Advancement gate

Advance only at 100% task completion with all mandatory requirements and
tests passing under the normal AGENTS.md gate. No advancement exception is
planned. Activation (done): Change 282 VERIFIED, Change 283 VERIFIED and
published, sole ACTIVE is 284-live-raid-wave-spawning; Change 258 must remain
BLOCKED.
