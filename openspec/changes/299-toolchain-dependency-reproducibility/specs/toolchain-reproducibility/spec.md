# Spec: toolchain-reproducibility

## Contract

Every repository verification gate MUST be evaluated against the dependency
tree that `package-lock.json` describes. A gate result produced under a
different installed tree is not a repository result and MUST NOT be recorded as
one.

The repository MUST declare its package manager exactly, MUST provide a
read-only check that reports whether the installed tree matches the lockfile,
and MUST make that check runnable both as a manual command and as an install-time
guard. The check MUST NOT mutate `node_modules`.

This capability governs the toolchain only. It does not change product code,
product behaviour, dependency versions, or coverage thresholds.

## Definitions

- **Installed tree**: the `node_modules` directory present in a working copy.
- **Lockfile-resolved version**: the concrete `version` recorded for a package
  under `packages["node_modules/<name>"]` in `package-lock.json`.
- **Drift**: an installed package whose on-disk version differs from its
  lockfile-resolved version.
- **Fresh tree**: a working copy in which `node_modules` is absent or empty,
  which is the normal state immediately before `npm ci`.
- **Platform-inapplicable optional dependency**: an `optionalDependencies`
  entry whose platform constraint excludes the current platform; absence of that
  package on disk is correct, not drift.

## Invariants

- The check MUST be read-only: it MUST NOT create, modify, or delete any file.
- The check MUST exit 0 on a fresh tree (before install) so `npm ci` is never
  blocked.
- The check MUST exit non-zero when at least one drift exists, and MUST print the
  offending package name, the installed version, the lockfile version, and a
  remediation command.
- The check MUST NOT modify `package-lock.json` or `package.json`.
- The lockfile remains the single authority for resolved versions.

## ADDED Requirements

### Requirement: The package manager is declared exactly

`package.json` MUST contain a `packageManager` field naming an exact package
manager and version, with no range. The declared version MUST be one that
produces the current lockfile.

#### Scenario: The field is present and exact

- **WHEN** `package.json` is parsed
- **THEN** a `packageManager` field is present
- **AND** its value names the package manager and a concrete version with no
  range operator

#### Scenario: The declared version is documented

- **WHEN** the onboarding documentation is read
- **THEN** it records the Node version CI uses and the package-manager version
  the repository declares
- **AND** it states that `npm ci` is the only supported install command

### Requirement: A read-only dependency-tree check is available

The repository MUST provide a script that compares each installed package
version against its lockfile-resolved version and reports every drift. The
script MUST accept the repository root as its working directory and MUST resolve
the lockfile and `node_modules` relative to that root.

The script MUST treat a package that is absent from disk as follows:

* if the lockfile records it and the tree is not fresh — that is drift;
* if the tree is fresh — skip;
* if the package is a platform-inapplicable optional dependency — skip.

The script MUST compare against the lockfile's resolved version and MUST NOT
compare against a caret or tilde range.

#### Scenario: Matching tree reports success

- **GIVEN** a working copy whose installed versions equal the lockfile-resolved
  versions
- **WHEN** the check runs
- **THEN** it exits 0
- **AND** it prints a summary naming the number of packages verified

#### Scenario: Drifted tree reports failure with remediation

- **GIVEN** a working copy in which `vitest` and `@vitest/coverage-v8` are
  installed at a version different from the lockfile
- **WHEN** the check runs
- **THEN** it exits with a non-zero status
- **AND** each drift line names the package, the installed version, the
  lockfile-resolved version, and the command `npm ci`

#### Scenario: Fresh tree does not fail

- **GIVEN** a working copy with no `node_modules` directory
- **WHEN** the check runs
- **THEN** it exits 0
- **AND** it reports that the tree is fresh rather than reporting every package
  as drift

#### Scenario: Platform-inapplicable optional dependency is skipped

- **GIVEN** a platform where a platform-specific optional dependency is not
  applicable
- **AND** that dependency is absent from `node_modules`
- **WHEN** the check runs
- **THEN** the absence is not reported as drift
- **AND** the check exits 0 when no other drift exists

#### Scenario: The check is read-only

- **GIVEN** a working copy with a drifted tree
- **WHEN** the check runs
- **THEN** no file under `node_modules`, and neither `package.json` nor
  `package-lock.json`, is modified
