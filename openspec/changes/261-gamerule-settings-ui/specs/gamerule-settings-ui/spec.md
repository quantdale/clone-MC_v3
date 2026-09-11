# Spec: gamerule-settings-ui

## Contract

Change 261 ships an in-game settings/gamerule UI over the change-189
`GameRuleFramework` with world-scoped persistence and live-consumer wiring,
closing the C252/MP-19.4-1 "seam not wired to UI" debt. The 189 registry
(keys, kinds, defaults, validation) is normative input and is NOT changed by
this spec. UI-only command surface (no `/gamerule` command) is sufficient.

## Definitions

- **Store**: the immutable `GameRuleStore` owned by `Game` (defaults or the
  validated persisted payload).
- **Valid edit**: a key naming a registered rule with a value of the rule's
  kind (via `isValidGameRuleValue` / `parseGameRuleValue`).
- **No-op edit**: an unknown key, wrong-kind value, or unparseable text. The
  store is returned/stays IDENTICAL and the panel reports the rejection.
- **Live consumer**: a production `Game` path that reads the store every use:
  wither explosions (`mobGriefing`), Fire random-tick dispatch
  (`doFireTick`), random-tick volume (`randomTickSpeed`).
- **Unwired rule**: a registered rule with no production `Game` consumer
  (`doWeatherCycle`, `doDaylightCycle`, `doMobSpawning`, `keepInventory`,
  `doImmediateRespawn`, `spawnRadius`). Unwired rules are still
  viewable, editable, and persisted; they MUST NOT gain invented consumers.

## Invariants

- I1: The panel renders exactly the rules (and order) returned by
  `gameRuleDefinitions()`; no rule list is duplicated in UI code.
- I2: Default stores reproduce pre-261 behavior exactly.
- I3: Persistence failures never break boot or play.

## Requirements

### Requirement: GR-1 — View all registered gamerules

The game SHALL render one row per registered gamerule showing its key, kind,
default, and current value.

#### Scenario: GR-1.1 — Full registry visible

- **GIVEN** a world booted with default gamerules
- **WHEN** the player opens the gamerule panel
- **THEN** nine rows appear (one per `GAME_RULE_KEYS` entry in order)
- **AND** each row shows the current value matching `createDefaultGameRules()`.

#### Scenario: GR-1.2 — Registry-driven rows

- **GIVEN** the 189 rule table
- **WHEN** the panel renders
- **THEN** no key string is hardcoded in the panel (rows derive from
  `gameRuleDefinitions()`).

### Requirement: GR-2 — Edit boolean rules

The game SHALL let the player toggle every boolean rule; each toggle applies
immediately, persists, and updates the row.

#### Scenario: GR-2.1 — Toggle mobGriefing off and on

- **GIVEN** the open panel with `mobGriefing` true
- **WHEN** the player activates the `mobGriefing` toggle
- **THEN** the store holds false, the toggle shows `aria-pressed="false"`,
  and the status line confirms the change
- **AND** activating again restores true.

### Requirement: GR-3 — Edit integer rules with validation

The game SHALL accept kind-valid integer text and SHALL no-op (store
identical, status explains) on invalid text.

#### Scenario: GR-3.1 — Valid integer applies

- **GIVEN** the open panel
- **WHEN** the player sets `randomTickSpeed` to `7`
- **THEN** the store holds 7 and the status confirms.

#### Scenario: GR-3.2 — Invalid integer is a no-op

- **GIVEN** the open panel with `randomTickSpeed` 3
- **WHEN** the player sets `randomTickSpeed` to `abc`
- **THEN** the store still holds 3 (IDENTICAL store)
- **AND** the status reports the rejection with the offending text.

#### Scenario: GR-3.3 — Wrong-kind programmatic set is a no-op

- **GIVEN** any store
- **WHEN** `Game.setGameRule('randomTickSpeed', 'fast' as unknown as number)`
  is called
