# Spec: resource-reload

## Contract
This capability adds the atomic resource reload transaction: a validated proposal phase over
211/212's manifests (with 212's injected registry resolution), a single commit point that bumps
the state version, and an abort that never touches runtime state — pure and headless-safe.

## Definitions
- **Resource state**: `{ version, resources, data }` — the loaded manifests with a monotonic
  version.
- **Proposal**: the validated `{ resources, data }` pair ready for commit.

## Invariants
- Pure and headless-safe: the registry check is injected; inputs are never mutated; no IO.
- Manifests enter via 211/212 constructors; the reload adds a defensive `formatVersion === 1`
  check and 212's resolution check.
- Failed proposals MUST NOT mutate runtime state; only `commitReload` produces a new state,
  ALWAYS with `version = current.version + 1`.
- The version MUST be monotonically increasing.

## Requirements

### Requirement: initial state
`createInitialResourceState()` MUST return `{ version: 0, resources: null, data: null }`.

#### Scenario: initial
- **GIVEN** `createInitialResourceState()`
- **THEN** the state is exactly `{ version: 0, resources: null, data: null }`

### Requirement: proposal validation
`proposeReload(current, input)` MUST return `{ ok: true, proposal }` when at least one manifest
is present and every data entry resolves through the injected `hasEntry`; MUST return
`{ ok: false, reason: 'no resources or data provided' }` when neither manifest is present;
`{ ok: false, reason: 'invalid resource pack manifest' }` / `'invalid data pack manifest'` for
bad format versions; and `{ ok: false, reason: 'unresolved data entries: <kind:path, ...>' }`
(in registration order) for unresolved data entries.

#### Scenario: proposals
- **GIVEN** a valid resource manifest, a valid data manifest whose entries all resolve, a data
  manifest with one unresolved entry, and an input with neither manifest
- **THEN** resources-only, data-only, and both yield `{ ok: true }` proposals carrying exactly
  the given manifests (missing ones as null); the unresolved input yields
  `{ ok: false, reason: 'unresolved data entries: recipe minecraft:planks' }`; the empty input
  yields `{ ok: false, reason: 'no resources or data provided' }`

### Requirement: commit and abort
`commitReload(current, { ok: true, proposal })` MUST return a NEW state with
`version = current.version + 1` and the proposal's manifests. `abortReload(current)` MUST
return the current state unchanged.

#### Scenario: transaction
- **GIVEN** an initial state and a successful proposal with a resource manifest
- **THEN** `commitReload` yields `{ version: 1, resources, data: null }`; committing again
  yields version 2; `abortReload(initial)` returns the identical initial object

## Error and failure behavior
- Failed proposals are structured `{ ok: false, reason }`, never thrown.
- `commitReload` accepts only a successful proposal (type-level); runtime state is untouched by
  failed proposals by design.

## Performance and resource bounds
- Proposal O(data entries); commit O(1).

## Compatibility and migration
- One new data file; 211/212 untouched; no `Game.ts` edit; no save-format change.

## Security and integrity
- Atomicity by construction: no partial application path exists.

## Observability
- The state and proposals are plain immutable objects; reason strings describe failures.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 initial state | `tests/unit/ResourceReload.test.ts` › initial |
| REQ-2 proposals | › proposals |
| REQ-3 commit/abort | › transaction |
