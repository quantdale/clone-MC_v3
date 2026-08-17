# Tasks: 241-deterministic-replay-suite

## 1. Baseline & characterization

- [ ] 1.1 Record baseline gate evidence at session start (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`) and confirm `SeedRng`, `SimulationHarness`, `WorldTickProcess`, and `GoldenSeed` unit suites are green. Note exact unit/E2E counts.
- [ ] 1.2 Characterize the existing replay hooks the suite will consume: `SimulationHarness.snapshot()/restore()` round-trip determinism (055), `SeedRng.state` capture (054), and `WorldTickProcess.step` headless ticking (224). Capture focused evidence in `verification.md` and confirm the 055 "fresh serializable snapshot" contract holds for the fixture systems.

## 2. Implementation

- [ ] 2.1 Implement `src/simulation/ReplayRecording.ts`: `ReplayInputEvent`, `ReplayTickSeed`, `ReplayRecording` types and `validateReplayRecording` with shape, input-event, full tick-seed coverage, ordering, duplicate, and atomic rejection rules (replay-recording spec).
- [ ] 2.2 Implement `ReplayRecorder` (capture inputs and per-tick named-stream states; deterministic `capture()`).
- [ ] 2.3 Implement `src/simulation/StateHasher.ts`: `canonicalize` (order-independent encodings, non-deterministic-value rejection) and `hashState` (pinned FNV-1a-32 uint32), plus `REPLAY_HASH_VERSION` (state-hash-scheme spec).
- [ ] 2.4 Implement `src/simulation/ReplayVerifier.ts` `runRecording`: apply tick-0/tick inputs in `seq` order, seed named streams per tick from tick seeds, step one tick, hash the authoritative snapshot per tick (replay-verification spec).
- [ ] 2.5 Implement `ReplayVerifier.compareHashes` divergence diagnosis (hash / seed_mismatch / version_mismatch / system_failure / missing_seed) with first-divergence reporting and cross-version refusal.
- [ ] 2.6 Implement `src/simulation/ReplayFixtures.ts` `createDefaultReplayFixtures` — a documented pinned default set (schema key + recording + expected per-tick hashes), mirroring `GoldenSeed` (102), tagged with `REPLAY_HASH_VERSION`.
- [ ] 2.7 Register the four new replay modules in the shared-simulation package-boundary declaration (`deterministic: true`, `headlessSafe: true`, `externalDeps: []`) and assert zero violations via `boundaryViolations`/`sharableModules`.

## 3. Focused unit tests

- [ ] 3.1 Unit tests for `validateReplayRecording`: valid shape; invalid top-level fields; invalid/unordered/duplicate inputs; missing/duplicate/out-of-range/unordered tick seeds; atomic rejection (replay-recording).
- [ ] 3.2 Unit tests for `canonicalize`/`hashState`: insertion-order independence, type encodings, nested/empty structures, negative/unicode values, system-order sensitivity, empty snapshot, known-value pin, `NaN`/`±Infinity`/function/symbol/bigint/cycle/`Date` rejection, cross-run stability (state-hash-scheme).
- [ ] 3.3 Unit tests for `runRecording`: reproduces expected hashes; cross-run reproducibility (two fresh runs equal); correct seeding and `seed_mismatch` on a recorded-seed break (replay-verification).
- [ ] 3.4 Unit tests for `ReplayRecorder`: captured inputs equal recorded events, captured seeds equal actual named-stream states, repeated capture is structurally equal (replay-recording determinism).
- [ ] 3.5 Unit tests for `compareHashes`: single divergence first-tick report; identical/empty traces; `version_mismatch`; `system_failure` naming the tick; missing-seed pre-run rejection (replay-verification).

## 4. Edge/failure, integration, regression

- [ ] 4.1 Edge/failure tests: partial/missing recordings, determinism-break seed mismatch, empty snapshot, unicode/negative numbers in canonicalization, and a system throwing mid-replay.
- [ ] 4.2 Integration test: one multi-tick scenario drives `SeedRng` named streams + a `SimulationHarness`-style world + `WorldTickProcess.step` together, and asserts the reproduced hashes equal a fresh run.
- [ ] 4.3 Verify the default replay fixture set: every `createDefaultReplayFixtures` fixture passes against the implementation; a tampered expected hash reports a mismatch; repeated construction is equal.
- [ ] 4.4 Update docs/state: note the replay suite in `AGENTS.md` (optional small), reconcile the 241 artifacts against the actual implementation, and update `verification.md` + `PROGRAM_STATE.json`/`PROGRAM_STATE.md` per the durable-checkpoint protocol.
- [ ] 4.5 Final regression gate: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` all pass; record exact evidence and advance 241 to VERIFIED.
