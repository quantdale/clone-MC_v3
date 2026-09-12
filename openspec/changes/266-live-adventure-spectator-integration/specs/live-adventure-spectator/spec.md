# Spec: live-adventure-spectator

## Contract

This spec binds the live (in-Game) semantics of adventure and spectator modes
over the VERIFIED headless contracts of 194 (`AdventureModeRules`) and 195
(`SpectatorFramework`), alongside the VERIFIED 265 creative wiring. 194/195 are
consumed read-only. Survival/creative behavior MUST be unchanged.

## Definitions

- **Declared set**: the block set resolved from the held stack's
  `minecraft:can_destroy` (break) / `minecraft:can_place_on` (place) component:
  direct canonical block ids plus members of `#`-prefixed block tags via the
  live block-tag registry (unknown tags contribute nothing). Absent component,
  empty hand, or empty resolution ⇒ the empty set.
- **Deny**: refuse with the existing `blocked` action before any stack consume
  or world edit.
- **Silent drain** (spectator): consume pending break/place inputs, reset break
  state, hide the target outline, emit no action and no toast.

## Invariants

- Survival and creative break/place outcomes are identical before/after this
  change.
- Spectator performs zero world edits and zero inventory mutations via the
  interaction, eat, pickup, and container paths.
- Denied adventure placements never consume the held stack.
- `toggleGameMode()` and chip-click flip semantics are unchanged.

## Requirements

### Requirement: adventure break permission (live)

In adventure mode the Game MUST allow breaking a block only when the target
block's canonical id is in the held stack's declared CanDestroy set; with no
declared set breaking MUST be denied. Survival/creative MUST always allow
(subject to the pre-existing unbreakable rule); spectator MUST always deny.

#### Scenario: adventure break denied without declarations

- **GIVEN** mode `adventure` and a held stack with no `can_destroy` component
- **WHEN** a break is attempted on any breakable block
- **THEN** the attempt is denied (`blocked`), the block is unchanged, the stack
  is unchanged, and no loot/XP/tool wear occurs

#### Scenario: adventure break allowed by direct declaration

- **GIVEN** mode `adventure` and a held stack declaring the target block id
- **WHEN** a break is attempted on that block
- **THEN** the legacy break flow runs (duration, harvest rules, drops)

#### Scenario: adventure break allowed via tag declaration

- **GIVEN** mode `adventure` and a held stack declaring `#<tag>` where the live
  block-tag registry resolves `<tag>` to a set containing the target block
- **WHEN** a break is attempted on that block
- **THEN** the break is allowed; an unknown tag grants nothing

#### Scenario: survival/creative break unaffected

- **GIVEN** mode `survival` (resp. `creative`) with any held stack (including
  declaration-free)
- **WHEN** a break is attempted on a breakable block
- **THEN** the legacy 265 flow runs unchanged (duration/instant-clean-break)

### Requirement: adventure place permission (live)

In adventure mode the Game MUST allow placing a block only when the placed
block's canonical id is in the held stack's declared CanPlaceOn set; with no
declared set placing MUST be denied before consuming the stack.
Survival/creative MUST always allow (legacy flow); spectator MUST always deny.

#### Scenario: adventure place denied without declarations

- **GIVEN** mode `adventure` and a held stack with no `can_place_on` component
- **WHEN** a place is attempted
- **THEN** the attempt is denied (`blocked`), the world is unchanged, and the
  held count is unchanged

#### Scenario: adventure place allowed by declaration

- **GIVEN** mode `adventure` and a held stack declaring the placed block id
- **WHEN** a place is attempted on a valid cell
- **THEN** the block is placed and exactly one item is consumed (192
  `depletesItems` for adventure)

#### Scenario: survival place unaffected

- **GIVEN** mode `survival` with a declaration-free held stack
- **WHEN** a place is attempted on a valid cell
- **THEN** the block is placed and exactly one item is consumed

### Requirement: permission declaration components

The stack-component registry MUST provide `minecraft:can_destroy` and
`minecraft:can_place_on` types whose values are flat records mapping
non-empty-string keys (canonical block ids or `#`-prefixed tag references) to
`true`; any other shape MUST fail validation. Resolution MUST equal
`resolveBlockPermissionSet` over the split keys (direct ids + tag members,
unknown tags skipped, deduped, never throwing).

#### Scenario: component validation

- **GIVEN** candidate values (valid record, array, non-object, `false` value,
  empty-string key)
- **WHEN** validated against the component type
- **THEN** only the valid record passes

#### Scenario: resolution composition

- **GIVEN** a held stack with direct ids plus a known and an unknown tag
- **WHEN** the held set is resolved
- **THEN** the result is the deduped union of direct ids and known-tag members

### Requirement: spectator movement (live)

In spectator mode the player MUST move with noclip (no solid collision), no
gravity, and no fall accumulation; flight vertical control follows the existing
265 flight drive (192 `canFly`). Non-spectator physics MUST be unchanged.

