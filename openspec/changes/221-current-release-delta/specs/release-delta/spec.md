# Spec: release-delta

## Contract
This capability adds the isolated current-release delta: a validated declaration of which
expanded content a release enables and which behaviors it overrides — the pure overlay surface
that never touches the baseline architecture.

## Definitions
- **Delta**: `{ release, content, behavior }`.
- **Content kinds**: the ten kinds from 215-220 (`blocks`, `items`, `biomes`, `mobs`,
  `structures`, `enchantments`, `effects`, `potions`, `recipes`, `loot`).
- **Override**: `{ target, field, value }` — a behavior field on a content id.

## Invariants
- Pure and headless-safe: no baseline access, no mutation of inputs.
- `release` MUST be non-empty; content lists MUST be non-empty strings (absent kinds read as
  empty); override target/field MUST be non-empty; override values MUST be boolean, finite
  number, or string.
- Unknown kinds MUST throw; the whole payload validates before anything is accepted.

## Requirements

### Requirement: delta creation
`createReleaseDelta(input)` MUST return a validated delta with the documented defaults.

#### Scenario: creation
- **GIVEN** a delta with release `'1.21'`, content `{ blocks: ['minecraft:obsidian_alt'],
  potions: ['minecraft:swiftness_alt'] }`, and behavior `[{ target: 'minecraft:obsidian_alt',
  field: 'hardness', value: 40 }]`; and a delta with only release `'1.21'`
- **THEN** the first holds the given content and behavior; the second has every content kind
  empty and behavior []

### Requirement: delta rejections
Construction MUST throw a descriptive `Error` for an empty release, an unknown content kind, a
non-string/empty content id, an empty override target/field, and an invalid override value.

#### Scenario: rejections
- **GIVEN** releases `''`; kinds `'blocks'` and `'terrain'`; content ids `''` and `5`; targets
  `''`; fields `''`; values `null` and `NaN`
- **THEN** each throws mentioning `release must be a non-empty string`, `unknown content kind`,
  `must be non-empty strings`, `behavior <i>.target must be a non-empty string`,
  `behavior <i>.field must be a non-empty string`, and `behavior <i>.value must be a boolean,
  finite number, or string` respectively

### Requirement: overlay queries
`contentForKind(delta, kind)` MUST return the kind's ids (registration order, never undefined);
`isEnabled(delta, kind, id)` MUST report membership; `overridesFor(delta, target)` MUST return
the target's overrides in registration order.

#### Scenario: queries
- **GIVEN** a delta with blocks `['minecraft:a', 'minecraft:b']` and behavior for
  `minecraft:a`
- **THEN** `contentForKind(delta, 'blocks')` is `['minecraft:a', 'minecraft:b']`;
  `contentForKind(delta, 'loot')` is `[]`; `isEnabled(delta, 'blocks', 'minecraft:a')` is true;
  `isEnabled(delta, 'blocks', 'minecraft:c')` is false; `overridesFor(delta, 'minecraft:a')`
  returns the overrides in order; `overridesFor(delta, 'minecraft:nope')` is `[]`

## Error and failure behavior
- Construction throws descriptively; nothing partially accepted. Queries are total.

## Performance and resource bounds
- Queries O(content/behavior).

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Security and integrity
- Pure functions; the baseline architecture is never touched by this module.

## Observability
- The delta is a plain immutable object; queries expose the overlay surface.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 creation | `tests/unit/ReleaseDelta.test.ts` › creation |
| REQ-2 rejections | › rejections |
| REQ-3 queries | › queries |
