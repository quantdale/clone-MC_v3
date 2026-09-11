# Spec: live-creative-mode

## Contract

Wire the verified 192 `GameModeFramework` predicates into the live Game and ship
a creative inventory/menu, so creative mode is actually playable. Survival stays
the default and is unaffected. All behavior is original code over the existing
registries; no proprietary assets.

## Definitions

- **Mode**: one of `survival | creative | adventure | spectator` (192 `GameMode`).
- **Live rules**: `depletesItems`, `instantBlockBreak`, `survivalStatsDeplete`,
  `canFly` applied per-tick/per-action from the current mode.
- **Creative menu**: the searchable grant UI listing placeable items.
- **Degrade-to-survival**: any absent/corrupt persisted mode boots `survival`.

## Invariants

- I1: Fresh worlds, absent records, corrupt records, and archives without the
  field all boot `survival`.
- I2: Identity/invalid switches change nothing observable (no write, no toast).
- I3: Survival behavior with mode `survival` is identical to pre-265 behavior.

## Requirements

### Requirement: Mode persistence

The Game MUST persist the mode world-scoped via a `__gamemode__:<worldId>` raw
record carrying the 192 serialized payload, restore it on boot (injected and
self-composed paths), degrade corrupt payloads to `survival` with a recorded
facade error, delete the key on world reset, and carry it through
export/import (missing reads null).

#### Scenario: Round-trip preserves creative

- **GIVEN** a world where `setGameMode('creative')` was applied
- **WHEN** the facade reopens (or the page reloads) and the Game boots
- **THEN** `getGameMode()` returns `'creative'`, and the HUD chip reads creative.

#### Scenario: Corrupt payload degrades to survival

- **GIVEN** a stored `__gamemode__` payload with a wrong version, unknown mode,
  unknown keys, or a non-object shape
- **WHEN** the facade opens and the Game boots
- **THEN** the Game boots `survival`, boot continues (no throw), and a
  `load gamemode` error is recorded.

#### Scenario: Reset and archive parity

- **GIVEN** a world with a persisted creative mode
- **WHEN** the world is reset
- **THEN** the `__gamemode__` key is deleted (reboot is survival);
- **WHEN** the world is exported and re-imported
- **THEN** the mode survives; archives without the field import as survival.

### Requirement: Mode switching

`setGameMode(mode)` MUST apply a different valid mode immediately (persist +
chip + toast), and MUST return false with no observable effect for the same
mode or an invalid value. `setGameModeFromText(text)` MUST use the 192
case-insensitive parse (surrounding whitespace tolerated) and return false for
unknown text. The HUD toggle MUST flip survival ⇄ creative only.

#### Scenario: Switch applies live with no restart

- **GIVEN** a survival game
- **WHEN** `setGameMode('creative')` is called
- **THEN** it returns true, `getGameMode()` is `'creative'`, the payload is
  saved, the chip relabels, a toast names Creative, and mining/placing on the
  very next tick follows creative rules.

#### Scenario: Identity and invalid switches are no-ops

- **GIVEN** any mode
- **WHEN** `setGameMode` is called with the current mode, an unknown string, or
  `setGameModeFromText` with blank/unknown text
- **THEN** each returns false, the store is identical, no persistence write
  occurs, and no toast appears.

### Requirement: No item depletion in creative

When `depletesItems(mode)` is false, placing a block MUST NOT consume the held
stack, and using a consumable (bonemeal/food path where eating would otherwise
consume) MUST NOT consume it either. An empty hand still cannot place.

#### Scenario: Place without depleting

- **GIVEN** creative mode with a selected dirt stack of N
- **WHEN** a dirt block is placed against a target face
- **THEN** the world cell changes and the selected stack is still N.

#### Scenario: Survival still depletes

- **GIVEN** survival mode with a selected dirt stack of N ≥ 2
- **WHEN** a dirt block is placed
- **THEN** the selected stack is N − 1.

### Requirement: Instant block break in creative

When `instantBlockBreak(mode)` is true, a breakable targeted block MUST be
removed on the first mining update (no duration wait), with no loot drops, no
XP orbs, and no tool durability loss. Unbreakable blocks (bedrock-like) MUST
still refuse. Survival mining durations MUST be unchanged.

#### Scenario: Creative break is instant and clean

- **GIVEN** creative mode targeting a breakable stone block with an empty hand
- **WHEN** one mining update runs
- **THEN** the cell is air, no item entities or XP spawned from it, and the
  held stack (if any tool) took no durability damage.

#### Scenario: Unbreakable still refuses in creative

- **GIVEN** creative mode targeting an unbreakable block
- **WHEN** mining is attempted
- **THEN** the cell is unchanged and the `blocked` action fires.

### Requirement: No survival-stat depletion in creative