#### Scenario: spectator passes through solid blocks

- **GIVEN** mode `spectator` moving toward a solid wall
- **WHEN** physics updates run
- **THEN** the player position advances through the wall cells with no velocity
  zeroing, no support contact, and `fallDistance` staying 0

#### Scenario: survival collision unchanged

- **GIVEN** mode `survival` moving toward a solid wall
- **WHEN** physics updates run
- **THEN** the legacy collision resolution applies (movement blocked, support
  reported)

### Requirement: spectator non-interaction (live)

In spectator mode the Game MUST NOT break, place, use (block/item), eat, open
any container (furnace/brewing/enchanting/crafting/creative), or pick up drops.
Break/place/use inputs MUST be silently drained; panel-open attempts MUST be
refused; the pickup adder MUST leave drops untouched.

#### Scenario: spectator break/place/use refused

- **GIVEN** mode `spectator` with a valid target and countable held stack
- **WHEN** break, place, and use inputs are delivered
- **THEN** the world is unchanged, the stack counts are unchanged, and no
  container opens

#### Scenario: spectator cannot eat or collect

- **GIVEN** mode `spectator` with food selected and drops nearby
- **WHEN** the eat input fires and collection ticks run
- **THEN** no food is consumed and no drops enter the inventory

### Requirement: spectator untargetability (live)

In spectator mode hostile mobs MUST NOT acquire the player (target supply is
null) and the wither/skull logic MUST treat the player as not-alive; direct
damage MUST remain refused via the existing `hurtPlayer`/survival-tick gates.
Non-spectator targeting MUST be unchanged.

#### Scenario: spectator ignored by hostiles and wither

- **GIVEN** mode `spectator`
- **WHEN** hostile and wither ticks run
- **THEN** the player-target supplier yields null and the wither candidate
  lists are empty

### Requirement: mode switching and persistence (shared)

All four modes MUST remain switchable via `setGameMode`/`setGameModeFromText`
(identity/invalid no-ops preserved), the HUD MUST expose all four modes through
a mode select (chip toggle unchanged: survival⇄creative), and `__gamemode__`
persistence MUST round-trip adventure/spectator field-for-field across reload
with reset/archive passthrough unchanged.

#### Scenario: switch to adventure/spectator via text and select

- **GIVEN** mode `survival`
- **WHEN** `setGameModeFromText(' adventure ')` runs, then the HUD select picks
  `spectator`
- **THEN** both switches return true, the chip reads `Mode: Adventure` then
  `Mode: Spectator`, and invalid text (`godmode`) still returns false

#### Scenario: reload persists adventure/spectator

- **GIVEN** mode `adventure` (resp. `spectator`)
- **WHEN** the page hides (autosave flush) and reloads
- **THEN** the mode boots field-for-field and the rules are live on the next tick

## Error and failure behavior

- Unknown numeric block ids in permission closures ⇒ deny (never throw).
- Unknown `placeBlock` resource ids ⇒ `blocked` (fail closed).
- `lookupBlockTag` never throws (bad parse / unknown tag / unfinalized ⇒
  `undefined`).
- `setHeldAdventurePermissions` with no countable held stack ⇒ false, inventory
  untouched, never throws.
- Mode-select values outside the four modes ⇒ no-op (the DOM only offers the
  four; programmatic misuse is guarded by `setGameMode` typing + parse).

## Performance and resource bounds

- Permission resolution runs per break/place attempt only (edge-triggered).
- Per-tick additions: one `noclip()` closure in physics, one `canInteract()`
  closure in interaction, one `isAttackable()` predicate in hostile tick. No
  new per-frame allocations beyond existing shapes.

## Compatibility and migration

- No store/schema changes. `__gamemode__` v1 already carries all four modes.
- Declaration components serialize via the existing generic component path;
  pre-266 saves (no declarations) behave as the specified adventure default
  (deny). Rollback renders 266 records inert (proposal.md).

## Security and integrity

- No new network, storage, or privilege surface. Spectator strictly reduces
  capability (no edits, no pickups, no targeting). Adventure strictly reduces
  capability versus survival (allow-list only).

## Observability

- `getGameMode()`, chip label, and select value always agree; denials reuse the
  `blocked` toast; spectator drains are silent by design (no toast spam).

## Verification mapping

- Unit: `AdventurePermissions` (validation/split/resolution/composition),
  `PlayerInteraction` gates (deny/allow/drain), `PlayerPhysics` noclip,
  registry size 3→5, `__gamemode__` adventure/spectator round-trip.
- Browser E2E `tests/e2e/adventure-spectator.spec.ts`: adventure
  blocked→permitted arc, spectator no-interact arc, survival contrast, reload
  persistence for both modes.
- Gates: `typecheck`, `lint`, `test`, `build`, `test:e2e` green; 265 E2E
  unmodified and green (chip-flip contract); file-audit clean.
