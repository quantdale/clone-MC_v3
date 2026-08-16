# Design: 222-shared-simulation-package-boundary

## Context/current state
- The deterministic simulation modules are shareable in principle; nothing declares the
  boundary. 222 adds the pure boundary declaration + the shareability rule; 223's network
  codecs build on it.

## Target state
- `src/simulation/SimulationPackageBoundary.ts` holding the boundary model, validation, the
  shareability rule, and the queries.

## Invariants
- Pure and headless-safe: no import analysis, no mutation of inputs, no IO.
- `version` MUST be 1; module names MUST be non-empty and unique; `deterministic`/
  `headlessSafe` MUST be booleans; `externalDeps` MUST be strings (default []); `checksum`
  optional non-empty.
- Shareability: `deterministic && headlessSafe && externalDeps.length === 0`.
- Violations: deterministic modules with external deps; headlessSafe modules with `dom` or
  `indexeddb` deps. Both are reported in registration order.

## API and data model
```ts
// src/simulation/SimulationPackageBoundary.ts (new)
export interface SimulationModule {
  name: string;              // unique non-empty module path
  deterministic: boolean;
  headlessSafe: boolean;
  externalDeps: readonly string[];   // default []
  checksum?: string;         // optional non-empty
}
export interface SimulationPackageBoundary {
  version: 1;
  modules: readonly SimulationModule[];
}
export function createSimulationPackageBoundary(modules: readonly SimulationModule[]): SimulationPackageBoundary;
export function validateSimulationPackageBoundary(input: unknown): SimulationPackageBoundary;

export interface BoundaryViolation { module: string; reason: string; }
export function boundaryViolations(boundary: SimulationPackageBoundary): readonly BoundaryViolation[];
export function sharableModules(boundary: SimulationPackageBoundary): readonly SimulationModule[];
export function moduleByName(boundary: SimulationPackageBoundary, name: string): SimulationModule | undefined;
```

## Control/data flow
1. Authors declare each simulation module's determinism/safety/deps in the boundary.
2. The tooling extracts `sharableModules` for the shared package; `boundaryViolations` flags
   declarations that would break client/server sharing.

## Detailed behavior
- Validation rejections (each `SimulationBoundary: <detail>`): non-object ->
  `expected an object`; version != 1 -> `unsupported version <v>`; `modules` not an array ->
  `modules must be an array`; per module: `modules <i>.name` empty/non-string ->
  `modules <i>.name must be a non-empty string`; duplicate name -> `duplicate module <name>`;
  non-boolean flags -> `modules <i>.deterministic must be a boolean` / `modules
  <i>.headlessSafe must be a boolean`; malformed deps -> `modules <i>.externalDeps must be
  non-empty strings`; empty checksum -> `modules <i>.checksum must be a non-empty string when
  present`; unknown top-level keys -> `unknown key <k>`.
- `boundaryViolations`: for each module in registration order: `deterministic` and
  `externalDeps.length > 0` -> `{ module, reason: 'deterministic module must have no external
  deps' }`; `headlessSafe` and deps include `dom` or `indexeddb` ->
  `{ module, reason: "headlessSafe module must not depend on dom or indexeddb" }`.
- `sharableModules`: registration-order filter of the shareability rule.
- Defaults: `externalDeps` [], `checksum` absent.

## Failure modes
- Construction/validation throws descriptively; nothing partially accepted. Queries are total.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- Queries O(modules * deps).

## Testing seams
- Tests drive the constructors with exact payloads and pin every rejection and violation.

## Observability/debugging
- The boundary is a plain immutable object; violations expose the audit result.

## Affected files/symbols
- `src/simulation/SimulationPackageBoundary.ts` (new).
- Tests: `tests/unit/SimulationPackageBoundary.test.ts` (new). No other files.

## Rejected alternatives
- **Static import analysis**: rejected — authors declare deps; the boundary is the contract the
  extraction tooling consumes.

## Downstream dependencies
- 223 (`network-protocol-codecs`) shares this boundary's modules; the extraction tooling
  consumes `sharableModules`; 242's e2e validates the boundary.
