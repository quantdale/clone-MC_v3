# Design: 292-player-status-effect-persistence

## Context/current state

On `origin/main` `e024126` (291 VERIFIED):

- `Game.playerEffects: StatusEffectManager` (registry
  `createDefaultStatusEffectRegistry()`) is created in the constructor, ticked
  once per unpaused fixed tick (`playerEffects.tick(dt)`, section 6) and
  cleared on respawn. `serialize()` yields `StatusEffectInstanceData[]`
  (`{ typeId, duration /* seconds remaining */, amplifier }`); `deserialize`
  is atomic and throws on any unregistered/malformed entry. Nothing persists it.
- Hero of the Village (290) is granted only on a non-VICTORY → VICTORY raid
  transition (`maybeGrantHeroOfTheVillage`) with amplifier
  `heroAmplifierFromBadOmen(level)` and `heroDurationSeconds()`.
- `Game.badOmen: BadOmenState` (`{ level }`, cap 5, 285) has no duration and
  is explicitly never persisted. Dispose resets it *before* the final
  `savePlayerStateDurable()`.
- `evaluateBadOmenVillageTrigger()` runs each unpaused fixed tick (5.8): omen
  ≥ 1 inside a detected village → `startRaidAt` (replaces any prior raid;
  291 clears the patrol) → omen cleared. *(294: an ACTIVE raid in the village
  is escalated in place instead.)*
- Player-state persistence (040/289): `buildPlayerSnapshot()` →
  `GamePersistence.savePlayerState()` → `validatePlayerStateRecord()` (which
  rebuilds the object with known fields only) → DirtySaveQueue unit
  `player-state|<worldId>`; `savePlayerStateDurable()` additionally flushes.
  Called on pagehide, dispose, enchant apply, death statistics and every 5 s
  of unpaused play (autosave). Load: `playerRecordToSnapshot` →
  `applyInitialPlayerState` (seed match, not recovery-required, position
  accepted) → inventory/survival/experience restore.
- Raid state persists independently (283 `__raid__`, `saveRaid()`).

## Target state

1. A versioned `effects` payload inside the existing player-state record:
   `{ version: 1, effects: StatusEffectInstanceData[], badOmen: { level,
   remainingSeconds } }`.
2. Bad Omen has a finite duration (`BAD_OMEN_DURATION_SECONDS = 6000`), ticked
   next to `playerEffects.tick(dt)`.
3. Restore resumes exact remaining durations; missing/invalid payload → none.
4. Event-driven durable saves close the discrete farming windows.

## Invariants

- I1. Round trip: serialize → parse → restore reproduces every active effect's
  type, amplifier and remaining duration (floating seconds, exact), and the
  omen level and remaining seconds.
- I2. Restore never increases a remaining duration beyond the stored value and
  never exceeds registry `maxDuration` / `maxAmplifier`, omen cap 5, omen
  duration 6000 s.
- I3. Restore never grants HOTV or omen; the 290 VICTORY predicate is the only
  HOTV grant path; hydrate of a VICTORY raid is not a transition.
- I4. A missing `effects` field (pre-292 record) yields no effects and omen 0.
- I5. `parsePlayerEffects` never throws; any malformed top-level payload yields
  no effects and omen 0; malformed entries are dropped individually.
- I6. Omen level > 0 ⇔ remaining > 0 in every normalized state.
- I7. No new object store/namespace/schema version; all writes go through the
  289 `player-state` dirty unit.
- I8. Omen consumption by a raid start is written durably together with the
  new raid record (`saveRaid()` + `savePlayerStateDurable()`), so reload can
  never replay a consumed omen.
- I9. Change 258 stays BLOCKED; no GPU work; goldens untouched.

## API and data model

```ts
// src/simulation/PlayerEffectsPersistence.ts (pure; no DOM, no Game)
export const PLAYER_EFFECTS_PAYLOAD_VERSION = 1;
export const BAD_OMEN_DURATION_SECONDS = 6000;   // 120000 ticks / 20 TPS
export const MAX_PERSISTED_EFFECTS = 64;

export interface PersistedBadOmen { level: number; remainingSeconds: number }
export interface PersistedPlayerEffects {
  version: 1;
  effects: StatusEffectInstanceData[];
  badOmen: PersistedBadOmen;
}
export type PlayerEffectsRestoreStatus = 'absent' | 'ok' | 'invalid';
export interface PlayerEffectsRestore {
  status: PlayerEffectsRestoreStatus;
  effects: StatusEffectInstanceData[];   // sanitized, registry-clamped
  badOmen: PersistedBadOmen;             // normalized
  dropped: number;                       // entries discarded while parsing
}

export function normalizeBadOmen(level: unknown, remaining: unknown): PersistedBadOmen;
export function refreshBadOmenDuration(level: number): PersistedBadOmen; // level≥1 → full
export function tickBadOmen(state: PersistedBadOmen, dt: number): PersistedBadOmen;
export function serializePlayerEffects(
  effects: readonly StatusEffectInstanceData[], badOmen: PersistedBadOmen,
): PersistedPlayerEffects;
export function parsePlayerEffects(
  input: unknown, registry: StatusEffectTypeRegistry,
): PlayerEffectsRestore;
```

