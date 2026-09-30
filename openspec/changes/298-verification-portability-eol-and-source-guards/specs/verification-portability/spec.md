# Spec: verification-portability

## Contract

The repository's verification suite MUST produce the same result on every
supported checkout platform, independent of the line-ending convention that
Git produces in a given working tree. Product behaviour is out of scope for
this capability: it governs how the repository's own gates observe the code,
never what the code does.

Line-ending normalisation is declared in-repository (`.gitattributes`), not
inherited from each contributor's local Git configuration. Tests that must
observe production wiring do so through a single shared reader that normalises
line endings, and through structural assertions (identifier presence and
relative order) rather than through byte-exact multi-line source text.

## Definitions

- **Working-tree line endings**: the `\n` or `\r\n` sequences present in a file
  after checkout, determined by `.gitattributes` plus the local Git
  configuration.
- **Source-guard suite**: a unit test that reads a file under `src/` as text and
  asserts on its contents. Eight such suites exist today.
- **Structural assertion**: an assertion that depends on the presence, count and
  relative order of identifiers or statements, and is independent of whitespace,
  line endings, and comment text.
- **Anchor**: the literal substring a source-guard assertion searches for.

## Invariants

- The assertion outcome for a given logical source file MUST be identical whether
  that file is checked out with LF or CRLF endings.
- Adding, editing or deleting a **comment** in a source file that a source-guard
  suite reads MUST NOT, by itself, change any source-guard assertion outcome.
- `.gitattributes` MUST preserve committed binary artifacts (golden PNGs) byte for
  byte.
- No product source file's runtime behaviour changes under this capability.
- Exactly one shared reader helper exists; no suite re-implements its own
  normalisation.

## ADDED Requirements

### Requirement: Repository-declared line-ending normalisation

The repository MUST contain a `.gitattributes` that declares line-ending
normalisation for text files such that a fresh checkout of the same commit
produces byte-identical text files on Linux, macOS and Windows. Text files MUST
be checked out with LF endings. Binary file types — at minimum `*.png`, `*.jpg`,
`*.webp`, `*.ico`, `*.woff`, `*.woff2` — MUST be declared binary so that Git
never transforms their bytes.

#### Scenario: Text files are LF in every checkout

- **GIVEN** a fresh clone of the repository on a host whose local Git
  configuration uses `core.autocrlf=true`
- **WHEN** `git check-attr text eol -- src/engine/Game.ts index.html` is executed
- **THEN** both paths report `eol: lf`
- **AND** the working-tree copy of `src/engine/Game.ts` contains no `\r\n`
  sequence

#### Scenario: Committed goldens are not transformed

- **GIVEN** the committed visual golden PNGs under `tests/visual-golden/`
- **WHEN** the renormalisation commit is created
- **THEN** `git diff --numstat` reports no change for any `*.png` path
- **AND** every golden PNG's blob hash is unchanged from its parent commit

#### Scenario: Renormalisation is content-neutral

- **GIVEN** the renormalisation commit produced by `git add --renormalize .`
- **WHEN** `git diff -w --stat <base>..HEAD` is executed
- **THEN** no file other than `.gitattributes` and the test files named by this
  change appears as modified
- **AND** the commit message states that the change is line-ending-only

### Requirement: Shared source-text reader normalises line endings

The test suite MUST provide exactly one shared helper that reads a file as UTF-8
text and normalises CRLF to LF before returning it. Every suite that reads a
production file as text MUST use that helper. No test file may call the
filesystem reader directly on a path under `src/`.

The helper MUST preserve all other bytes exactly; it MUST NOT trim, collapse
whitespace, or otherwise alter the returned text beyond the CRLF→LF
normalisation.

#### Scenario: CRLF and LF inputs normalise identically

- **WHEN** two temporary files are written with identical content, one with LF
  endings and one with CRLF endings
- **THEN** reading both through the shared helper returns byte-identical strings
- **AND** the returned string contains no carriage-return character

#### Scenario: No direct source reads remain in the unit suite

- **WHEN** the unit test tree is inspected
- **THEN** no file under `tests/unit/` invokes the filesystem reader directly on
  a path that resolves inside `src/`
- **AND** each of the eight known source-guard suites resolves its source text
  through the shared helper

### Requirement: Source-guard assertions are structural and comment-independent

A source-guard assertion MUST NOT use a multi-line anchor that embeds a newline
character, and MUST NOT require the presence of a specific comment string in
order to pass. Assertions that verify call ordering MUST locate the enclosing
method by its signature and then compare identifier positions within that
method's body.

Assertions that verify the relative order of statements within one method MUST
remain satisfied when the intervening comments are rewritten, removed, or
reordered.

#### Scenario: A comment edit does not break a wiring assertion

- **GIVEN** `src/engine/Game.ts` contains, inside its fixed-tick method, a call to
  `this.tickSplashPotions();` followed by an explanatory comment
- **WHEN** that comment's text is changed, and the file is committed with CRLF
  endings in the working tree
