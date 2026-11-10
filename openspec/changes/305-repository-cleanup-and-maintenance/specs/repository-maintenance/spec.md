# Spec: repository-maintenance

## Contract

The repository's stated invariants MUST be enforced by programs that can fail, and
every record that claims repository state (parity matrix, gate catalogue, program
state, file-audit manifest) MUST agree with the tree it ships in.

Maintenance MUST remove only provably unreferenced code and byte-identical
duplicates. Where a value is defined twice — once as an export and once as an
inline literal on a live path — the export MUST become the single source of truth
rather than being deleted, so the live path is bound to the named constant.

No maintenance change may alter runtime behaviour, rendering output, stored data,
thresholds, or test semantics.

## Definitions

- **Referenced symbol**: an exported declaration whose identifier appears at least
  once outside its own declaration file, anywhere in `src/`, `tests/` or
  `scripts/`.
- **Contracted symbol**: a symbol quoted verbatim in an `openspec/` design, proposal,
  task or spec artifact. Contracted symbols are preserved regardless of consumer
  count.
- **Gate**: an executable check reachable through a named npm command that exits
  non-zero when its invariant is violated.
- **Allow-listed entry point**: a source file that is legitimately importer-free
  because a non-import mechanism loads it (`index.html` script tag, `new Worker`).

## Invariants

- `npm ci` MUST remain the only supported install and MUST reproduce
  `package-lock.json` exactly (`npm run verify:deps` exit 0).
- No high or critical advisory may remain in the installed tree
  (`npm audit --audit-level=high` exit 0) and no advisory at all may affect
  production dependencies (`npm audit --omit=dev` exit 0).
- No committed golden PNG under `tests/visual-golden/**` MUST change. The durable review
  record `tests/visual-golden/acknowledgements.json` MAY gain one entry, because change
  300's staleness gate requires a written reason when a commit touches a captured
  surface path without moving a captured pixel. (Amended during implementation: the
  collection originally forbade any change under `tests/visual-golden/**`, which would
  have made the repository's own staleness gate unsatisfiable for a pixel-neutral
  deletion inside `src/rendering/`.)
- Coverage floors in `vitest.config.ts` MUST NOT be lowered.
- The unit test file count MUST NOT decrease.
- `scripts/orphan-check.mjs` MUST exit non-zero on any orphan that is not
  allow-listed.
- `PARITY_MATRIX.md` MUST contain exactly one row for each numbered change
  recorded VERIFIED in `openspec/PROGRAM_STATE.json`, and the summary counts MUST
  equal the rows actually present.

## Requirements

### Requirement: R-1 Installed toolchain carries no high-severity advisory

`package.json` MUST declare `vite` at a version whose installed copy is outside
every published `<=6.4.3` advisory range, and `vitest` plus `@vitest/coverage-v8`
MUST be at the same matching version whose installed copy is outside every
`<=4.1.11` advisory range. The lockfile MUST be regenerated from a clean
`npm ci`, and no other dependency MAY cross a major version.

#### Scenario: high-severity gate passes on a clean install
- **GIVEN** a clean checkout with `npm ci`
- **WHEN** `npm audit --audit-level=high` runs
- **THEN** it exits 0 and reports no high or critical advisory
- **AND** `npm audit --omit=dev` exits 0

#### Scenario: the locked versions agree with the installed tree
- **GIVEN** the updated `package.json` and `package-lock.json`
- **WHEN** `npm run verify:deps` runs
- **THEN** it exits 0 reporting the verified package count
- **AND** the installed `vite`, `vitest` and `@vitest/coverage-v8` versions equal
  the locked versions

#### Scenario: behaviour and thresholds are unchanged
- **GIVEN** the upgraded toolchain
- **WHEN** `npm test`, `npm run test:coverage` and `npm run test:e2e` run
- **THEN** the unit count is at least the pre-change count with zero failures
- **AND** all four coverage thresholds (91/88/94/93) pass
- **AND** the browser suite passes and no golden PNG changed
  (`git status --porcelain tests/visual-golden/` reports no `*.png`)

