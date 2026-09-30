# Design: 301-verification-script-gate-wiring

## Context/current state

`scripts/` ships eight verification programs. Measured cross-reference at base
`2ecf781` (`ls scripts/*.mjs` against `package.json` and
`.github/workflows/*.yml`):

| Script | npm/CI-referenced | Purpose (from its own header) | Current result when run by hand |
|---|---|---|---|
| `validate-state.mjs` | **yes** (pkg + ci) | program-state coherence | `State validation PASSED` |
| `check-release-bundle.mjs` | **yes** (ci) | E2E hook must not leak into the release bundle | 2 assets checked |
| `validate-file-audit.mjs` | no | reviewed file-audit manifest integrity | `PASSED (3031 rows, sha 3d0fd2d5…)` |
| `gen-file-audit.mjs` | no | manifest generator (`status:"pending"` by design) | n/a |
| `orphan-check.mjs` | no | zero-internal-importer (dead) source detection | `384 files … zero internal importers: 3` |
| `verify-mcp-addons.mjs` | no | fail-closed `.mcp.json` security preflight | `PREFLIGHT OK … pinned, secret-free, no global resolution` |
| `audit-inventory.mjs` | no | legacy-world pattern scanner | (change-253 scanner) |
| `build-evidence-archive.mjs` | no | consolidated evidence archive | (change-250 generator) |

`orphan-check.mjs` output at base:

```
Source files: 384
Files with zero internal importers (potential entry/dormant): 3
  - src/main.ts
  - src/rendering/MeshWorkerEntry.ts
  - src/worldgen/WorldgenWorkerEntry.ts
```

All three are legitimate entry points (the browser entry and two worker entries),
so the current tree is clean; the gate is meaningful, not decorative.

### Why this matters

The file-audit manifest is quoted as a mandatory gate throughout the program's
verification record — for example
`openspec/changes/297-gunpowder-and-splash-brewing/verification.md` lists
``node scripts/validate-file-audit.mjs …/file-audit-manifest.json | PASS, 3031
rows`` alongside typecheck/lint/unit/build. Yet nothing in CI runs it and nothing
in `AGENTS.md`'s "Baseline verification" list mentions it. The guarantee exists
only because each agent remembered to run it. A file added without a manifest
row would merge with no signal.

The same is true of the add-on security preflight, which the repository itself
describes as fail-closed and secret-scanning. A `.mcp.json` regression — a
pinned version replaced by `@latest`, a token pasted into the config, a global
command resolution — would merge unnoticed.

## Target state

* Every `scripts/*.mjs` verification program is reachable via a named npm script.
* The three fast, invariant-guarding gates (file-audit, orphan, MCP preflight)
  run in the CI `gate` job alongside `validate-state`/`typecheck`/`lint`.
* One aggregate command runs the full documented sequence and stops at the first
  failure.
* A gate catalogue documents name, purpose, and blocking status.

## Invariants

- No gate script's logic is modified by this change.
- No product file is modified.
- The aggregate command's order is stable and documented.
- A wired gate is green at activation or explicitly deferred with a recorded
  reason.

## API and data model

Two new npm-script families and one aggregate runner:

```jsonc
{
  "scripts": {
    // existing (unchanged)
    "dev": "...", "build": "...", "test": "...", "lint": "...",
    "typecheck": "...", "validate-state": "...", "test:e2e": "...",

    // newly exposed individual gates
    "verify:file-audit": "node scripts/validate-file-audit.mjs openspec/hardening/2026-08-23-exhaustive-repository-certification/file-audit-manifest.json",
    "gen:file-audit":    "node scripts/gen-file-audit.mjs",
    "verify:orphans":    "node scripts/orphan-check.mjs",
    "verify:mcp":        "node scripts/verify-mcp-addons.mjs",
    "verify:inventory":  "node scripts/audit-inventory.mjs",
    "evidence:archive":  "node scripts/build-evidence-archive.mjs",

    // aggregate
    "verify:all":        "node scripts/verify-all.mjs"
  }
}
```

