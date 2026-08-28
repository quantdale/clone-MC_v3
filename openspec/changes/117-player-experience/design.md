# Design: 117-player-experience

## Context/current state

Change 116 (`armor-protection`) is VERIFIED and advanced. The runtime can track
health/hunger (via `SurvivalSystem`) and item drops (via `ItemEntityManager`), but
there is no player-experience track and no XP orb:

- `Player` (`src/player/Player.ts`) holds only physics (position/velocity/
  rotation) — **no XP/level** fields.
- `SurvivalSystem` (`src/player/SurvivalSystem.ts:11`) defines
  `SurvivalSnapshot { version:1; health; hunger; saturation }` with a strict
  `restore()` that rejects `version !== 1` and non-finite numbers. `Game` round-trips
  it through `GameSaveSnapshot.survival` and `PlayerStateRecord.survival`.
- `ItemEntityManager` (`src/simulation/ItemEntityManager.ts`) and `ItemEntity`
  (`src/world/ItemEntity.ts`) define the world-entity pattern: deterministic id
  minting (`nextId`), a strict `createItemEntity` constructor, per-tick `ageTicks`
  advance, `serializeAll`/`deserializeAll` against the 037 `SerializedEntity`
  envelope (`typeKey = 'minecraft:item'`, `ENTITY_RECORD_VERSION = 1`,
  `validateSerializedEntity`), and `clear()`.
- `PlayerInteraction.breakBlock` (`src/player/PlayerInteraction.ts:275`) already
  spawns item loot via `this.itemEntities.spawnLootStacks(stacks, …)` when
  `stacks.length > 0`; this is the natural hook for a sibling XP orb.
- `Game.savePlayerState`/`loadPlayerState`/`isGameSaveSnapshot`
  (`src/engine/Game.ts:753/720/776`) define the localStorage envelope
  `GameSaveSnapshot { version:1; seed; player; inventory; survival }`.
- `CONFIG` (`src/config/index.ts`) is frozen at the definition site; new tunables
  must be added as a new frozen block.

What is missing: an experience state + leveling curve, an XP-orb world entity and
its manager, the `Game` tick/persistence wiring, and the break hook.

## Target state

1. A new **`ExperienceSystem`** mirrors `SurvivalSystem`: owns `level`/`xp`, derives
   `xpToNext` from the canonical cost curve, accrues via `addXp`, and round-trips
   via `{version:1, level, xp}` snapshot/restore.
2. A new **`XpOrb`** (`src/world/XpOrb.ts`) + **`XpOrbManager`**
   (`src/simulation/XpOrbManager.ts`) model free-floating XP orbs with the same
   discipline as `ItemEntity`/`ItemEntityManager`, including 037
   `minecraft:xp_orb` serialization.
3. `Game` constructs both, ticks orbs in the simulation loop (attraction → collect →
   `addXp`), and persists/restores XP/level via `GameSaveSnapshot.experience` and
   `PlayerStateRecord.experience`.
4. `PlayerInteraction` spawns one `CONFIG.xp.orbValue` orb on a productive break.
5. `CONFIG` gains a frozen `xp` block.

`Game`'s observable behavior is unchanged for callers that do not inspect
experience; existing `Game`/persistence paths fall back safely when `experience` is
absent.

## Invariants

- **XP is never negative**: `addXp` ignores non-integer / negative input; `restore`
  rejects `xp < 0`; internal subtraction only ever removes the exact `xpToNext`
  when advancing.
- **`level` only rises through `addXp`** (and is set only by `restore`). It never
  decreases.
- **`0 ≤ xp < xpToNext`** holds at rest and after every `addXp` step; `xpToNext`
  always matches `computeXpToNext(level)`.
- **Orb value is a positive integer** (validated by `createXpOrb`); collection adds
  exactly `value` to XP.
- **Attraction never overshoots**: per-tick movement is capped at the current
  distance to the player, so an orb cannot tunnel through the player.
- **Collection only within `collectRadius`**: checked after movement, every tick.
- **`addXp` is the only mutator of `level`/`xp`** from gameplay; `restore` is the
  only other writer and only runs on load.
