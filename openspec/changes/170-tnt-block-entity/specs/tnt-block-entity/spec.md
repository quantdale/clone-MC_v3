# Spec: tnt-block-entity

## Contract
This capability adds the TNT block and its priming/detonation lifecycle: a stateless `tnt` block that
primes when powered (162-style consumer rule) or when a fire block is adjacent; a `PrimedTnt`
descriptor (vanilla's PrimedTnt entity modeled as pure data) with a cause-specific fuse that counts
down on the fixed tick clock; and `explodePrimedTnt`, the first consumer of 169's `computeExplosion`.
No real entity spawn, no real world mutation — the caller applies results.

## Definitions
- **Priming cause**: `'redstone'` (fuse 80 ticks) or `'fire'` (fuse 20 ticks — deterministic
  stand-in for vanilla's random 10-30).
- **Primed TNT**: `{ x, y, z, fuseTicks, strength }`.
- **Due**: `fuseTicks <= 0` (detonation moment).

## Invariants
- `tntShouldPrime(powered, fireAdjacent)` is exactly `powered || fireAdjacent`.
- `tntFuseTicks('redstone') === 80`; `tntFuseTicks('fire') === 20`.
- `tickPrimedTnt` reduces the fuse by exactly the (non-negative, finite) elapsed ticks and clamps at
  0; `primedTntIsDue` is `fuseTicks <= 0`.
- `explodePrimedTnt` runs 169's `computeExplosion` at `[x + 0.5, y + 0.5, z + 0.5]` with
  `strength = primed.strength`.

## Requirements

### Requirement: the tnt block and item are registered
`BlockRegistry` MUST register a stateless `tnt` block (empty property schema, exactly 1 state);
`ItemTypeRegistry` MUST register a placing item.

#### Scenario: the block is stateless with a single state
- **GIVEN** `createDefaultBlockRegistry()` and `createDefaultBlockStateRegistry()`
- **WHEN** the `tnt` block is looked up
- **THEN** its property schema `isEmpty` is `true` and `statesForBlock` enumerates exactly 1 state

#### Scenario: the item places the block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `tnt` item is looked up
- **THEN** its `placeBlock` resolves to the tnt block and `validateItemBlockCrossReferences` passes

### Requirement: fuse lengths are cause-specific
`tntFuseTicks(cause)` MUST return 80 for `'redstone'` and 20 for `'fire'`.

#### Scenario: redstone priming has the vanilla 80-tick fuse
- **GIVEN** `cause = 'redstone'`
- **WHEN** `tntFuseTicks` is called
- **THEN** it returns 80

#### Scenario: fire priming has the deterministic 20-tick fuse
- **GIVEN** `cause = 'fire'`
- **WHEN** `tntFuseTicks` is called
- **THEN** it returns 20

### Requirement: tntShouldPrime is a powered consumer plus fire adjacency
`tntShouldPrime(powered, fireAdjacent)` MUST return exactly `powered || fireAdjacent`.

#### Scenario: all four trigger combinations
- **GIVEN** each of `(false,false)`, `(true,false)`, `(false,true)`, `(true,true)`
- **WHEN** `tntShouldPrime` is called
- **THEN** the results are `false`, `true`, `true`, `true`

### Requirement: primeTnt produces the descriptor
`primeTnt(x, y, z, cause)` MUST return `{ x, y, z, fuseTicks: tntFuseTicks(cause), strength: 4 }`.

#### Scenario: redstone priming descriptor
- **GIVEN** `primeTnt(1, 2, 3, 'redstone')`
- **THEN** the result is `{ x: 1, y: 2, z: 3, fuseTicks: 80, strength: 4 }`

### Requirement: the fuse counts down deterministically
`tickPrimedTnt(primed, elapsedTicks)` MUST return a descriptor whose fuse is the input fuse minus
exactly `elapsedTicks` (clamped at 0); non-finite or negative elapsed MUST leave the descriptor
unchanged. `primedTntIsDue` MUST be `true` exactly when the fuse is `<= 0`.

#### Scenario: the fuse decrements by exactly the elapsed ticks
- **GIVEN** a descriptor with `fuseTicks: 80`
- **WHEN** `tickPrimedTnt` is called with `79`, then with `80`
- **THEN** the fuses are `1` (not due) and `0` (due)

#### Scenario: over-ticking clamps at zero; invalid elapsed is ignored
- **GIVEN** a descriptor with `fuseTicks: 80`
- **WHEN** `tickPrimedTnt` is called with `1000`, `NaN`, and `-5`
- **THEN** the fuses are `0`, `80`, `80`

### Requirement: explodePrimedTnt consumes 169's core
`explodePrimedTnt(primed, world)` MUST compute 169's explosion centered on the primed block
(`[x + 0.5, y + 0.5, z + 0.5]`) with `strength = primed.strength`, and MUST be deterministic.

#### Scenario: a stone block one block east is destroyed
- **GIVEN** a primed TNT at `(0, 0, 0)` and a stone block (drop `minecraft:cobblestone`) at `(1, 0, 0)`
- **WHEN** `explodePrimedTnt` is called
- **THEN** `destroyed` contains `[1, 0, 0]` and `drops` contains
  `{ item: 'minecraft:cobblestone', position: [1, 0, 0] }`

#### Scenario: an all-air world destroys nothing, deterministically
- **GIVEN** a world whose every position is air
- **WHEN** `explodePrimedTnt` is called twice
- **THEN** both results are `toEqual` and `destroyed` is `[]`

## Error and failure behavior
- No function throws for well-formed inputs; invalid elapsed ticks are no-ops; 169's own
  short-circuits cover non-finite explosion inputs.

## Performance and resource bounds
- `tickPrimedTnt` is O(1); `explodePrimedTnt` inherits 169's bounded march. One new stateless block
  state.

## Compatibility and migration
- One additive stateless block id and one additive item id; one new simulation file reusing 169's
  `computeExplosion`; one characterization update (`BlockRegistry` `all()` 41→42). No `Game.ts` edit;
  no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted-input surface.

## Observability
- `PrimedTnt.fuseTicks` and `primedTntIsDue` make the lifecycle explicit.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registration + single state | `tests/unit/TntPriming.test.ts` registration cases |
| REQ-2 fuse lengths | fuse cases |
| REQ-3 trigger combinations | trigger cases |
| REQ-4 primeTnt descriptor | descriptor case |
| REQ-5 fuse countdown/clamp | lifecycle cases |
| REQ-6 explodePrimedTnt | explosion cases |
