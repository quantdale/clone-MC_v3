# Spec: surface-rule-engine

## Contract

`applySurfaceRules(rules, ctx, currentBlockId)` MUST return the block id of the first rule whose
condition holds and whose `depth` covers `ctx.depthFromSurface`, or null when no rule matches.
`evaluateSurfaceCondition` MUST implement the documented predicate matrix. `validateSurfaceRules`
MUST reject unknown condition types, malformed fields, invalid depths, and invalid block ids.
Everything MUST be pure and deterministic.

## Definitions

- **depthFromSurface**: 0 = the surface cell, increasing downward.
- **Rule depth**: the number of surface layers a rule replaces (depths 0..depth-1); default 1.
- **noise condition**: `noise(id, x, y, z) > threshold` via the context sampler.
- **height condition**: `minY <= y < maxY`.

## Invariants

- Rules apply in list order; first match wins.
- No match → null (keep the current block).
- Conditions compose: `not` negates; `and`/`or` evaluate in fixed order with short-circuit.
- Validation: depths are integers ≥ 1; block ids are integers ≥ 0; composition depth ≤ 64.

## Requirements

### Requirement: condition matrix
`evaluateSurfaceCondition` MUST implement each predicate.

#### Scenario: leaf conditions
- **GIVEN** always, a matching/mismatching biome key, a y inside/outside a height range, and a
  noise value above/below a threshold (stub sampler)
- **WHEN** each condition is evaluated
- **THEN** results match the documented semantics.

#### Scenario: compositions
- **GIVEN** not/and/or trees over known leaves
- **WHEN** evaluated
- **THEN** results follow boolean logic with fixed-order short-circuit.

### Requirement: rule application
`applySurfaceRules` MUST apply first-match-wins with depth semantics.

#### Scenario: first match wins
- **GIVEN** rules [grass on plains, sand on desert] with a plains context
- **WHEN** application runs
- **THEN** the grass id is returned (desert never evaluated).

#### Scenario: depth coverage
- **GIVEN** a rule with depth 2 over a surface cell (depth 0) and the cell below (depth 1)
- **WHEN** application runs at both depths
- **THEN** the rule's id is returned for both; at depth 2 it no longer matches.

#### Scenario: no match
- **GIVEN** a rule set with no matching condition
- **WHEN** application runs
- **THEN** null is returned.

### Requirement: validation
`validateSurfaceRules` MUST reject invalid rule sets.

#### Scenario: rejection matrix
- **GIVEN** unknown condition types, missing fields, depth 0/-1/1.5, negative block ids, and
  composition trees deeper than 64
- **WHEN** validation runs
- **THEN** it throws a descriptive error; valid sets pass.

### Requirement: purity
Application MUST be deterministic and mutation-free.

#### Scenario: repeated application
- **GIVEN** fixed rules and context
- **WHEN** application runs twice
- **THEN** results are equal and the inputs are unchanged.

## Error and failure behavior

- Validation throws descriptive errors; application is total over valid inputs.

## Performance and resource bounds

Application O(rules); validation O(rules).

## Compatibility and migration

Additive.

## Security and integrity

Not applicable.

## Observability

Results are plain ids or null; tests assert exact replacements.

## Verification mapping

- `tests/unit/SurfaceRuleEngine.test.ts` — condition matrix, first-match/depth/no-match,
  validation matrix, purity.
