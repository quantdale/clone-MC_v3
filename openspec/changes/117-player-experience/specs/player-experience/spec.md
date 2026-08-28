# Spec: player-experience

## Contract

This capability defines the player's experience track — an XP/level model with a
deterministic leveling curve, free-floating XP orbs that are attracted to and
collected by the player, and persistence of the accumulated level/XP. It does
**not** include an XP HUD bar (that is `205-hud-parity`), enchantment XP spending
(`118/119`), or a full block/mob/smelting XP catalog (that is `215+`). Every
normative requirement is backed by a deterministic formula and at least one
GIVEN/WHEN/THEN scenario with concrete numbers.

## Definitions

- **Level** — the player's non-negative integer experience level; starts at `0` and
  only increases through `addXp` (or is set by `restore`).
- **XP** — the integer progress within the current level, confined to
  `0 ≤ xp < xpToNext`.
- **xpToNext** — the integer cost to advance from the current `level` to `level+1`,
  derived from `computeXpToNext(level)`.
- **XP orb** — a free-floating world entity carrying a positive-integer `value` of
  XP; attracted to the player and collected within a radius.
- **Productive break** — a block break that also yields at least one item loot
  stack (the existing `stacks.length > 0` condition in `PlayerInteraction`).

### Leveling cost curve

```
computeXpToNext(level):
  if level < 16:  2 * level + 7
  elif level < 31: 5 * level - 38
  else:            9 * level - 158
```

## Invariants

- `xp` is never negative; `addXp` ignores non-integer / negative input.
- `level` only rises through `addXp` and is set only by `restore`.
- At rest and after every `addXp` step: `0 ≤ xp < xpToNext`, and `xpToNext ===
  computeXpToNext(level)`.
- An XP orb's `value` is a positive integer; collection adds exactly `value` to XP.
- Attraction movement per tick is capped at the current distance to the player
  (no tunneling); collection requires being within `collectRadius` after movement.
- `restore` rejects a malformed payload and leaves state unchanged (`false`).

## Requirements

### Requirement: leveling cost curve

`computeXpToNext(level)` MUST return the canonical per-level cost: `2·level+7` for
`level < 16`, `5·level−38` for `16 ≤ level < 31`, and `9·level−158` for
`level ≥ 31`; the result MUST be a positive integer.

#### Scenario: low-tier costs

- **GIVEN** the leveling cost curve
- **WHEN** `computeXpToNext` is evaluated at levels `0, 1, 15`
- **THEN** it returns `7, 9, 37` respectively.

#### Scenario: tier boundary continuity at 16

- **GIVEN** the leveling cost curve
- **WHEN** `computeXpToNext` is evaluated at levels `16` and `17`
- **THEN** it returns `42` and `47` respectively.

#### Scenario: tier boundary continuity at 31

- **GIVEN** the leveling cost curve
- **WHEN** `computeXpToNext` is evaluated at levels `30` and `31`
- **THEN** it returns `112` and `121` respectively.

### Requirement: addXp accrual and level advance

`ExperienceSystem.addXp(amount)` MUST, for a non-negative integer `amount`, add
`amount` to `xp` and MUST advance `level` (and re-derive `xpToNext`) one or more
times while `xp ≥ xpToNext`, so that afterwards `0 ≤ xp < xpToNext`. It MUST treat
non-integer or negative `amount` as a no-op (no change to `level`/`xp`).

#### Scenario: a single level is crossed

- **GIVEN** an `ExperienceSystem` at `level = 0` (`xpToNext = 7`) with `xp = 5`
- **WHEN** `addXp(5)` is called
- **THEN** `level === 1`, `xp === 3` (5+5=10 → 10−7=3), and `xpToNext === 9`.

#### Scenario: multiple levels are crossed in one call