- **THEN** it returns false and the store is IDENTICAL.

### Requirement: GR-4 — Persist gamerules with the world

The game SHALL persist the store under the world's save scope on every valid
edit and SHALL restore it on boot; absent payloads boot defaults and corrupt
payloads degrade to defaults without breaking boot.

#### Scenario: GR-4.1 — Toggle survives reload

- **GIVEN** `mobGriefing` set to false
- **WHEN** the page is hidden/unloaded and reloaded (autosave flush path)
- **THEN** the booted store holds `mobGriefing` false.

#### Scenario: GR-4.2 — Corrupt payload degrades to defaults

- **GIVEN** a stored gamerule payload with a wrong version, a missing key, a
  wrong-kind value, or an unknown key
- **WHEN** the world boots
- **THEN** the store equals `createDefaultGameRules()`
- **AND** a persistence error is recorded (save-status path), boot continues.

#### Scenario: GR-4.3 — Fresh worlds boot defaults

- **GIVEN** a world with no stored gamerule record
- **WHEN** the world boots
- **THEN** the store equals `createDefaultGameRules()`.

### Requirement: GR-5 — mobGriefing gates wither block destruction

`Game.applyWitherExplosion` SHALL destroy no blocks while `mobGriefing` is
false and SHALL destroy as before while true; player blast damage SHALL be
unaffected by the flag.

#### Scenario: GR-5.1 — Explosion spares blocks when false

- **GIVEN** `mobGriefing` false and a stone platform around a blast center
- **WHEN** `applyWitherExplosion(center, strength)` runs
- **THEN** every platform block survives.

#### Scenario: GR-5.2 — Explosion destroys when true

- **GIVEN** `mobGriefing` true (default) and the same platform
- **WHEN** `applyWitherExplosion(center, strength)` runs
- **THEN** at least one platform block is destroyed (pre-261 behavior).

#### Scenario: GR-5.3 — Player damage independent of the flag

- **GIVEN** the player within blast range
- **WHEN** the explosion runs with `mobGriefing` false
- **THEN** player damage equals the `mobGriefing`-true damage.

### Requirement: GR-6 — doFireTick gates Fire random ticks

The game SHALL skip the Fire `onRandomTick` dispatch while `doFireTick` is
false and SHALL dispatch as before while true (default).

#### Scenario: GR-6.1 — Fire frozen when false

- **GIVEN** `doFireTick` false
- **WHEN** `tickRandomBlocks` selects a Fire cell
- **THEN** `FireBlockBehavior.onRandomTick` is not invoked for it.

#### Scenario: GR-6.2 — Fire live by default

- **GIVEN** default gamerules
- **WHEN** `tickRandomBlocks` selects a Fire cell
- **THEN** dispatch proceeds exactly as pre-261.

### Requirement: GR-7 — randomTickSpeed drives tick volume

The game SHALL pass the `randomTickSpeed` value (clamped to `>= 0`) as the
per-section selector count; the default 3 SHALL reproduce the pre-261 call.

#### Scenario: GR-7.1 — Default count unchanged

- **GIVEN** default gamerules
- **WHEN** `tickRandomBlocks` runs
- **THEN** the selector receives count 3.

#### Scenario: GR-7.2 — Edited count propagates

- **GIVEN** `randomTickSpeed` set to 0 (or 7)
- **WHEN** `tickRandomBlocks` runs
- **THEN** the selector receives count 0 (or 7).

### Requirement: GR-8 — Panel lifecycle and accessibility

The panel SHALL open via `G` and the HUD button, close via `G`, `C`, its
close button, death, and `dispose()`; it SHALL keep `role="dialog"`
semantics, labeled controls, `aria-pressed` booleans, and a polite status
line; blur/visibility SHALL keep it open without stacking; exactly one
container panel SHALL be open at a time.

#### Scenario: GR-8.1 — Toggle open/close

