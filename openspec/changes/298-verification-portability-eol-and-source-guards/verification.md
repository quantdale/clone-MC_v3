# Verification: 298-verification-portability-eol-and-source-guards

Status: NOT VERIFIED
Completion: 0% (T1 and T2 are pre-implementation evidence only; T3–T14 are open)
Advancement allowed: false

This change was authored by an audit campaign that is **forbidden from
implementing product code**. T1/T2 below record the failing-first evidence the
implementing agent must reproduce; every other task is unimplemented. No passing
evidence may be pre-filled.

## Pre-implementation evidence captured at base `2ecf781`

### E1 — Baseline diagnostics at the published tip

| Command | Result |
|---|---|
| `npm run typecheck` | PASS (no output, exit 0) |
| `npm run lint` | 0 errors / 85 warnings (pre-existing `no-explicit-any`) |
| `npm run validate-state` | PASSED |
| `node scripts/validate-file-audit.mjs openspec/hardening/2026-08-23-exhaustive-repository-certification/file-audit-manifest.json` | PASSED (3031 rows, sha `3d0fd2d5aee39ae1706b7210ad27e675450f521c`) |
| `npm test` | **FAIL — 2 failed / 5711 passed / 1 skipped (5714); 2 test files failed of 476; 57.95 s** |

Note: installed `vitest` is **3.2.7** while `package-lock.json` pins
**4.1.11** (tracked separately by change 299). `npm run test:coverage` is
therefore not a meaningful measurement on this host and was deliberately not
run for this change; CI remains authoritative for the coverage gate.

### E2 — Line-ending evidence

| Probe | Result |
|---|---|
| `ls .gitattributes` | No such file or directory |
| `git config core.autocrlf` | `true` |
| `file src/engine/Game.ts` | `... with CRLF line terminators` |
| CRLF count in `src/engine/Game.ts` | 7381 |
| bare-LF count in `src/engine/Game.ts` | 0 |
| tracked text files CRLF in working tree | 2651 of 2934 |

### E3 — The two failures (reproduced in isolation)

```
$ npx vitest run tests/unit/LiveSplashPotion.test.ts tests/unit/LiveStatusEffectPersistence.test.ts

× Game splash potion source guards (295) > tick 5.10 steps potions after the raid and patrol ticks
  → AssertionError: expected -1 to be greater than -1

× Game source guards (292) > fixed tick counts the omen down beside the status-effect tick
  → AssertionError: expected 'import * as THREE from 'three';\r\n…' to match
    /this\.playerEffects\.tick\(dt\);\n\s*\/\/ 292[^\n]*\n\s*this\.tickBadOmenDuration\(dt\);/
```

Failing assertion sites:

- `tests/unit/LiveSplashPotion.test.ts:243-248` — anchors on
  `'    this.tickRaidFeedback();\n    // 5.8'` (line 243),
  `'    this.tickPillagerPatrol();\n    // 5.10'` (244),
  `'    this.tickSplashPotions();\n\n    // 6. Survival'` (245).
- `tests/unit/LiveStatusEffectPersistence.test.ts:374` — single regex embedding
  `\n` twice plus the literal comment marker `// 292`.

Reader sites and anchor counts across the eight affected suites:

| Test file | Reader line(s) | `\n`-bearing string literals |
|---|---|---|
| `tests/unit/RaiderRenderer.test.ts` | 298–299 | 94 |
| `tests/unit/LiveSplashPotion.test.ts` | 233–235 | 81 |
| `tests/unit/LiveStatusEffectPersistence.test.ts` | 287 | 74 |
| `tests/unit/LiveRaidEscalation.test.ts` | 275 | 70 |
| `tests/unit/LivePeriodicStatusEffects.test.ts` | 238 | 62 |
| `tests/unit/LivePillagerPatrol.test.ts` | 206 | 49 |
| `tests/unit/LiveWitchGunpowderDrops.test.ts` | 216 | 49 |
| `tests/unit/SplashPotionRenderer.test.ts` | 102–103 | 45 |

### E4 — Proof of concept (evaluated outside the repository)

```
$ node -e "const raw=fs.readFileSync('src/engine/Game.ts','utf8');
           const src=raw.replace(/\r\n/g,'\n');
           const raid=src.indexOf('    this.tickRaidFeedback();\n    // 5.8');
           const patrol=src.indexOf('    this.tickPillagerPatrol();\n    // 5.10');
           const potions=src.indexOf('    this.tickSplashPotions();\n\n    // 6. Survival');
           console.log(raid,patrol,potions);"
114067 114580 114766
292 regex: true
```