Storage (additive, optional):

```ts
interface PlayerStateRecord { …; effects?: unknown }   // opaque to storage
interface GamePlayerSnapshot { …; effects?: unknown }
```

`validatePlayerStateRecord` copies `effects` only when it is not `undefined`
(absent stays absent, so pre-292 equality checks are unaffected);
`savePlayerState` and `playerRecordToSnapshot` pass it through.

Game additions:

- `private badOmenRemainingSeconds = 0`
- `getBadOmenRemainingSeconds(): number` (seam)
- `debugTickStatusEffects(seconds: number): void` — advances playerEffects and
  omen as the fixed tick would (E2E proof of resume without waiting minutes)
- `getStatusEffectRestoreReport(): { status; dropped; effects; badOmenLevel }`
  (observability of the last restore)

## Control/data flow

Save: `buildPlayerSnapshot()` adds
`effects: serializePlayerEffects(playerEffects.serialize(), { level, remaining })`
→ `savePlayerState` → validated record (field passthrough) → DirtySaveQueue →
IndexedDB (`flush` on durable paths).

Load: record → `playerRecordToSnapshot` (passthrough) →
`applyInitialPlayerState` → after experience restore:
`restorePlayerEffects(state.effects)` → `parsePlayerEffects` →
`playerEffects.deserialize(sanitized)` (fallback `clear()` if it still throws)
→ `badOmen = createBadOmen(level)`, `badOmenRemainingSeconds = remaining`.
Trading panel re-renders if open (HOTV discount is read live).

## Detailed behavior

### Serialization

- Effects entries with non-finite or ≤ 0 duration, non-finite/negative
  amplifier, or non-string type are omitted; at most 64 entries are written.
- Omen normalized through `normalizeBadOmen` (level floor/clamp 0..5,
  remaining clamp [0, 6000]; either 0 → `{0, 0}`).

### Parsing (tolerant, fail closed)

- `undefined`/`null` → `status 'absent'`, no effects, omen `{0,0}`.
- Non-object, `version !== 1`, `effects` not an array → `status 'invalid'`,
  no effects, omen `{0,0}` (never throws).
- Each entry: object with string `typeId` parseable as a registered effect,
  finite `duration > 0`, finite `amplifier ≥ 0`; else dropped (`dropped++`).
  Duration clamped to `min(duration, type.maxDuration)`; amplifier
  `min(floor(amplifier), type.maxAmplifier ?? 0)`. Duplicate type ids: first
  occurrence wins (later duplicates dropped). Entries beyond 64 dropped.
- `badOmen` missing or malformed → `{0,0}` (entries still restored).

### Bad Omen duration

- Valid grant (`clampBadOmenLevel(amount) ≥ 1`): level stacks toward cap 5 per
  285, then remaining is refreshed to 6000 s — also at the cap (vanilla
  re-application refreshes). Invalid amounts stay complete no-ops.
- `clearBadOmen`, trigger consumption, dispose → `{0, 0}`.
- Fixed tick (section 6, beside `playerEffects.tick(dt)`): remaining −= dt;
  reaching 0 clears the level and saves durably. Paused/loading/disposed
  paths never tick (same gate as effects).

### Durable save points

| Event | Save |
|---|---|
| pagehide / dispose | existing `savePlayerStateDurable()` (dispose now resets omen *after* it) |
| every 5 s unpaused | existing autosave `savePlayerState` (duration staleness ≤ 5 s on crash) |
| HOTV granted (VICTORY) | `saveRaid()` + `savePlayerStateDurable()` (raid VICTORY and HOTV in one flush) |
| `grantBadOmen` / `clearBadOmen` effective change | `savePlayerStateDurable()` |
| omen consumed by 285 trigger raid start | `saveRaid()` + `savePlayerStateDurable()` |
| omen expiry | `savePlayerStateDurable()` |
| respawn (effects cleared) | `savePlayerStateDurable()` |
| `debugClearHeroOfTheVillage` removal | `savePlayerStateDurable()` |