- **GIVEN** playing with no panel open
- **WHEN** `G` is pressed
- **THEN** the panel opens; pressing `G` again closes it.

#### Scenario: GR-8.2 — One container at a time

- **GIVEN** the gamerule panel open
- **WHEN** `C` is pressed (or crafting/furnace/brewing/enchanting opens)
- **THEN** the gamerule panel closes and the other surface owns the screen.

#### Scenario: GR-8.3 — Focus loss keeps panel unstacked

- **GIVEN** the gamerule panel open
- **WHEN** the window blurs and refocuses
- **THEN** the panel is still open exactly once (no duplicate, no overlay
  stacking).

### Requirement: GR-9 — No invented systems or scope creep

The change SHALL NOT alter the 189 registry, SHALL NOT add consumers for
unwired rules, SHALL NOT add a `/gamerule` command, SHALL NOT touch the 207
keybinding table, and SHALL NOT touch 258 headed work or 259/260 behavior.

#### Scenario: GR-9.1 — Registry untouched

- **GIVEN** the 261 diff
- **WHEN** inspected
- **THEN** `src/simulation/GameRuleFramework.ts` is unmodified and no new
  rule key exists.

#### Scenario: GR-9.2 — Command path untouched

- **GIVEN** the 261 diff
- **WHEN** inspected
- **THEN** `CoreCommands.ts`, `CommandParser.ts`, and
  `ChatCommandNetworking.ts` are unmodified.

## Error and failure behavior

- Unknown gamerule key in `setGameRule`: return false, store IDENTICAL, no
  throw.
- Unparseable panel text: row keeps its value, status names the key and the
  offending text, no throw, no persistence write.
- Corrupt persisted payload: defaults + recorded error (GR-4.2).
- Persistence write failure: recorded error via the save-status path;
  in-memory value kept for the session.
- Missing `#gamerule` element: `GameRulePanel` constructor throws
  `Gamerule element missing` (fail-fast, 259/260 parity).

## Performance and resource bounds

- Tick paths perform O(1) in-memory reads per use; no IndexedDB on any hot
  path; one persistence put per successful edit only.
- Panel `render()` is signature-gated; no per-frame DOM churn while open and
  unchanged.

## Compatibility and migration

- Absent gamerule record → defaults (old saves boot unchanged).
- `WorldArchive.gameruleData` is OPTIONAL (missing → null); v1/v2 archives
  without it validate and import; export writes it when present.
- World reset deletes the gamerule record (fresh world boots defaults).
- No store version bumps; no registry/block/network format changes.

## Security and integrity

- Panel text input never reaches innerHTML (textContent/value only); gamerule
  values are typed primitives, never code.
- Persistence inputs are validated whole-payload before acceptance (189
  `deserializeGameRules`); nothing is partially applied.
- Original assets only: `.html`/`.css`/`.ts` additions, no binaries.

## Observability

- `#gamerule-status` (`aria-live="polite"`) reports every applied edit and
  every rejection with key + reason.
- Persistence errors surface through `GamePersistence.errors` → the existing
  save-status banner.

## Verification mapping

- GR-1/GR-2/GR-3 → `tests/unit/GameRulePanel.test.ts` + E2E journey.
- GR-4 → `tests/unit/GameRulesPersistence.test.ts` + E2E reload leg.
- GR-5 → `tests/unit/GameRuleWiring.test.ts` + E2E explosion contrast.
- GR-6/GR-7 → `tests/unit/GameRuleWiring.test.ts` (selector-count helper,
  dispatch gating via Game-tick observation where headless-feasible, else
  E2E-adjacent deterministic harness) + code inspection of the two call
  sites.
- GR-8 → E2E lifecycle spec + panel unit (show/hide).
- GR-9 → `git diff --stat` inspection (untouched-file allowlist) in
  verification.md.
- Gates: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e`, `node scripts/validate-state.mjs`.