- **Persistence round-trips exactly**: `snapshot()` → `restore()` yields the same
  `level` and `xp` (and identical `xpToNext`); an `experience` payload that is
  `undefined` or fails `restore` is rejected and the save is ignored.

## API and data model

```ts
// src/player/ExperienceSystem.ts

/** Persisted experience payload. Matches SurvivalSnapshot's strict version-1 contract. */
export interface ExperienceSnapshot {
  version: 1;
  level: number;   // integer >= 0
  xp: number;      // progress within the current level, 0 <= xp < xpToNext
}

export class ExperienceSystem {
  level = 0;
  xp = 0;
  xpToNext: number;

  constructor();
  /** Add a non-negative integer of XP; advances levels as needed. No-op on bad input. */
  addXp(amount: number): void;
  /** Cumulative/remaining helpers for HUD/debug (later 205). */
  get progress(): number;        // xp / xpToNext in [0, 1)
  snapshot(): ExperienceSnapshot;
  restore(value: unknown): boolean;
}

/** Canonical per-level XP cost (parity). */
export function computeXpToNext(level: number): number;

// src/world/XpOrb.ts
export const XP_ORB_TYPE_KEY = 'minecraft:xp_orb';

export interface XpOrb {
  readonly id: number;
  value: number;     // positive integer XP
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  ageTicks: number;
}

export function createXpOrb(opts: {
  id: number; value: number; x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number; ageTicks?: number;
}): XpOrb;

// src/simulation/XpOrbManager.ts
export class XpOrbManager {
  constructor(opts?: { rng?: RandomSource });
  spawnXpOrb(value: number, x: number, y: number, z: number,
             opts?: { vx?: number; vy?: number; vz?: number; id?: number }): XpOrb;
  tickItemEntities(dt: number, px: number, py: number, pz: number,
                   experience: ExperienceSystem): number;   // returns orbs collected
  getItemEntities(): XpOrb[];                                // (prefer getXpOrbs)
  getXpOrbs(): XpOrb[];
  clear(): void;
  serializeAll(): SerializedEntity[];
  deserializeAll(entities: unknown[]): number;
}
```

### Leveling cost curve (deterministic, parity)

```
computeXpToNext(level):
  if level < 16:  2 * level + 7
  elif level < 31: 5 * level - 38
  else:            9 * level - 158
```

Properties (pinned by spec scenarios):

- `level = 0` ⇒ cost `7`; `level = 1` ⇒ `9`; `level = 15` ⇒ `37` (the `0–15` tier).
- `level = 16` ⇒ `42`; `level = 30` ⇒ `112` (the `16–30` tier).
- `level = 31` ⇒ `121`; `level = 32` ⇒ `130` (the `31+` tier).
- The function is continuous at the boundaries (`15→16`: `37` then `42`; `30→31`:
  `112` then `121`), so `addXp` transitions cleanly.

The curve is independently authored from the well-known parity specification; it is
the normative cost for change 117.

## Control/data flow

**Accrual** (`ExperienceSystem.addXp(amount)`):

1. If `!Number.isInteger(amount) || amount < 0` → return (no-op, defensive).
2. `this.xp += amount`.
3. `while (this.xp >= this.xpToNext) { this.xp -= this.xpToNext; this.level += 1;
   this.xpToNext = computeXpToNext(this.level); }`

**Orb tick** (`XpOrbManager.tickItemEntities(dt, px, py, pz, experience)`):

1. `ticks = round(dt * 20)`; for each orb `ageTicks += ticks` (no-op on `dt ≤ 0`).
2. For each orb compute `dx,dy,dz` to the player; `distSq = dx²+dy²+dz²`.
   - If `distSq <= attractionRadius²`: move orb toward player by
     `step = min(attractionSpeed * dt, sqrt(distSq))`; update `x/y/z`; recompute
     `distSq`.
   - If `distSq <= collectRadius²`: `experience.addXp(orb.value)`; mark for removal;
     `collected++`.