All are no-ops without persistence or while recovery-required (existing
`savePlayerStateDurable` gate).

### Restored omen × 285 trigger × 291 patrols (decision)

- **Vanilla parity:** a restored omen whose player stands inside a detected
  village starts a raid on the first unpaused fixed tick where the village
  query resolves `containsPlayer` — exactly like live omen (5.8 runs every
  tick; nothing special-cases restore).
- That raid start goes through `startRaidAt`, which dismisses any live patrol
  (291, `'raid-start'`) and never grants omen; the omen is then consumed and
  written durably with the raid record (I8). A second reload shows omen 0 and
  the restored ACTIVE raid (283).
- A restored omen with a restored ACTIVE raid behaves identically to the same
  state before the reload (285 replacement rule unchanged). Vanilla instead
  escalates the running raid's omen level; that divergence is pre-existing and
  documented as a future candidate, not changed here. *Resolved by 294: the
  restored omen now escalates a restored ACTIVE raid in the village in place,
  saved durably with the consumed omen.*
- Patrols are not restored (291), so a restored omen can only come from a
  save; no patrol-derived double grant is possible across reload.

### Death

Respawn keeps its pre-292 semantics: `playerEffects.clear()` (HOTV removed)
and Bad Omen retained (285). 292 adds a durable save after the clear so a
reload right after death cannot resurrect cleared effects. Vanilla clears
Bad Omen on death; documented divergence, unchanged. *Resolved by 294:
`respawnPlayer()` now also clears Bad Omen (level + remaining) inside the same
durable save, so a reload after death shows omen 0.*

## Failure modes

| Failure | Behavior |
|---|---|
| pre-292 record (no field) | no effects, omen 0, status `absent` |
| corrupt/foreign payload | no effects, omen 0, status `invalid`, boot continues |
| unregistered effect id (registry change) | entry dropped, others restored |
| over-cap duration/amplifier/level | clamped |
| `deserialize` throws unexpectedly | `clear()`; omen still restored |
| persistence absent / recovery-required | no save; restore skipped (existing gate) |
| crash without pagehide | ≤ 5 s duration replay (autosave interval) |

## Compatibility/migration

Additive optional field; no schema bump; old code ignores it; world backups
carry it through `validatePlayerStateRecord`. Legacy localStorage migration
produces records without the field → no effects.

## Performance/resource constraints

Payload ≤ 64 small entries (typically 0–2). Durable saves are event driven and
rare (grant/consume/expiry/respawn); the 5 s autosave is unchanged. Omen tick
is O(1).

## Testing seams

- Pure codec unit tests (`PlayerEffectsPersistence.test.ts`).
- `PlayerStateRecord` passthrough/absence tests.
- Live composition oracle (`LiveStatusEffectPersistence.test.ts`) over the
  real `StatusEffectManager`, codec and `BadOmenRules`, plus Game source
  guards (dispose ordering, restore call, snapshot field, save points).
- E2E `status-effect-persistence.spec.ts` + updated 285/290/291 reload specs.

## Observability/debugging

`getStatusEffectRestoreReport()`, `getBadOmenRemainingSeconds()`,
`playerEffects.serialize()`.

## Affected files/symbols

- New: `src/simulation/PlayerEffectsPersistence.ts`,
  `tests/unit/PlayerEffectsPersistence.test.ts`,
  `tests/unit/LiveStatusEffectPersistence.test.ts`,
  `tests/e2e/status-effect-persistence.spec.ts`.
- Modified: `src/storage/PlayerStateRecord.ts`,
  `src/storage/GamePersistence.ts`, `src/engine/Game.ts`,
  `tests/unit/PlayerStateRecord.test.ts`,
  `tests/e2e/hero-of-the-village.spec.ts`,
  `tests/e2e/pillager-patrol.spec.ts`,
  `tests/e2e/bad-omen-acquisition.spec.ts`.

## Rejected alternatives

- New `__effects__` store/namespace: more migration surface; effects are
  player state and belong in the player record.
- Reset durations to full on load: enables farming; rejected by scope.
- Store absolute expiry timestamps: wall-clock time passes while the tab is
  closed; vanilla durations only tick during play.
- Moving Bad Omen into `playerEffects` as the `bad_omen` registry entry: its
  placeholder bounds (max 100 s, amplifier 0) conflict with the 285 level cap
  and would change 285/291 tests widely; a Game-owned remaining counter keeps
  `BadOmenRules` untouched.
- Blocking the 285 trigger during an ACTIVE raid: behavior change outside
  persistence scope; documented as a candidate.

## Downstream dependencies

293 (raider/patrol rendering) is independent of this change.
