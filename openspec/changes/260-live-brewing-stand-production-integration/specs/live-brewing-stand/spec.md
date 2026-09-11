# Spec: live-brewing-stand

## Contract

This capability wires the verified headless brewing seam (122 potion contents,
123 stand engine + menu helpers, 219 potion data) into the playable Game,
mirroring Change 251 (furnace) and Change 259 (panel lifecycle). It covers
place, open, insert, deterministic fixed-tick brewing with progress UI,
persistence across reload, safe break, and safe session lifecycle. Original
procedural assets only; no binaries.

Out of scope (see proposal): multiplayer sync, 258 headed work, 259 reopen,
second potion system, component-carrying item entities, water→awkward
completion.

## Definitions

- **Stand**: a placed brewing-stand block (id 62) with one authoritative
  `BrewingState` in `LiveBlockEntityHost`.
- **Bottle**: a `minecraft:potion` stack carrying valid 122
  `potion_contents` (awkward base + ≥1 effect in the live loop).
- **Fuel**: `minecraft:blaze_powder` (1200 burn ticks per powder).
- **Ingredient**: a recipe ingredient item (live loop: `minecraft:redstone`).
- **Brew cycle**: 400 fixed ticks turning awkward+redstone into speed
  (duration 480, amplifier 1), consuming one ingredient.
- **Simulating chunk**: a chunk reporting `isChunkSimulating` (host view).

## Invariants

- I-1..I-6 per `design.md` (single authority; simulating-only ticks;
  cursor-only transient panel state; one container at a time; snapshot
  persistence with quarantine; atomic transactions).

## Requirements

### Requirement: BREW-1 Place instantiates a live stand

The brewing-stand item MUST place block 62 and register exactly one empty
brewing instance; placing MUST NOT disturb furnace/enchanting state.

#### Scenario: BREW-1.1 Place from inventory through the real path

- **GIVEN** a player holding the brewing-stand item aimed at a valid surface
- **WHEN** the place action commits block 62
- **THEN** `blockEntityHost.hasBrewing(x,y,z)` is true, `getBrewingState`
  returns the empty state (all timers 0), and `host.size` grew by exactly one.

#### Scenario: BREW-1.2 Double-place is idempotent-safe

- **GIVEN** a live stand at a position
- **WHEN** `placeBrewing` is called again for the same position
- **THEN** it returns false and the authoritative state is unchanged.

### Requirement: BREW-2 Right-click opens the brewing panel

Right-clicking/`use` on a brewing-stand block MUST open `#brewing` (with
coords, furnace/259 parity) and MUST close furnace/crafting/enchanting first;
opening MUST be a no-op when no live stand exists at the cell.

#### Scenario: BREW-2.1 Use opens instead of placing

- **GIVEN** a placed stand and any held stack
- **WHEN** the player right-clicks the stand block
- **THEN** `#brewing` is visible, `#hotbar` is hidden, the block is still 62,
  `isBrewingOpen` is true, and the held stack is untouched.

#### Scenario: BREW-2.2 Stale use opens nothing

- **GIVEN** no live stand at the targeted cell
- **WHEN** `openBrewing(x,y,z)` is invoked
- **THEN** nothing opens and no exception is raised.

### Requirement: BREW-3 Insert through real menu transactions

Bottle, ingredient, and fuel MUST enter the stand through 106 transactions
(left/right click, quick-move) on a 39-slot menu derived from authoritative
state; unconvertible results MUST abort the whole transaction.

#### Scenario: BREW-3.1 Quick-move loads the stand

- **GIVEN** an open panel and awkward bottle + blaze powder + redstone in the
  player inventory
- **WHEN** the player shift-clicks in bottle → fuel → ingredient order
  (first-fit routing, furnace parity — the symmetric 123 menu has no
  per-slot filters; vanilla-accurate slot filters are future work)
- **THEN** host state shows `minecraft:potion` (awkward contents),
  `minecraft:blaze_powder`, and `minecraft:redstone` in
  bottle/fuel/ingredient slots.

#### Scenario: BREW-3.2 Components ride every transaction

- **GIVEN** a bottle carrying `potion_contents` in any menu slot
- **WHEN** the player picks it up (left/right click), places it, swaps it,
  or quick-moves it
- **THEN** the carried/result slots hold identical contents, emptied slots
  keep no orphan components, same-item merges happen only for identical
  contents (differing contents swap instead), and component-less flows
  behave byte-identically to the pre-260 106 core.

#### Scenario: BREW-3.3 Corrupt result aborts atomically

- **GIVEN** an open panel
- **WHEN** a transaction would produce a slot that cannot convert back
  (unknown id / corrupt components)
- **THEN** the authoritative stand state, player inventory, and cursor are
  all unchanged.