Both failing assertions pass after a single CRLF→LF normalisation. The defect is
line-ending-only; no assertion needs to be relaxed, only re-anchored.

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Repository-declared line-ending normalisation | E2 shows the precondition failure. T3/T4 unimplemented. | NOT VERIFIED |
| Shared source-text reader normalises line endings | E1/E3 show 8 suites reading `src/` directly. T5/T8 unimplemented. | NOT VERIFIED |
| Source-guard assertions are structural and comment-independent | E3 shows comment-coupled anchors at `LiveSplashPotion.test.ts:243-245` and `LiveStatusEffectPersistence.test.ts:374`. T7 unimplemented. | NOT VERIFIED |
| The unit gate is green on both line-ending conventions | E1 shows `npm test` FAIL on CRLF. T9 unimplemented. | NOT VERIFIED |
| Portability regression test exists and runs by default | T6/T11 unimplemented. | NOT VERIFIED |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | E1 |
| `npm run lint` | PASS (0 errors / 85 warnings) | E1 |
| `npm run validate-state` | PASSED | E1 |
| `npm test` | **FAIL — 2 failed / 5711 passed / 1 skipped** | E1, E3 |
| `npm run build` | NOT RUN | Not required to establish the finding; must PASS at T12 |
| `npm run test:e2e` | NOT RUN | ~33.5 min suite; unrelated to the finding; must PASS at T12 |
| `npm run test:coverage` | NOT RUN (deliberately) | Local `vitest` 3.2.7 ≠ lockfile 4.1.11; the measurement would be meaningless. See change 299. |

## Edge/adversarial validation (required at T6/T9/T10)

- [ ] CRLF and LF inputs normalise to identical text.
- [ ] `readSource` output contains no `\r`.
- [ ] `methodBody` throws on an absent signature (no vacuous pass).
- [ ] `methodBody` throws on unbalanced braces (no truncated-body pass).
- [ ] `methodBody` correctly ignores braces inside string literals, template
      literals and comments.
- [ ] A reordered call sequence still fails the ordering assertion.
- [ ] Rewording the `// 5.8` / `// 5.10` / `// 6. Survival` / `// 292` comments
      leaves all eight suites green.
- [ ] `npm test` exits 0 with an identical test count on an LF checkout and on a
      CRLF checkout.
- [ ] No committed `*.png` blob changed.
- [ ] `git diff -w --stat` for the renormalisation commit shows no content
      change.

## Migration/compatibility validation

- [ ] No file under `src/` is modified by the shipped diff.
- [ ] `git check-attr eol` reports `lf` for representative text paths.
- [ ] The renormalisation commit is content-neutral by two independent proofs.
- [ ] `scripts/check-release-bundle.mjs` still passes after a clean
      `npm run build`.
- [ ] Product save/world-archive/network compatibility is untouched (no product
      code changed — asserted by the empty `src/` diff).

## Performance/resource validation

- [ ] Suite wall-clock delta attributable to `readSource` is negligible; both the
      LF and CRLF runs complete inside the existing 120 s per-test timeout.
- [ ] No production bundle imports `tests/support/sourceText.ts`.

## Regressions

- None introduced. The change is test-only plus a `.gitattributes` declaration.
- Pre-existing accepted debt recorded but NOT addressed here: the Vitest
  version drift (change 299), the permanently-red high/1920x1080 visual column
  (change 300), the un-wired manual gate scripts (change 301), and the
  never-executed canonical multiplayer load test (change 302).

## Incomplete tasks

T3–T14 (12 of 14 tasks). Completion **0%** by checkbox count.

## Advancement Exception

Not applicable: completion is below 90%, and advancement is forbidden.

## Final decision

**NOT VERIFIED.** The mandatory local unit gate is red at the published tip on a
CRLF checkout because eight source-guard suites assert on byte-exact source text
that embeds `\n` and comment markers, and the repository declares no line-ending
convention. T3–T14 must be implemented and the full mandatory gate
(`typecheck`, `lint`, `test`, `build`, `validate-state`, `test:e2e`) must pass on
both line-ending conventions before this change may be marked VERIFIED.