- **GIVEN** an `ExperienceSystem` at `level = 0` (`xpToNext = 7`) with `xp = 0`
- **WHEN** `addXp(50)` is called
- **THEN** `level === 4` and `xp === 10` (costs consumed stepping L0→L1→L2→L3→L4 are
  `7 + 9 + 11 + 13 = 40`; remainder `50 − 40 = 10`; next cost
  `computeXpToNext(4) = 15`, and `0 ≤ 10 < 15`).

#### Scenario: non-integer input is ignored

- **GIVEN** an `ExperienceSystem` at `level = 0, xp = 0`
- **WHEN** `addXp(1.5)` and `addXp(-3)` are each called
- **THEN** `level === 0`, `xp === 0`, and no exception is thrown.

### Requirement: experience snapshot and restore

`ExperienceSystem.snapshot()` MUST return `{ version: 1, level, xp }`.
`restore(value)` MUST, for a valid payload (`version === 1`, integer `level ≥ 0`,
finite `xp ≥ 0`), commit it, re-derive `xpToNext`, and return `true`; it MUST
return `false` (and leave state unchanged) for `version !== 1`, a non-integer
`level`, or `xp < 0`. A snapshot round-trips exactly.

#### Scenario: snapshot round-trips

- **GIVEN** an `ExperienceSystem` at `level = 7, xp = 4`
- **WHEN** `snapshot()` is taken and then `restore()` is applied to a fresh system
- **THEN** the fresh system reports `level === 7`, `xp === 4`, and `xpToNext ===
  computeXpToNext(7)`.

#### Scenario: wrong version is rejected

- **GIVEN** a payload `{ version: 2, level: 3, xp: 1 }`
- **WHEN** `restore(payload)` is called on a `level 0` system
- **THEN** it returns `false`, and `level === 0`, `xp === 0` are unchanged.

#### Scenario: negative xp is rejected

- **GIVEN** a payload `{ version: 1, level: 2, xp: -1 }`
- **WHEN** `restore(payload)` is called
- **THEN** it returns `false` and the system state is unchanged.

### Requirement: xp orb spawn and validation

`createXpOrb(opts)` / `XpOrbManager.spawnXpOrb(value, x, y, z, opts)` MUST validate
a non-negative integer `id`, a positive integer `value`, finite coordinates and
velocity, and a non-negative integer `ageTicks`; it MUST throw on any invalid field
and MUST mint strictly increasing unique ids.

#### Scenario: a valid orb is created

- **GIVEN** a `XpOrbManager`
- **WHEN** `spawnXpOrb(7, 10.5, 64.5, 10.5)` is called twice
- **THEN** two orbs exist with ids `0` and `1`, each `value === 7`, and
  `getXpOrbs().length === 2`.

#### Scenario: a non-positive value is rejected

- **GIVEN** a `XpOrbManager`
- **WHEN** `spawnXpOrb(0, 0, 0, 0)` is called
- **THEN** an `Error` is thrown and no orb is added.

### Requirement: orb attraction, movement, and collection

`XpOrbManager.tickItemEntities(dt, px, py, pz, experience)` MUST advance each orb's
`ageTicks` by `round(dt·20)`; MUST move any orb within `attractionRadius²` toward
the player by at most the current distance; MUST collect (call
`experience.addXp(orb.value)` and remove) any orb within `collectRadius²`; MUST
despawn orbs with `ageTicks ≥ despawnTicks`; and MUST return the number collected.

#### Scenario: a close orb is collected in one tick

- **GIVEN** a `XpOrbManager` with one orb of `value = 5` at `(0, 64, 0)` and an
  `ExperienceSystem` at `level 0, xp 0` (`xpToNext = 7`)
- **WHEN** `tickItemEntities(0.05, 0, 64, 0, experience)` is called
  (player at the orb)
- **THEN** the orb is collected, `experience.level === 0`, `experience.xp === 5`,
  `getXpOrbs().length === 0`, and the method returns `1`.

> Note: a value equal to `xpToNext` (e.g. `7` at level 0) would instead trigger a
> level-up to `level 1, xp 0` because the invariant is `0 ≤ xp < xpToNext`; the
> scenario uses `5` so the result is unambiguous.

