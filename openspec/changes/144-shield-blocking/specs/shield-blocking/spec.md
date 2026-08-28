# Spec: shield-blocking

## Contract
This capability adds directional shield-block geometry, durability-cost computation, the composed
`resolveShieldBlock` outcome, and a per-entity shield-disable cooldown tracker. No `Inventory`/
`DurabilityRules` application, no damage-type-specific exceptions, no `SurvivalSystem`/
`ArmorProtection` integration, and no `Game`/input wiring — see the proposal's Non-goals.

## Definitions
- **Bearing**: the horizontal direction (in this module's own degree convention: `0°` along `+Z`,
  increasing toward `+X`) from one position to another.
- **Blocking arc**: the angular window, centered on the defender's facing bearing, within which an
  attacker's bearing counts as "in front" and thus blockable.
- **Shield block result**: `{blocked, damageAfterBlock, durabilityDamage, shouldDisable}` — the
  outcome of one block attempt.
- **Shield-disable window**: the tick range after a disabling hit during which a defender's shield
  cannot block.

## Invariants
- `bearingYawDegrees` always returns a value in `(-180, 180]`.
- `angleBetweenYawDegrees` always returns a value in `[0, 180]`.
- `isWithinBlockingArc` is `true` exactly when the angle between the defender's facing and the
  bearing to the attacker is `<= arcDegrees / 2`.
- `computeShieldDurabilityDamage` never returns less than `1` for a positive input, and is
  non-decreasing in its input.
- `resolveShieldBlock` returns `blocked: false` with undiminished damage, zero durability cost, and
  `shouldDisable: false` whenever the shield is not raised, is currently disabled, or the attacker is
  outside the blocking arc.
- `ShieldCooldownTracker.isDisabled(id, tick)` is `true` exactly while `tick` is before that id's
  most recently set disable-until tick.

## Requirements

### Requirement: bearingYawDegrees and angleBetweenYawDegrees are correct at the cardinal directions
`bearingYawDegrees(fromX, fromZ, toX, toZ)` MUST return `0` for a target directly along `+Z`, and
distinct, correctly-signed values for `+X`, `-Z`, and `-X` directions. `angleBetweenYawDegrees(a, b)`
MUST return the smaller angular difference in `[0, 180]`, correctly handling wraparound (e.g. the
difference between `170` and `-170` is `20`, not `340`).

#### Scenario: bearings at the four cardinal directions
- **GIVEN** a defender at the origin and targets one block along `+Z`, `+X`, `-Z`, and `-X`
- **WHEN** `bearingYawDegrees` is called for each
- **THEN** the four results are distinct and match this module's documented convention (`0`, `90`,
  `180` or `-180`, `-90`, in some order determined by `atan2(dx, dz)`)

#### Scenario: angleBetweenYawDegrees handles wraparound
- **GIVEN** bearings `170` and `-170`
- **WHEN** `angleBetweenYawDegrees` is called
- **THEN** it returns `20`, not `340`

### Requirement: isWithinBlockingArc is true inside the arc and false just outside it
`isWithinBlockingArc` MUST return `true` for an attacker bearing exactly at the defender's facing
direction, and for one at the arc's edge (`arcDegrees/2` away), and `false` for one just past the
edge.

#### Scenario: an attacker directly ahead is within the arc
- **GIVEN** a defender facing bearing `0` and an attacker directly ahead (bearing `0`)
- **WHEN** `isWithinBlockingArc` is called with the default arc
- **THEN** it returns `true`

#### Scenario: an attacker just outside the arc is excluded
- **GIVEN** a defender facing bearing `0` and an attacker whose bearing is `arcDegrees/2 + 1`
  degrees off
- **WHEN** `isWithinBlockingArc` is called with that `arcDegrees`
- **THEN** it returns `false`

### Requirement: computeShieldDurabilityDamage has a floor of 1 and is monotonic
`computeShieldDurabilityDamage(incomingDamage)` MUST return at least `1` for any `incomingDamage >
0`, and a result that is non-decreasing as `incomingDamage` increases.

