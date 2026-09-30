# Proposal: 301-verification-script-gate-wiring

## Problem

The repository ships a set of high-quality, security- and quality-relevant
verification scripts, but **almost none of them are wired into any npm script or
CI workflow**. They are only ever run by hand, so their guarantees are not
enforced and can silently regress.

Measured at base `2ecf781`, cross-referencing every `scripts/*.mjs` against
`package.json` and `.github/workflows/*.yml`:

| Script | Referenced by an npm script or CI? | What it guards |
|---|---|---|
| `validate-state.mjs` | yes (`package.json` + `ci.yml`) | program-state coherence |
| `check-release-bundle.mjs` | yes (`ci.yml`) | E2E hook does not leak into the release bundle |
| `validate-file-audit.mjs` | **NO** | every-file audit manifest integrity (claimed as a mandatory gate in every change's `verification.md`) |
| `gen-file-audit.mjs` | **NO** | manifest generator that every new file must be appended to |
| `orphan-check.mjs` | **NO** | dead/unreferenced source files (currently: only the 3 legitimate entry points have zero importers) |
| `verify-mcp-addons.mjs` | **NO** | fail-closed security preflight for `.mcp.json` (unpinned versions, embedded secrets, global command resolution) |
| `audit-inventory.mjs` | **NO** | legacy-world pattern scanner |
| `build-evidence-archive.mjs` | **NO** | consolidated evidence archive generation |

The most consequential gap is `validate-file-audit.mjs` / `gen-file-audit.mjs`:
the 3031-row reviewed file-audit manifest is a genuine repository gate — every
`verification.md` from change 250 onward claims "file-audit PASS" — yet nothing
in CI runs it, and nothing reminds an implementer to regenerate or extend the
manifest when files are added. The manifest *can* drift out of sync with the tree
without any automated signal. `verify-mcp-addons.mjs` is a security preflight
that also runs only by hand.

This change wires the un-wired gates into the repository's automation so their
guarantees are actually enforced, and adds a single "verify all gates" entry
point that an agent can trust.

## Inspection findings (base `2ecf781`)

- `ls scripts/*.mjs` → 8 scripts; only `validate-state` and `check-release-bundle`
  appear in `package.json`/CI (see the table above).
- `verify-mcp-addons.mjs` currently reports `PREFLIGHT OK: repository-local MCP
  config validated (pinned, secret-free, no global resolution).` and is a real
  security check (documented as fail-closed, read-only).
- `orphan-check.mjs` currently reports `Files with zero internal importers
  (potential entry/dormant): 3 — src/main.ts, src/rendering/MeshWorkerEntry.ts,
  src/worldgen/WorldgenWorkerEntry.ts` (all legitimate entry points).
- `validate-file-audit.mjs …/file-audit-manifest.json` PASSES locally (3031 rows,
  sha `3d0fd2d5aee39ae1706b7210ad27e675450f521c`) — but only because an operator
  remembered to run it.
- There is no single command that runs the full gate set; `AGENTS.md` lists
  `typecheck / lint / test / build / test:e2e` but omits the file-audit,
  dependency, orphan, and MCP-preflight gates.

## Goals

1. Expose every shipped verification script as an npm script with a stable name.
2. Wire the meaningful gates into the CI `gate` job (or a fast pre-gate) so their
   guarantees are enforced on every push.
3. Provide a single aggregate command that runs the repository's verification
   gates in the documented order, so an implementing agent can satisfy the
   "Baseline verification" requirement with one trustworthy invocation.
4. Keep each script's read-only/fail-closed semantics unchanged.

## Non-goals

- No behaviour change to any script's logic.
- No new gate semantics invented here (each script already exists).
- Not running `gen-file-audit.mjs` automatically in a way that would mask an
  out-of-date manifest (the generator produces `status:"pending"` rows by design;
  auto-regeneration must not be presented as an audit).
- No 258 headed work.

## Preconditions

- 298 (green local gate) and 299 (dependency check as an explicit first step) are
  recommended predecessors so the aggregate command is trustworthy.

## Dependencies

- **299**: the aggregate "verify all" command should call the dependency check
  first; coordinate so both changes do not independently rewrite the same
  `scripts` block without ordering. Land 299 first, or land both in one commit.
- **300**: adds a `check-visual-goldens.mjs`; 301 should wire it into the same
  aggregate command rather than 301 inventing a second entry point.

## Proposed change

### 1. Name every gate as an npm script

Add to `package.json` `scripts`:

```
"verify:file-audit":   "node scripts/validate-file-audit.mjs openspec/hardening/2026-08-23-exhaustive-repository-certification/file-audit-manifest.json",
"gen:file-audit":      "node scripts/gen-file-audit.mjs",
"verify:orphans":      "node scripts/orphan-check.mjs",
"verify:mcp":          "node scripts/verify-mcp-addons.mjs",
"verify:inventory":    "node scripts/audit-inventory.mjs",
"evidence:archive":    "node scripts/build-evidence-archive.mjs"
```

(Adjust the `verify:file-audit` path to the real manifest path; keep
`validate-state` and the existing `build`/`lint`/`typecheck`/`test` unchanged.)

### 2. Wire the fast, read-only gates into the CI `gate` job

Insert, before the heavy unit/E2E steps:

- `npm run verify:file-audit` (fails if the manifest is stale or a tracked file
  is missing a row — the guarantee every verification.md already claims).
- `npm run verify:orphans` (fails on a new zero-importer source file, i.e. dead
  code, once the three known entry points are allow-listed).
- `npm run verify:mcp` (security preflight for `.mcp.json`).

These are read-only and fast, so they belong in the static half of the gate.

`verify:inventory` and `evidence:archive` are report generators rather than
pass/fail gates; expose them as npm scripts and run them on demand / nightly
rather than gating every push (see design for the exact policy).

### 3. Provide a single aggregate verification command

Add a `verify:all` script (or a small `scripts/verify-all.mjs`) that runs, in
order and stop-on-first-failure:

```
verify:deps (299) → validate-state → typecheck → lint → build →
check-release-bundle → test → test:coverage → verify:file-audit →
verify:orphans → verify:mcp → test:e2e
```

This becomes the canonical way to satisfy `AGENTS.md` "Baseline verification",
and `AGENTS.md` is updated to reference it (while still listing the individual
commands for clarity).

### 4. Document the gate catalogue

Add a short "Verification gates" section to `ONBOARDING.md` listing every npm
gate script, what it guards, whether it blocks a push, and how to run it. This
removes the "which script enforces what?" ambiguity that currently contributes
to gates being skipped.

## Compatibility and migration

- No product code or data change.
- `package.json` gains scripts only.
- CI's `gate` job gains three fast steps. If any gate is red on a clean tree at
  activation time, that is a finding to report and fix, not a reason to omit the
  step.
- `orphan-check` will legitimately flag the three entry points; the wired gate
  MUST allow-list exactly those three (documented) and fail on any *new*
  zero-importer file.

## Risks

- **`verify:file-audit` red on activation.** If the manifest is out of sync at
  activation, the new CI step would fail. Mitigation: run it during the
  implementation task and either fix the manifest or explicitly defer wiring
  that one gate with a recorded reason — never leave CI knowingly red.
- **`orphan-check` false positives.** Any new worker entry point or dynamically
  loaded module would appear as a zero-importer. Mitigation: the gate fails on a
  *new* zero-importer not in the documented allow-list, and the allow-list is a
  reviewed file.
- **CI time.** The three added gates are read-only and fast (seconds); the
  heavy suites are unchanged.
- **`verify:all` coupling to 299/300 scripts.** Coordinate ordering so the
  aggregate references scripts that exist.

## Rollback strategy

Remove the added npm scripts and the CI steps. Each underlying script remains on
disk and runnable by hand, so no capability is lost.

## Definition of Done

- Every `scripts/*.mjs` is reachable through a documented npm script.
- The CI `gate` job runs `verify:file-audit`, `verify:orphans`, `verify:mcp` and
  they pass on the candidate SHA.
- `npm run verify:all` exists, runs the documented gate order, and stops on the
  first failure.
- `AGENTS.md` "Baseline verification" references the aggregate command.
- `ONBOARDING.md` documents the gate catalogue (name, purpose, blocking status).
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run validate-state`, `npm run test:e2e` all PASS.

## Advancement gate

All mandatory gates PASS on the candidate SHA. Completion target 100%; below 90%
advancement is forbidden. Wiring a gate that is red at activation is not
acceptable completion — the wired gate must be green or explicitly deferred with
a recorded, non-blocking reason.
