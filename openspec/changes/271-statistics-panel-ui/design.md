# Design: 271-statistics-panel-ui

## Context/current state

- 187 (`src/simulation/StatisticsFramework.ts`) is fully verified but
  headless-only: `createStatisticStore`, `applyStatisticEvent` (7 events),
  `statisticsSnapshot`, `serializeStatisticStore` /
  `deserializeStatisticStore` (strict, throws on version/unknown-key/
  non-integer violations). Nothing in `Game` references it.
- Panels follow the 263 shape: `AdvancementPanel` (pure DOM view,
  `listRows()` dep, `onClose()` dep, signature-cached `render()`,
  `hidden`-class show/hide) + Game-owned store + `openX`/`closeX`/`isXOpen`
  + HUD button + one-container close-all + blur/pause/dispose closes +
  E2E observability getters.
- Persistence follows the 263/267 shape: `WorldMetadataRepository`
  `put/get*Data` (`__advancements__` at `:200-208/:282-287`,
  hardcore/difficulty at `:233-252/:305-319`), `GamePersistence`
  `save*/load` (`saveAdvancements` `:1431-1447`, load degrade `:698-706`
  adv / `:742-759` hardcore), reset delete (`GamePersistence.ts:979-988`),
  archive passthrough (`WorldArchiver.ts:190,194-195`,
  `WorldArchive.ts:99,127,135`).
- Hotkeys are hardcoded in `InputManager.onKeyDown`
  (`KeyC`/`KeyG`/`KeyE`/`KeyR` + `consume*Toggle` accessors); the 207
  23-action table is movement/inventory-only and stays untouched. `KeyH`
  is free (no `src` usage).
- Event sites (all pre-existing, verified by recon):
  - breaks: `Game.onInteractionAction('break')` (`Game.ts:2985-2992`),
    the single choke fed by `PlayerInteraction.finishBreak`
    (`PlayerInteraction.ts:437-545`, survival + creative-instant +
    adventure-permitted).
  - damage/death: `Game.onSurvivalEvent` (`Game.ts:4710-4727`), fed by
    every applied-damage path (`hurtPlayer` `:4705-4708` single choke +
    survival.update DoT at the gated tick site `:1981-1990`).
  - wither defeat: 3 exactly-once reward sites
    (`damageWitherById` `:3468`, `tickWithers` `:3541`, melee `:3561`),
    each guarded by `!hasDroppedReward`.
  - fixed tick: `Game.runFixedTick` (`Game.ts:1893-2000`), driven by
    `tick→runFixedTick` (`:1309-1313`); pause-safe by construction (046).
  - jumps: `PlayerController.update` manual (`:131-137`) + auto-jump
    (`:149-158`) impulse sites; no callback exists yet.
  - walk: no tracker; `player.position` (`THREE.Vector3`) + `onGround`
    available in Game.

## Target state

One world-scoped `StatisticStore` owned by Game, persisted as
`__statistics__`, incremented from the hooks above, rendered by a new
`#statistics` panel with `KeyH` + HUD entry, live-updating while open,
and proven by unit + browser E2E.

## Invariants

- The 187 store stays immutable: Game replaces (never mutates) its
  reference; `statisticsSnapshot` copies cross the Game→panel boundary.
- Identity increments change nothing observable: no save, no re-render
  (the 263 early-return rule).
- Exactly-once mob-kill per wither: the increment rides inside the
  existing `!hasDroppedReward` guards, never beside them.
- Writes are bounded: stats may go dirty every tick; persistence fires
  only on autosave (5s), pagehide/dispose flush, death, and panel close.
- The panel owns no statistics state (status line only), like 263.

## API and data model