### Requirement: R-2 Unreferenced non-contracted exports are removed

Every exported runtime symbol listed in `design.md` § "Dead exports" that is both
unreferenced (Definitions) and uncontracted MUST be removed from `src/`. Removing
them MUST NOT change any executed statement, and `tsc --noEmit` MUST stay clean.

#### Scenario: the dead export set is gone
- **GIVEN** the post-change tree
- **WHEN** the whole-repository census is re-run over `src/`, `tests/` and `scripts/`
- **THEN** no removed identifier occurs as code (declaration or reference) in any
  `.ts`/`.mjs` file under those roots — prose records such as the visual-golden
  acknowledgement and the change's own design/verification files may still *name*
  the removed symbols, because naming a deletion is its evidence
- **AND** `npm run typecheck` exits 0

#### Scenario: contracted symbols are preserved
- **GIVEN** a symbol that is unreferenced but quoted in an `openspec/` artifact
- **WHEN** the removal set is computed
- **THEN** that symbol is excluded from the removal set
- **AND** `git grep` still finds it in `src/`

### Requirement: R-3 A named constant with a live inline twin becomes authoritative

Where `design.md` records an export duplicated by an inline literal on a live path
(`WITHER_MAX_SKULLS` vs `Game.ts`'s local cap, `WITHER_RECORD_VERSION` vs the
`v: 1` literals, `isWitherArmored` vs `damageWither`'s inline predicate), the live
path MUST consume the exported definition instead of restating it.

#### Scenario: the skull cap has one definition
- **GIVEN** the post-change `src/engine/Game.ts`
- **WHEN** the wither skull cap is inspected
- **THEN** no local `WITHER_SKULL_CAP` constant exists
- **AND** the cap expression imports `WITHER_MAX_SKULLS` from `WitherBoss`

#### Scenario: the record version has one definition
- **GIVEN** the post-change `SerializedWither` and `serializeWither`
- **WHEN** the serialized version fields are inspected
- **THEN** both are typed and written as `WITHER_RECORD_VERSION`
- **AND** the serialized value remains the number `1` so persisted records still parse

#### Scenario: armour immunity reuses the exported predicate
- **GIVEN** the post-change `damageWither`
- **WHEN** a projectile hits an armoured wither
- **THEN** the immunity decision calls `isWitherArmored`
- **AND** the existing phase/threshold scenarios stay green

### Requirement: R-4 Duplicated helpers collapse to one implementation

`promisifyRequest`, `isFinitePosition`, `isValidRelativePath` and the disconnected
gamepad frame MUST each exist exactly once in `src/`, exported from one module and
imported by every former copy site. The consolidated body MUST be byte-identical to
the duplicated bodies it replaces.

#### Scenario: one IndexedDB request adapter
- **GIVEN** the post-change `src/storage/`
- **WHEN** `promisifyRequest` and `awaitRequest` declarations are counted
- **THEN** exactly one declaration exists, exported from `WorldMetadataRepository`
- **AND** the save-recovery, archive-reset and repository suites stay green

#### Scenario: one finite-position guard
- **GIVEN** the post-change movement modules
- **WHEN** `isFinitePosition` declarations are counted across `src/`
- **THEN** exactly one declaration exists in the shared guard module
- **AND** `MovementAuthority` and `MovementReconciler` still reject null, non-object
  and non-finite payloads identically to before

#### Scenario: one pack-relative-path validator
- **GIVEN** the post-change manifest modules
- **WHEN** `isValidRelativePath` declarations are counted across `src/`
- **THEN** exactly one declaration exists
- **AND** both data-pack and resource-pack validation still reject absolute paths,
  empty segments and `..`/`.` segments

#### Scenario: one disconnected gamepad frame
- **GIVEN** the post-change input modules
- **WHEN** the empty/disconnected gamepad frame factory is counted across `src/`
- **THEN** exactly one exported factory exists
- **AND** a disconnected pad still yields `connected: false` with zeroed axes and
  no held actions

### Requirement: R-5 Duplicate and obsolete repository artifacts are removed

Exactly one on-disk copy of change 256 MUST exist (the archived one), and no
Playwright config may exist that no npm script, workflow or test consumes.

#### Scenario: one copy of change 256
- **GIVEN** the post-change tree
- **WHEN** `ls openspec/changes | grep 256` and
  `ls openspec/changes/archive | grep 256` run
- **THEN** the live (non-archive) directory is absent
- **AND** the archived copy is intact with all five artifacts plus its spec

#### Scenario: no dead Playwright config
- **GIVEN** the post-change tree
- **WHEN** every tracked `playwright*.config.ts` is checked for consumers in
  `package.json`, `.github/workflows` and `tests/`
- **THEN** every remaining config has at least one consumer
- **AND** `npm run test:e2e` still runs with `playwright.config.ts`

### Requirement: R-6 The unreferenced-source gate fails closed

`scripts/orphan-check.mjs` MUST define a reviewed allow-list containing exactly the
entry points recorded in `design.md`, MUST compute orphans from the tracked source
graph, and MUST exit 1 when any orphan is not allow-listed. `verify:orphans` MUST
therefore be a real gate.

#### Scenario: the real tree passes
- **GIVEN** the current reviewed tree
- **WHEN** `npm run verify:orphans` runs
- **THEN** it exits 0
- **AND** it reports the three allow-listed entry points

#### Scenario: a synthetic orphan fails
- **GIVEN** a temporary root containing one allow-listed entry point and one extra
  importer-free source file
- **WHEN** `scripts/orphan-check.mjs` runs against that root
- **THEN** it exits 1 naming the extra file

#### Scenario: the allow-list is pinned by a test
- **GIVEN** `tests/unit/`
- **WHEN** the gate-wiring suite runs
- **THEN** it asserts the script's allow-list contents and both exit paths

### Requirement: R-7 The parity record matches program state

`PARITY_MATRIX.md` MUST contain exactly one row per numbered change that
`openspec/PROGRAM_STATE.json` records VERIFIED, including the seven changes
298–304, and its summary counts MUST equal the rows present. C258 MUST remain
`deferred` and MUST NOT be relabelled VERIFIED.

#### Scenario: the seven newest changes are recorded
- **GIVEN** the post-change `PARITY_MATRIX.md`
- **WHEN** rows C298 through C304 are read
- **THEN** each exists exactly once, cites its change's `verification.md` as
  evidence, and is marked VERIFIED

#### Scenario: summary counts agree with the rows
- **GIVEN** the post-change summary table
- **WHEN** `npm run validate-state` runs its parity cross-check
- **THEN** it exits 0
- **AND** the declared `Total rows` equals the number of `C` + `MP` rows

#### Scenario: the blocker stays a blocker
- **GIVEN** the post-change matrix
- **WHEN** C258 is read
- **THEN** its status is `deferred` with the headed-WebGL blocker cited
- **AND** no headed GPU evidence is claimed anywhere

### Requirement: R-8 The gate catalogue and provider record match the locked tree

`ONBOARDING.md`'s coverage-provider clause MUST name the version actually locked
after this change, and the orphan-gate row MUST describe the enforced behaviour
rather than an aspirational one. `vitest.config.ts` MUST NOT retain a stale note
that contradicts the measured state.

#### Scenario: the provider version matches the lockfile
- **GIVEN** the post-change `ONBOARDING.md` and `package-lock.json`
- **WHEN** the quoted `@vitest/coverage-v8` version is compared with the locked one
- **THEN** they are equal

#### Scenario: the gate catalogue describes enforced behaviour
- **GIVEN** the post-change `ONBOARDING.md` §7
- **WHEN** gate 8's description is compared with `scripts/orphan-check.mjs`
- **THEN** the documented allow-list and failure behaviour match the implementation

### Requirement: R-9 The audit manifest is a bijection with the tracked tree

The reviewed file-audit manifest MUST satisfy `npm run verify:file-audit` on the
published tree: exactly one row per tracked file, no pending rows, and a non-empty
review record for every added or re-reviewed path.

#### Scenario: manifest bijection holds
- **GIVEN** the post-change tracked file list
- **WHEN** `npm run verify:file-audit` runs
- **THEN** it exits 0
- **AND** the reported row count equals `git ls-files | wc -l`

### Requirement: R-10 Programme state, tasks and evidence stay synchronized

`openspec/PROGRAM_STATE.json` and `.md` MUST record this change with a coherent
status, the session start and published SHAs, and the actual gate results;
`tasks.md` checkboxes MUST match executed work; `verification.md` MUST carry measured
evidence rather than claims.

#### Scenario: state validation passes
- **GIVEN** the post-change state files
- **WHEN** `npm run validate-state` runs
- **THEN** it exits 0
- **AND** the JSON and Markdown agree on current, last-completed and next change

#### Scenario: no evidence is fabricated
- **GIVEN** `verification.md`
- **WHEN** each recorded command result is compared with an archived log or a
  re-run
- **THEN** every result matches an actual execution
- **AND** any skipped or unavailable check is named as such

## Error and failure behavior

- A deleted symbol that is still needed fails `npm run typecheck` with
  "Cannot find name", which blocks the gate.
- A new importer-free source file fails `npm run verify:orphans` with the file name.
- An advisory crossing high fails `npm audit --audit-level=high` in CI.
- A tracked file missing from or extra in the manifest fails
  `npm run verify:file-audit` naming the path.
- A parity row that contradicts program state fails `npm run validate-state`.

## Performance and resource bounds

Removing dead exports and duplicate helpers cannot increase any measured runtime
metric: no hot path gains a call, no bundle gains bytes. The consolidated helpers
keep identical bodies, so per-request allocation is unchanged. `npm run build`
bundle size MUST be compared before and after to confirm no regression.

## Compatibility and migration

No stored data changes. `SerializedWither.v` keeps the literal value `1`. The
consolidated IndexedDB adapter preserves the exact rejection semantics
(`req.error` when it is an `Error`, otherwise `new Error('IndexedDB request failed')`).
The package is `"private": true`, so removing unused exports cannot break an
external consumer.

## Security and integrity

The toolchain upgrade removes five published `vite` advisories including
command-injection and path-bypass classes affecting the dev server, and the two
`@vitest/mocker` injection advisories. Removing the `isProtectedWrapped`
`as unknown as { isProtected?: ... }` escape eliminates a type hole that could have
hidden a runtime contract violation. No credential, secret or environment file is
touched.

## Observability

`verify:orphans` prints the allow-list and the unexpected set separately so a failure
names the file. `verify:file-audit` prints the row count. `npm audit` output names
each advisory and its dependency chain.

## Verification mapping

| Requirement | Evidence |
|---|---|
| R-1 | `npm audit --audit-level=high`, `npm audit --omit=dev`, `npm run verify:deps`, installed-vs-locked version echo, `npm test`, `npm run test:coverage`, `git diff --numstat -- tests/visual-golden/` |
| R-2 | whole-repository census script output before/after (`design.md` § "Dead exports" enumerates the removal set, including the two `RenderLayer.ts` symbols found during implementation), `npm run typecheck`, `git grep` of each removed identifier |
| R-3 | `git grep` of each constant, `npm test` (WitherBoss/WitherSkull/Game suites), wither save/load E2E |
| R-4 | declaration-count greps, storage suite results, movement suite results, manifest suite results, input suite results |
| R-5 | `ls`/`diff` of the change-256 directories, tracked-config consumer census, `npm run test:e2e` |
| R-6 | `npm run verify:orphans` (exit 0 on real tree), synthetic-orphan run (exit 1), gate-wiring unit test |
| R-7 | `npm run validate-state` parity cross-check, row reads of C298–C304, C258 status read |
| R-8 | version comparison in `ONBOARDING.md`, gate-8 description comparison |
| R-9 | `npm run verify:file-audit`, row count vs `git ls-files` |
| R-10 | `npm run validate-state`, `verification.md` vs archived logs |
