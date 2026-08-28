# Proposal: 117-player-experience

## Problem

The runtime has no notion of player experience — no XP, no levels, and no way for
the player to accumulate progress that survives a reload. Concretely missing:

1. **No XP/level model** — `Player` holds only physics state; `SurvivalSystem` owns
   health/hunger via a `{version, health, hunger, saturation}` snapshot/restore pair,
   but nothing tracks `xp` / `level` or the cost curve between levels.
2. **No XP orbs** — block breaks already spawn item drops through
   `ItemEntityManager` (111), but there is no world entity that carries XP, gets
   attracted to the player, and is collected into an experience total.
3. **No persistence of progress** — `GameSaveSnapshot` (`version:1`, seed, player,
   inventory, survival) and the IndexedDB `PlayerStateRecord` (040) both omit any
   `experience` payload, so accumulated XP/level cannot round-trip across a reload.
4. **No forward-compatible orb envelope** — the 037 `SerializedEntity` envelope
   exists, but no `minecraft:xp_orb` type is defined or serialized, so XP orbs
   cannot later plug into the chunk-grouped entity store (129+/131).

Change 117 introduces a self-contained experience subsystem (level curve + XP orbs)
and persists the player's XP/level alongside survival, reusing the established
snapshot/restore + envelope patterns.

## Goals

- Add a **`ExperienceSystem`** (`src/player/ExperienceSystem.ts`) mirroring
  `SurvivalSystem`: an `xp`/`level` state, an `addXp(n)` accrual rule, and a
  `{version:1, level, xp}` snapshot + strict `restore()`.
- Define the leveling cost curve (parity with the canonical per-level XP cost).
- Add an **`XpOrbManager`** (`src/simulation/XpOrbManager.ts`) and **`XpOrb`**
  (`src/world/XpOrb.ts`) modeling free-floating XP orbs: deterministic id minting,
  per-tick age, attraction toward the player within a squared radius, collection
  into `ExperienceSystem.addXp`, and 037 `SerializedEntity` (`minecraft:xp_orb`)
  serialization/deserialization.
- Wire experience into `Game`: construct both systems, tick orbs in the simulation
  loop (`attraction → collect → addXp`), and spawn an XP orb on a productive block
  break (a block that yields loot) via the existing `PlayerInteraction` break path.
- Persist XP/level: add an `experience` field to `GameSaveSnapshot` (localStorage)
  and an opaque `experience` field to `PlayerStateRecord` (IndexedDB), restored
  exactly like `survival`.
- Add XP/orb tunables to `CONFIG` (`xp` block: attraction radius, collect radius,
  attraction speed, despawn ticks, per-break orb value).
- Cover the curve, `addXp` invariants (no negative XP, level only rises), orb
  spawn/attract/collect, orb serialize/deserialize round-trip, and experience
  snapshot/restore (including malformed/`version` rejection) with unit tests; cover
  the `Game` persistence round-trip.

## Non-goals

- **XP HUD bar / level display** (`205-hud-parity`) — `HUD.setSurvival` only; no UI
  work this change. The `ExperienceSystem` exposes read-only state for a later bar.
- **Enchantment XP costs / the enchantment table** (`118/119`) — 117 only accrues
  and persists XP; spending it is later.
- **Per-block / per-mob / smelting XP tables** — 117 spawns a fixed-value orb on a
  productive break; a full block→XP catalog and mob/smelting sources are later
  content (215+).
- **Orb persistence through the chunk entity store (131)** — 117 implements the
  037 envelope serialization/deserialization for orbs (tested, forward-compatible)
  but does not bind them into the autosave store; that is a later change.

## Preconditions

- Change 116 (`armor-protection`) is VERIFIED and advanced.
- `SurvivalSystem` (114) exposes a strict `snapshot(): SurvivalSnapshot` /
  `restore(value): boolean` pair (`version:1`) that `Game.loadPlayerState` /
  `savePlayerState` already round-trip.