#### Scenario: a distant orb is never collected

- **GIVEN** a `XpOrbManager` with one orb of `value = 7` at `(100, 64, 0)` and an
  `ExperienceSystem` at `level 0, xp 0`
- **WHEN** `tickItemEntities(0.05, 0, 64, 0, experience)` is called
- **THEN** `experience.xp === 0`, the orb remains, and the method returns `0`.

#### Scenario: a mid-range orb is attracted but not overshot

- **GIVEN** a `XpOrbManager` with one orb of `value = 3` at `(5, 64, 0)` and an
  `ExperienceSystem` at `level 0, xp 0`, with `attractionRadius = 8`,
  `attractionSpeed = 8`
- **WHEN** `tickItemEntities(0.1, 0, 64, 0, experience)` is called (player at origin)
- **THEN** the orb's distance to the player is reduced (moved toward origin by
  `min(8·0.1, 5) = 0.8`), `experience.xp === 0` (not yet collected), and the orb
  still exists.

#### Scenario: an expired orb despawns

- **GIVEN** a `XpOrbManager` with one orb whose `ageTicks = despawnTicks`, at a far
  distance from the player
- **WHEN** `tickItemEntities(0.05, 0, 0, 0, experience)` is called
- **THEN** the orb is removed (`getXpOrbs().length === 0`).

### Requirement: orb serialization round-trip

`XpOrbManager.serializeAll()` MUST emit 037 `SerializedEntity` records with
`typeKey = 'minecraft:xp_orb'` and `schemaVersion = ENTITY_RECORD_VERSION`;
`deserializeAll(records)` MUST restore every orb exactly (id, value, coordinates,
velocity, ageTicks) and MUST throw (leaving the manager unchanged) if any record is
not a valid `minecraft:xp_orb` payload.

#### Scenario: a batch round-trips exactly

- **GIVEN** a `XpOrbManager` with two orbs of differing value/position/age
- **WHEN** `serializeAll()` is captured and then `deserializeAll(records)` is
  applied to a fresh manager
- **THEN** the fresh manager's `getXpOrbs()` equals the originals field-for-field
  (ids, values, x/y/z, vx/vy/vz, ageTicks).

#### Scenario: one bad record rejects the whole batch

- **GIVEN** a valid serialized batch with one record whose `data.value` is a string
- **WHEN** `deserializeAll(records)` is called on a populated manager
- **THEN** an `Error` is thrown and the manager's prior orbs are unchanged.

### Requirement: persistence of experience in the game save

`GameSaveSnapshot` MUST carry an `experience` payload, `isGameSaveSnapshot` MUST
require `experience` to be a non-null object, `Game` MUST write
`experience: this.experience.snapshot()` in `savePlayerState` and MUST
`restore` it in `loadPlayerState`, and a snapshot produced from a leveled-up state
MUST restore exactly. An old save without `experience` MUST be rejected
(`isGameSaveSnapshot` returns `false`).

#### Scenario: a leveled state round-trips through the snapshot

- **GIVEN** an `ExperienceSystem` at `level = 4, xp = 2`
- **WHEN** its `snapshot()` is embedded in a `GameSaveSnapshot` and validated +
  restored
- **THEN** the restored system reports `level === 4, xp === 2`.

#### Scenario: a missing experience payload is rejected

- **GIVEN** a `GameSaveSnapshot` shaped like today's (no `experience` field)
- **WHEN** `isGameSaveSnapshot(snapshot)` is evaluated
- **THEN** it returns `false` (the save is ignored; the game falls back to spawn).

### Requirement: productive break spawns an xp orb

`PlayerInteraction.breakBlock` MUST, when an `xpOrbs` manager and a positive
`xpOrbValue` are supplied and the break is productive (yields loot), spawn exactly
one XP orb of `xpOrbValue` at the block-center spawn position. Supplying no
`xpOrbs` MUST leave orb state unchanged.