- **AND** `git status` reports no new modification after the run

### Requirement: The check runs as an install-time guard

`package.json` MUST declare a `preinstall` lifecycle script that invokes the
check. Because `preinstall` runs before npm mutates the tree, a drifted tree MUST
cause the install to abort before any package is added, removed, or updated.

The guard MUST NOT invoke `npm install`, `npm ci`, or any other package manager,
because doing so from within `preinstall` would recurse.

#### Scenario: Drifted tree aborts the install before mutation

- **GIVEN** a working copy with a drifted installed tree
- **WHEN** `npm install` is invoked
- **THEN** the process exits non-zero
- **AND** the drift table is printed
- **AND** no package directory is added, removed, or updated

#### Scenario: Clean install succeeds

- **GIVEN** a fresh working copy
- **WHEN** `npm ci` is invoked
- **THEN** the guard exits 0 and the install completes

### Requirement: Gates are declared as depending on a matching tree

The repository's documented mandatory verification sequence MUST include the
dependency-tree check as an explicit step that runs before any gate whose result
depends on the toolchain version, and MUST state that a gate result obtained
under a drifted tree is invalid.

#### Scenario: The documented sequence includes the check

- **WHEN** the mandatory baseline-verification sequence is read
- **THEN** it lists a dependency-tree verification step ahead of the type
  check, lint, unit, coverage, build, and browser gates

#### Scenario: The coverage provider caveat is documented

- **WHEN** the documentation covering coverage thresholds is read
- **THEN** it states that the thresholds are calibrated for the locked
  coverage-provider version
- **AND** it states that the branch metric is not comparable across provider
  major versions

## Error and failure behavior

- An unreadable or malformed `package-lock.json` MUST cause the check to exit
  non-zero with a message naming the parse failure. It MUST NOT fall back to
  "no drift".
- An installed package whose `package.json` cannot be read MUST be reported as
  `installed <unreadable>` and counted as drift. It MUST NOT be silently skipped.
- The check MUST NOT print a success summary when at least one drift was found,
  even if other packages matched.
- The check MUST NOT throw an unhandled exception; all failures are reported on
  stdout/stderr with a non-zero exit code.

## Performance and resource bounds

- The check MUST complete in under 5 seconds on a tree with the current
  dependency count (order 300 direct plus transitive packages).
- It MUST read each package's `package.json` at most once.
- It MUST NOT load or parse any file larger than necessary for version
  extraction.

## Compatibility and migration

- No product code, product data, or API change.
- `package-lock.json` contents are unchanged; only `package.json` gains a
  `packageManager` field and two scripts.
- Contributors who knowingly run a drifted tree will now see installs abort.
  This is the intended behaviour and MUST be recorded in the change's
  verification notes.
- CI behaviour is unchanged because CI runs `npm ci`, which yields a matching
  tree.

## Security and integrity

- A drifted test toolchain can mask or fabricate a gate result. Pinning the
  package manager and failing fast on drift makes the build's inputs auditable:
  the versions that produced any recorded evidence are exactly the versions in
  the lockfile.
- The check compares against the lockfile rather than resolving ranges, so a
  compromised or mis-resolved registry entry that is not the locked version
  cannot pass unnoticed.

## Observability

- Drift output MUST be a stable, greppable table format containing the package
  name, installed version, and lockfile version on each line.
- The remediation command MUST appear exactly once in the output.
- The check MUST print the number of packages verified on success so a reader can
  tell an empty check from a real one.

## Verification mapping

| Requirement | Verification |
|---|---|
| Package manager declared exactly | Parse `package.json`; assert `packageManager` present with no range |
| Read-only check available | Run on a matching tree (exit 0), a drifted tree (exit 1 + table), a fresh tree (exit 0), and an incompatible-optional platform case (exit 0) |
| Read-only property | Snapshot `git status` before/after; assert no `node_modules`, `package.json`, or `package-lock.json` change |
| Install-time guard | In a throwaway copy: `npm install` on a drifted tree aborts before mutation; `npm ci` on a fresh tree succeeds |
| Gates depend on a matching tree | Read `AGENTS.md` / `ONBOARDING.md`; assert the check precedes the toolchain-sensitive gates and that the provider caveat is stated |