#### Scenario: a small hit still costs at least 1 durability
- **GIVEN** `incomingDamage = 0.1`
- **WHEN** `computeShieldDurabilityDamage` is called
- **THEN** it returns `1`

#### Scenario: durability cost increases with damage
- **GIVEN** two damage values, one greater than the other
- **WHEN** `computeShieldDurabilityDamage` is evaluated on each
- **THEN** the greater damage's result is `>=` the lesser's

### Requirement: resolveShieldBlock blocks only when raised, not disabled, and within arc
`resolveShieldBlock` MUST return `blocked: false` (undiminished `damageAfterBlock`, `durabilityDamage:
0`, `shouldDisable: false`) whenever `isRaised` is `false`, `isDisabled` is `true`, or the attacker is
outside the blocking arc. Otherwise it MUST return `blocked: true` with `damageAfterBlock` reduced by
`SHIELD_BLOCK_DAMAGE_REDUCTION`, `durabilityDamage` equal to `computeShieldDurabilityDamage(incomingDamage)`,
and `shouldDisable` equal to the caller-supplied `isAxeAttack` flag.

#### Scenario: not raised, disabled, and out-of-arc all fail to block
- **GIVEN** three otherwise-identical calls: one with `isRaised = false`, one with `isDisabled =
  true`, and one with the attacker outside the arc
- **WHEN** `resolveShieldBlock` is called for each
- **THEN** all three return `blocked: false`, undiminished damage, `durabilityDamage: 0`

#### Scenario: a raised, undisabled, in-arc block succeeds and echoes the axe flag
- **GIVEN** `isRaised = true`, `isDisabled = false`, an attacker within the arc, and
  `isAxeAttack = true`
- **WHEN** `resolveShieldBlock` is called
- **THEN** it returns `blocked: true`, `damageAfterBlock` reduced per
  `SHIELD_BLOCK_DAMAGE_REDUCTION`, `durabilityDamage > 0`, and `shouldDisable: true`

### Requirement: ShieldCooldownTracker gates isDisabled within the disable window
`ShieldCooldownTracker.disable(id, currentTick, durationTicks)` MUST make `isDisabled(id, tick)`
return `true` for every `tick` in `[currentTick, currentTick + durationTicks)` and `false` once
`tick >= currentTick + durationTicks`. `clear(id)` MUST restore `isDisabled` to `false` immediately.

#### Scenario: the disable window gates isDisabled correctly
- **GIVEN** `disable(1, 100, 100)`
- **WHEN** `isDisabled(1, 199)` and `isDisabled(1, 200)` are checked
- **THEN** the results are `true` and `false` respectively

#### Scenario: clear restores isDisabled
- **GIVEN** the same disabled entity
- **WHEN** `clear(1)` is called, then `isDisabled(1, 150)` is checked
- **THEN** it returns `false`

## Error and failure behavior
- No function in this module throws for finite numeric inputs.

## Performance and resource bounds
- Every function/method is O(1). `ShieldCooldownTracker`'s map grows by at most one entry per
  distinct disabled entity id; `clear` releases entries.

## Compatibility and migration
- One new, additive file (`src/simulation/ShieldBlocking.ts`); no edits to any existing module. No
  schema/save-format change; no migration.

## Security and integrity
- All computed values are derived from finite arithmetic on finite inputs, so no non-finite value can
  result from a well-formed call.

## Observability
- `ShieldBlockResult`'s fields fully explain one block attempt's outcome.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 bearing/angle math at cardinal directions + wraparound | `tests/unit/ShieldBlocking.test.ts` bearing/angle cases |
| REQ-2 isWithinBlockingArc boundary | `tests/unit/ShieldBlocking.test.ts` arc cases |
| REQ-3 computeShieldDurabilityDamage floor/monotonicity | `tests/unit/ShieldBlocking.test.ts` durability cases |
| REQ-4 resolveShieldBlock composition | `tests/unit/ShieldBlocking.test.ts` resolveShieldBlock cases |
| REQ-5 ShieldCooldownTracker window gating | `tests/unit/ShieldBlocking.test.ts` tracker cases |