- `ItemEntityManager` (111) and `ItemEntity` (111) establish the world-entity +
  037 envelope pattern (`ITEM_ENTITY_TYPE_KEY`, `serializeAll`/`deserializeAll`,
  `ENTITY_RECORD_VERSION`, `validateSerializedEntity`).
- `GameSaveSnapshot` (localStorage key `voxel-game-state-v1:${seed}`) and
  `PlayerStateRecord` (040, `validatePlayerStateRecord`) are the established
  persistence envelopes.
- `CONFIG` (`src/config/index.ts`) is a frozen object; new tunables must be added at
  the definition site.

## Dependencies

- Change 111 (`world-item-entity`) — entity manager shape, 037 envelope, id minting.
- Change 037 (`entity-storage-envelope`) — `SerializedEntity` / `EntityChunkRecord`.
- Change 040 (`player-state-record`) — `PlayerStateRecord` envelope.
- Change 114 (`survival-system`) — snapshot/restore pattern mirrored by
  `ExperienceSystem`.

## Proposed change

1. **`ExperienceSystem`** (`src/player/ExperienceSystem.ts`, new):
   - State: `level` (starts 0), `xp` (progress within the current level, `0 ≤ xp <
     xpToNext`), and `xpToNext` (cost to advance, derived by `computeXpToNext`).
   - `computeXpToNext(level)` — the canonical per-level cost: `level<16 ⇒ 2·level+7`;
     `16≤level<31 ⇒ 5·level−38`; `level≥31 ⇒ 9·level−158`.
   - `addXp(amount)` — accepts a non-negative integer; adds to `xp`; while
     `xp ≥ xpToNext` advances `level++` and re-derives `xpToNext`. Rejects
     non-integer / negative input (no-op). XP never goes negative; `level` only
     rises through this path.
   - `snapshot(): ExperienceSnapshot` → `{ version: 1, level, xp }`;
     `restore(value): boolean` validates `version===1`, integer `level≥0`, finite
     `xp≥0`, re-derives `xpToNext`, clamps `xp` into `[0, xpToNext)`, and returns
     `false` on any malformed input.
2. **`XpOrb`** (`src/world/XpOrb.ts`, new): a `createXpOrb` strict constructor +
   `XpOrb` interface (id, integer `value`, float x/y/z, vx/vy/vz, `ageTicks`) named
   and validated like `ItemEntity`.
3. **`XpOrbManager`** (`src/simulation/XpOrbManager.ts`, new): mirrors
   `ItemEntityManager` — deterministic id minting (`nextId`), spawn, per-tick age
   advance (`round(dt·20)`), attraction + collection tick, despawn of expired orbs,
   `clear()`, `getXpOrbs()`, and 037 envelope `serializeAll` / `deserializeAll`
   with `typeKey = 'minecraft:xp_orb'`.
   - `tickItemEntities(dt, playerX, playerY, playerZ, experience)`:
     1. advance `ageTicks` for every orb by `round(dt·20)`;
     2. for each orb within `attractionRadius²` of the player, move it toward the
        player by `min(attractionSpeed·dt, distance)`;
     3. collect any orb within `collectRadius²` into `experience.addXp(orb.value)`
        and remove it;
     4. despawn orbs with `ageTicks ≥ despawnTicks`;
     5. return the number of orbs collected.
4. **`Game` wiring** (`src/engine/Game.ts`):
   - Construct `this.experience = new ExperienceSystem()` and
     `this.xpOrbs = new XpOrbManager()` alongside `itemEntities`.
   - In the simulation block (after `itemEntities` tick/merge/despawn/collect), call
     `this.xpOrbs.tickItemEntities(dt, px, py, pz, this.experience)`.
   - In `savePlayerState` add `experience: this.experience.snapshot()`; in
     `loadPlayerState` call `this.experience.restore(snapshot.experience)`; in
     `isGameSaveSnapshot` require `experience` to be a non-null object.
