# Design: 241-deterministic-replay-suite

## Context / current state

The simulation exposes determinism primitives but no end-to-end replay guarantee:

- `src/simulation/SeedRng.ts` (054): pinned mulberry32 `SeedRng`; `createNamedRng(worldSeed, streamName)`
  derives isolated named streams; `fork(name)` derives deterministic children; `state` (getter) exposes
  the current uint32 stream position. Algorithm is pinned and MUST NOT change without a versioned
  scheme.
- `src/simulation/SimulationHarness.ts` (055): `HarnessSystem` adds `snapshot()`/`restore()` to
  `tick(t)`; `SimulationHarness` steps systems in registration order, and `snapshot()`/`restore()`
  round-trip so replay from equal snapshots equals fresh runs. The 055 contract requires systems to
  return **fresh, serializable objects** from `snapshot()` (never live state). `HarnessSnapshot` is
  `{ tick, systems: unknown[] }`.
- `src/simulation/WorldTickProcess.ts` (224): production authoritative tick driver. `step(times)` runs
  ticks directly (headless); `update(nowMs)` is clock-fed. `TickSystem` only has `tick(t)` — **no**
  snapshot/restore. A throwing system stops the process (`isStopped`, `lastError`).
- `src/simulation/SimulationPackageBoundary.ts` (222): a module is client/server-shareable when
  `deterministic && headlessSafe && externalDeps.length === 0`; `boundaryViolations` flags
  deterministic-with-deps and headlessSafe-with-dom/indexeddb modules.
- `src/worldgen/GoldenSeed.ts` (102): golden regression fixtures. `GoldenFixture` =
  `{ key, kind, version, seed, x, y, z, expected }`; `GOLDEN_VERSION = 'v1'`; `verifyGoldenFixtures`
  reports per-fixture `pass: actual === expected` **without throwing**; `createDefaultGoldenFixtures`
  returns a documented pinned set. This is the pattern to mirror for replay fixtures.
- `src/math/PRNG.ts`: `hash2`/`hash3` integer coordinate hashes; the file also hosts a mulberry32
  `PRNG` class distinct from `SeedRng`.
- `src/engine/InputTypes.ts`: the interactive `InputState` interface is engine/render-coupled
  (`isLocked()`, `consumeMouseDelta()`, etc.) and is **not** suitable as a headless replay input. The
  replay suite therefore uses its own plain-data input records.

No existing module records inputs, computes an authoritative-state hash, or reproduces hashes from a
recording. The change is entirely additive.

## Target state

A replay suite where:

1. A **recording** is plain data: the world seed, a `maxTick`, the ordered input events applied before
   each tick, and the named-stream states (per `SeedRng.state`) at the start of every tick.
2. A **state hash** deterministically summarizes the authoritative simulation state (the
   `HarnessSnapshot`) at the end of each tick under a versioned scheme.
3. A **verifier** replays a recording against a fresh headless world, reproduces the per-tick hashes,
   compares them to expected, and diagnoses the first divergence, seed breaks, version mismatches, and
   mid-replay system failures.

## Invariants

- Identical recording + identical world configuration → identical hash trace (cross-run stability).
- `hashState` of equal canonical state values is equal; the canonical form is independent of
  object-key insertion order.
- The hash scheme is pinned by `REPLAY_HASH_VERSION`; changing what is hashed or how MUST bump it.
- A recording that covers ticks `1..maxTick` MUST carry a tick seed for every such tick (full
  coverage); missing seeds are a validation rejection, never a silent pass.
- The verifier MUST NOT compare traces or fixtures under different `REPLAY_HASH_VERSION`.
- A mismatch is reported, never thrown, by comparison; seed/version/failure conditions are diagnosed
  by tick.

## API and data model

TypeScript sketches describe intent and do not override the normative spec.

