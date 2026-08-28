# Spec: adventure-mode-rules

## Contract
This capability adds the adventure-mode interaction rules: pure break/place permission decisions
per mode, plus the helper that resolves an item's declared block set from direct ids and tag
membership — the "restricted breaking/placing using item components/tags" behavior, registry-free
and headless-safe.

## Definitions
- **Allowed set**: the canonical block ids (`minecraft:stone` form) an item may break/place in
  adventure mode — its `CanDestroy`/`CanPlaceOn` declarations (components, tags, or both).
- **Canonical id**: a block id as a string of the form `namespace:path`.

## Invariants
- Pure and headless-safe: no world access, no mutation, no throws.
- survival and creative MUST always be allowed to break and place; spectator MUST NEVER be.
- adventure MUST be allowed exactly when the block is in the allowed set; an empty set grants
  nothing.
- `resolveBlockPermissionSet` MUST union direct ids with members of resolvable tags, MUST skip
  unknown/missing tags, MUST deduplicate, and MUST return the empty set for empty inputs.

## Requirements

### Requirement: break permission per mode
`canBreakBlock(mode, blockId, allowed)` MUST return true for survival and creative regardless of
the allowed set; MUST return false for spectator; MUST return `allowed.has(blockId)` for adventure.

#### Scenario: break table
- **GIVEN** modes `survival`, `creative`, `adventure`, `spectator`; allowed sets
  `{'minecraft:stone'}` and `{}`; block id `minecraft:stone`
- **THEN** survival and creative return true with both sets; spectator returns false with both;
  adventure returns true with the stone set and false with the empty set; adventure with
  `{'minecraft:dirt'}` and block `minecraft:stone` returns false

### Requirement: place permission per mode
`canPlaceBlock(mode, blockId, allowed)` MUST follow the same table as breaking.

#### Scenario: place table
- **GIVEN** modes `survival`, `creative`, `adventure`, `spectator`; allowed sets
  `{'minecraft:dirt'}` and `{}`; block id `minecraft:dirt`
- **THEN** survival and creative return true with both sets; spectator returns false with both;
  adventure returns true with the dirt set and false with the empty set

### Requirement: declared-set resolution
`resolveBlockPermissionSet(directIds, tagIds, lookupTag)` MUST return the deduplicated union of
`directIds` and the members of every tag whose lookup returns a set; lookups returning `undefined`
MUST contribute nothing.

#### Scenario: resolution
- **GIVEN** `directIds = ['minecraft:stone', 'minecraft:stone']`,
  `tagIds = ['minecraft:logs', 'minecraft:missing']`, and a lookup where `minecraft:logs` ->
  `{'minecraft:oak_log', 'minecraft:birch_log'}` and `minecraft:missing` -> `undefined`
- **THEN** the result set is `{'minecraft:stone', 'minecraft:oak_log', 'minecraft:birch_log'}`
  (deduplicated, missing tag skipped); with empty directIds and empty tagIds the result is the
  empty set

### Requirement: composed adventure flow
The resolved set MUST feed the permission rules: an adventure player with a resolved set containing
the target block MUST be allowed to break/place it; otherwise MUST be denied.

#### Scenario: composed flow
- **GIVEN** `allowed = resolveBlockPermissionSet(['minecraft:stone'], ['minecraft:logs'],
  lookup)` with logs resolving to `{'minecraft:oak_log'}`
- **THEN** `canBreakBlock('adventure', 'minecraft:stone', allowed)` is true,
  `canBreakBlock('adventure', 'minecraft:oak_log', allowed)` is true, and
  `canBreakBlock('adventure', 'minecraft:dirt', allowed)` is false

## Error and failure behavior
- No throws; unknown tags and undefined lookups degrade to empty membership.

## Performance and resource bounds
- Decisions are O(1) set membership; resolution is O(total declared + tag members).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Total pure functions; a denied action is the only output a wiring needs to enforce the rule.

## Observability
- Both rules are total functions of their inputs; resolution never throws and reports membership
  through the returned set.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 break permission | `tests/unit/AdventureModeRules.test.ts` › break permission |
| REQ-2 place permission | › place permission |
| REQ-3 set resolution | › set resolution |
| REQ-4 composed flow | › composed adventure flow |