```ts
// src/simulation/StatisticsView.ts (new, pure)
interface StatisticRowView { key: StatisticKey; label: string; value: number; valueText: string; }
function describeStatistics(store: StatisticStore): StatisticRowView[]; // catalog order
function formatStatisticValue(key: StatisticKey, value: number): string;

// src/ui/StatisticsPanel.ts (new, DOM controller, 263 shape)
interface StatisticsPanelDeps { listRows(): StatisticRowView[]; onClose(): void; }
class StatisticsPanel {
  constructor(el: HTMLElement, deps: StatisticsPanelDeps);
  show(): void; hide(): void; isVisible(): boolean;
  setStatus(text: string): void; render(): void;
}

// Game additions (src/engine/Game.ts)
private statistics: StatisticStore;
recordStatistic(event: StatisticEvent): void;   // identity → return; else save-policy + render-if-open
getStatisticsSnapshot(): StatisticStore;        // E2E/unit read surface (copy)
listStatisticRows(): StatisticRowView[];        // panel dep + E2E
openStatistics(): void; closeStatistics(): void; isStatisticsOpen(): boolean;
private saveStatistics(): void;                 // no-op while recovery/disposed

// PlayerController (src/player/PlayerController.ts)
constructor(player, input, opts: { frictionProvider?: ...; onJump?: () => void });
// both impulse sites invoke opts.onJump?.()

// InputManager (src/engine/InputManager.ts)
private statisticToggleQueued = false;
consumeStatisticToggle(): boolean;              // KeyH queues, preventDefault added

// Persistence
WorldMetadataRepository: putStatisticData/getStatisticData ('__statistics__')
GamePersistence: saveStatistics/loadStatisticsRecord + reset delete
WorldArchiver/WorldArchive: statistics passthrough
```

Value formatting: `walk_distance` → `${v} m`; `time_played` (ticks @20tps)
→ human duration (`Xs`, `Mm SSs`, `Hh Mm`); others → plain integer text.
Labels: Distance Walked / Blocks Mined / Mob Kills / Deaths / Time Played /
Damage Taken / Jumps.

## Control/data flow

- Boot: `loadStatisticsRecord()` → `deserializeStatisticStore` on success;
  absent → `createStatisticStore()`; throw → `recordError` + defaults
  (late-promise re-render parity like `:927-941`).
- Play: hooks call `recordStatistic`; dirty store; panel re-renders iff open.
- Persist: autosave/pagehide/dispose/death/panel-close call
  `saveStatistics()` → `persistenceImpl.saveStatistics(serialize(...))`.
- Panel open: close all other containers first (extend both open-sites
  `:4095-4101`/`:3837-3843` and every close-all call site incl.
  `respawnPlayer`, dispose, `simulationActive` gate); `KeyH` toggles via
  `consumeStatisticToggle` next to `consumeGameruleToggle` (`:1787-1791`);
  HUD `#statistics-open` next to `#advancements-open` (`:1256-1257`).
- While open: re-render in the same per-frame slot that renders the
  advancements panel when open (`:1838-1839`).

## Detailed behavior

1. `recordStatistic`: `next = applyStatisticEvent(store, event)`; if
   `next === store` return; else `store = next`, `saveStatisticsDirty`
   marking (autosave picks it up) + immediate save on death events only,
   `statisticsPanel.render()` iff open.
   (Simplification: reuse the bounded save sites; death calls
   `saveStatistics()` directly because a death can precede an autosave.)
2. `break_block`: first line of `onInteractionAction` case `'break'`
   (counts every committed break incl. creative-instant; documented).
3. `damage`/`death`: top of the matching `onSurvivalEvent` legs with the
   provided `amount` (`damage` floors via the framework; `undefined`
   amount → no increment, never throw).
4. `kill_mob` (`mobKey: 'wither'`): inside each of the 3 defeat guards
   next to the reward grant.
5. `play_tick`: end of `runFixedTick` (after section 6), unconditional —
   ticks only run unpaused in simulating state.
6. `walk`: same site; horizontal displacement since last tick
   (`hypot(dx, dz)`) accumulated only while `player.onGround` is true.
   Per-tick amounts (~0.2 m) would floor to zero in the 187 event, so a
   `walkRemainder` carries sub-meter fractions across ticks and only
   whole meters are recorded (lossless over time). Initializes
   `lastStatX/Z` at boot/spawn/respawn (teleport discontinuity must not
   mint meters; the remainder itself is kept — it is real walked
   distance).
