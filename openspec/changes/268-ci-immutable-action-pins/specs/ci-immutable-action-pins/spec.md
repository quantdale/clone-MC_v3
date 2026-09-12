# Spec: ci-immutable-action-pins

## Contract

This capability pins the repository's GitHub Actions supply chain to
immutable refs and closes certification debt R-5. It changes workflow files
and documentation only; game behavior is untouched. All requirements are
statically decidable from repository text plus the observed CI result on the
published SHA.

## Definitions

- **Floating ref**: a `uses:` value of the form `actions/<name>@vN`
  (major-version tag, movable).
- **Pinned ref**: a `uses:` value of the form
  `actions/<name>@<40-hex-sha> # vN` (immutable commit, human-readable major
  retained as a comment).
- **Workflow set**: `.github/workflows/ci.yml` and
  `.github/workflows/seed-visual-goldens.yml`.

## Invariants

- The four SHAs in the pin table are the upstream `v4` tips observed
  2026-09-12; they MUST NOT be substituted with any other commit.
- Workflow job semantics (inputs, permissions, concurrency, run commands)
  MUST be unchanged apart from the ref format.

## Requirements

### Requirement: PIN-CI — ci.yml uses only pinned refs

Every `uses: actions/*` step in `.github/workflows/ci.yml` MUST be a pinned
ref whose SHA equals the pin-table entry for that action and whose comment
is `# v4`.

#### Scenario: PIN-CI.1 — all seven steps pinned

- **GIVEN** the committed `ci.yml`
- **WHEN** all `uses: actions/` lines are listed
- **THEN** there are exactly 7, each matches
  `actions/<name>@<40-hex> # v4`, and each SHA equals the pin-table value
  for that action.

#### Scenario: PIN-CI.2 — versions unchanged

- **GIVEN** the committed `ci.yml`
- **WHEN** diffed against the pre-change file
- **THEN** the only changed tokens are the `@v4` → `@<sha> # v4` ref
  segments (no input, permission, concurrency, or command change).

### Requirement: PIN-SEED — seed-visual-goldens.yml uses only pinned refs

Every `uses: actions/*` step in
`.github/workflows/seed-visual-goldens.yml` MUST be a pinned ref whose SHA
equals the pin-table entry for that action and whose comment is `# v4`.

#### Scenario: PIN-SEED.1 — all four steps pinned

- **GIVEN** the committed `seed-visual-goldens.yml`
- **WHEN** all `uses: actions/` lines are listed
- **THEN** there are exactly 4, each matches
  `actions/<name>@<40-hex> # vN`, and each SHA equals the pin-table value
  for that action.

### Requirement: NOFLOAT — no floating action ref remains

No file under `.github/workflows/` MUST contain a floating
`actions/*@vN` ref (i.e. `@v` immediately followed by a version digit rather
than a hex SHA).

#### Scenario: NOFLOAT.1 — grep clean

- **GIVEN** the committed tree
- **WHEN** searching `.github/workflows/` for the pattern
  `uses: actions/[^ ]*@v[0-9]`
- **THEN** zero matches are found.

#### Scenario: NOFLOAT.2 — YAML still parses

- **GIVEN** both edited workflow files
- **WHEN** parsed with a YAML safe loader
- **THEN** both parse without error and expose the same job/step structure
  as before the change.

### Requirement: TRACE — pins are documented and R-5 is closed

The change `verification.md` MUST record each pinned SHA with its resolution
method (`git/refs/tags/v4` + commit confirmation) and date, and the
certification risk register R-5 row MUST read CLOSED with a pointer to that
evidence.

#### Scenario: TRACE.1 — verification carries the pin table

- **GIVEN** the committed `verification.md`
- **WHEN** its requirement-evidence table is read
- **THEN** all four SHAs appear with resolution method and date
  (2026-09-12), matching the workflow files byte-for-byte.

#### Scenario: TRACE.2 — R-5 closed

- **GIVEN** the committed risk register
- **WHEN** the R-5 row is read
- **THEN** it is marked CLOSED by Change 268 with a pointer to the 268
  `verification.md`, and no other row is altered.

## Error and failure behavior

- A mistyped SHA fails GitHub's action resolution at runtime; the
  authorizing gate is CI green on the exact published SHA (REQ evidence in
  `verification.md`). The change MUST NOT be marked VERIFIED while that run
  is red or unobserved.
- Stale pins (upstream `v4` advancing later) are safe-by-design: CI runs
  older known code, never unknown code. Refresh is explicitly out of scope.

## Performance and resource bounds

CI wall-clock and resource use are unchanged (the pinned code is what `v4`
resolved to on 2026-09-12).

## Compatibility and migration

No migration. Rollback is a revert of the two workflow files.

## Security and integrity

This change IS the supply-chain integrity fix: immutable refs remove tag-
mutability and tag-hijack risk for the four third-party actions, complementing
the existing `permissions: contents: read` containment (which is unchanged).

## Observability

Pin provenance (API endpoints, tip subjects/dates, SHAs) is frozen in
`verification.md` and summarized in `design.md`; drift can be re-checked with
the same two `curl` commands.

## Verification mapping

- PIN-CI → `grep` listing of `ci.yml` + `git diff` review + CI gate job green.
- PIN-SEED → `grep` listing of `seed-visual-goldens.yml` + CI presence
  (seed workflow resolves pins at dispatch; its job bodies are unchanged).
- NOFLOAT → repo-wide floating-ref grep (zero matches) + YAML safe-parse.
- TRACE → `verification.md` pin table + risk-register R-5 row text.
