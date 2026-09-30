# Proposal: 298-verification-portability-eol-and-source-guards

## Problem

The repository's own mandatory local verification gate (`npm test`, required by
`AGENTS.md` under "Baseline verification") is **red on a Windows checkout** at
the published tip. Two unit tests fail deterministically, and they fail for a
reason that has nothing to do with the product: eight test suites read
`src/engine/Game.ts` and other production files as raw text and assert on
**byte-exact substrings that embed `\n`**.

The repository has no `.gitattributes`, and the authoring/verification host has
`core.autocrlf=true`. Git therefore checks every text file out with **CRLF**
line endings in the working tree while CI (Linux) checks out **LF**. Any
assertion written against `\n` is platform-dependent by construction.

Result:

* `npm test` reports `2 failed | 5711 passed | 1 skipped (5714)` on Windows.
* CI reports green because Linux checkouts use LF.
* Every `verification.md` in changes 292–297 claims these suites pass, and they
  do — but only on the CI platform. The maintainer's own platform is permanently
  red, so the documented "run the baseline gate" step cannot be honoured locally.
* The change that introduced the last two failures (297) recorded them as passing
  evidence without noticing the platform dependency.

## Inspection findings (base `2ecf781`)

- `.gitattributes` does not exist. `git config core.autocrlf` is `true` on the
  authoring host. **2651 of the 2934** tracked `*.ts|js|mjs|json|md|html|css|yml|yaml`
  files are CRLF in the working tree; `src/engine/Game.ts` has 7381 CRLF sequences
  and **0** bare LF sequences.
- Confirmed failures (`npm test`, and reproduced in isolation with
  `npx vitest run tests/unit/LiveSplashPotion.test.ts tests/unit/LiveStatusEffectPersistence.test.ts`):
  - `tests/unit/LiveSplashPotion.test.ts` → *"Game splash potion source guards (295) > tick 5.10 steps potions after the raid and patrol ticks"* — `AssertionError: expected -1 to be greater than -1`.
    The test does `game.indexOf('    this.tickRaidFeedback();\n    // 5.8')`; the search returns `-1` because the file contains `...;\r\n    // 5.8`.
  - `tests/unit/LiveStatusEffectPersistence.test.ts` → *"Game source guards (292) > fixed tick counts the omen down beside the status-effect tick"* —
    `AssertionError: expected 'import * as THREE from \'three\';\r\n…' to match /this\.playerEffects\.tick\(dt\);\n\s*\/\/ 292[^\n]*\n\s*this\.tickBadOmenDuration\(dt\);/`.
- Eight suites read production source as text. Of those, **seven assertions carry
  CRLF-fragile anchors** (15 `\n` occurrences) inside match/contain/indexOf calls:

  | Test file | Line | Fragile anchor | Status |
  |---|---|---|---|
  | `tests/unit/LiveSplashPotion.test.ts` | 243 | `indexOf('    this.tickRaidFeedback();\n    // 5.8')` | **fails** |
  | `tests/unit/LiveSplashPotion.test.ts` | 244 | `indexOf('    this.tickPillagerPatrol();\n    // 5.10')` | **fails** |
  | `tests/unit/LiveSplashPotion.test.ts` | 245 | `indexOf('    this.tickSplashPotions();\n\n    // 6. Survival')` | **fails** |
  | `tests/unit/LiveStatusEffectPersistence.test.ts` | 374 | `toMatch(/...tick(dt);\n...// 292...\n...this.tickBadOmenDuration(dt);/)` | **fails** |
  | `tests/unit/LivePeriodicStatusEffects.test.ts` | 242 | `src.indexOf('\n  }\n', start)` | latent |
  | `tests/unit/RaiderRenderer.test.ts` | 314 | `render.indexOf('\n  }\n')` | latent |
  | `tests/unit/SplashPotionRenderer.test.ts` | 118 | `render.indexOf('\n  }\n')` | latent |

  Two distinct patterns are present. The four failing anchors couple a call to
  the **comment that follows it** (`// 5.8`, `// 5.10`, `// 6. Survival`,
  `// 292`), so they break on a comment edit as well as on line endings. The
  three latent anchors extract a method body by searching for `\n  }\n`,
  which cannot match under CRLF either; they happen not to fail today only
  because the resulting over-long slice still satisfies their assertions, so
  they will break as soon as the surrounding assertions tighten.

