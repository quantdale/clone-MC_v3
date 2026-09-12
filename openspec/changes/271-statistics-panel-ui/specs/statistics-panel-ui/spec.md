# Spec: statistics-panel-ui

## Contract

Wire the verified 187 `StatisticsFramework` into the live Game and ship an
in-game statistics panel. This spec covers persistence of the store,
live event increments, the panel UI, lifecycle, and test proof. The 187
key set and framework semantics are consumed verbatim and MUST NOT change.

## Definitions

- **Store**: the Game-owned immutable `StatisticStore` over the 7
  `DEFAULT_STATISTIC_KEYS`.
- **Record key**: the world-scoped raw metadata key `__statistics__`
  holding a `SerializedStatisticStore` (version 1).
- **Panel**: the `#statistics` DOM dialog driven by `StatisticsPanel`.
- **One-container rule**: at most one of crafting/furnace/brewing/
  enchanting/gamerule/recipe-book/advancements/creative/statistics is open.
- **Bounded saves**: persistence fires on the 5s autosave, pagehide/
  dispose flush, death events, and panel close — never per-tick.

## Invariants

- Game replaces (never mutates) its store reference; snapshots crossing
  to the panel/tests are copies.
- Identity increments (187 no-ops) produce no save and no re-render.
- Each wither defeat increments `mob_kills` exactly once.
- Walk accrues on-ground horizontal displacement only; teleports,
  respawns, and flight never mint meters.

## Requirements

### Requirement: world-scoped versioned persistence

The store MUST persist under `__statistics__` through the world save path
and MUST degrade to zeros on absent/corrupt payloads.

#### Scenario: fresh world starts at zeros

- **GIVEN** no `__statistics__` record exists
- **WHEN** the Game boots
- **THEN** the store equals `createStatisticStore()` (all 7 keys zero)
- **AND** the panel lists 7 zero rows.

#### Scenario: round-trip preserves counts

- **GIVEN** a store with non-zero counts
- **WHEN** serialized, stored, loaded, and deserialized
- **THEN** every key restores exactly (lossless integers).

#### Scenario: corrupt payload quarantines to defaults

- **GIVEN** a stored payload with a wrong version, an unknown key, a
  negative value, or a non-integer value
- **WHEN** the Game boots
- **THEN** the whole payload is rejected (nothing partially accepted)
- **AND** the store is zeros
- **AND** the failure is recorded via `recordError`.

#### Scenario: reset and archive passthrough

- **GIVEN** a world with stored statistics
- **WHEN** the world is reset
- **THEN** `__statistics__` is deleted (fresh zeros on next boot)
- **WHEN** the world is archived/restored
- **THEN** the statistics record travels with the archive intact.

### Requirement: live block-break increments

#### Scenario: committed break counts

- **GIVEN** any committed block break through `onInteractionAction('break')`
  (survival, creative-instant, or adventure-permitted)
- **WHEN** the break commits
- **THEN** `blocks_broken` increments by exactly 1.

### Requirement: live damage and death increments

#### Scenario: applied damage counts

- **GIVEN** an applied-damage outcome at `onSurvivalEvent('damage', amount)`
- **WHEN** the event fires with a finite positive amount
- **THEN** `damage_taken` increments by `floor(amount)`.

#### Scenario: death counts and saves promptly

- **GIVEN** a death outcome at `onSurvivalEvent('death')`
- **WHEN** the event fires
- **THEN** `deaths` increments by exactly 1
- **AND** the store is persisted immediately (not only at the next autosave).

### Requirement: wither-defeat mob kills exactly once

#### Scenario: each wither counts once across all defeat paths

- **GIVEN** a wither defeated via melee-tick damage, `damageWitherById`,
  or the passive tick defeat check
- **WHEN** the first defeat guard claims the reward (`!hasDroppedReward`)
- **THEN** `mob_kills` increments by exactly 1 alongside the reward
- **AND** later guards for the same wither increment nothing.

### Requirement: play-tick time accrual

#### Scenario: unpaused fixed ticks accrue time

- **GIVEN** the Game running unpaused fixed ticks
- **WHEN** N fixed ticks elapse
- **THEN** `time_played` increments by exactly N (one `play_tick` each).

### Requirement: walk-distance accrual

#### Scenario: on-ground movement accrues floored meters

- **GIVEN** the player moving horizontally while `onGround`
- **WHEN** fixed ticks elapse
- **THEN** `walk_distance` grows by the floored horizontal displacement,
  with sub-meter per-tick fractions carried across ticks (no distance is
  lost to flooring).

