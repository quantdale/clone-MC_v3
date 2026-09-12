# Verification: 270-leaf-apple-loot-probability

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| APPLE-1 no guaranteed apple | `tests/unit/LootTable.test.ts` (unlucky rng `0.999` → leaves only; boundary draw `== chance` → leaves only) + `tests/unit/LeafAppleLoot.test.ts` (interaction unlucky → exactly one leaves entity) + `PlayerInteraction.finishBreak` unconditional apple push deleted | PASS |
| APPLE-2 probabilistic 1/200 via loot | `LEAF_APPLE_CHANCE = 0.005` pinned + lucky rng `0.0` → leaves + exactly 1 apple + alternating-sequence shape test (2000 evals → exactly 1000 apples) | PASS |
| APPLE-3 rng hook + draw order | order test (gate `0.25` then quantity `0.0`), miss-consumes-only-gate test, strict-`<` boundary test | PASS |
| APPLE-4 chance validation | `0/-0.1/1.5/2/NaN/±Infinity` → `INVALID_CHANCE` (nothing finalized); `chance: 1` legal, always proceeds | PASS |
| APPLE-5 silk/fallback block-drop | silk + lucky rng → exactly the block item, zero apples; no-registry fallback → block item only (push deletion + fallback interaction test) | PASS |
| APPLE-6 untangled systems unchanged | non-leaf equivalence loop over every breakable block (fixed rng, byte-identical) + wheat/mob/fortune/clean-break untouched (`git diff` review) | PASS |
| CERT-1 R-2 closed | risk-register R-2 reads CLOSED by Change 270 with evidence pointer; `PARITY_MATRIX.md` C270 `exact` row + summary 252 + post-terminal note | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run validate-state` | PASS | `State validation PASSED` (270 ACTIVE 10/12 pre-verify; re-run green at VERIFIED) |
| `npm run typecheck` | PASS | 0 errors |
| `npm run lint` | PASS | 0 errors, 85 pre-existing warnings (matches 269 baseline) |
| `npm test` | PASS | 423 files: 5066 passed + 1 skipped (269 baseline 422 files 5054+1; +1 file `LeafAppleLoot` 4 tests + `LootTable` net +8) |
| `npm run build` | PASS | 2.73s |
| `npx playwright test tests/e2e/game.spec.ts` | PASS | **30/30 in 1.9m** (`/tmp/e2e-game.log`) |
| `npx playwright test tests/e2e/game-dispose.spec.ts` | PASS | **1/1 in 17.4s** (`/tmp/e2e-dispose.log`) |
| `npx playwright test <rest 17 specs>` | PASS* | **51/52 in 29.8m** (`/tmp/e2e-rest.log`); single failure `adventure-spectator allow-list` = `waitForFunction` timeout in `waitForBlockAt` (1.1m, placement unobserved — no loot path involved) |
| `npx playwright test tests/e2e/adventure-spectator.spec.ts` (retry) | PASS | **3/3 in 1.5m** incl. the flaked test (35.7s) — flake proven environmental (`/tmp/e2e-adventure-retry.log`) |
| `npm run test:e2e` (total) | PASS | **83/83** (30 game.spec + 1 game-dispose + 52 rest incl. retry-proven file) |
| `validate-file-audit.mjs` | PASS | 2775 rows (6 new 270 rows), reviewed manifest |

## Edge/adversarial validation

- Boundary draw exactly `== chance` misses (strict `<`); NaN rng draws miss safely with no throw.
- Invalid chance (`0`, negative, `> 1`, NaN, ±Infinity) fails closed at construction with `INVALID_CHANCE`; nothing finalizes.
- Silk touch + lucky rng yields zero apples (replacement runs after loot eval).
- Double-authority removal: interaction unlucky ⇒ exactly one leaves entity (no second push); lucky ⇒ leaves + exactly one apple (no double-apple).
- 2000-eval alternating sequence pins the exact hit fraction; non-leaf tables byte-identical.

## Migration/compatibility validation

No save/network/registry-id/public-signature change (`git diff --stat` review at publish: `src/` touches only `LootTable.ts` chance support + 3-line push deletion in `PlayerInteraction.ts`; `chance` absent = legacy behavior for every non-leaf table). 259–269 suites untouched (full unit green without touching them).

## Performance/resource validation

One float comparison + one rng call per leaf break only (leaves is the sole gated production pool); no frame/tick hot path touched. Standard gate is the guard; no dedicated benchmark. Build 2.73s (matches baseline).

## Regressions

Full unit green (423/423 files); full e2e green 83/83 (single waitForFunction flake proven environmental via isolated 3/3 retry — same pattern as 269's game.spec timeouts). 258 stays BLOCKED (no headed work touched, no GPU evidence, 258 NOT marked VERIFIED); 259–269 NOT reopened. No economy redesign.

## Incomplete tasks

None. T1–T12 complete.

## Advancement Exception

Not applicable (target 100%; none expected).

## Final decision

**VERIFIED 12/12.** All six APPLE requirements + CERT-1 PASS with fixed-rng unit proofs and interaction tests; R-2 CLOSED; full gates green locally (validate-state/typecheck/lint 0 errors/unit 423 files 5066+1/build 2.73s/e2e 83/83/file-audit 2775); 258 stays BLOCKED; 259–269 untouched and VERIFIED.