3. Despawn orbs with `ageTicks >= despawnTicks`.
4. Return `collected`.

**Persistence** (`Game`):

- `savePlayerState`: snapshot gains `experience: this.experience.snapshot()`.
- `loadPlayerState`: `if (!this.experience.restore(snapshot.experience)) { /* ignore
  bad payload; keep fresh state */ }` inside the existing try/catch.
- `isGameSaveSnapshot`: additionally require `typeof candidate.experience ===
  'object' && candidate.experience !== null`.

**Break hook** (`PlayerInteraction.breakBlock`): after the existing
`this.itemEntities.spawnLootStacks(stacks, …)` (guarded by `stacks.length > 0`),
if `this.xpOrbs` and `this.xpOrbValue` are present, call
`this.xpOrbs.spawnXpOrb(this.xpOrbValue, spawn.x, spawn.y, spawn.z)`, seeding a
small upward velocity from `CONFIG.xp.orbSpawnUpVelocity`.

## Detailed behavior

- **`computeXpToNext`**: integer arithmetic on an integer `level`; returns an
  integer (7 at level 0).
- **`restore`**: `typeof value !== 'object' || value === null` → `false`; cast and
  check `version === 1`, `Number.isInteger(level) && level >= 0`,
  `Number.isFinite(xp) && xp >= 0`; recompute `xpToNext = computeXpToNext(level)`;
  clamp `xp` into `[0, xpToNext)` (defensive); commit and return `true`. Any
  malformed field → `false` with **no state mutation**.
- **`createXpOrb`**: validates non-negative integer `id`, positive integer `value`,
  finite coordinates/velocity, non-negative integer `ageTicks`; throws on any
  invalid field (mirrors `createItemEntity`).
- **`XpOrbManager.spawnXpOrb`**: validates integer `value >= 1` and finite
  coordinates; mints the next id (or uses `opts.id`); stores in `byId` + `order`.
- **`deserializeAll`**: validates the whole batch via `validateSerializedEntity`,
  rejects any non-`minecraft:xp_orb` typeKey or malformed `data`, rebuilds, and
  **only** commits when every record is valid (manager left unchanged on rejection).

## Failure modes

- **Non-integer / negative `addXp`**: ignored (no-op); `level`/`xp` unchanged.
- **Malformed `experience` in a save**: `restore` returns `false`; `loadPlayerState`
  keeps the fresh (level 0) state inside the existing try/catch, so a corrupt save
  never crashes startup.
- **Old save with no `experience`**: `isGameSaveSnapshot` returns `false` →
  `loadPlayerState` no-ops → deterministic spawn state.
- **Orb `deserializeAll` with one bad record**: throws after validating all; the
  manager is left unchanged (atomic).
- **`addXp` with a huge amount**: still only advances levels in fixed steps;
  `level`/`xp` stay internally consistent (`0 ≤ xp < xpToNext`).

## Compatibility/migration

- `ExperienceSnapshot` and the orb `SerializedEntity` are new `version:1` envelopes;
  no existing shape changes.
- `GameSaveSnapshot` gains `experience` (required by `isGameSaveSnapshot`);
  `PlayerStateRecord` gains `experience` (required by `validatePlayerStateRecord`).
  Both fall back safely when absent.
- `PlayerInteraction` gains two optional fields; existing callers/tests unaffected.
- `XpOrbManager` is independent of `ItemEntityManager`; the 037 envelope is reused,
  not modified.

## Performance/resource constraints

- `addXp` is O(levels advanced) — amortized O(1) for normal gains; `restore` is
  O(1).
- `tickItemEntities` is O(orbs) with O(1) per-orb distance math; runs on the 20 TPS
  simulation tick, same cadence as `itemEntities`.
- `serializeAll`/`deserializeAll` are O(orbs); only invoked by the (later) entity
  store, not the per-frame loop.
- `computeXpToNext` is O(1) arithmetic; `xpToNext` is cached (not recomputed each
  tick).
- No allocation beyond the existing per-tick work; no new per-frame allocations on
  the no-orb path.

## Testing seams