### Requirement: BREW-4 Deterministic fixed-tick brewing with progress

Stands in simulating chunks MUST advance exactly one canonical tick per fixed
tick (fuel lights only when a brew is possible; active fuel always burns
down); awkward+redstone MUST complete in 400 ticks into speed (480/1) and
consume one ingredient; the panel MUST show live brew/fuel progress.

#### Scenario: BREW-4.1 Full brew on the fixed tick

- **GIVEN** a loaded stand (awkward bottle, redstone, blaze powder) in a
  simulating chunk
- **WHEN** 400 fixed ticks run (simulation active, panel may be closed)
- **THEN** the bottle carries speed (duration 480, amplifier 1), exactly one
  ingredient and one fuel were consumed, and timers reset.

#### Scenario: BREW-4.2 No fuel burn without a possible brew

- **GIVEN** fuel + ingredient but no valid bottle (or no matching recipe)
- **WHEN** ticks run
- **THEN** fuel is unconsumed and `fuelBurnTime` stays 0.

#### Scenario: BREW-4.3 Pause freezes brewing but burns active fuel

- **GIVEN** a mid-brew stand with active fuel
- **WHEN** simulation pauses (panel open / overlay / non-simulating chunk)
- **THEN** `brewTime` does not advance while `fuelBurnTime` burns down
  (123 safe-pause rule, furnace parity).

#### Scenario: BREW-4.4 Progress UI is live

- **GIVEN** an open panel over a brewing stand
- **WHEN** ticks advance the brew
- **THEN** the brew bar width tracks `brewTime/brewTimeTotal`, the fuel bar
  tracks `fuelBurnTime/fuelBurnTimeTotal`, and the status line names the lit
  state.

### Requirement: BREW-5 Persistence across unload/reload

Stand state MUST survive chunk unload, autosave, pagehide, and full page
reload field-for-field via the 036 envelope; corrupt/future payloads MUST
quarantine with a degraded banner, never a crash.

#### Scenario: BREW-5.1 Reload restores the committed snapshot

- **GIVEN** a stand with bottle/ingredient/fuel and partial timers, panel closed
- **WHEN** the page persists (pagehide) and reloads
- **THEN** `getBrewingState` equals the pre-reload snapshot (slots, bottle
  contents, all four timers).

#### Scenario: BREW-5.2 Corrupt and future payloads quarantine

- **GIVEN** a stored brewing row with a malformed payload or a
  non-current envelope version
- **WHEN** the host hydrates at boot
- **THEN** the row is skipped + warned (sticky degraded banner), boot
  continues, and valid rows still hydrate.

#### Scenario: BREW-5.3 Stale records are removed lazily

- **GIVEN** a hydrated brewing record whose block is no longer a stand once
  the chunk simulates
- **WHEN** the fixed tick runs
- **THEN** the record is removed, the chunk re-persists, and no exception
  is raised.

### Requirement: BREW-6 Break drops contents safely, never resurrects

Breaking a stand MUST close a matching open panel first, remove the record
exactly once, drop contents (component-preserving direct insert; plain loot
spill only on true overflow), and MUST NOT resurrect on a later reload.

#### Scenario: BREW-6.1 Break drops and cleans up

- **GIVEN** a loaded live stand
- **WHEN** the block is broken
- **THEN** the block is air, `hasBrewing` is false, `host.size` fell by one,
  and world drops exist (stand item + contained stacks).

#### Scenario: BREW-6.2 Brewed bottle survives break with contents

- **GIVEN** a stand holding a brewed speed bottle and inventory room
- **WHEN** the stand breaks
- **THEN** the player inventory holds the potion stack with identical
  `potion_contents`, with no duplication (stand holds nothing afterwards).

#### Scenario: BREW-6.3 No resurrection after reload

- **GIVEN** a broken stand whose chunk re-persisted
- **WHEN** the page reloads
- **THEN** `hasBrewing` is false and no brewing row exists for the position.

### Requirement: BREW-7 Session lifecycle is safe

Close, walk-away (>8 blocks), block-destroyed, C-toggle, pointer relock,
focus loss, death, and dispose MUST all settle or close the session without
losing the cursor (components intact when inventory has room) and without
overlay stacking.

#### Scenario: BREW-7.1 Close settles the cursor with contents

- **GIVEN** an open panel with a bottle on the cursor
- **WHEN** the panel closes (button or toggle or relock)
- **THEN** the panel hides, the overlay returns, and the inventory holds the
  bottle with identical contents.

#### Scenario: BREW-7.2 Walk-away and destroy close

- **GIVEN** an open panel
- **WHEN** the player moves >8 blocks away, or the stand block is destroyed
- **THEN** the panel closes (cursor settled) and the overlay returns.

