# Spec: slime-honey-move-groups

## Contract
This capability adds sticky (slime/honey) adjacency grouping and sticky-piston retract-pull,
closing the piston sub-arc (163-165). Both compose into 163's `PistonPushPlan` shape unchanged, so
164's `executePistonPush`/`pistonAffectedPositions` apply and report on the result with no
modification. No `slime_block`/`honey_block` block, no `Game`/`World` wiring — see the proposal's
Non-goals.

## Definitions
- **Sticky kind**: `'slime' | 'honey'`, or `null` for a non-sticky block.
- **Passenger**: a non-sticky block dragged into a group by an adjacent sticky block; it does not
  itself drag further neighbors.
- **Group**: the full set of positions that move together as a unit, discovered by expansion from
  one or more seeds.

## Invariants
- `wouldDrag(current, neighbor)` is `true` iff `neighbor === null || neighbor === current`.
- Only positions with a non-null `stickyKind` expand the group's frontier.
- An `'immovable'` neighbor discovered during expansion fails the whole group.
- `orderGroupForMove` sorts by strictly decreasing projection onto the movement direction.
- `sticky_piston` shares `PISTON_SCHEMA` (and its default state) with `piston`.

## Requirements

### Requirement: the sticky piston block and item are registered
`BlockRegistry` MUST register `sticky_piston` carrying the same `PISTON_SCHEMA` instance as
`piston`, with the same default; `ItemTypeRegistry` MUST register a placing item.

#### Scenario: the block shares piston's schema and default
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** the `sticky_piston` block is looked up
- **THEN** it exposes the same `PISTON_SCHEMA` instance as `piston`, and the same default state

#### Scenario: the item places the block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `sticky_piston` item is looked up
- **THEN** its `placeBlock` resolves to the sticky piston block and
  `validateItemBlockCrossReferences` passes

#### Scenario: the block enumerates exactly 12 states
- **GIVEN** a `BlockStateRegistry` over the default block registry
- **WHEN** the sticky piston's states are counted
- **THEN** there are exactly 12, matching `piston`'s own count

### Requirement: wouldDrag resolves vanilla's slime/honey compatibility rule
`wouldDrag(current, neighbor)` MUST return `true` when `neighbor` is `null` or equals `current`,
and `false` otherwise.

#### Scenario: a non-sticky neighbor is always dragged
- **GIVEN** `current = 'slime'`, `neighbor = null`
- **WHEN** `wouldDrag` is called
- **THEN** it returns `true`

#### Scenario: the same sticky kind drags
- **GIVEN** `current = 'honey'`, `neighbor = 'honey'`
- **WHEN** `wouldDrag` is called
- **THEN** it returns `true`

#### Scenario: different sticky kinds do not drag each other
- **GIVEN** `current = 'slime'`, `neighbor = 'honey'`
- **WHEN** `wouldDrag` is called
- **THEN** it returns `false`

### Requirement: expandStickyGroup grows through sticky connections and stops correctly
`expandStickyGroup` MUST include every position transitively reachable from a seed through
`wouldDrag`-compatible sticky neighbors, MUST NOT include a `'terminates-clear'`/
`'terminates-destroy'` neighbor, and MUST fail the whole group on an `'immovable'` neighbor or on
exceeding `maxGroupSize`.

#### Scenario: a chain of same-kind sticky blocks grows the group
- **GIVEN** a seed that is `'slime'`, adjacent to another `'slime'` block, adjacent to a plain
  movable block
- **WHEN** `expandStickyGroup` is called
- **THEN** the group includes all three positions

#### Scenario: a non-sticky passenger does not further expand the group
- **GIVEN** a seed that is `'slime'` adjacent to a plain movable block, which is itself adjacent to
  another `'slime'` block
- **WHEN** `expandStickyGroup` is called
- **THEN** the group includes the seed and the plain block, but not the far `'slime'` block (the
  plain block is a passenger, not a connector)

#### Scenario: a different sticky kind stops expansion at that neighbor
- **GIVEN** a `'slime'` seed adjacent to a `'honey'` block
- **WHEN** `expandStickyGroup` is called
- **THEN** the group includes only the seed; the honey block is excluded

#### Scenario: an immovable neighbor fails the whole group
- **GIVEN** a `'slime'` seed adjacent to an immovable position
- **WHEN** `expandStickyGroup` is called
- **THEN** `canMove` is `false`, `blockedReason` is `'immovable'`, and `positions` is empty