- `ExperienceSystem.test.ts` (new): `computeXpToNext` boundary checks (0/15/16/17/30/
  31/32); `addXp` no-op on bad input, single-level gain, multi-level gain, no
  negative; `snapshot`/`restore` round-trip; `restore` rejects `version !== 1`,
  non-integer `level`, `xp < 0`, `xp >= xpToNext`.
- `XpOrbManager.test.ts` (new): `createXpOrb`/`spawnXpOrb` validation; `tickItemEntities`
  collects a close orb, never collects a distant orb, attracts a mid-range orb toward
  the player, respects `attractionSpeed` cap, despawns expired orbs;
  `serializeAll`/`deserializeAll` round-trip exactly and reject one bad record
  atomically.
- `ExperienceSystem` persistence within `Game`: a `GameSaveSnapshot` with an
  `experience` payload is restored exactly; a snapshot missing `experience` is
  rejected by `isGameSaveSnapshot`.
- `PlayerStateRecord` (`src/storage/PlayerStateRecord.test.ts`, extend): a record
  with `experience` validates; one missing `experience` rejects.
- Existing `PlayerInteraction` tests stay green (no `xpOrbs` supplied → no orb).

## Observability/debugging

- `ExperienceSystem.progress` (`xp / xpToNext`) and `level`/`xp` are cheap reads for
  a later HUD bar (205).
- `XpOrbManager.getXpOrbs()` exposes live orbs for debug overlays.

## Affected files/symbols

- `src/player/ExperienceSystem.ts` — **new** module (system + `computeXpToNext` +
  snapshot/restore).
- `src/world/XpOrb.ts` — **new** entity model (`createXpOrb`, `XP_ORB_TYPE_KEY`).
- `src/simulation/XpOrbManager.ts` — **new** manager (spawn/tick/serialize).
- `src/engine/Game.ts` — construct both systems; tick orbs; add `experience` to the
  save snapshot + validation; mirror into `PlayerStateRecord` usage.
- `src/player/PlayerInteraction.ts` — optional `xpOrbs` + `xpOrbValue`; spawn orb on
  productive break.
- `src/storage/PlayerStateRecord.ts` — add `experience` field; require it.
- `src/config/index.ts` — add frozen `xp` block.
- `tests/unit/ExperienceSystem.test.ts` — **new**.
- `tests/unit/XpOrbManager.test.ts` — **new**.
- `tests/unit/PlayerStateRecord.test.ts` — **extend** (experience field).
- `tests/unit/Game.test.ts` (or equivalent) — **extend** (experience persistence).

## Rejected alternatives

- **Cram XP into `SurvivalSystem`**: `SurvivalSystem` is health/hunger and its
  snapshot is survival-scoped; mixing XP there breaks the single-responsibility
  pattern and complicates restore. A sibling `ExperienceSystem` mirrors the
  established pattern cleanly.
- **Reuse `ItemEntity` directly for orbs**: items and XP have different collection
  semantics (XP merges into a counter, not an inventory slot) and different payloads;
  a dedicated `XpOrb`/`XpOrbManager` keeps the 037 envelope reuse without overloading
  item-merge/insert logic.
- **Persist orbs in the live localStorage snapshot now (131)**: orbs are transient
  world entities; binding them into the chunk store is a later, separable change.
  117 implements the 037 envelope serialization (tested, forward-compatible) and
  persists only the player's XP/level.
- **Per-block XP tables in 117**: out of scope; 117 uses a single `CONFIG.xp.orbValue`
  on productive breaks. Full block/mob/smelting tables are later content (215+).

## Downstream dependencies

- `205-hud-parity` will render the XP bar from `ExperienceSystem.level`/`progress`.
- `118/119-enchantment-*` will spend XP (consume levels) — the `addXp`-only model
  leaves spend as a later additive method.
- `131-entity-store` will bind `XpOrbManager.serializeAll`/`deserializeAll` into the
  chunk-grouped `EntityRepository` for live orb autosave.
- `215-block-item-content-expansion` will replace the fixed per-break orb value with
  a real block→XP table.
