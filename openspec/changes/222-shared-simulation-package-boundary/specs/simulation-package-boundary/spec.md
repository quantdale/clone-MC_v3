# Spec: simulation-package-boundary

## Contract
This capability adds the shared-simulation package boundary: a validated declaration of which
simulation modules are deterministic/headless-safe and dependency-free, the shareability rule
that makes them client/server-shareable, and a violation audit — pure and headless-safe.

## Definitions
- **Module**: `{ name, deterministic, headlessSafe, externalDeps, checksum? }`.
- **Boundary**: `{ version: 1, modules }`.
- **Shareable**: `deterministic && headlessSafe && externalDeps.length === 0`.

## Invariants
- Pure and headless-safe: no import analysis, no mutation of inputs.
- `version` MUST be 1; names MUST be non-empty and unique; flags MUST be booleans;
  `externalDeps` MUST be strings (default []); `checksum` optional non-empty.
- Violations: a deterministic module with external deps; a headlessSafe module with `dom` or
  `indexeddb` deps. Both reported in registration order.

## Requirements

### Requirement: boundary creation
`createSimulationPackageBoundary(modules)` MUST return a validated boundary;
`validateSimulationPackageBoundary(input)` MUST round-trip it.

#### Scenario: creation
- **GIVEN** a deterministic, headless-safe module `simulation/GameRuleFramework` with no deps,
  and a module `simulation/WeatherFramework` with a checksum
- **THEN** both functions accept them; `version` is 1

### Requirement: boundary rejections
Construction MUST throw a descriptive `Error` for a non-object payload, an unsupported version,
a non-array `modules`, an empty/non-string module name, a duplicate module name, non-boolean
flags, malformed external deps, an empty checksum, and unknown top-level keys.

#### Scenario: rejections
- **GIVEN** `{ version: 0 }`; `{ modules: 'x' }`; a module with name `''`; two modules named
  `simulation/A`; a module with `deterministic: 'yes'`; a module with `externalDeps: ['']`; a
  module with `checksum: ''`; and an extra `{ extra: true }` key
- **THEN** each throws mentioning `expected an object`, `unsupported version`,
  `modules must be an array`, `must be a non-empty string`, `duplicate module`,
  `must be a boolean`, `must be non-empty strings`, `checksum must be a non-empty string when
  present`, and `unknown key` respectively

### Requirement: violations
`boundaryViolations(boundary)` MUST report, in registration order, every deterministic module
with external deps and every headlessSafe module with `dom`/`indexeddb` deps.

#### Scenario: violations
- **GIVEN** a deterministic+headlessSafe module with deps `['three']`; a deterministic+
  headlessSafe module with deps `['dom']`; a deterministic+headlessSafe module with deps
  `['indexeddb']`; and a clean shareable module
- **THEN** the violations are: the first module gets `deterministic module must have no external
  deps`; the dom and indexeddb modules each get BOTH that determinism violation and
  `headlessSafe module must not depend on dom or indexeddb` (five entries, registration order);
  the clean module yields none

### Requirement: queries
`sharableModules(boundary)` MUST return the shareable modules in registration order;
`moduleByName(boundary, name)` MUST return the module or undefined.

#### Scenario: queries
- **GIVEN** a boundary with one shareable and one non-shareable module
- **THEN** `sharableModules` is the shareable module; `moduleByName(boundary, 'simulation/A')`
  returns it; `moduleByName(boundary, 'nope')` is undefined; an empty boundary yields no
  modules

## Error and failure behavior
- Construction/validation throws descriptively; nothing partially accepted. Queries are total.

## Performance and resource bounds
- Queries O(modules * deps).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no save-format change.

## Security and integrity
- Pure functions; the boundary is a declaration, never executable code.

## Observability
- The boundary is a plain immutable object; violations expose the audit result.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 creation | `tests/unit/SimulationPackageBoundary.test.ts` › creation |
| REQ-2 rejections | › rejections |
| REQ-3 violations | › violations |
| REQ-4 queries | › queries |