#### Scenario: a productive break spawns one orb

- **GIVEN** a `PlayerInteraction` with `xpOrbs` (a `XpOrbManager`) and
  `xpOrbValue = 3`, and a productive break target
- **WHEN** `breakBlock` is invoked and yields loot
- **THEN** `xpOrbs.getXpOrbs().length === 1` and the spawned orb's `value === 3`.

#### Scenario: no xpOrbs supplied spawns nothing

- **GIVEN** a `PlayerInteraction` with no `xpOrbs`
- **WHEN** `breakBlock` is invoked
- **THEN** no orb is created (`xpOrbs` is `undefined` and behaves as today).

## Error and failure behavior

- `addXp` ignores non-integer / negative input (defensive against hostile/derived
  feeds); `level`/`xp` are unchanged.
- `restore` rejects malformed payloads (`version !== 1`, non-integer `level`,
  `xp < 0`) and never mutates state on rejection.
- `createXpOrb`/`spawnXpOrb` throw on invalid fields; the manager is unchanged.
- `deserializeAll` validates the entire batch first and throws atomically on any
  bad record; the manager is left unchanged.
- A `Game` save missing `experience` is rejected by `isGameSaveSnapshot` and the
  game starts from the deterministic spawn state.

## Performance and resource bounds

- `addXp` is O(levels advanced), amortized O(1); `restore` is O(1).
- `tickItemEntities` is O(orbs) with O(1) per-orb distance math on the 20 TPS
  simulation tick.
- `serializeAll`/`deserializeAll` are O(orbs) and only used by the later entity
  store, not the per-frame loop.
- `xpToNext` is cached; `computeXpToNext` is O(1) and not called per tick.
- No new per-frame allocations on the no-orb path.

## Compatibility and migration

- `ExperienceSnapshot` and the orb `SerializedEntity` are new `version:1` envelopes;
  no existing shape changes.
- `GameSaveSnapshot` and `PlayerStateRecord` gain a required `experience` field;
  both fall back safely when absent (corrupt/old saves ignored).
- `PlayerInteraction` gains two optional fields; existing callers/tests are
  unaffected.
- `XpOrbManager` is independent of `ItemEntityManager`; the 037 envelope is reused.

## Security and integrity

- `addXp` rejects non-integer / negative amounts, so a malformed or hostile XP feed
  cannot drive `xp` negative or `level` downward.
- `restore` enforces `version === 1` and non-negative integer `level`/`xp`, so a
  crafted save cannot inject an invalid level or overflow `xp`.
- Orb `value` is validated as a positive integer at spawn and on deserialize; a
  negative/zero/string value is rejected.

## Observability

- `ExperienceSystem.level`, `ExperienceSystem.xp`, and a derived `progress`
  (`xp / xpToNext`) are cheap reads for a later HUD bar (`205-hud-parity`).
- `XpOrbManager.getXpOrbs()` exposes live orbs for debug overlays.

## Verification mapping

| Requirement | Tests |
|---|---|
| Leveling cost curve | `ExperienceSystem.test.ts` — computeXpToNext boundaries |
| addXp accrual and level advance | `ExperienceSystem.test.ts` — single/multi-level, bad input |
| Experience snapshot and restore | `ExperienceSystem.test.ts` — round-trip, wrong version, negative xp |
| XP orb spawn and validation | `XpOrbManager.test.ts` — valid spawn/minting, non-positive value |
| Orb attraction, movement, collection | `XpOrbManager.test.ts` — close/mid/distant/expired |
| Orb serialization round-trip | `XpOrbManager.test.ts` — batch round-trip, bad-record atomic reject |
| Persistence in game save | `Game.test.ts` (extend) — snapshot round-trip, missing rejected |
| Productive break spawns orb | `PlayerInteraction.test.ts` (extend) — productive spawns one, none supplied |
| Full gate | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` |
