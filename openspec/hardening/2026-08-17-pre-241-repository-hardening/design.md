# Design: Pre-241 Repository Hardening

## 1. Safety model

This work is an execution interlock outside the parity numbering. It has precedence over advancing to Change 241 but does not change the numbering or intended scope of 241-250. The executor treats `origin/main` as canonical, captures the current head before edits, and records all drift from the authored audit baseline.

The core invariant is:

> While this interlock is not VERIFIED, no production/test implementation belonging to Change 241+ may be introduced or retained merely to advance that future change.

Future **specification artifacts** may remain because the repository explicitly supports spec authoring ahead of activation.

## 2. Phase A — Freeze and rebaseline

1. Fetch/prune remotes and make local `main` exactly match current `origin/main` before review.
2. Record session-start SHA, dirty state, Node/npm/browser versions, and current GitHub Actions result for that SHA.
3. Read the entire governance chain and this package.
4. Compare current head against the last legitimate pre-241 implementation boundary. The authored audit observed `6f9b670a...` as the parent before premature 241 code, but the executor must validate that this remains the correct provenance boundary rather than blindly resetting to it.
5. Freeze numbered advancement in state/handoff notes while the interlock is ACTIVE.

## 3. Phase B — Restore the preactivation boundary

The observed premature 241 implementation surface is:

- `src/simulation/ReplayFixtures.ts`
- `src/simulation/ReplayRecording.ts`
- `src/simulation/ReplayVerifier.ts`
- `src/simulation/StateHasher.ts`
- Change-241 modifications to `src/simulation/SimulationPackageBoundary.ts`
- `tests/unit/ReplayRecording.test.ts`
- `tests/unit/replayScenario.ts`

The executor MUST verify provenance before editing. If these files or hunks are still exclusively premature 241 work, remove new files and restore modified shared files to the last legitimate pre-241 behavior. If subsequent hardening changes overlap them, preserve unrelated fixes while eliminating future-change implementation semantics.

Do **not** delete `openspec/changes/241-*` through `250-*`. Their specs are audit inputs and future work packages.

After restoration, run typecheck/lint/build/unit immediately. Failures become hardening findings; do not proceed as though the baseline is clean.

## 4. Phase C — Canonical Change-240 failure recovery

Reproduce the last known canonical pre-241 E2E failures under the same production-preview path used by CI. The authored audit observed failures in these behavior groups:

- live simulated pig spawn;
- target-and-break block flow;
- breaking a block spawning an item entity;
- breaking a block yielding a collectible drop;
- block placement;
- long exploration memory/GPU-resource budget, with geometry growth above the configured ceiling.

For each failure:

1. reproduce from a clean deterministic state;
2. classify product defect / test defect / environment defect / true nondeterministic flake;
3. collect trace, screenshot, console/page errors, and deterministic seed/state when applicable;
4. fix the root cause;
5. rerun the isolated scenario repeatedly;
6. rerun the entire E2E suite with retries disabled.

A failure is not closed by increasing timeout/retries or relaxing a resource threshold unless a requirement/spec is proven wrong and is separately corrected with evidence.

## 5. Phase D — Control-plane reconciliation

Create one coherent state model:

- `PROGRAM_STATE.json` and `PROGRAM_STATE.md` MUST agree on last completed, current, next, status, and published head.
- A change cannot be VERIFIED if canonical evidence for the claimed SHA is red.
- Local verification may be recorded as local evidence, but MUST NOT be represented as canonical CI evidence.
- `REVIEW_HANDOFF.md`, `AUTONOMOUS_GOAL.md`, `AGENTS.md`, and state instructions MUST have one unambiguous publication rule. If direct-to-main is the repository policy, remove stale contradictory “do not push” text.
- Task/verification ledgers MUST match actual repository implementation state.
- Add a lightweight validator where practical so JSON/Markdown state drift, impossible active-change combinations, stale head provenance, and incomplete verification cannot silently pass CI.

## 6. Phase E — Future-spec integrity audit (241-250)

Before implementation resumes, audit every file in all authored 241-250 change directories against `SPEC_AUTHORING_PROTOCOL.md`.

At minimum, inspect:

- requirement vs scenario consistency;
- ownership/lifetime of dependencies;
- deterministic ordering/tie-breakers;
- malformed/empty/boundary input behavior;
- migration/backward compatibility;
- performance/resource budgets;
- observability and failure semantics;
- evidence claims that imply verification before verification exists;
- task/spec/verification traceability.

Known 241 repairs that MUST be resolved before 241 may activate:

1. Resolve the contradiction between “one `tickSeeds` entry for every tick 1..maxTick” and the purported valid `maxTick: 3` recording with an empty `tickSeeds` list.
2. Define seed-stream ownership and injection explicitly. The verifier cannot own stream instances in an inaccessible local map while production systems are expected to consume the same streams through an unrelated closure.
3. Define whether recorded tick seeds are initialization state, per-tick reseeds, expected post-tick state, or another model. Make verifier behavior and fixtures match exactly one interpretation.
4. Remove false provenance such as fixture comments claiming generation from a verified implementation while verification is NOT VERIFIED.
5. Specify deep immutability/canonicalization semantics for replay payloads, including `undefined`, property ordering, `-0`, symbols, unsupported values, and mutation after capture.
6. Define failure comparison semantics so expected failure traces cannot compare identical to unexpected successful completion.

The hardening executor repairs **specs only** for 241. It does not reimplement 241.

## 7. Phase F — Repository-wide tracked-file audit

Generate the canonical inventory from `git ls-files` at the hardening head. Every tracked path gets one manifest record with:

- path;
- category (`production`, `test`, `spec`, `config`, `script`, `asset`, `generated`, `docs`, other);
- integration status for executable/source modules (`integrated`, `intentional-dormant`, `dead/unreachable`, `n/a`);
- review methods used;
- finding IDs or `none`;
- disposition/evidence.

Mechanical review applies to every applicable text/code file. Semantic review is deeper for system boundaries: boot/main loop, rendering/WebGL lifecycle, input/pointer lock, chunk/world lifecycle, worldgen, simulation/RNG/replay boundary, persistence/recovery, networking/protocol, workers/concurrency, entity/AI, inventory/crafting, registry/data loading, resource ownership/disposal, UI/HUD, test harnesses, CI, and OpenSpec governance.

The audit MUST catch “additive but not integrated” modules. New source that has tests but no production reachability is not silently treated as implemented; it is classified and reconciled with the owning change/spec.

## 8. Phase G — CI, coverage, dependency, and toolchain hardening

### CI

- Keep strict typecheck, lint, unit, build, dependency audit, and E2E as required gates.
- Add explicit timeouts/concurrency and durable failure artifacts where useful.
- Use retries only for diagnosis; the hardening acceptance run MUST prove a complete first-attempt pass with retries disabled.
- Record test counts and skips; unexpected skips fail the gate.

### Coverage

Measure the clean baseline with `npm run test:coverage`. Establish non-regression thresholds from actual measured coverage, plus targeted minimums for critical deterministic/stateful modules where justified. Thresholds must not be guessed below the current baseline just to pass.

### Dependencies/toolchain

Run both full `npm audit` and `npm audit --omit=dev`. Trace every high/critical advisory to its dependency path and runtime reachability. Production high/critical findings block completion. Dev-only high findings must be upgraded away where compatible; if truly unavoidable, document a time-bounded waiver with evidence and no runtime path. Choose and document a currently supported Node line and align `package.json`, CI, and developer guidance; do not blindly equate the GitHub Actions JavaScript runtime with the app's Node runtime.

## 9. Phase H — Final verification and publication

1. Run the full local gate from a clean tree.
2. Run E2E first-attempt/no-retry plus repeatability probes defined by the test-evidence spec.
3. Complete the 100% file manifest and close every blocking finding.
4. Reconcile state and evidence to the exact commit being published.
5. Commit hardening changes and push to `origin/main` according to repository handoff policy.
6. Refetch and verify `origin/main` equals the intended published commit.
7. Wait only in the sense of querying current GitHub Actions synchronously during the session where possible; do not claim green until a canonical run for the exact SHA has actually completed successfully.
8. Only then mark this interlock VERIFIED and allow a later session to activate Change 241.

## 10. Rollback strategy

All governance/spec additions are additive except explicit reconciliation edits. Production fixes must be individually attributable to a hardening finding. If a remediation regresses behavior, revert that remediation—not the evidence framework. Never restore the premature 241 implementation merely to regain green typecheck.