#### Scenario: exceeding maxGroupSize fails the whole group
- **GIVEN** a chain of same-kind sticky blocks longer than `maxGroupSize`
- **WHEN** `expandStickyGroup` is called
- **THEN** `canMove` is `false` and `blockedReason` is `'exceeded-limit'`

### Requirement: orderGroupForMove produces a safe execution order for a non-linear group
`orderGroupForMove` MUST sort positions by strictly decreasing projection onto `movementDirection`.

#### Scenario: an L-shaped group is sorted so no destination is ever occupied by an unmoved member
- **GIVEN** an L-shaped group of positions moving in a given direction
- **WHEN** `orderGroupForMove` is called and the result is applied via 164's `executePistonPush`
- **THEN** the final world state has every original position vacated and every member at its
  correct destination, with no block lost or overwritten

### Requirement: extendPushPlanWithStickyGroup composes with 163's plan correctly
`extendPushPlanWithStickyGroup` MUST return `basePlan` unchanged when it is blocked or contains no
sticky block, and otherwise MUST return a plan whose `blocksToMove` is the ordered, expanded group
and whose `blocksToDestroy` is unchanged from `basePlan`.

#### Scenario: a plan with no sticky blocks is unaffected
- **GIVEN** a successful `basePlan` whose `blocksToMove` are all non-sticky
- **WHEN** `extendPushPlanWithStickyGroup` is called
- **THEN** the returned plan is identical to `basePlan`

#### Scenario: a plan containing a sticky block grows to include its attachment
- **GIVEN** a successful `basePlan` whose farthest `blocksToMove` entry is `'slime'`, adjacent (off
  the line) to another `'slime'` block
- **WHEN** `extendPushPlanWithStickyGroup` is called
- **THEN** the returned plan's `blocksToMove` includes the off-line block, correctly ordered, and
  `blocksToDestroy` is unchanged

### Requirement: planStickyRetract pulls the block in front of a sticky piston
`planStickyRetract` MUST fail if the position directly in front is `'immovable'`, MUST succeed with
an empty `blocksToMove` if that position is a terminator, and otherwise MUST pull it (and anything
transitively stuck to it) toward the piston.

#### Scenario: nothing in front is a genuine no-op success
- **GIVEN** the position directly in front of the piston is `'terminates-clear'`
- **WHEN** `planStickyRetract` is called
- **THEN** `canPush` is `true` and `blocksToMove` is empty

#### Scenario: a single movable block is pulled back
- **GIVEN** the position directly in front is a plain movable block
- **WHEN** `planStickyRetract` is called
- **THEN** `canPush` is `true` and `blocksToMove` contains exactly that position

#### Scenario: a sticky block in front cascades the pull
- **GIVEN** the position directly in front is `'slime'`, adjacent to another `'slime'` block
- **WHEN** `planStickyRetract` is called
- **THEN** `blocksToMove` contains both positions, ordered for the pull direction

#### Scenario: an immovable block in front blocks the retract
- **GIVEN** the position directly in front is `'immovable'`
- **WHEN** `planStickyRetract` is called
- **THEN** `canPush` is `false` and `blockedReason` is `'immovable'`

## Error and failure behavior
- No function in this module throws for well-formed inputs; a blocked group or plan is represented
  in the returned result, not an exception.

## Performance and resource bounds
- `expandStickyGroup` is O(`maxGroupSize`) `PistonWorld`/`StickyWorld` calls, independent of world
  size.

## Compatibility and migration
- One additive block id and one additive item id (reusing `PISTON_SCHEMA`); one new simulation
  file; the documented characterization-test updates. No `Game.ts` edit; no schema/save-format
  change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted input surface.

## Observability
- `StickyGroupResult`'s `blockedReason`/`blockedAt` mirror 163's `PistonPushPlan` shape.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 sticky_piston registration + shared schema | `tests/unit/PistonStickyGroups.test.ts` registration cases |
| REQ-2 wouldDrag compatibility | wouldDrag cases |
| REQ-3 expandStickyGroup growth/stop/failure | expandStickyGroup cases |
| REQ-4 orderGroupForMove non-linear safety | ordering/execution case |
| REQ-5 extendPushPlanWithStickyGroup composition | extend-plan cases |
| REQ-6 planStickyRetract pull behavior | retract cases |
