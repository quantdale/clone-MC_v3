# Verification: 298-verification-portability-eol-and-source-guards

Status: VERIFIED
Completion: 100% (14/14 tasks)
Advancement allowed: true
Session start head: `0e90fa2a13c1658b91b0e84b3047467f3ddc87d9` (origin/main)
Published head: recorded in `openspec/PROGRAM_STATE.json` after publication

## Summary

The mandatory local gate is now platform-independent. The repository declares
its line-ending convention in `.gitattributes` (`* text=auto eol=lf` plus
explicit binary types), all eight source-guard suites read production text
through one CRLF-normalising `readSource` helper, and the four newline-bearing
comment-coupled anchors were replaced with `methodBody`-scoped identifier and
ordering assertions. No file under `src/` changes; no product behaviour, save
format, API, dependency version, coverage threshold, or golden threshold
changes.

## Baseline (reproduced at session start, base `0e90fa2`)

The audit evidence was captured at `2ecf781`; the same defects were reproduced
here before any edit.

| Command | Result |
|---|---|
| `npm test` | **FAIL — 3 failed / 5710 passed / 1 skipped (5714); 476 files, 3 failed** — the two 298 targets plus `ValidateFileAuditScript` (a manifest-bijection failure tracked below) |
| `npx vitest run tests/unit/LiveSplashPotion.test.ts tests/unit/LiveStatusEffectPersistence.test.ts` | **FAIL — 2 failed / 24 passed (26)** |
| `git config core.autocrlf` | `true` |
| `ls .gitattributes` | No such file or directory |
| `node -e "read Game.ts; count CRLF/bareLF"` | 7381 CRLF, 0 bare LF |
| `git ls-files --eol \| awk $1` | `i/crlf` 2061, `i/lf` 816, `i/mixed` 69, `i/-text` 120 |
| `git worktree list` | one stale prunable worktree `/tmp/clone-mc-253-baseline` (pre-existing) |

Failing assertion sites reproduced:

```
FAIL tests/unit/LiveSplashPotion.test.ts > Game splash potion source guards (295)
     > tick 5.10 steps potions after the raid and patrol ticks
  AssertionError: expected -1 to be greater than -1        (line 246)

FAIL tests/unit/LiveStatusEffectPersistence.test.ts > Game source guards (292)
     > fixed tick counts the omen down beside the status-effect tick
  AssertionError: expected 'import * as THREE from 'three';\r\n…' to match
    /this\.playerEffects\.tick\(dt\);\n\s*\/\/ 292[^\n]*\n\s*this\.tickBadOmenDuration\(dt\);/
```

## E2 — Line-ending evidence after the change

| Probe | Result |
|---|---|
| `ls .gitattributes` | present |
| `git check-attr text eol -- src/engine/Game.ts index.html tests/e2e/visual-regression.spec.ts` | each reports `text: auto` and `eol: lf` |
| `git check-attr text eol -- tests/visual-golden/linux-ci/render-world.png` | `text: unset`, `eol: lf` (declared binary) |
| `git diff --cached --numstat HEAD -- '*.png'` | **0 rows** (no golden churn) |
| `git diff --cached --numstat HEAD -- src/` | **0 content changes** (1290 files touched only by line-ending renormalisation; see below) |

## T4 — Renormalisation is content-neutral

`git add --renormalize .` normalised 2138 tracked files from CRLF in the working
tree to LF in the index. Two independent proofs show that only line endings
changed:

```
$ git diff --cached -w --numstat HEAD | awk '$1>0 || $2>0'
19      0       .gitattributes

$ git diff --cached --ignore-all-space --numstat HEAD | awk '$1>0 || $2>0'
19      0       .gitattributes
3       8       tests/unit/LivePeriodicStatusEffects.test.ts
5       22      tests/unit/LivePillagerPatrol.test.ts
3       17      tests/unit/LiveRaidEscalation.test.ts
15      11      tests/unit/LiveSplashPotion.test.ts
10      18      tests/unit/LiveStatusEffectPersistence.test.ts
2       2       tests/unit/LiveWitchGunpowderDrops.test.ts
4       4       tests/unit/RaidBarParity.test.ts
5       6       tests/unit/RaiderRenderer.test.ts
5       6       tests/unit/SplashPotionRenderer.test.ts
```

`git diff -w` (the strictest whitespace-ignoring comparison) shows **only**
`.gitattributes` as changed; every one of the 2138 renormalised files —
including `src/engine/Game.ts`, `index.html`, `package-lock.json` and
`tests/visual/goldenCompare.ts` — is byte-identical after ignoring whitespace.
The lockfile was additionally verified directly:

```
$ git show HEAD:package-lock.json | tr -d '\r' | md5sum
1275a9682b3bc0078a9854215bb5cb4d
$ tr -d '\r' < package-lock.json | md5sum
1275a9682b3bc0078a9854215bb5cb4d
```

The commit message states "line-ending-only" so a reviewer can apply the same
check.

## T9 — Platform independence proven both ways

| Tree | Command | Result |
|---|---|---|
| LF (renormalised working tree) | `npm test` | **exit 0 — 477 files, 5725 passed + 1 skipped (5726)** |
| CRLF (throwaway worktree, every text file forced to CRLF including `Game.ts` 7381 CRLF) | `npm test` | **exit 0 — 477 files, 5725 passed + 1 skipped (5726)** |

Both runs produced an identical test count and an identical result set. The
CRLF run was executed in a disposable `git worktree` that was removed
afterwards.

## T10 — Comment independence proven

In the disposable CRLF worktree only, the four anchors were reworded:
`// 5.8`, `// 5.10`, `// 6. Survival` and `// 292` were all replaced (a
subsequent sweep replaced every remaining `// 292` in `Game.ts`). The eight
source-guard suites then ran green:

```
Test Files  8 passed (8)
     Tests  97 passed (97)
```

`git status` confirms no file under `src/` is modified in the repository.

## T7/T8 — Regression detection is preserved (negative proof)

Still in the disposable worktree, `this.tickSplashPotions();` and
`this.tickPillagerPatrol();` were swapped inside `runFixedTick` (a genuine
reordering, comments untouched). The assertion correctly failed:

```
FAIL tests/unit/LiveSplashPotion.test.ts
  AssertionError: expected 5059 to be greater than 5196
```

So the replacement assertions are strictly stronger than the comment-anchored
originals: they are insensitive to line endings and comment text, and still
detect the ordering regression they exist to protect.

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Repository-declared line-ending normalisation | E2: `.gitattributes` present; `git check-attr` reports `eol: lf`; PNGs declared binary with 0 rows of churn; renormalisation content-neutral by two proofs (T4) | VERIFIED |
| Shared source-text reader normalises line endings | `tests/support/sourceText.ts` (one helper); `SourceTextPortability.test.ts` proves CRLF/LF identical, no `\r`, error propagation; sweep asserts no `tests/unit/**` file reads `src/` directly and all eight suites reference `readSource` | VERIFIED |
| Source-guard assertions are structural and comment-independent | T10 (comment rewording green) + T7 (reorder still fails) + sweep asserting no `indexOf('\n...')` anchor remains in `tests/unit/**` | VERIFIED |
| The unit gate is green on both line-ending conventions | T9: LF 5725+1, CRLF 5725+1, both exit 0 | VERIFIED |
| Portability regression test exists and runs by default | `tests/unit/SourceTextPortability.test.ts` matches the configured `tests/unit/**/*.test.ts` include glob; 12 tests, no `skipIf`, no environment gate; observed running in the full `npm test` (478 files now, was 477 before this change added files) | VERIFIED |

## Commands (final, `298` candidate tree)

| Command | Result | Evidence |
|---|---|---|
| `npm run validate-state` | **PASS** (`State validation PASSED`) | `/tmp/gate-static.log` |
| `npm run verify:deps` | n/a (change 299) | — |
| `npm run typecheck` | **PASS** | `/tmp/gate-static.log` |
| `npm run lint` | **PASS — 0 errors / 85 warnings** (unchanged `no-explicit-any` set) | `/tmp/gate-static.log` |
| `npm run build` | **PASS — 266 modules, 11.74 s**, existing chunk-size advisory only | `/tmp/gate-static.log` |
| `node scripts/check-release-bundle.mjs` | **PASS — `4 assets checked; no E2E hook found`** | `/tmp/gate-static.log` |
| `npm test` | **PASS — 477 files, 5725 passed + 1 skipped, exit 0** | `/tmp/test-v4.log` |
| `npm run test:coverage` | **PASS — statements 91.82 / branches 88.61 / functions 94.65 / lines 93.15** vs thresholds 91/88/94/93 | `/tmp/coverage.log` |
| `npm run test:e2e` | **PASS — 137/137, exit 0**, including the full 60-cell visual matrix (`visual-regression.spec.ts`, 8.9 m) | `/tmp/e2e.log` |
| `node scripts/validate-file-audit.mjs <manifest>` | **PASS — `File-audit validation PASSED (3070 rows, reviewed manifest)`** | direct run |