`scripts/verify-all.mjs` (node builtins only, no new dependency):

```ts
type Gate = { name: string; cmd: string[]; blocking: boolean };
const GATES: readonly Gate[] = [
  { name: 'dependency-tree',      cmd: ['npm','run','--silent','verify:deps'] },          // 299
  { name: 'program-state',        cmd: ['npm','run','--silent','validate-state'] },
  { name: 'typecheck',            cmd: ['npm','run','--silent','typecheck'] },
  { name: 'lint',                 cmd: ['npm','run','--silent','lint'] },
  { name: 'build',                cmd: ['npm','run','--silent','build'] },
  { name: 'release-bundle',       cmd: ['node','scripts/check-release-bundle.mjs'] },
  { name: 'file-audit',           cmd: ['npm','run','--silent','verify:file-audit'] },
  { name: 'unreferenced-source',  cmd: ['npm','run','--silent','verify:orphans'] },
  { name: 'addon-preflight',      cmd: ['npm','run','--silent','verify:mcp'] },
  { name: 'unit',                 cmd: ['npm','run','--silent','test'] },
  { name: 'coverage',             cmd: ['npm','run','--silent','test:coverage'] },
  { name: 'browser',              cmd: ['npm','run','--silent','test:e2e'] },
];
```

Exit semantics: run in order; on the first non-zero exit, print
`FAIL <gate-name> (exit <code>)` plus the tail of that gate's output, then exit
with the **gate's own** exit code. A `--only <gate>` / `--from <gate>` selector
is permitted for targeted re-runs and MUST be documented as non-default.

## Control/data flow

```
npm run verify:all
   │
   ├─ for each gate in GATES (ordered):
   │      print "── <name> …"
   │      spawn gate command, stream output
   │      exit !== 0  ─▶ print "FAIL <name> (exit <code>)" + tail; exit <code>
   │
   └─ print "ALL GATES PASS" ; exit 0

CI gate job (fast static half):
  checkout → setup-node → npm ci
    → validate-state
    → verify:file-audit          <-- NEW
    → verify:orphans             <-- NEW
    → verify:mcp                 <-- NEW
    → typecheck → lint → build → check-release-bundle → test → coverage → npm audit
```

## Detailed behavior

### Ordering rationale

1. `dependency-tree` first, because every later gate's meaning depends on it
   (change 299).
2. Cheap static checks (`validate-state`, `typecheck`, `lint`) before anything
   that builds or runs, so an obvious error costs seconds.
3. `build` before `check-release-bundle`, which inspects `dist/` (this also
   resolves the documented AUDIT-007 operational trap: running the release
   check straight after the E2E server rebuilt `dist` with test instrumentation
   reports a false positive).
4. Repository-invariant gates (`file-audit`, `unreferenced-source`,
   `addon-preflight`) before the heavy suites, so an invariant break is reported
   in seconds rather than after 30 minutes of E2E.
5. `unit` → `coverage` → `browser` last, matching the existing CI job split.

### Report generators are exposed, not gating