#### Scenario: teleport and respawn mint no meters

- **GIVEN** any position discontinuity (teleport, respawn, initial spawn)
- **WHEN** the next fixed tick runs
- **THEN** the displacement baseline resets and `walk_distance` is unchanged.

### Requirement: jump increments

#### Scenario: jump impulses count

- **GIVEN** a manual jump impulse or an auto-jump impulse in
  `PlayerController.update`
- **WHEN** the impulse fires
- **THEN** `jumps` increments by exactly 1 via the `onJump` hook.

### Requirement: statistics panel UI

The panel MUST list all 7 statistics with readable labels and formatted
values, MUST open via `KeyH` and the HUD button, MUST obey the
one-container rule, MUST re-render while open as values change, and MUST
announce counts on its status line.

#### Scenario: open shows seven labeled rows

- **GIVEN** the Game running with any store
- **WHEN** the player presses `H` (or clicks `#statistics-open`)
- **THEN** the `#statistics` dialog becomes visible
- **AND** it lists 7 rows in catalog order with labels (Distance Walked,
  Blocks Mined, Mob Kills, Deaths, Time Played, Damage Taken, Jumps)
- **AND** each row shows the current value (`statisticsSnapshot`).

#### Scenario: values update live while open

- **GIVEN** the panel open
- **WHEN** a gameplay event increments the store
- **THEN** the visible rows update without reopening.

#### Scenario: one-container and close paths

- **GIVEN** the statistics panel open
- **WHEN** another container opens (or `H`, the close button, `C`,
  death, or dispose fires)
- **THEN** the statistics panel closes (and vice versa: opening
  statistics closes every other container).
- **WHEN** the page blurs with the panel open
- **THEN** the panel stays open exactly once (263 blur precedent: no
  stacking, no silent close).

### Requirement: unit and browser proof

#### Scenario: unit coverage

- **GIVEN** the implementation
- **WHEN** `npm test` runs
- **THEN** new tests cover view labels/order/format, panel render/cache/
  close, persistence round-trip + all four rejection classes + reset/
  archive, wiring identity/exactly-once/no-throw seams, and the
  `onJump` hook at both impulse sites.

#### Scenario: browser journey

- **GIVEN** a fresh headed-off (headless-Capable) browser world
- **WHEN** the player walks, breaks a block, and jumps, then opens the
  panel with `H`, then reloads (with `pagehide` flush + settle)
- **THEN** the panel shows bumped `walk_distance`, `blocks_broken`,
  `jumps`, and `time_played`
- **AND** the reloaded panel shows the same values field-for-field.

## Error and failure behavior

- `deserializeStatisticStore` violations throw descriptive errors; the
  Game catches at the load boundary, records, and continues with zeros.
- `recordStatistic` MUST NOT throw for any framework-accepted event;
  `damage` with a missing/non-positive amount is a no-op.
- Missing panel DOM throws `Statistics element missing: #<id>` at
  construction (fail-fast, 263 pattern).
- Disposed/recovery Games ignore toggles and skip saves.

## Performance and resource bounds

- Per-tick statistics work is O(1): one `hypot`, one optional immutable
  spread, one signature compare; no allocations on the identity path.
- Persistence writes are bounded (autosave/pagehide/dispose/death/
  panel-close); per-tick writes are forbidden.
- Panel render while open is signature-gated (no DOM churn on equal values).

## Compatibility and migration

- Additive record; version 1; no migration. Reset deletes; archive carries.
- `DEFAULT_STATISTIC_KEYS` and framework semantics unchanged by this change.

## Security and integrity

- Stored payloads are untrusted input: full validation before accept, no
  partial application. No network surface; no new privileged APIs.

## Observability

- `Game.getStatisticsSnapshot()`, `Game.listStatisticRows()`,
  `Game.isStatisticsOpen()` back E2E via `window.__voxelGame`.
- Panel rows carry `data-statistic-row="<key>"`; status line announces
  counts (aria-live polite).

## Verification mapping

| Requirement | Proof |
|---|---|
| persistence round-trip/quarantine/reset/archive | `StatisticsPersistence` unit + E2E reload |
| break/damage/death/wither/tick/walk/jump increments | `StatisticsWiring` + controller unit tests |
| panel list/live-update/one-container/close | `StatisticsPanel` unit + E2E lifecycle |
| journey bump→show→reload-preserve | `tests/e2e/statistics.spec.ts` journey |
| gates green, no 258/259–270 impact | full gate commands + file-audit |