5. **Break hook** (`src/player/PlayerInteraction.ts`): accept an optional
   `xpOrbs?: XpOrbManager` and `xpOrbValue?: number`; on a productive break (one
   that also spawns item loot), if both are present, spawn one XP orb of
   `xpOrbValue` at the block-center spawn position. `Game` passes its manager and
   `CONFIG.xp.orbValue`.
6. **Persistence shape** (`src/storage/PlayerStateRecord.ts`):
   - `PlayerStateRecord` gains `experience: unknown` (opaque; validated present like
     `survival`).
   - `validatePlayerStateRecord` requires `experience` to be present (non-`undefined`).
7. **Config** (`src/config/index.ts`): add a frozen `xp` block:
   `orbAttractionRadius`, `orbCollectRadius`, `orbAttractionSpeed`,
   `orbDespawnTicks`, `orbValue`.

## Compatibility and migration

- `ExperienceSnapshot` and the orb `SerializedEntity` are additive new envelopes
  (`version:1`); no existing shape changes.
- `GameSaveSnapshot` gains an optional-then-required `experience` field beside
  `survival`. Old saves (no `experience`) are rejected by `isGameSaveSnapshot` and
  fall back to the deterministic spawn state — identical to today's corrupt-save
  handling.
- `PlayerStateRecord` gains a required `experience` field; the IndexedDB store is
  keyed per `worldId`, so the new column is written on the next save.
- `PlayerInteraction` gains two optional fields; existing callers (and existing
  `PlayerInteraction` tests) are unaffected.
- `XpOrbManager` is a new, independent module; `ItemEntityManager` is untouched.

## Risks

- **Wrong leveling curve / off-by-one**: the cost function must reproduce the
  canonical `7,9,…,37 / 42,…,112 / 121,…` sequence or the curve scenarios fail.
  Mitigated by pinning the formula in `spec.md` with concrete per-boundary checks
  and testing the `15→16→17` and `30→31→32` transitions.
- **Orb attraction instability / tunneling**: movement must be capped at the
  current distance so orbs never overshoot past the player; the collect radius is
  checked after movement each tick. Tested with a head-on orb that collects in one
  tick and an orb outside the radius that never collects.
- **Malformed restore corrupting level/xp**: `restore` rejects `version !== 1`,
  non-integer `level`, or `xp < 0`/`xp ≥ xpToNext`, returning `false` and leaving
  state untouched — matching `SurvivalSystem.restore`.
- **Negative/non-integer XP injection**: `addXp` treats non-integer or negative
  input as a no-op (defensive against hostile/derived feeds).

## Rollback strategy

All additions are additive. Removing the `Game` wiring (stop ticking orbs + drop the
`experience` field from the snapshot) restores prior behavior without a data change;
the `ExperienceSystem`/`XpOrbManager` modules and the `xp` config block are inert
without the wiring. The `experience` `PlayerStateRecord` field is opaque to storage
and ignored if a later consumer drops it.

## Definition of Done

- `ExperienceSystem` implements `computeXpToNext`, `addXp` (level-only-rises, no
  negative), and a strict `snapshot()`/`restore()` pair.
- `XpOrbManager` + `XpOrb` model orbs with deterministic id minting, age ticks,
  attraction + collection, despawn, and 037 `minecraft:xp_orb` serialization that
  round-trips exactly.
- `Game` constructs both systems, ticks orbs in the simulation loop, and
  persists/restores XP/level via `GameSaveSnapshot` + `PlayerStateRecord`.
- A productive block break spawns an XP orb of `CONFIG.xp.orbValue`.
- Unit tests cover the curve, `addXp` invariants, orb spawn/attract/collect,
  orb serialize/deserialize, experience snapshot/restore (including malformed
  rejection), and the `Game` persistence round-trip.
- Full baseline regression gate is green (typecheck, lint, unit, build, e2e).

## Advancement gate

100% task completion, all MUST/SHALL requirements verified by tests, and the
baseline regression gate (`npm run typecheck`, `npm run lint`, `npm test`,
`npm run build`, `npm run test:e2e`) fully green.
