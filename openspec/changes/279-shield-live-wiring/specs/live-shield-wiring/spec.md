# Spec: live-shield-wiring

## Contract

This capability wires the already-verified `ShieldBlocking` rules into the live
single-player Game. It is a deterministic input, equipment, damage, and HUD
integration; it does not add a second combat authority or a new save record.

## Definitions

- **Shield item**: registry item id 71, key `shield`, stack size 1, and maximum
  durability 336.
- **Raised**: the player is pointer-locked, interactive, has a shield-keyed
  Offhand stack, and is holding the right mouse button during a fixed tick.
- **Source damage**: hostile-mob melee or wither explosion/melee/skull damage
  carrying finite attacker/source XZ coordinates.
- **Source-less damage**: fall, lava, drowning, starvation, status-only, or
  debug-lethal damage that has no attacker direction.

## Invariants

- The implementation MUST use `resolveShieldBlock` and
  `ShieldCooldownTracker`; it MUST NOT duplicate the arc or cooldown formula.
- Offhand shield wear MUST preserve all non-durability component values and
  MUST clear the stack exactly when the existing durability rule reports break.
- A blocked hit MUST leave survival health unchanged and MUST wear the shield
  once; a non-blocked hit MUST preserve the existing SurvivalSystem amount.
- Offhand equipment MUST serialize through the existing Inventory snapshot;
  this change MUST NOT create a `__shield__` namespace.
- Change 258 MUST remain BLOCKED and no headed/GPU evidence may be claimed.

## Requirements

### Requirement: The catalog MUST expose a durable shield item

#### Scenario: Stable shield definition

- **GIVEN** the default item registry
- **WHEN** it resolves item id 71 and key `shield`
- **THEN** the definition MUST have resource id `minecraft:shield`, stack size 1,
  maximum durability 336, and a finite procedural icon tile
- **AND** the definition MUST not be placeable or edible.

### Requirement: Players MUST be able to equip and raise an offhand shield

#### Scenario: V swaps the selected stack

- **GIVEN** a selected hotbar stack and an Offhand stack
- **WHEN** the player presses `V` once
- **THEN** the two stacks MUST swap without changing either stack's components
- **AND** the hotbar MUST re-render and a second press MUST swap them back.

#### Scenario: Right hold raises only a valid shield

- **GIVEN** pointer lock, an interactive survival/creative player, and a shield
  keyed Offhand stack
- **WHEN** right mouse is held during a fixed tick
- **THEN** `getShieldState().raised` MUST be true
- **AND** when the Offhand is empty, non-shield, disabled, or the hold ends it
  MUST be false.

#### Scenario: Raised shield owns right-click use

- **GIVEN** a raised offhand shield and a targeted placeable block
- **WHEN** right mouse is held
- **THEN** placement/use input MUST be drained and no block/container action
  MUST occur.

### Requirement: Source damage MUST use directional blocking

#### Scenario: Front source is blocked

- **GIVEN** a raised, enabled shield and a source inside the existing 90-degree
  arc
- **WHEN** hostile or wither source damage is applied
- **THEN** health MUST remain unchanged, the result MUST report a block through
  the existing resolver, and exactly one durability wear MUST be applied.

#### Scenario: Edge and rear sources preserve the rule

- **GIVEN** a raised enabled shield
- **WHEN** the source is exactly on the arc edge, it MUST block
- **AND WHEN** the source is one degree beyond the edge or directly behind, it
  MUST not block and the original damage MUST reach SurvivalSystem.

#### Scenario: Source-less damage is unchanged

- **GIVEN** a raised shield
- **WHEN** fall, lava, drowning, starvation, status-only, or debug-lethal damage
  is applied without source coordinates
- **THEN** the shield MUST not reduce or wear and the existing damage behavior
  MUST remain unchanged.

### Requirement: Durability and axe disable MUST be live

#### Scenario: Shield breaks atomically

- **GIVEN** an offhand shield with one or fewer durability points remaining
- **WHEN** a blocked source hit is applied
- **THEN** the health result MUST still be blocked, the Offhand MUST become empty,
  `raised` MUST become false, and a break toast/HUD state MUST be emitted.

#### Scenario: Axe damage disables the shield

- **GIVEN** a raised enabled shield and a source axe attack inside the arc
- **WHEN** the attack is applied
- **THEN** the hit MUST block and the shield MUST be disabled for exactly the
  existing 100 simulation ticks
- **AND** a subsequent in-arc hit during that window MUST damage health normally.

### Requirement: Equipment persistence MUST remain backward compatible

#### Scenario: Existing inventory record round-trips shield wear

- **GIVEN** a version-1 Inventory snapshot with an offhand shield and a damage
  component
- **WHEN** a new Game restores and later snapshots it
- **THEN** item id, count, non-durability components, and remaining durability
  MUST match exactly
- **AND** a snapshot without `equipment` MUST restore an empty Offhand.

### Requirement: The HUD MUST report shield state without hot-path churn

#### Scenario: HUD state transitions

- **GIVEN** the HUD is visible
- **WHEN** the shield is equipped, raised, disabled, broken, or lowered
- **THEN** `#shield-indicator` MUST expose the corresponding accessible text
  and hidden/visible state
- **AND** unchanged state MUST not rewrite the DOM text or class list.

## Error and failure behavior

Unknown ids, invalid counts, malformed components, non-finite source positions,
and invalid input states MUST be no-ops or existing fail-closed restore failures;
they MUST NOT partially mutate health, equipment, or cooldown. Invalid source
damage falls through to the original survival damage path.

## Performance and resource bounds

The shield check MUST add no per-frame allocation and no work outside the
existing fixed-tick input update or damage event. The resolver is O(1); the HUD
may update only when its derived state signature changes.

## Compatibility and migration

No persisted version or namespace changes. Old records without equipment remain
valid. The additive id is rejected by older inventory validators rather than
being interpreted as another item.

## Security and integrity

The Game is the only composition point for live shield damage. A caller cannot
claim a block by omitting a source: source-less damage is never shielded, and
the pure resolver validates finite geometry through its existing boundary.

## Observability

`getShieldState()` is read-only. `debugEquipShield()` and
`debugDamageFrom()` are test-only seams available through the existing E2E Game
handle; normal users use `V` and right mouse. HUD text and break/disable toasts
are player-visible diagnostics.

## Verification mapping

| Requirement | Unit evidence | Browser evidence |
|---|---|---|
| Catalog | `ShieldItems.test.ts` | shield HUD setup |
| Equip/raise/use | `LiveShieldWiring.test.ts`, `PlayerInteraction.test.ts` | `shield.spec.ts` V/right hold |
| Direction/source damage | `LiveShieldWiring.test.ts`, existing `ShieldBlocking.test.ts` | front/behind E2E |
| Wear/break/disable | `Equipment.test.ts`, `LiveShieldWiring.test.ts` | axe/break E2E |
| Persistence | `Equipment.test.ts` | reload durability E2E |
| HUD/performance | `LiveShieldWiring.test.ts` | `shield.spec.ts` indicator transitions |