7. `jump`: `onJump: () => this.recordStatistic({ type: 'jump' })` passed
   to the controller; both impulse sites fire (each upward impulse
   counts, incl. swim-up ticks — documented semantic).

## Failure modes

- Corrupt/absent/unknown-key payload → defaults + `recordError`; panel
  shows zeros; game continues (fail-open with quarantine, like 263/267).
- `recordStatistic` never throws for framework no-ops (unknown key type
  impossible via TS; runtime floats floored by 187).
- Panel DOM missing → constructor throws exact `Statistics element
  missing: #id` (263 pattern) — surfaces in tests, not silent.
- Disposed/recovery Game → `saveStatistics()` no-ops; toggle ignored.

## Compatibility/migration

Additive `__statistics__` record; old saves load as zeros; reset deletes;
archive carries; version stays 1. No migration code.

## Performance/resource constraints

- Per-tick cost: one `hypot` + one immutable spread only when an event
  actually changed the store (identity fast path otherwise); panel render
  skipped by signature cache when values unchanged.
- Persistence bounded per §7 proposal (no per-tick IndexedDB writes).

## Testing seams

- Pure: `StatisticsView` (labels/order/format), framework already covered.
- DOM: `StatisticsPanel` over FakeElement (259–263 node-shim pattern).
- Seam: `recordStatistic` composition + hook-call placement proven via
  new `StatisticsWiring` unit tests (identity refs, exactly-once wither
  guard logic at seam level) + `PlayerController` onJump unit tests.
- E2E (`tests/e2e/statistics.spec.ts`): journey (KeyH open → walk/break/
  jump bump → reload → field-for-field preserved, incl. `pagehide`
  dispatch + settle like hardcore 76-80) + lifecycle (close via KeyH/
  Escape-equivalent, one-container vs crafting, blur closes, no double
  toggle). Death path via the existing `debugKillPlayer` seam
  (`Game.ts:4355-4356`).
- Game is DOM-bound with no node harness (263 precedent): Game-structural
  guarantees at seam level in unit tests, end-to-end in the browser.

## Observability/debugging

`getStatisticsSnapshot()`, `listStatisticRows()`, `isStatisticsOpen()`
on Game (consumed by `window.__voxelGame` E2E); panel status line
announces counts (`7 statistics` + non-zero summary).

## Affected files/symbols

New: `src/simulation/StatisticsView.ts`, `src/ui/StatisticsPanel.ts`,
`tests/unit/StatisticsView.test.ts`, `tests/unit/StatisticsPanel.test.ts`,
`tests/unit/StatisticsWiring.test.ts`, `tests/unit/StatisticsPersistence.test.ts`,
`tests/e2e/statistics.spec.ts`, `openspec/changes/271-statistics-panel-ui/*`.
Modified: `src/engine/Game.ts`, `src/engine/InputManager.ts`,
`src/player/PlayerController.ts`, `src/storage/WorldMetadataRepository.ts`,
`src/storage/GamePersistence.ts`, `src/storage/WorldArchiver.ts`,
`src/storage/WorldArchive.ts`, `index.html`, `src/styles.css`,
`PARITY_MATRIX.md`, `openspec/PROGRAM_STATE.*`.
Untouched: `StatisticsFramework.ts`, `KeybindingFramework.ts`, 259–270
sources/tests, 258 files.

## Rejected alternatives

- Saving every tick: unbounded IndexedDB churn for `play_tick`; rejected
  for the bounded policy.
- HUD-chip-only (263 style) with no hotkey: scope explicitly allows
  "hotkey or entry"; `KeyH` is free and E2E-friendly. HUD button added
  too for mouse/touch parity.
- Counting fly/swim displacement as walk: rejected; on-ground gate keeps
  the label honest with one documented simplification.
- Wiring regular-mob kills: no live kill path exists; inventing sampling
  (e.g. polling mob counts) is the fragile path the scope forbids.

## Downstream dependencies

None: statistics are a leaf consumer (no simulation reads them). Future
advancement triggers (e.g. stat-gated rewards) can compose on
`getStatisticsSnapshot`.