- **THEN** every assertion in the affected source-guard suites still passes

#### Scenario: Splash potion tick ordering is still verified

- **GIVEN** the fixed-tick method of `Game` is located by its signature
- **WHEN** the source-guard suite evaluates the raid/patrol/splash ordering
  assertion
- **THEN** it requires the call identifiers `tickRaidFeedback`, `tickPillagerPatrol`
  and `tickSplashPotions` to each appear exactly once in that body
- **AND** it requires their positions to be strictly increasing in that order
- **AND** the assertion does not reference any section comment

#### Scenario: Bad Omen countdown ordering is still verified

- **GIVEN** the fixed-tick method of `Game` is located by its signature
- **WHEN** the source-guard suite evaluates the status-effect/omen ordering
  assertion
- **THEN** it requires `playerEffects.tick` to appear before
  `tickBadOmenDuration` within that body
- **AND** the assertion does not reference any change-number comment

#### Scenario: A real reordering regression is still detected

- **GIVEN** a hypothetical source file in which the call identifiers appear in
  the wrong order
- **WHEN** the structural ordering assertion is evaluated against it
- **THEN** the assertion fails

### Requirement: The unit gate is green on both line-ending conventions

`npm test` MUST exit successfully with the same test count and the same set of
passing tests whether the working tree uses LF or CRLF endings. A failure that
is reproducible only under one line-ending convention is a release-blocking
defect, not an environment condition.

#### Scenario: Windows checkout

- **GIVEN** a checkout with CRLF working-tree line endings
- **WHEN** `npm test` is executed
- **THEN** the exit code is 0
- **AND** no test fails with a message referencing a newline or carriage-return
  mismatch

#### Scenario: Linux checkout

- **GIVEN** a checkout with LF working-tree line endings
- **WHEN** `npm test` is executed
- **THEN** the exit code is 0 and the test count equals the Windows run

#### Scenario: Portability is covered by a regression test

- **WHEN** `tests/unit/SourceTextPortability.test.ts` is executed
- **THEN** it verifies the shared helper normalises CRLF and LF inputs to
  identical text
- **AND** it verifies the helper output contains no carriage-return character
- **AND** it verifies no unit test reads a `src/` file without the helper

## Error and failure behavior

- If the shared helper cannot read a file, it MUST propagate the underlying
  filesystem error unchanged. It MUST NOT return an empty string, because an
  empty string would make structural assertions vacuously fail in a way that
  looks like a product regression.
- If a structural assertion cannot locate the enclosing method by signature, the
  assertion MUST fail with a message naming the signature it searched for. It
  MUST NOT silently succeed.
- If `.gitattributes` is missing or does not declare `eol: lf`, the portability
  regression test MUST fail. The test MUST NOT be skipped when the platform is
  Windows or when the environment is non-interactive.

## Performance and resource bounds

- The shared helper performs one extra full-string scan per read. Source files
  read by the unit suite total well under 1 MiB; the added cost is bounded by a
  single linear pass and MUST NOT measurably change the suite wall-clock budget
  (the suite's configured per-test timeout remains 120 s).
- No production runtime path is affected; the helper is test-only and MUST NOT be
  imported from `src/`.

## Compatibility and migration

- Product data, save files, world archives, and network payloads are unaffected.
- No exported API changes.
- The renormalisation commit is line-ending-only. It MUST be published with a
  normal history-preserving push and MUST NOT rewrite published history.
- Contributors whose local Git previously produced CRLF checkouts will receive LF
  checkouts. This is the intended outcome and matches CI.
- Committed binary artifacts are unaffected because they are declared binary.

## Security and integrity

- Line-ending normalisation is a supply-chain-relevant control: an
  inconsistent tree can make a source change invisible to review tooling that
  normalises or ignores whitespace. Declaring the convention in-repository makes
  review and CI see the same bytes.
- The renormalisation commit MUST be verified content-neutral before publication
  so that a whitespace-hiding change cannot be smuggled through it.

## Observability

- `git check-attr text eol -- <path>` MUST be usable to confirm the declared
  convention for any tracked text file.
- The portability regression test MUST report, on failure, the offending test
  file path and the count of direct source reads it found, so the fix is
  actionable without a full manual sweep.

## Verification mapping

| Requirement | Verification |
|---|---|
| Repository-declared normalisation | `git check-attr eol -- <paths>`; `git diff --numstat` shows no `*.png` churn; `git diff -w --stat` content-neutral check |
| Shared reader normalisation | `tests/unit/SourceTextPortability.test.ts` |
| Structural, comment-independent assertions | Rewritten assertions in `LiveSplashPotion.test.ts` and `LiveStatusEffectPersistence.test.ts`; grep proves no newline-bearing or comment-bearing anchors remain |
| Green gate on both conventions | `npm test` executed on an LF checkout and on a CRLF checkout with equal test counts |
| Regression protection | `tests/unit/SourceTextPortability.test.ts` is part of the default `tests/unit/**/*.test.ts` include glob and therefore runs in CI |