#### Scenario: BREW-7.3 Focus loss keeps the panel without stacking

- **GIVEN** an open panel
- **WHEN** the window blurs (pointer unlocked by the open, not by gameplay)
- **THEN** the panel stays visible and no pause overlay stacks over it.

#### Scenario: BREW-7.4 Death and dispose close

- **GIVEN** an open panel
- **WHEN** the player dies or the game disposes
- **THEN** the session closes (cursor settled; dispose persists afterwards).

### Requirement: BREW-8 Browser E2E journey proves the loop

`tests/e2e/brewing.spec.ts` MUST drive the real production build through
place→open→insert→brew→collect→reload→break plus lifecycle, using
`__voxelGame` only for setup and read-only observation.

#### Scenario: BREW-8.1 Full journey passes headed

- **GIVEN** a fresh world
- **WHEN** the spec runs (grant kit → place stand → open → insert via real
  clicks → 400-tick brew → collect via real click → close → pagehide+reload
  → break → reload)
- **THEN** every assert passes: brewed speed contents, exact consumption,
  field-for-field reload persistence, drops on break, no resurrection.

#### Scenario: BREW-8.2 Lifecycle passes headed

- **GIVEN** an open panel
- **WHEN** the spec walks away / blurs / breaks-while-open
- **THEN** close/settle behavior matches BREW-7 with overlay invariants.

### Requirement: BREW-9 Registries, art, and pins

Block 62 / items 64–66 MUST resolve with the specified ids, names, stacking,
and placement; atlas tiles 66–68 MUST be painted original art with all prior
tiles pixel-stable; the worldgen v2 matrix hash MUST be unchanged and the
state fingerprint MUST still equal its pin (closed generation-relevant set);
no binary assets may be added.

#### Scenario: BREW-9.1 Registry and art pins

- **GIVEN** the default registries and atlas
- **WHEN** queried
- **THEN** `brewing_stand` is block 62 (+ `placeBlock` item 64),
  `blaze_powder` is item 65, `potion` is item 66 with `stackSize` 1, tiles
  66–68 paint non-blank, and `git status` shows no added binaries.

#### Scenario: BREW-9.2 Fingerprint stable, matrix stable

- **GIVEN** the default worldgen inputs
- **WHEN** hashed
- **THEN** `worldgenMatrixHash` equals the pinned v2 hash and
  `fingerprintWorldgenState` still equals `PINNED_WORLDGEN_STATE_FINGERPRINT`
  (unchanged by construction: the digest covers a closed 14-path
  generation-relevant set that excludes `brewing_stand`; the passing suite
  is the evidence — no re-pin).

## Error and failure behavior

- Invalid/unknown/future brewing payloads: quarantine + banner (BREW-5.2).
- Writes to vanished stands: null, authoritative state untouched.
- Unconvertible transaction results: whole-transaction abort (BREW-3.2).
- Full inventory on settle/spill: plain-item loot drop, contents-detach pinned
  by unit test (accepted debt; follow-up = component-carrying entities).
- Ticks on corrupt runtime payload: drop the instance, never tick garbage.
- Water→awkward completion pause: pinned 123 behavior, out of scope.

## Performance and resource bounds

- Open-panel frame cost: one block read + one distance check + one
  signature-gated render (no timers/rAF/RNG).
- Tick cost: simulating-chunk instances only, equality short-circuit.
- Atlas growth is construction-time; existing UVs identical.
- No headed-FPS claims; 258 untouched.

## Compatibility and migration

- Envelope unchanged and additive; old saves load; foreign rows skipped;
  no migration, no network change, no public signature change (`has()`
  stays furnace-only).

## Security and integrity

- No duplication/loss on covered paths (I-6 + BREW-6.2 + BREW-7.1); hostile
  batches (foreign typeKeys, duplicate positions, bad versions) covered by
  host unit tests mirroring the 251 hostile suite.

## Observability

- Quarantine → degraded banner; `host.size` / `getBrewingState` / status
  text observable from tests/E2E; tick returns changed-count.

## Verification mapping

- BREW-1/2/3/7: unit (host/panel/slots) + E2E journey/lifecycle.
- BREW-4: 123 engine (existing) + host tick unit + integration (real engine
  over real registries, 400-tick completion) + E2E live brew.
- BREW-5: host persistence unit (real serialize path) + E2E reload.
- BREW-6: host removal unit + Game break unit/E2E + no-resurrection E2E.
- BREW-8: `tests/e2e/brewing.spec.ts` headed green + full suite green.
- BREW-9: registry/atlas unit + fingerprint suite + `git status` asset check.
- Baseline gate: typecheck, lint (0 errors), unit, build, e2e, validate-state,
  file-audit validator.
