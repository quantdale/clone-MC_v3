# Spec: gate-automation

## Contract

Every verification gate the repository ships MUST be reachable through a
documented command, and every gate that guards a repository invariant MUST be
enforced automatically on the canonical continuous-integration boundary rather
than only by manual invocation.

This capability governs the repository's verification surface: how gates are
named, invoked, ordered, and enforced. It does not change what any individual
gate checks, and it does not change product code.

## Definitions

- **Gate**: a read-only script that exits non-zero when a repository invariant is
  violated.
- **Report generator**: a script that produces an artifact or inventory for
  review but whose output is not a pass/fail precondition for a push.
- **Gate catalogue**: the documented list of every npm-exposed gate with its
  purpose and blocking status.
- **Aggregate verification command**: a single entry point that runs the
  documented gate order and stops at the first failure.

## Invariants

- Every script under `scripts/` that the repository relies on for verification is
  reachable through an npm script.
- A gate added to the continuous-integration configuration MUST also be listed in
  the gate catalogue.
- A gate MUST remain read-only with respect to product data, and MUST NOT mutate
  `src/`.
- The aggregate command MUST stop at the first failing gate and surface that
  gate's exit code.
- Wiring a gate MUST NOT require editing that gate's logic.

## ADDED Requirements

### Requirement: Every shipped verification script is npm-exposed

Each verification script under `scripts/` MUST be invocable through a named npm
script whose name makes its purpose evident. Report generators MUST be exposed
too, so that no shipped verification script is reachable only by knowing its file
path.

The npm script for a gate that reads a repository artifact MUST point at the
artifact's real committed path.

#### Scenario: Catalogue completeness

- **WHEN** the set of verification scripts under `scripts/` is compared with the
  set of scripts referenced by `package.json`
- **THEN** every verification script is referenced by at least one npm script

#### Scenario: Purpose-revealing names

- **WHEN** the npm script list is read
- **THEN** each gate script name identifies whether it verifies, generates, or
  archives

### Requirement: Repository-invariant gates block continuous integration

Every gate that guards a repository invariant MUST run as a step in the
continuous-integration workflow that gates pushes to the main branch. At minimum
this includes the file-audit manifest integrity gate, the unreferenced-source
gate, and the repository add-on security preflight.

A newly wired gate MUST pass on the candidate commit; a gate that is knowingly red
MUST NOT be added to the blocking path.

#### Scenario: Manifest integrity blocks a stale manifest

- **GIVEN** a tracked file that has no row in the reviewed file-audit manifest
- **WHEN** the continuous-integration workflow runs
- **THEN** the file-audit gate step fails
- **AND** the failure names the unlisted file

#### Scenario: Add-on security preflight blocks an unsafe config

- **GIVEN** an add-on configuration containing a secret or an unpinned version
- **WHEN** the continuous-integration workflow runs
- **THEN** the add-on preflight step fails
- **AND** the failure names the offending entry

#### Scenario: Unreferenced source blocks new dead code

- **GIVEN** a new source file with zero internal importers that is not a
  documented entry point
- **WHEN** the continuous-integration workflow runs
- **THEN** the unreferenced-source gate fails
- **AND** the three documented entry points do NOT fail that gate

### Requirement: A single aggregate verification command exists

The repository MUST expose one command that runs the mandatory gate sequence in
the documented order and stops at the first failure, surfacing the failing gate's
exit code and name.

The aggregate command MUST include the dependency-tree check before any gate whose
result depends on the installed toolchain, and MUST include the file-audit,
unreferenced-source, and add-on preflight gates.

#### Scenario: Aggregate stops at the first failure

- **GIVEN** a tree in which an early gate fails and a later gate would also fail
- **WHEN** the aggregate command runs
- **THEN** it exits non-zero
- **AND** it names the first failing gate
- **AND** it does not report success for any later gate

#### Scenario: Aggregate on a clean tree

- **GIVEN** a tree that satisfies every mandatory gate
- **WHEN** the aggregate command runs
- **THEN** every mandatory gate reports PASS
- **AND** the command exits 0

### Requirement: The gate catalogue is documented

The repository MUST document every npm-exposed gate with its purpose, whether it
blocks a push, and how to run it individually. The documented mandatory
verification sequence MUST reference the aggregate command while still naming the
individual commands.

#### Scenario: Catalogue completeness

- **WHEN** the gate catalogue documentation is compared with the npm script list
- **THEN** every gate script is documented with a purpose and a blocking status

#### Scenario: Mandatory sequence references the aggregate

- **WHEN** the mandatory verification sequence is read
- **THEN** it names the aggregate command
- **AND** it still lists the individual commands it comprises

## Error and failure behavior

- A gate script that cannot read its artifact MUST exit non-zero with a message
  naming the artifact. It MUST NOT treat a missing artifact as a pass.
- A gate wired into continuous integration that fails MUST fail the job; it MUST
  NOT be downgraded to a warning.
- The aggregate command MUST propagate the failing gate's non-zero exit code
  rather than collapsing every failure into a generic non-zero.
- A missing `package.json` script that the aggregate references MUST fail loudly
  at the first invocation, not silently skip that gate.

## Performance and resource bounds

- The newly wired continuous-integration gates MUST each complete in under 60
  seconds so they fit in the fast static half of the gate job.
- The aggregate command MUST NOT duplicate work that an individual gate already
  performs within the same invocation.
- No newly wired gate may read or rewrite the visual golden PNG sets.

## Compatibility and migration

- No product code or product data change.
- `package.json` gains scripts only; no existing script's behaviour changes.
- The continuous-integration workflow gains steps; the heavy jobs are unchanged.
- Wiring a gate that is red at activation is not acceptable; the implementer
  resolves the redness or records an explicit deferral before landing the step.

## Security and integrity

- The add-on security preflight (unpinned versions, embedded secrets, global
  command resolution) is a supply-chain control. Running it only by hand means a
  compromised or unsafe add-on configuration can merge unnoticed; wiring it into
  continuous integration is the enforcement point.
- The file-audit manifest integrity gate prevents the repository's own audit
  record from silently diverging from the tracked tree, which is the property
  every change's verification evidence relies on.

## Observability

- Each wired gate step's name in the workflow MUST identify the invariant it
  guards.
- The aggregate command MUST print the ordered gate list and, on failure, the
  gate name, its exit code, and the tail of its output.

## Verification mapping

| Requirement | Verification |
|---|---|
| Every verification script is npm-exposed | Script-to-`package.json` reference sweep returns no unexposed verification script |
| Invariant gates block CI | Introduce each synthetic violation in a throwaway worktree (unlisted tracked file; unsafe add-on config; new zero-importer file) and observe the corresponding workflow step fail |
| Aggregate command | Run on a clean tree (exit 0, all PASS) and on a tree with an early-gate failure (exit non-zero, names the first failing gate) |
| Catalogue documented | Compare the documentation table with `package.json` scripts |
