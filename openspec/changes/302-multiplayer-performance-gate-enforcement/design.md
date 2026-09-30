# Design: 302-multiplayer-performance-gate-enforcement

## Context/current state

Change 236 (`236-multiplayer-load-tests`) established a headless authoritative
server simulation and a performance budget over it. The budget constants live in
`src/simulation/MultiClientLoadHarness.ts`:

```ts
minTicksPerSecond: 200,          // line 256
maxElapsedMsForTicks: 6000,      // REQ-P7
maxChunkAddedPerClient: 81,
```

and are exported to tests as `DEFAULT_BASELINE_BUDGETS`. Two requirement
families exist in
`openspec/changes/236-multiplayer-load-tests/specs/multi-client-performance-fixtures/spec.md`:

* **REQ-P3** — wall-clock throughput budget: 1200 ticks stepped, sustained
  ticks/sec `>= minTicksPerSecond`.
* **REQ-P7** — elapsed wall-time ceiling: `elapsedMs <= maxElapsedMsForTicks`.
* plus structural per-client ceilings (chunk adds, entity spawns, inventory
  accepts) that are load-independent.

`tests/unit/multi-client-performance.test.ts` enforces these in two halves.

**Half A — always runs in `npm test`** (structural ceilings only). Its own
comment disclaims the performance verdict:

```ts
// Per-client-tick ceilings are structural (interest/tracked/queue sizes) and
// load-independent; the throughput/elapsed verdict lives in the canonical test below.
expect(r.maxChunkAdded).toBeLessThanOrEqual(DEFAULT_BASELINE_BUDGETS.maxChunkAddedPerClient);
```

**Half B — the actual REQ-P3/REQ-P7 verdict** is gated:

```ts
// Canonical isolated measurement: run alone via
//   MC_CANONICAL=1 npx vitest run tests/unit/multi-client-performance.test.ts
// (no other test file competes for CPU), and enforce the normative throughput and
// elapsed budgets (REQ-P3/REQ-P7). The verdict is recorded in verification.md.
it.skipIf(process.env.MC_CANONICAL !== '1')(
  'canonical isolated measurement sustains >= 200 ticks/sec within 6000 ms',
  () => {
    const r = runBaselineLoad();
    expect(r.report.withinBudget).toBe(true);
    expect(r.sustainedTicksPerSecond).toBeGreaterThanOrEqual(DEFAULT_BASELINE_BUDGETS.minTicksPerSecond);
    expect(r.elapsedMs).toBeLessThanOrEqual(DEFAULT_BASELINE_BUDGETS.maxElapsedMsForTicks);
  },
  180000,
);
```

### The gap

`grep -rn "MC_CANONICAL" .` (excluding `node_modules`) matches **only
documentation**:

```
openspec/changes/236-multiplayer-load-tests/design.md
openspec/changes/236-multiplayer-load-tests/proposal.md
openspec/changes/236-multiplayer-load-tests/specs/multi-client-performance-fixtures/spec.md
openspec/changes/236-multiplayer-load-tests/verification.md
openspec/evidence/changes/236.md
openspec/hardening/2026-08-17-pre-241-repository-hardening/verification.md
openspec/PROGRAM_STATE.json
```

It appears in **no** `.github/workflows/*.yml`, **no** `package.json` script, and
**no** `scripts/*.mjs`. So the normative REQ-P3/REQ-P7 verdict is never evaluated
by automation. A regression that halves sustained throughput, or that pushes
1200 ticks past 6000 ms, merges with every automated gate green.

### The budget is healthy, which makes enforcement low-risk

Measured in this audit session on the authoring host (base `2ecf781`), running
the documented manual command:

```
$ MC_CANONICAL=1 npx vitest run tests/unit/multi-client-performance.test.ts \
    -t "canonical isolated measurement"

[236 BASELINE_LOAD canonical] elapsedMs=2333.7 sustainedTps=514.2 withinBudget=true
✓ canonical isolated measurement sustains >= 200 ticks/sec within 6000 ms  2343ms
Test Files  1 passed (1)
     Tests  1 passed | 11 skipped (12)
```