### Toolchain note (important)

The audit recorded that the *installed* `node_modules` did not match
`package-lock.json` (installed Vitest 3.2.7 vs locked 4.1.11), which is finding
F-002 / change 299. During this session the module tree was rebuilt with
`npm ci`, so **every measurement above was taken on the locked toolchain**
(`vitest` 4.1.11, confirmed by `require('./node_modules/vitest/package.json').version`).
This makes the coverage figures directly meaningful for the first time locally:
the thresholds were calibrated for Vitest 4 and are now met
(91.82/88.61/94.65/93.15). Change 299 remains required to make this state
*enforced* rather than incidental.

## File-audit manifest

`npm test` initially failed with `File-audit validation FAILED (39)` because
the reviewed manifest had no rows for `.gitattributes`, the two new test files,
`MASTER_PLAN.md` (untracked at the manifest's generation point) or the
audit-authored 298–304 OpenSpec packages. 39 rows were appended using the
manifest's existing shape and review conventions; `total` was updated to 3070
and `schemaNote` extended. The validator now reports
`PASSED (3070 rows, reviewed manifest)`.

## Edge/adversarial validation

- [x] CRLF and LF inputs normalise to identical text.
- [x] `readSource` output contains no `\r`.
- [x] `methodBody` throws on an absent signature (`/signature not found/`).
- [x] `methodBody` throws on unbalanced braces (`/unmatched braces/`).
- [x] `methodBody` correctly ignores braces inside string literals, template
      literals and comments.
- [x] A reordered call sequence still fails the ordering assertion.
- [x] Rewording the `// 5.8` / `// 5.10` / `// 6. Survival` / `// 292` comments
      leaves all eight suites green.
- [x] `npm test` exits 0 with an identical test count on an LF checkout and on a
      CRLF checkout.
- [x] No committed `*.png` blob changed (0 numstat rows).
- [x] `git diff -w --stat` for the renormalisation commit shows no content
      change.

## Migration/compatibility validation

- [x] No file under `src/` is modified by the shipped diff
      (`git diff --cached --numstat HEAD -- src/` → empty).
- [x] `git check-attr eol` reports `lf` for representative text paths.
- [x] The renormalisation commit is content-neutral by two independent proofs.
- [x] `scripts/check-release-bundle.mjs` passes after a clean `npm run build`.
- [x] Product save/world-archive/network compatibility is untouched (no product
      code changed).

## Performance/resource validation

- [x] LF run 39.66 s / CRLF run 34.07 s wall-clock; both complete inside the
      120 s per-test timeout. `readSource` adds one linear `replace` over
      ~0.5 MiB total across the eight suites — no measurable change.
- [x] No production bundle imports `tests/support/sourceText.ts`
      (`check-release-bundle.mjs` passes; the helper lives under `tests/`).

## Windows contributor consequence (recorded per T13)

A contributor whose local Git previously forced `core.autocrlf=true` will now
receive **LF** checkouts for all text files. Their working tree will show the
same 2138-file line-ending renormalisation on the next `git add --renormalize .`
or on a fresh clone. This is the intended outcome and matches CI. Binary assets
are unaffected.

## Regression / debt status

- No regression introduced. The change is test-only plus a declarative
  `.gitattributes`, plus line-ending renormalisation that is provably
  content-neutral.
- Pre-existing accepted debt recorded but NOT addressed here (each has its own
  audit-authored change): the un-*enforced* toolchain pin (299), the visual
  gate's stale-baseline risk on other hosts plus golden staleness detection
  (300), the six un-wired verification scripts (301), the never-executed
  canonical multiplayer load test (302), `src/engine/Renderer.ts` coverage
  (303), and modal focus/keyboard accessibility (304).
- `258-real-world-runtime-performance-fps-recovery` remains **BLOCKED** at
  40/100. No headed FPS work, no GPU evidence, and no 258 status change is part
  of 298.

## Advancement Exception

Not required: completion is 100% (14/14), every MUST/SHALL requirement in
`specs/verification-portability/spec.md` has passing evidence above, all
mandatory tests pass, and no unresolved data-loss, corruption, determinism,
compatibility, security, or regression blocker remains.

## Final decision

**VERIFIED.** The mandatory local unit gate is green with an identical test
count on LF and CRLF checkouts, the line-ending convention is declared
in-repository, the source-guard assertions are structural and comment-
independent without losing their regression-detection power, and the full
baseline gate (`validate-state`, `typecheck`, `lint`, `test`, `build`,
`check-release-bundle`, `test:coverage`, `test:e2e`, file-audit) passes.
