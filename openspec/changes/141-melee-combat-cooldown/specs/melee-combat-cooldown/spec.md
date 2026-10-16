# Spec: melee-combat-cooldown

## Contract
This capability adds Java 1.9+-style attack-cooldown damage scaling, knockback computation, and
per-target invulnerability-frame tracking, composed by `resolveMeleeAttack`. No critical hits, no
`SurvivalSystem`/`EntityManager` application, no attribute-registry lookups, and no `Game`/mob-AI
wiring — see the proposal's Non-goals.

## Definitions
- **Attack cooldown progress**: a `[0, 1]` charge value derived from ticks since the attacker's last
  attack and their attacks-per-second rate.
- **Cooldown damage multiplier**: `0.2 + progress² × 0.8` — `0.2` at zero charge, `1.0` at full
  charge.
- **Knockback vector**: a `{vx, vy, vz}` impulse combining the target's halved existing velocity, a
  horizontal push away from the attacker scaled by `strength`, and a fixed vertical pop.
- **Invulnerability window**: the number of ticks after a hit during which further hits on the same
  target id are ignored.

## Invariants
- `attackCooldownProgress` never leaves `[0, 1]`.
- `cooldownDamageMultiplier(0) === 0.2` and `cooldownDamageMultiplier(1) === 1.0` exactly.
- `computeKnockback` always includes the halved existing velocity and the fixed vertical pop; the
  horizontal impulse is added only when the horizontal distance between attacker and target is
  non-negligible.
- `InvulnerabilityTracker.canDamage` is `true` for a never-hit id and `false` while
  `currentTick - lastHitTick < invulnerabilityTicks`.
- `resolveMeleeAttack` registers a hit if and only if it returns `applied: true`.

## Requirements

### Requirement: attackCooldownProgress stays within [0, 1] and reaches 1 once fully recovered
`attackCooldownProgress(ticksSinceLastAttack, attacksPerSecond)` MUST return `0` immediately after an
attack (`ticksSinceLastAttack = 0`, scaled by the `+0.5` offset per the vanilla formula) rising
toward `1`, and MUST clamp at exactly `1` once `ticksSinceLastAttack` reaches or exceeds the full
cooldown duration (`20 / attacksPerSecond` ticks).

#### Scenario: progress rises from near-zero to exactly 1 as ticks accumulate
- **GIVEN** `attacksPerSecond = 4` (cooldown duration 5 ticks)
- **WHEN** `attackCooldownProgress` is evaluated at `ticksSinceLastAttack = 0`, `2`, and `10`
- **THEN** the results are non-decreasing, and the `10`-tick result equals exactly `1`

### Requirement: cooldownDamageMultiplier matches the vanilla formula at its endpoints
`cooldownDamageMultiplier(progress)` MUST equal `0.2` at `progress = 0` and `1.0` at `progress = 1`,
and MUST be non-decreasing over `[0, 1]`.

#### Scenario: multiplier at 0, 0.5, and 1
- **GIVEN** `progress` values `0`, `0.5`, and `1`
- **WHEN** `cooldownDamageMultiplier` is evaluated on each
- **THEN** the results are `0.2`, `0.4` (`0.2 + 0.25*0.8`), and `1.0` respectively

### Requirement: computeKnockback halves existing velocity and adds a directional impulse
`computeKnockback(fromX, fromZ, toX, toZ, strength, existingVelocity)` MUST return the target's
existing velocity halved componentwise, plus a horizontal unit-direction impulse (away from the
attacker) scaled by `strength` and a fixed `+0.4` vertical addition, when the horizontal distance is
non-negligible. When the horizontal distance is negligible (attacker and target share a position),
it MUST still return the halved existing velocity plus the fixed vertical addition, with no
horizontal impulse.

#### Scenario: a horizontal knockback away from the attacker
- **GIVEN** an attacker at `(0, 0)` and a target at `(1, 0)` with `strength = 2` and
  `existingVelocity = {vx: 2, vy: 0, vz: 0}`