```ts
// src/simulation/ReplayRecording.ts
export type ReplayInputPayload = unknown; // JSON-serializable plain data

export interface ReplayInputEvent {
  readonly tick: number;        // 0 = pre-simulation setup (before tick 1); else 1..maxTick
  readonly seq: number;         // non-negative ordering within a tick
  readonly type: string;        // non-empty; e.g. 'block_place' | 'block_break' | 'player_move'
  readonly payload: ReplayInputPayload;
}

export interface ReplayTickSeed {
  readonly tick: number;        // 1..maxTick
  readonly seeds: ReadonlyArray<{ readonly stream: string; readonly state: number }>; // uint32 states
}

export interface ReplayRecording {
  readonly version: number;       // positive integer (recording format version)
  readonly schema: string;        // non-empty scenario identifier (fixture key)
  readonly initialSeed: number;   // uint32 world seed
  readonly maxTick: number;       // positive integer
  readonly inputs: readonly ReplayInputEvent[];
  readonly tickSeeds: readonly ReplayTickSeed[];
}

export function validateReplayRecording(input: unknown): ReplayRecording; // throws descriptively, atomically

export class ReplayRecorder {
  constructor(options: { initialSeed: number; maxTick: number; schema: string });
  recordInput(event: ReplayInputEvent): void;
  recordTickSeed(tick: number, seeds: ReadonlyArray<{ stream: string; state: number }>): void;
  capture(): ReplayRecording; // validates before returning
}
```

```ts
// src/simulation/StateHasher.ts
export const REPLAY_HASH_VERSION = 'v1';
export function canonicalize(value: unknown): string; // order-independent; throws on non-deterministic values
export function hashState(value: unknown): number;   // uint32 over canonicalize(value)
```

```ts
// src/simulation/ReplayVerifier.ts
export interface ReplayTraceTick { readonly tick: number; readonly hash: number; }
export interface ReplayTrace { readonly version: string; readonly ticks: readonly ReplayTraceTick[]; }

export interface ReplayRunnerOptions {
  readonly initialSeed: number;
  // Systems whose snapshot() is the authoritative state source (055 HarnessSystem).
  readonly makeSystems: () => Array<HarnessSystem & { applyInput?(event: ReplayInputEvent): void }>;
  readonly seedStreams?: (stream: string, state: number) => SeedRng; // default: new SeedRng(state)
}

export function runRecording(recording: ReplayRecording, options: ReplayRunnerOptions): ReplayTrace;

export type ReplayDivergence =
  | { kind: 'hash'; tick: number; expected: number; actual: number }
  | { kind: 'seed_mismatch'; tick: number; stream: string; expected: number; actual: number }
  | { kind: 'version_mismatch'; expected: string; actual: string }
  | { kind: 'system_failure'; tick: number; error: unknown }
  | { kind: 'missing_seed'; tick: number };

export interface ReplayComparison {
  readonly identical: boolean;
  readonly firstDivergence: ReplayDivergence | null;
}

export function compareHashes(expected: ReplayTrace, actual: ReplayTrace): ReplayComparison; // never throws on mismatch
```

```ts
// src/simulation/ReplayFixtures.ts  (mirrors 102 createDefaultGoldenFixtures)
export interface ReplayFixture {
  readonly key: string;
  readonly version: string;   // = REPLAY_HASH_VERSION
  readonly recording: ReplayRecording;
  readonly expectedHashes: readonly number[]; // one per tick 1..maxTick
}
export function createDefaultReplayFixtures(): readonly ReplayFixture[];
```

## Control / data flow

1. **Recording**: a scenario is driven once; `ReplayRecorder.recordInput` stores each applied input and
   `recordTickSeed` stores the actual named-stream states (via `SeedRng.state`) at the start of each
   tick. `capture()` validates and freezes the recording.
2. **Replay**: `runRecording` builds a fresh world (`makeSystems()`), seeds named streams for tick 1
   from `tickSeeds[1]`, applies the tick-0 setup inputs then tick-1 inputs in `seq` order, steps one
   tick, hashes the `HarnessSnapshot` (`hashState({ tick, systems })`), then repeats for each tick.
3. **Compare**: `compareHashes` walks expected vs actual traces, returning the first divergence.
4. **Fixture verification**: each default fixture's recording is replayed and its hashes compared to
   `expectedHashes`.

## Detailed behavior

### Canonical encoding (`canonicalize`)

Order-independent string encoding of a plain-data value:

- `null` → `N`; `undefined` → `U`; `true` → `T`; `false` → `F`.
- Integer number → `i<decimal>`; non-integer finite number → `f<Number(v)>` (pinned). `NaN`,
  `+Infinity`, `-Infinity` are rejected (non-deterministic across platforms).
