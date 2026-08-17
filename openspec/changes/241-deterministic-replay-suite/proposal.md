# Proposal: 241-deterministic-replay-suite

## Problem

The simulation primitives provide determinism hooks individually — `SeedRng` (054) exposes a pinned
mulberry32 stream and its `state`; `SimulationHarness` (055) snapshots/restores deterministic state;
`WorldTickProcess` (224) steps systems authoritatively headlessly; `GoldenSeed` (102) pins worldgen
outputs. But there is **no end-to-end contract** that proves *recorded inputs + per-tick seeds
reproduce authoritative state hashes*. Today a system can silently drift (an RNG stream re-seeded from
the wrong state, an input applied at the wrong tick, a nondeterministic snapshot) without any suite
catching it. Change 242 (`survival-progression-e2e`) and the later final-hardening changes assume this
replay guarantee exists.

## Goals

- Define a **recorded-input/tick-seed replay** contract: a plain-data recording captures the input
  events applied to the simulation and the named RNG-stream states at the start of each tick.
- Reproduce **authoritative state hashes**: replaying a recording through a headless world yields, for
  every tick `1..maxTick`, a deterministic hash of the authoritative simulation state.
- **Cross-run stability**: replaying the same recording twice from a fresh world produces identical
  hash traces.
- **Cross-version stability**: the hash scheme (what is hashed, how, and the snapshot semantics) is
  versioned (`REPLAY_HASH_VERSION`), so recorded fixtures stay stable across code changes until
  deliberately re-pinned.
- **Failure diagnosis**: a divergence reports the first differing tick with expected vs actual hash; a
  determinism break (recorded seed no longer reproduces) and missing/partial recordings are reported
  as explicit diagnosed failures, never silent passes.
- Provide a **default pinned fixture set** (`createDefaultReplayFixtures`) over representative
  multi-tick scenarios, mirroring the 102 golden-fixture pattern.

## Non-goals

- Implementing specific end-to-end gameplay scenarios (tools/food/Nether/End) — that is change 242.
- Recording real browser/network input streams or driving the render loop — the suite is headless and
  operates on plain-data input records only.
- Changing `SeedRng`, `SimulationHarness`, `WorldTickProcess`, or the 222 boundary rules — the suite
  *consumes* them and registers new modules in the boundary, but does not alter their behavior.
- Cryptographic hashing, large-world full-state hashing, or hashing performance beyond the suite's own
  fixtures.

## Preconditions

- Change 234 (`server-world-persistence`) and the immediately preceding changes are VERIFIED and
  advancement is allowed (per `AGENTS.md` and `CHANGE_SEQUENCE.md`).
- The baseline gate (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e`) is green at the session start, and `SeedRng`, `SimulationHarness`,
  `WorldTickProcess`, and `GoldenSeed` unit suites pass.

## Dependencies

- `SeedRng` / `createNamedRng` (054) for seeded named streams and `state` capture.
- `SimulationHarness` (055) `snapshot()`/`restore()` as the authoritative-state source and replay hook.
- `WorldTickProcess` (224) `step` as the headless authoritative tick driver (optional seam; the
  harness may be used directly).
- `SimulationPackageBoundary` (222) for declaring the new modules shareable (deterministic +
  headless-safe + no external deps).
- `GoldenSeed` (102) as the pattern reference for default fixtures and version pinning.

## Proposed change

New headless, deterministic, dependency-free modules under `src/simulation/`:

- `ReplayRecording.ts` — `ReplayInputEvent`, `ReplayTickSeed`, `ReplayRecording` types;
  `validateReplayRecording` (shape + full tick-seed coverage + atomic rejection); `ReplayRecorder`
  (capture inputs and per-tick named-stream states from a driven scenario).
- `StateHasher.ts` — `canonicalize` (order-independent canonical encoding), `hashState` (pinned
  FNV-1a-32 over the canonical string), `REPLAY_HASH_VERSION`.
- `ReplayVerifier.ts` — `runRecording` (apply seeds + inputs, step, hash per tick), `compareHashes`
  (first-divergence diagnosis, version guard).
- `ReplayFixtures.ts` — `createDefaultReplayFixtures` (pinned default set, mirroring 102).

Plus unit tests and the default fixture verification. All new modules are registered in the
shared-simulation package boundary as deterministic/headless-safe with no external deps.

## Compatibility and migration

Additive: new exported names only; no existing module, registry, save format, or public API changes.
`SeedRng`, `SimulationHarness`, and `WorldTickProcess` are consumed unchanged. `REPLAY_HASH_VERSION`
pins the hash scheme; any future change to what is hashed or how MUST bump it and re-pin fixtures
(exactly the 102 `GOLDEN_VERSION` convention). No stored/game data migration is needed.

## Risks

- **Hash collisions**: `hashState` is 32-bit; identical state always yields an identical hash, but
  different states could collide. Mitigated by pinning fixture scenarios that are verified
  collision-free in practice and by treating a hash match as a strong (not absolute) equivalence
  signal while a mismatch is a definite divergence signal.
- **Snapshot fidelity**: the hash is only as authoritative as the systems' `snapshot()` (055 contract:
  systems must return fresh, serializable objects). The spec states this dependency explicitly and the
  diagnosis path treats an unstable snapshot as a determinism-break signal.
- **Seed-coverage rigidity**: requiring a tick seed for every tick is strict but necessary to avoid
  silent divergence; partially recorded scenarios are rejected rather than approximated.

## Rollback strategy

Revert the commit(s); the change is additive and touches no existing behavior. Re-pinned fixtures live
only under this change's test files.

## Definition of Done

- `validateReplayRecording` accepts valid recordings and rejects malformed/partial ones atomically with
  descriptive errors.
- `hashState`/`canonicalize` produce order-independent, deterministic uint32 hashes; non-deterministic
  values (NaN, `±Infinity`, functions, symbols, BigInt, cycles) are rejected.
- `runRecording` reproduces the recorded authoritative hashes for every tick `1..maxTick`; replaying
  the same recording twice yields identical traces.
- `compareHashes` reports the first diverging tick (expected vs actual) and never throws on mismatch;
  cross-version comparisons are refused; seed mismatches and system failures are diagnosed by tick.
- `createDefaultReplayFixtures` returns a documented pinned set that passes against the implementation
  and whose tampered values report mismatches.
- New modules are declared in the shared-simulation boundary with zero violations.
- Unit tests cover validation, canonicalization/hashing, recording determinism, reproducibility,
  divergence diagnosis, edge/failure (missing/partial, seed break, empty snapshot, unicode/negative
  numbers, mid-replay throw), and an integration scenario driving SeedRng + SimulationHarness +
  WorldTickProcess together.
- Full baseline gate green; 241 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass. The
unit count grows by the 241 suite; E2E stays unchanged (the suite is headless Vitest only).