Measured margin: **514.2 tps against a 200 tps floor (2.6×)** and **2333.7 ms
against a 6000 ms ceiling (2.6× headroom)**. The budget is not marginal, so
enforcing it in CI carries low flake risk on the measurement itself — the risk is
purely hosted-runner CPU contention, which the isolation requirement addresses.

## Target state

* One documented, cross-platform npm command that sets the environment and runs
  the canonical measurement in isolation.
* A dedicated CI job that runs exactly that command with a single worker and a
  bounded timeout, failing the build when REQ-P3 or REQ-P7 is violated.
* `npm test` semantics unchanged (the canonical measurement stays skipped there).
* The measured value recorded as evidence with a CI run reference.

## Invariants

- `it.skipIf(process.env.MC_CANONICAL !== '1')` is **not** removed.
- No budget constant is changed.
- The measurement runs alone, never inside the shared full-suite run.
- The command is cross-platform; no POSIX-only `VAR=1 cmd` prefix in the
  committed script, because the authoring host is Windows (`shell: bash` for the
  agent, but `npm run` executes through `cmd.exe`/PowerShell for the user).

## API and data model

```ts
// scripts/run-canonical-multiplayer.mjs  (node builtins only)
// Sets the environment for the child and spawns vitest with a fixed argv.
// Never interpolates untrusted input; no shell.
const CANONICAL_ENV = 'MC_CANONICAL';
const FILE = 'tests/unit/multi-client-performance.test.ts';
const NAME = 'canonical isolated measurement';

// argv: [ 'node_modules/vitest/vitest.mjs', 'run', FILE, '-t', NAME ]
// env:  { ...process.env, [CANONICAL_ENV]: '1' }
// stdio: inherit; exit with the child's code.
```

```jsonc
"test:perf:multiplayer": "node scripts/run-canonical-multiplayer.mjs"
```

CI job:

```yaml
  perf-multiplayer:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@11d5960a…   # v4  (immutable pin, per change 268)
      - uses: actions/setup-node@49933ea…  # v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run test:perf:multiplayer
```

A dedicated job (not a step inside `gate`) is required because the measurement
is only valid without CPU contention; sharing the 5700-test `gate` job would
reintroduce exactly the contention the guard was created to avoid.

## Control/data flow

```
npm run test:perf:multiplayer
        │
        └─ node scripts/run-canonical-multiplayer.mjs
              ├─ spawn(vitest, ['run', FILE, '-t', NAME], { env: {…,'MC_CANONICAL':'1'}, stdio:'inherit' })
              ├─ harness prints [236 BASELINE_LOAD canonical] elapsedMs=… sustainedTps=… withinBudget=…
              └─ exit(child.code)

CI perf-multiplayer job:  npm ci → npm run test:perf:multiplayer → job status
Shared `npm test`:        canonical test remains skipIf(MC_CANONICAL !== '1') → skipped
```

## Detailed behavior

* The runner MUST use `spawn` with an explicit argv array and `shell: false`, so
  no argument is ever interpreted by a shell.
* The runner MUST forward stdio so the harness's `[236 BASELINE_LOAD canonical]`
  line is visible in CI logs.
* The runner MUST exit with the child's exit code, and MUST NOT swallow a spawn
  error (e.g. missing vitest binary) — that is a non-zero exit with a message.
* The runner MUST NOT set `MC_CANONICAL` for any other test file.
* `--list` MAY be added to print the command it would run, for diagnosability.

## Failure modes