- String → `s<length>:<utf16>` (raw UTF-16 code units; length guards against ambiguity).
- Array → `[<elem>*]` (elements encoded in array order).
- Plain object → `{` + for each own enumerable key **sorted ascending by UTF-16 code units**: encode
  (key) + `:` + encode(value) + `;` + `}`; empty object → `{}`.
- Non-plain values (functions, symbols, `bigint`, class instances, cyclic structures, `Map`/`Set`,
  `Date`) are rejected with a descriptive error.

### Hash function (`hashState`)

FNV-1a 32-bit (matching the algorithm used by `SeedRng.hashString`) over the UTF-16 code units of
`canonicalize(value)`, returned as a uint32. Same algorithm as the pinned FNV-1a 32-bit used elsewhere
in the simulation so the suite is internally consistent. Algorithm is pinned by `REPLAY_HASH_VERSION`.

### What is hashed

The authoritative state hashed per tick is the full `HarnessSnapshot` produced by the 055 harness:
`{ tick, systems: unknown[] }` where `systems[i]` is system `i`'s `snapshot()` in registration order.
Ordering matters — the same system states in a different order hash differently. Empty systems
snapshot hashes deterministically. Because the 055 contract requires fresh serializable snapshots, the
hash reflects a stable point-in-time state and does not capture later live mutation.

### Seeding semantics

**Recorded tick seeds are pre-tick states**: each `tickSeeds[T].seeds[i].state` is the `SeedRng.state`
captured at the **start** of tick `T`, before that tick runs. This is the single, explicit seed-state
model; there is no separate "initialization seed" vs "per-tick reseed" vs "post-tick expected state"
ambiguity — the recorded `state` is always the value the stream holds at the moment tick `T` begins.

**Shared ownership / injection**: the verifier obtains every named stream through one governed source —
the injectable `seedStreams(stream, state) => SeedRng` factory on `ReplayRunnerOptions`. The verifier
calls `seedStreams` once per `(stream, state)` at the start of each tick, and the **same** returned
`SeedRng` instance is handed to the simulation systems that consume that stream during the tick.
Systems MUST NOT build or read named streams through any other closure (for example a verifier-local
`Map` invisible to production code). Production systems obtain their streams from this same factory, so
the replay integration path is identical to the one production would use, and a passing verifier cannot
mask a system reading a divergent stream instance.

Before tick 1, named streams present in `tickSeeds[1]` are created at the recorded `state`
(`new SeedRng(state)` by default, or via the injectable `seedStreams`). Before each tick `T > 1`, the
same is done from `tickSeeds[T]`. Streams not listed in a tick's seeds are unconstrained. If, while
replaying, a recorded stream state does not match the state the authoritative run actually derives at
that point, the verifier reports a `seed_mismatch` at that tick (determinism-break diagnosis) rather
than continuing silently.

### Failure and diagnosis

- `compareHashes` reports the first differing tick with expected vs actual hash and never throws on
  a mismatch.
- Cross-version trace comparison yields `{ kind: 'version_mismatch' }`.
- A system throwing during replay yields `{ kind: 'system_failure', tick }` (the tick where the throw
  occurred), surfacing the original error.
- A recording missing a required tick seed is rejected by `validateReplayRecording` before any tick
  runs (`missing_seed`), never silently passed.

## Failure modes

- `validateReplayRecording` throws descriptive `ReplayRecording: <detail>` errors and never returns a
  partial recording (validate-before-mutate).
- `canonicalize` throws on non-deterministic values and never emits a string that could differ between
  runs.
- `runRecording` refuses to run a recording whose format `version` is unsupported; a system throw is
  converted to a diagnosed `system_failure` and the remaining ticks are not hashed.
- `compareHashes` never throws on mismatches; it always returns a structured comparison.

## Compatibility / migration

Additive. No existing module, registry, save format, or public API changes. `REPLAY_HASH_VERSION`
binds the hash scheme; a future change to canonicalization, the hash algorithm, or snapshot semantics
MUST bump it and re-pin `createDefaultReplayFixtures` deliberately (102 `GOLDEN_VERSION` convention).
No stored game data changes, so no data migration is required.

## Performance / resource constraints

- `canonicalize`/`hashState` are O(state size) with one pass; `runRecording` is O(maxTick × state
  size) over the fixture scenarios.
- The suite is test-only infrastructure; it does not run on hot paths (no render or game tick loop
  use). Default fixtures are sized to small representative scenarios (small system sets, short tick
  counts) so full verification stays in the low milliseconds.