`gen:file-audit`, `verify:inventory` and `evidence:archive` produce artifacts
rather than pass/fail verdicts. `gen-file-audit.mjs` explicitly *cannot* produce
audit verdicts (its header: "This script deliberately CANNOT produce audit
verdicts"). Auto-running a generator inside a gate would let a stale manifest be
silently refreshed with `pending` rows and then be read as "audited". They are
therefore exposed as on-demand commands and documented as such.

## Failure modes

| Failure | Behaviour |
|---|---|
| A gate script referenced by `verify:all` is missing from `package.json` | Fail loudly on the first invocation; never skip silently. |
| A gate is red at activation | Resolve it, or record an explicit deferral in `verification.md` and omit the CI step. Never land a knowingly-red blocking step. |
| `orphan-check` flags a legitimate new entry point | Add it to the reviewed allow-list with a comment; the gate then fails only on unlisted zero-importer files. |
| `verify-file-audit` sees a tracked file missing a row | Fail, naming the file. This is the property every verification.md already claims. |
| A gate hangs | The aggregate MUST apply a per-gate timeout and report the gate name on timeout. |

## Compatibility/migration

- `package.json` gains scripts; no existing script changes.
- `.github/workflows/ci.yml` gains three steps in the `gate` job; the `e2e` job
  is untouched.
- `AGENTS.md` "Baseline verification" gains a reference to `npm run verify:all`
  while retaining the explicit command list.
- `ONBOARDING.md` gains the gate catalogue.

## Performance/resource constraints

- The three newly wired CI gates are read-only and complete in seconds.
- `verify:all` performs no duplicated work within one invocation; the heavy
  suites dominate and their cost is unchanged.
- No wired gate reads or rewrites the visual golden PNG sets.

## Testing seams

* A unit test asserts script-to-`package.json` reference completeness: every
  `scripts/*.mjs` is referenced by at least one npm script.
* A unit test asserts the `verify:all` gate order matches the documented order
  and that every referenced npm script exists.
* Synthetic-violation proofs, each run in a **throwaway worktree** so the primary
  tree is never dirtied:
  1. add a tracked file with no manifest row → `verify:file-audit` exits non-zero
     naming it;
  2. add a source file with no importer → `verify:orphans` exits non-zero naming
     it, while the three documented entry points still pass;
  3. write an unsafe `.mcp.json` (an `@latest` pin and a `secrets` key) →
     `verify:mcp` exits non-zero naming it;
  4. break an early gate (e.g. temporarily introduce a type error in a throwaway
     copy) → `verify:all` stops at `typecheck`, names it, and exits with its
     code.

## Observability

- `verify:all` prints a `── <gate-name>` banner before each gate and a final
  `ALL GATES PASS` or `FAIL <name> (exit <code>)`.
- Each CI step name identifies the invariant it guards, not just the script
  file.

## Affected files/symbols

**Modified**
- `package.json` (`scripts`)
- `.github/workflows/ci.yml` (`gate` job: three new steps)
- `AGENTS.md` (baseline verification reference)
- `ONBOARDING.md` (gate catalogue)

**New**
- `scripts/verify-all.mjs`
- `tests/unit/GateWiring.test.ts`
- the reviewed allow-list consulted by the wired orphan gate (either inside
  `orphan-check.mjs` as data, or as a small JSON file)

**Explicitly not modified**
- the logic of any existing `scripts/*.mjs`
- anything under `src/`

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Wire only the file-audit gate | Leaves the MCP security preflight and dead-code gate manual for the same reason. The boundary should be "invariant guards are enforced", applied consistently. |
| Run `gen-file-audit` automatically before validating | The generator emits `status:"pending"` rows and explicitly cannot produce verdicts. Auto-regeneration would let an unaudited manifest read as audited — the opposite of the gate's purpose. |
| Merge all gates into `validate-state.mjs` | Couples unrelated concerns and makes a state-validation failure indistinguishable from a manifest failure. Named scripts keep failures diagnosable. |
| Drop `orphan-check` because it is nearly always clean | A clean gate that costs seconds and catches new dead code is exactly the kind of cheap invariant worth enforcing; the current clean result proves it is not noise. |
| Replace the aggregate with documentation only | Documentation is precisely what already failed here: the gates were documented in verification files yet never automated. |

## Downstream dependencies

- 299 supplies `verify:deps`, the first entry in the aggregate order; 299 must
  land first or in the same commit.
- 300 supplies `check-visual-goldens.mjs`; if 300 lands first, add it to the
  aggregate here rather than creating a second entry point.
- 302 changes which browser-suite steps are mandatory; it may extend the
  aggregate but must not reorder the existing sequence.