- **WHEN** `computeKnockback` is called
- **THEN** the result is `{ vx: 1 + 2, vy: 0.4, vz: 0 }` (`1` from halved existing velocity plus `2`
  from the full-strength `+x` impulse)

#### Scenario: a degenerate same-position case still halves velocity and pops vertically
- **GIVEN** an attacker and target at the same `(x, z)` with `existingVelocity = {vx: 4, vy: -2, vz: 6}`
- **WHEN** `computeKnockback` is called
- **THEN** the result is `{ vx: 2, vy: -1 + 0.4, vz: 3 }`

### Requirement: InvulnerabilityTracker gates damage within the invulnerability window
`InvulnerabilityTracker.canDamage(id, currentTick, invulnerabilityTicks)` MUST return `true` for an
id with no recorded hit, `false` while `currentTick - lastHitTick(id) < invulnerabilityTicks`, and
`true` once that difference reaches `invulnerabilityTicks`. `clear(id)` MUST remove that id's
recorded hit (or every id's, when called with no argument), restoring `canDamage` to `true`.

#### Scenario: a hit blocks further damage until the window elapses
- **GIVEN** a hit registered at tick `100` with `invulnerabilityTicks = 10`
- **WHEN** `canDamage` is checked at ticks `105`, `109`, and `110`
- **THEN** the results are `false`, `false`, and `true` respectively

#### Scenario: clear restores canDamage
- **GIVEN** the same registered hit
- **WHEN** `clear(id)` is called, then `canDamage` is checked at tick `101`
- **THEN** it returns `true`

### Requirement: resolveMeleeAttack composes damage/knockback and registers a hit only when applied
`resolveMeleeAttack(...)` MUST return `{ applied: false, damage: 0, knockback: null }` and MUST NOT
call `registerHit` when the target is currently invulnerable. Otherwise it MUST return
`{ applied: true, damage: computeAttackDamage(...), knockback: computeKnockback(...) }` and MUST call
`registerHit(targetId, currentTick)` exactly once.

#### Scenario: an attack during the invulnerability window is fully blocked
- **GIVEN** a target already hit this window
- **WHEN** `resolveMeleeAttack` is called again before the window elapses
- **THEN** it returns `{ applied: false, damage: 0, knockback: null }`, and a subsequent
  `tracker.canDamage` check still reflects the original hit (no new hit was registered)

#### Scenario: a successful attack computes damage/knockback and registers exactly one hit
- **GIVEN** a target not currently invulnerable
- **WHEN** `resolveMeleeAttack` is called
- **THEN** it returns `applied: true` with `damage`/`knockback` matching
  `computeAttackDamage`/`computeKnockback`'s own results for the same inputs, and the tracker now
  reports the target invulnerable at `currentTick`

## Error and failure behavior
- No function in this module throws for finite numeric inputs.

## Performance and resource bounds
- Every function/method is O(1). `InvulnerabilityTracker`'s internal map grows by at most one entry
  per distinct hit target id; `clear` releases entries.

## Compatibility and migration
- One new, additive file (`src/simulation/MeleeCombat.ts`); no edits to any existing module. No
  schema/save-format change; no migration.

## Security and integrity
- All computed values are derived purely from finite numeric inputs; no non-finite value can be
  produced from finite inputs in any of these formulas.

## Observability
- `MeleeAttackResult`'s fields fully explain one attack attempt's outcome.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 attackCooldownProgress bounded and reaches 1 | `tests/unit/MeleeCombat.test.ts` cooldown-progress cases |
| REQ-2 cooldownDamageMultiplier endpoints | `tests/unit/MeleeCombat.test.ts` multiplier cases |
| REQ-3 computeKnockback halving + directional impulse | `tests/unit/MeleeCombat.test.ts` knockback cases |
| REQ-4 InvulnerabilityTracker window gating | `tests/unit/MeleeCombat.test.ts` tracker cases |
| REQ-5 resolveMeleeAttack composition + hit registration | `tests/unit/MeleeCombat.test.ts` resolveMeleeAttack cases |