When `survivalStatsDeplete(mode)` is false, the survival tick MUST NOT drain
hunger/saturation or apply damage-over-time, and direct player-damage paths
(mobs, explosions, hazards) MUST NOT reduce health. Survival depletion MUST be
unchanged in survival/adventure.

#### Scenario: Creative ignores damage and drain

- **GIVEN** creative mode with health/hungersnapshotted
- **WHEN** survival ticks run (sprinting, submerged variants) and damage is
  dealt through the player-damage paths
- **THEN** health and hunger are unchanged (unit-pinned via the tick gate and
  damage gate; E2E-pinned via mode persistence + HUD values).

### Requirement: Minimal safe flight

When `canFly(mode)` is true, gravity MUST NOT pull the player, vertical
velocity MUST follow Space (ascend) / Shift (descend) / hover (neither or both),
horizontal movement MUST be unchanged, and `fallDistance` MUST NOT accumulate
(no landing damage on return to survival while airborne — damage itself is also
gated, belt-and-braces). When `canFly(mode)` is false, physics MUST be exactly
legacy.

#### Scenario: Hover, rise, sink

- **GIVEN** creative mode with the player airborne
- **WHEN** no vertical input is held for several ticks
- **THEN** altitude holds (within float tolerance);
- **WHEN** jump is held
- **THEN** altitude increases at the documented fly speed;
- **WHEN** sneak is held instead
- **THEN** altitude decreases at the same speed.

#### Scenario: Survival physics untouched

- **GIVEN** survival mode with the player airborne and no input
- **WHEN** ticks run
- **THEN** altitude decreases under gravity exactly as before (existing physics
  suites stay green untouched).

### Requirement: Creative inventory/menu

The menu MUST list every registry item with a `placeBlock` target in
registration order (name + key), filter them by case-insensitive substring over
name/key (blank = all), and grant a full `stackSize` stack into the inventory
on row activation with no crafting cost or gate. Unknown ids and a full
inventory MUST fail gracefully (false + status, inventory unchanged). The panel
MUST follow the one-container rule and MUST render with a signature guard.

#### Scenario: Browse, search, grant

- **GIVEN** creative mode with the menu open
- **WHEN** the player types a query matching a subset (e.g. dirt-like)
- **THEN** only matching rows show in registry order;
- **WHEN** a row is activated
- **THEN** the inventory count for that item grows by a full stack and the
  hotbar re-renders.

#### Scenario: Grant failure is graceful

- **GIVEN** the menu open
- **WHEN** granting an unknown id (stale row) or when the inventory is full
- **THEN** it returns false, the inventory is byte-identical, and the status
  line explains.

#### Scenario: One container at a time

- **GIVEN** the creative menu open
- **WHEN** crafting/furnace/brewing/enchanting/gamerule/recipe-book/advancements
  opens (or the `KeyE`/chip toggle fires)
- **THEN** the creative menu closes (and vice versa); death/dispose also close
  it.

## Error and failure behavior

- All persistence failures degrade (null + recorded error); boot never throws
  for mode data.
- All switch/grant entry points are total (boolean returns, never throw on
  invalid input).
- Registry drift (unresolvable `placeBlock`) lists the row with a null block
  reference; grant still yields the item form; placement follows the existing
  blocked path.

## Performance and resource bounds

- Menu upkeep while open is O(1) when the signature is unchanged; filtering is
  linear over at most hundreds of entries on query change only.
- Flight adds at most one predicate call per tick plus one float store; no
  per-tick allocations beyond the single resolver result at the Game call site.
- Mode saves are event-driven (switch) plus piggyback on existing
  dispose/pagehide/autosave sites; no new timers.

## Compatibility and migration

- No store/schema version changes. Reset deletes `__gamemode__`. Archives carry
  optional `gameModeData` (missing = null = survival).
- `PlayerInteraction`/`PlayerPhysics` extensions are optional callbacks;
  unwired callers keep exact legacy behavior.

## Security and integrity

- No new network, storage, or permission surface. The text seam accepts only
  the four 192 mode names (everything else is a false no-op); no eval, no HTML
  injection (rows use `textContent`).

## Observability

- Switch toast, HUD chip label (aria-live), status line in the menu,
  `load gamemode` facade errors through the save-status banner.

## Verification mapping

- Persistence: `tests/unit/GameModePersistence.test.ts` + E2E reload case.
- Switching: E2E toggle/text/invalid cases + 192 unit suites (underlying rule).
- No-deplete/instant/clean-break: `PlayerInteraction` unit extensions + E2E.
- No-stats: unit gate tests (where Game-DOM-bound logic allows, facade-level) +
  E2E HUD assertions.
- Flight: `CreativeFlight` unit + `PlayerPhysics` flying unit + E2E hover/rise.
- Menu: `CreativeInventory` unit + E2E browse/search/grant + lifecycle E2E.
- Regression: typecheck, lint (0 errors), unit suite, build, full E2E,
  file-audit, validate-state.