- Proof of the minimal fix (evaluated outside the repository, no product file
  changed): normalising the read text with `raw.replace(/\r\n/g, '\n')` makes
  **both** failing assertions pass
  (`raid=114067 > -1`, `patrol=114580 > raid`, `potions=114766 > patrol`,
  and the 292 regex returns `true`).
- The assertions are additionally coupled to **comment text**. `LiveSplashPotion`
  requires the literal markers `// 5.8`, `// 5.10` and `// 6. Survival`;
  `LiveStatusEffectPersistence` requires `// 292`. Editing a comment, renaming a
  section, or reordering two tick calls breaks a "wiring" test even though the
  behaviour is unchanged. These are formatting assertions masquerading as
  behavioural verification.

## Goals

1. Make the unit suite **platform-independent**: no assertion may depend on the
   working tree's line-ending convention.
2. Add a `.gitattributes` so text normalisation is declared in-repository rather
   than inherited from each contributor's local `core.autocrlf`.
3. Make the source-guard suites assert on **structure** (identifier presence and
   relative order) instead of on byte-exact multi-line source text.
4. Prove the fix on both line-ending conventions (LF and CRLF) so a regression is
   impossible on either platform.

## Non-goals

- No change to any product runtime behaviour, gameplay, rendering, persistence
  or public API.
- No refactor of `src/engine/Game.ts` itself (see the rejected alternatives).
- No new capability coverage, no new test targets, no coverage-threshold change.
- No visual-golden, dependency, CI-job, or performance-gate work — those are
  tracked by changes 299, 300, 301 and 302.
- No `.editorconfig` reformat of the existing tree.

## Preconditions

- Change 297 is VERIFIED and published (satisfied at base `2ecf781`).
- The working tree is clean and `origin/main` is the review boundary.

## Dependencies

- None. This is the first change of the audit-authored sequence and unblocks
  trustworthy local verification for every later change.
- 299–302 all assume a green local unit gate; 298 restores that precondition.

## Proposed change

### 1. Declare line-ending normalisation in the repository

Add `.gitattributes` pinning the conventions that already hold in the working
tree, so a checkout is byte-identical on Windows, macOS and Linux:

```gitattributes
* text=auto eol=lf
*.png binary
*.jpg binary
*.webp binary
*.ico binary
*.woff binary
*.woff2 binary
```

`* text=auto eol=lf` makes Git normalise to LF in the index and check out LF in
every working tree. This is the correct choice for a repository whose CI, its
committed goldens, and its source-text tests are all LF-oriented, and it makes
the tree *more* reproducible rather than less. The binary declarations preserve
the 12 committed golden PNGs byte-for-byte.

The CRLF files will be renormalised by a subsequent
`git add --renormalize .`; that commit is expected to show a large
line-ending-only diff and must be reviewed as such (no content change).

### 2. Normalise text at the reader seam

Introduce one shared test helper and route all eight suites through it, so the
normalisation rule exists exactly once:

```ts
// tests/support/sourceText.ts
import { readFileSync } from 'node:fs';

export function readSource(absolutePath: string): string {
  return readFileSync(absolutePath, 'utf8').replace(/\r\n/g, '\n');
}
```

Each of the eight suites replaces its local
`readFileSync(resolve(__dirname, '../../src/...'), 'utf8')` with
`readSource(resolve(__dirname, '../../src/...'))`. This alone restores a green
suite on Windows without weakening any assertion.

### 3. Decouple the assertions from comment text

The two currently failing assertions are rewritten to depend only on statement
order, never on the comment that follows it:

* `LiveSplashPotion.test.ts` — assert that `this.tickRaidFeedback()`,
  `this.tickPillagerPatrol()` and `this.tickSplashPotions()` appear exactly once
  each inside `Game`'s fixed-tick method and that their indices are strictly
  increasing, instead of anchoring on `// 5.8` / `// 5.10` / `// 6. Survival`.
  The fixed-tick method is located by signature, not by a section comment.
* `LiveStatusEffectPersistence.test.ts` — assert that
  `this.playerEffects.tick(dt);` precedes `this.tickBadOmenDuration(dt);` within
  the fixed-tick body, instead of matching a literal `// 292` comment between
  them.

The remaining 522 literal-`\n` anchors in the other six suites are converted to
single-line, identifier-only anchors (the `readSource` normalisation already
makes them line-ending safe; this step removes the comment coupling that would
otherwise still fail on an unrelated comment edit).

### 4. Prove platform independence

Add `tests/unit/SourceTextPortability.test.ts` which:

* writes a CRLF and an LF copy of a representative source file into the test
  scratch directory and asserts `readSource` returns byte-identical text for
  both;
* asserts `readSource` output contains no `\r`;
* asserts each of the eight source-guard suites' reader uses the shared helper
  (no direct `readFileSync` of a `src/` file remains in `tests/unit/`).

The suite runs under whatever line-ending convention the checkout has, so it is
self-proving on both platforms.

## Compatibility and migration

- **Product data:** none. No save file, world archive, or network payload changes.
- **Public API:** none.
- **Rendering/goldens:** none. `* text=auto eol=lf` affects text files only; the
  committed `*.png` goldens are declared binary and are not renormalised.
- **Git history:** the renormalisation commit is line-ending-only. It must be
  pushed with a normal history-preserving push and must not rewrite the already
  published `2ecf781` history (per `AGENTS.md` / `openspec/REVIEW_HANDOFF.md`).
- **Reviewer impact:** the renormalisation commit is large in line count and
  small in content. The commit message MUST state that it is line-ending-only so
  a reviewer can verify it with `git diff -w --stat` returning no content change.

## Risks

- **Renormalisation churn.** `git add --renormalize .` produces a diff that
  looks enormous. Mitigation: verify with `git diff -w --stat` and
  `git diff --ignore-all-space --numstat` before pushing; both MUST show zero
  content changes outside `.gitattributes` itself.
- **Windows contributor workflow change.** Contributors who had
  `core.autocrlf=false` will now receive LF checkouts. This is the intended
  outcome and matches CI; it is recorded in `openspec/changes/298-.../verification.md`.
- **Over-normalising binary files.** Mitigated by explicit binary declarations
  and by asserting `git diff --numstat` shows no golden PNG churn.
- **Weakened wiring coverage.** Stripping comment anchors could in principle let
  a real reordering regression slip through. Mitigation: the rewritten
  assertions anchor on method signature + identifier + relative order, which is
  strictly stronger than the comment-anchored originals, and the behavioural
  harnesses in the same files are unchanged.

## Rollback strategy

Revert the `.gitattributes` addition and the eight test edits. Because the
renormalisation commit is content-neutral, reverting it is safe at any time; a
subsequent `git add --renormalize .` restores the working tree convention.
No product rollback is required because no product file changes.

## Definition of Done

- `npm test` is green on an LF checkout **and** on a CRLF checkout, with the same
  test count.
- The two named failing tests pass and their assertions no longer contain comment
  text.
- No `tests/unit/**` file calls `readFileSync` directly on a path under `src/`.
- `.gitattributes` exists and `git check-attr text eol -- src/engine/Game.ts
  index.html tests/e2e/visual-regression.spec.ts` reports `eol: lf` for each.
- `git diff -w --stat <base>..HEAD` shows no content change other than
  `.gitattributes` and the eight test files plus the new helper/test.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run validate-state`
  and the full `npm run test:e2e` all PASS.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
`npm run validate-state` and `npm run test:e2e` must all be PASS with no new
warnings introduced. Completion target 100%; below 90% advancement is forbidden.