## Testing seams

- `tests/unit/ReplayRecording.test.ts` — validation matrix (shape, invalid tick/seq/seed, duplicate
  stream, missing/extra tick seed, unordered inputs/seeds, atomicity) and recorder capture determinism.
- `tests/unit/StateHasher.test.ts` — insertion-order independence, type encodings, empty/nested
  structures, negative/unicode numbers and strings, NaN/`±Infinity`/function/symbol/bigint/cycle
  rejection, cross-run stability, known-value pin.
- `tests/unit/ReplayVerifier.test.ts` — reproduction, cross-run reproducibility, seeding correctness,
  first-divergence report, version mismatch, seed mismatch, mid-replay system failure, empty traces,
  missing-seed pre-run rejection.
- `tests/unit/ReplayFixtures.test.ts` — default set passes against the implementation; a tampered
  expected hash reports a mismatch; repeated construction is equal.
- Integration: one test drives `SeedRng` named streams + a `SimulationHarness`-style world +
  `WorldTickProcess.step` across several ticks and asserts the reproduced hashes equal a fresh run.

## Observability / debugging

- `ReplayTrace` exposes the per-tick hashes; `ReplayComparison` exposes the exact first divergence with
  expected vs actual.
- Diagnosis kinds distinguish hash, seed, version, system-failure, and missing-seed causes so a failing
  fixture tells the implementer which tick and which stream/field diverged.

## Affected files / symbols

New files (no existing files change):

- `src/simulation/ReplayRecording.ts` — `ReplayInputEvent`, `ReplayTickSeed`, `ReplayRecording`,
  `validateReplayRecording`, `ReplayRecorder`.
- `src/simulation/StateHasher.ts` — `REPLAY_HASH_VERSION`, `canonicalize`, `hashState`.
- `src/simulation/ReplayVerifier.ts` — `ReplayTrace`, `ReplayRunnerOptions`, `runRecording`,
  `compareHashes`, `ReplayDivergence`, `ReplayComparison`.
- `src/simulation/ReplayFixtures.ts` — `ReplayFixture`, `createDefaultReplayFixtures`.
- `tests/unit/ReplayRecording.test.ts`, `tests/unit/StateHasher.test.ts`,
  `tests/unit/ReplayVerifier.test.ts`, `tests/unit/ReplayFixtures.test.ts`.

Updated files:

- `src/simulation/SimulationPackageBoundary.ts` — the shared-simulation module-list declaration gains
  the four new replay modules with `deterministic: true`, `headlessSafe: true`, `externalDeps: []`.
- `tests/unit/SimulationPackageBoundary.test.ts` — asserts the new modules are shareable with zero
  violations.
- `AGENTS.md` — note the replay suite as the determinism gate consumers rely on (optional, small).

## Rejected alternatives

- *Hashing `WorldTickProcess` directly*: `TickSystem` has no `snapshot()`; the process cannot expose
  authoritative state. The 055 harness snapshot is the correct authoritative-state source. The
  verifier may still drive ticks through `WorldTickProcess.step` where a scenario wants the production
  driver.
- *Hashing a full world/game object*: over-broad, non-portable, and couples the suite to concrete
  world internals; the canonical snapshot of registered systems is the minimal authoritative state.
- *Recording raw `InputState` (engine/InputTypes)*: engine-coupled (pointer lock, mouse deltas);
  unusable headlessly. Plain-data `ReplayInputEvent` records keep the suite deterministic and
  dependency-free.
- *Allowing partial tick-seed coverage*: silently diverges on unrecorded ticks. Full-coverage
  validation is the only safe contract.
- *Cryptographic hash (e.g., SHA-256)*: out of scope; FNV-1a-32 matches the existing simulation
  hashing and is sufficient for the suite's determinism signal (see Risks in proposal.md).

## Downstream dependencies

- Change 242 (`survival-progression-e2e`) builds its headless progression scenarios on top of this
  suite, recording input/tick seeds and asserting authoritative hashes.
- The final-hardening changes (243-249) use the replay suite as a determinism regression gate.
- The suite consumes (unchanged): `SeedRng` (054), `SimulationHarness` (055), `WorldTickProcess`
  (224), and the 222 boundary; it mirrors the 102 golden-fixture pattern.