| Failure | Behaviour |
|---|---|
| REQ-P3 violated (`sustainedTps < 200`) | vitest exits non-zero; job fails |
| REQ-P7 violated (`elapsedMs > 6000`) | vitest exits non-zero; job fails |
| Measurement did not run (name drift) | `-t` matches nothing → vitest reports "no tests" and exits non-zero by default; the runner MUST verify that exactly one test was selected and fail otherwise, so a renamed test cannot silently turn the gate into a no-op |
| vitest binary missing | spawn error → non-zero with a named message |
| Hosted-runner contention causes a marginal miss | Must be investigated, not silenced. Only a documented margin change with recorded multi-run evidence is acceptable. |

The "exactly one test selected" check is the important one: without it, renaming
the canonical test would make the gate vacuously pass.

## Compatibility/migration

- `package.json` gains one script. A node-builtins runner is added; no new
  dependency (so `cross-env` is *not* introduced).
- `.github/workflows/ci.yml` gains one job using the same immutable action pins
  already established by change 268 (`checkout@11d5960a…`, `setup-node@49933ea…`).
- No product code, measurement logic, or budget constant changes.
- The new job adds roughly one test file's runtime (measured 2.3 s locally, well
  inside a 15-minute job timeout) plus `npm ci`, which is already cached.

## Performance/resource constraints

- The command runs one test file and completes in seconds (measured 2343 ms).
- The shared full-suite run is not lengthened: the canonical test remains
  skipped there.
- CI job timeout is bounded (15 minutes proposed).

## Testing seams

* `tests/unit/CanonicalMultiplayerRunner.test.ts` (new): assert the runner sets
  `MC_CANONICAL=1`, passes the exact expected argv, uses no shell, forwards the
  child exit code, and **fails when zero tests match the `-t` filter**. The
  runner should accept an injectable spawn function so this is testable without
  launching vitest.
* An existing behavioural check in `multi-client-performance.test.ts` (the
  `report`/`withinBudget` boundary cases around lines 191–211) remains the
  regression net for the budget evaluation itself.
* Guard test: `npm test` output still lists the canonical measurement as skipped.

## Observability

- The harness's `[236 BASELINE_LOAD canonical] elapsedMs=… sustainedTps=…
  withinBudget=…` line appears verbatim in the CI job log.
- The job name identifies it as the isolated multiplayer performance measurement.
- `verification.md` records the measured values and the CI run URL + job id.

## Affected files/symbols

**New**
- `scripts/run-canonical-multiplayer.mjs`
- `tests/unit/CanonicalMultiplayerRunner.test.ts`

**Modified**
- `package.json` (`test:perf:multiplayer` script)
- `.github/workflows/ci.yml` (new `perf-multiplayer` job)
- `ONBOARDING.md` (gate catalogue entry — coordinate with change 301)
- `AGENTS.md` (baseline-verification note)

**Explicitly not modified**
- `tests/unit/multi-client-performance.test.ts` (the `skipIf` stays)
- `src/simulation/MultiClientLoadHarness.ts` (no budget change)
- anything else under `src/`

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Remove the `skipIf` so `npm test` enforces it | The measurement is explicitly invalid under CPU contention; running it inside the 5700-test suite would make the gate flaky, which is precisely why the canonical form exists. |
| Add `cross-env` as a dependency | A node-builtins runner is one small file and adds no supply-chain surface to a repository that has already hardened its action pins and dependency audits. |
| Raise the budget to reduce flake risk | The measured margin is already 2.6×. There is no evidence of marginality, so raising the budget would only weaken the gate. |
| Mark the new job `continue-on-error` | That recreates the original defect (an unenforced budget) with extra steps. |
| Enforce the budget only in the shared suite with a longer timeout | A timeout does not remove contention; the harness's own documentation requires isolation. |
| Delete the canonical test and keep only structural ceilings | Deletes the normative REQ-P3/REQ-P7 requirements rather than enforcing them. |

## Downstream dependencies

- 301 owns the gate catalogue and may already be editing `package.json` scripts
  and `ci.yml`; land 301 first or coordinate a single combined commit.
- 298 is a recommended predecessor so "green except the canonical test is skipped"
  is unambiguous in local evidence.
