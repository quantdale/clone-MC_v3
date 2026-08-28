# Proposal: 222-shared-simulation-package-boundary

## Problem
The deterministic simulation modules (190-221's frameworks and much of the simulation layer)
are theoretically shareable between the browser client and a server, but nothing declares the
boundary: no index of which modules are deterministic/headless-safe, and no rule enforcing that
a shareable module has no external dependencies. 223's network codecs need this contract.

## Goals
- `src/simulation/SimulationPackageBoundary.ts` (NEW), pure and headless-safe:
  - **Boundary**: `SimulationPackageBoundary { version: 1, modules }` with
    `SimulationModule { name, deterministic, headlessSafe, externalDeps, checksum? }` —
    validated: version 1, unique non-empty module names, booleans, string external deps
    (default []), optional non-empty checksum.
  - **Shareability rule**: a module is SHARABLE (client + server) iff `deterministic &&
    headlessSafe && externalDeps.length === 0`.
  - **Violations**: `boundaryViolations(boundary)` — structured `{ module, reason }` entries:
    a `deterministic` module with external deps (`deterministic module must have no external
    deps`), and a `headlessSafe` module with `dom`/`indexeddb` deps (`headlessSafe module must
    not depend on dom or indexeddb`).
  - **Queries**: `sharableModules(boundary)` — the shareable subset (registration order);
    `moduleByName(boundary, name)` (undefined when missing).

## Non-goals
- **No actual package/build extraction** (the boundary is the declaration the tooling consumes),
  **no import analysis** (authors declare deps), **no change to any simulation module**, **no
  `Game.ts` edit**, **no save-format change**.

## Preconditions
- Change 221 (`current-release-delta`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library.

## Proposed change
1. `src/simulation/SimulationPackageBoundary.ts` (NEW): the boundary model, validation, the
   shareability rule, and the queries.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Rule drift**. Mitigation: the shareability rule and both violation classes are pinned in
  tests with exact reasons.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: valid boundaries (defaults + explicit); every rejection; unique names;
  violations (deterministic-with-deps, headlessSafe-with-dom/indexeddb); sharableModules;
  moduleByName; empty boundary.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
