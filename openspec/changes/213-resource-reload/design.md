# Design: 213-resource-reload

## Context/current state
- 211/212 define the manifest formats; nothing reloads them atomically. 213 adds the
  validate-then-commit transaction over those formats; the wiring applies committed manifests to
  the registries, and 214's localization follows.

## Target state
- `src/data/ResourceReload.ts` holding `ResourceState`, proposal validation, and the
  commit/abort transaction.

## Invariants
- Pure and headless-safe: no registry access (the check is injected), no mutation of inputs,
  no IO.
- Manifests MUST enter via 211/212 constructors (already validated); the reload adds a defensive
  `formatVersion === 1` check and 212's resolution check.
- Failed proposals NEVER mutate runtime state: `abortReload` returns the current state
  (identity); only `commitReload` produces a new state, always with `version + 1`.
- The version is monotonically increasing and never decreases.

## API and data model
```ts
// src/data/ResourceReload.ts (new)
export interface ResourceState {
  version: number;
  resources: ResourcePackManifest | null;
  data: DataPackManifest | null;
}
export function createInitialResourceState(): ResourceState;

export interface ReloadInput {
  resources?: ResourcePackManifest;
  data?: DataPackManifest;
  hasEntry: (kind: DataKind, id: ResourceId) => boolean;
}
export interface ReloadProposal { resources: ResourcePackManifest | null; data: DataPackManifest | null; }
export type ReloadResult =
  | { ok: true; proposal: ReloadProposal }
  | { ok: false; reason: string };
export function proposeReload(current: ResourceState, input: ReloadInput): ReloadResult;

export function commitReload(current: ResourceState, result: Extract<ReloadResult, { ok: true }>): ResourceState;
export function abortReload(current: ResourceState): ResourceState;
```

## Control/data flow
1. The wiring constructs validated manifests (211/212), then calls `proposeReload`.
2. On `{ ok: true }` it applies the proposal to the registries and calls `commitReload`; on
   `{ ok: false }` it calls `abortReload` (a no-op that documents the contract).

## Detailed behavior
- `proposeReload`: `input.resources` and `input.data` both absent -> `{ ok: false, reason:
  'no resources or data provided' }`; a present `resources` with `formatVersion !== 1` ->
  `{ ok: false, reason: 'invalid resource pack manifest' }`; a present `data` with
  `formatVersion !== 1` -> `{ ok: false, reason: 'invalid data pack manifest' }`; present data
  with unresolved entries (212's `resolveEntries`) -> `{ ok: false, reason:
  'unresolved data entries: <kind:path, ...>' }` (registration order); otherwise
  `{ ok: true, proposal: { resources: resources ?? null, data: data ?? null } }`.
- `commitReload`: `{ version: current.version + 1, resources, data }` from the proposal.
- `abortReload`: the current state, unchanged (identity).

## Failure modes
- Failed proposals are structured (`{ ok: false, reason }`), never thrown; runtime state is
  untouched by design.

## Compatibility/migration
- One new data file; 211/212 untouched; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- Proposal O(data entries); commit O(1).

## Testing seams
- Tests build manifests via 211/212 constructors and stub the `hasEntry` check.

## Observability/debugging
- The state and proposals are plain immutable objects; the reason strings describe failures.

## Affected files/symbols
- `src/data/ResourceReload.ts` (new).
- Tests: `tests/unit/ResourceReload.test.ts` (new). No other files.

## Rejected alternatives
- **Mutating state during validation**: rejected — the proposal/commit split is the atomicity
  contract.

## Downstream dependencies
- 214 (`localization-framework`) reloads translations through this transaction; the wiring
  applies committed manifests; 242's e2e reloads a pack in development.
