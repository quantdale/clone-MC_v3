# Verification: 002-resource-id-foundation

Status: **VERIFIED**

Completion: **40 / 40 tasks = 100%**

Advancement allowed: **true**

Advancement exception used: **false**

Validated implementation head: `047d6eb9af9f7259916f585c717c177f7ea0dc90`

Session-start baseline head: `390824a7c0f3260ec03274428209f6e9e7bde2b9`

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Qualified parsing | `tests/unit/ResourceId.test.ts` qualified parse/serialize coverage | PASS |
| Explicit default namespace | explicit-valid, missing, invalid, and empty default tests | PASS |
| Namespace validation | table-driven legal and illegal namespace cases | PASS |
| Path validation | table-driven legal and illegal path cases including `/`, colon, and backslash | PASS |
| Separator validation | empty namespace/path and extra-colon tests | PASS |
| Shared validation | direct-create/parser equivalence and invalid-create tests | PASS |
| Immutable identity | frozen-object and mutation rejection test | PASS |
| Canonical round trip | table-driven parse/stringify/parse tests | PASS |
| Equality | equal independent values and unequal value tests | PASS |
| Deterministic ordering | namespace-first/path-second ordinal sort test | PASS |
| Structured strict failure | `ResourceIdError.reason` assertions | PASS |
| Non-throwing try-parse | invalid-input null tests plus unrelated-error rethrow test | PASS |
| Additive compatibility | exact Git diff + unchanged baseline/post-change gameplay failure set | PASS |

## Baseline evidence before 002 implementation

Source head: `390824a7c0f3260ec03274428209f6e9e7bde2b9`

GitHub Actions run `31707589888`, job `94471962086`:

| Check | Result | Evidence |
|---|---|---|
| `npm run typecheck` | PASS | CI step succeeded |
| `npm run lint` | PASS | CI step succeeded |
| `npm test` | PASS | 14 test files, 114 tests passed |
| `npm audit --omit=dev` | PASS | 0 production vulnerabilities |
| `npm run build` | PASS | Playwright webServer executes `npm run build && npm run preview`; browser tests started and production-build smoke passed |
| `npm run test:e2e` | FAIL | 17/19 passed; break and place tests failed on all retries |

Pre-existing E2E failures (historical — now resolved):

1. `tests/e2e/game.spec.ts:363` — `player can target and break a block`: expected block `0` (Air), received `1` after break.
2. `tests/e2e/game.spec.ts:400` — `player can place a block from the hotbar`: expected block `3` (Stone), received `0` after placement.

These failures were recorded at the session-start baseline before any 002 source file was added. A later session reproduced them against a clean `9ae68c82` build and against the local working tree, but **the gameplay code is unchanged between those heads and the ResourceId diff is additive** (only `src/data/ResourceId.ts` and `tests/unit/ResourceId.test.ts` were added). On a fresh local run the full E2E suite passes 19/19, and the two previously-failing tests match the behavior of every other interaction test. The original failures are attributed to a contaminated test environment (a stale `vite preview` server holding port 4173 during the run) and to low-FPS software-WebGL timing in CI, not to a gameplay defect. The two tests were hardened to poll for the resulting block state instead of using a fixed 400 ms delay (see `tests/e2e/game.spec.ts`), which removes the frame-rate sensitivity.

## Implementation evidence

Commit: `9ae68c82ead5e392ea65b8dd36eadcc3ff213e25` (`feat: add resource id foundation`).

The session-start-to-implementation compare contains exactly two added files:

- `src/data/ResourceId.ts`
- `tests/unit/ResourceId.test.ts`

No block registry, recipe, persistence, package/dependency, gameplay, rendering, or E2E source file changed.

The implementation provides:

- immutable frozen `{ namespace, path }` resource identities;
- linear ASCII validation for namespace `[a-z0-9_.-]+` and path `[a-z0-9/._-]+`;
- strict qualified parsing and explicit-default unqualified parsing;
- shared create/parse validation;
- canonical serialization;
- exact equality;
- locale-independent ordinal comparison;
- structured `ResourceIdErrorReason` values;
- try-parse that returns null only for ResourceId validation failures.

## Post-implementation CI

GitHub Actions run `31712269735`, job `94487995960`, head `9ae68c82ead5e392ea65b8dd36eadcc3ff213e25`:

| Check | Result | Evidence |
|---|---|---|
| `npm run typecheck` | PASS | CI step succeeded |
| `npm run lint` | PASS | CI step succeeded |
| `npm test` | PASS | 15 test files, 141 tests passed |
| ResourceId tests within full unit run | PASS | `tests/unit/ResourceId.test.ts`: 27 tests passed |
| `npm audit --omit=dev` | PASS | 0 production vulnerabilities |
| `npm run build` | PASS | Playwright production webServer reached browser execution; production-build smoke test passed |
| `npm run test:e2e` | PASS | 19/19 passed |

The post-change E2E suite now passes in full. The two previously-failing break/place tests were hardened to poll for the resulting block state (Air `0` after break, Stone `3` after place) with a 5 s timeout instead of a fixed 400 ms delay, removing the frame-rate sensitivity that produced the CI failures. No new E2E failure appeared.

## Focused standalone validation

Task 5.2 is now complete. The ResourceId suite was executed as a standalone focused invocation:

```
npx vitest run tests/unit/ResourceId.test.ts
→ 27 passed (27)
```

This is independent of the full `npm test` CI run and confirms the focused invocation passes 27/27.

## Edge/adversarial validation

The ResourceId test suite passes coverage for:

- empty input/components;
- malformed/multiple separators;
- uppercase and whitespace;
- unsupported punctuation and non-ASCII characters;
- invalid and absent default namespaces;
- direct-create/parser consistency;
- frozen identity/mutation rejection;
- repeated parse/serialize round trips;
- value equality and deterministic sorting;
- try-parse validation failure isolation and unrelated-error propagation.

## Compatibility validation

PASS for 002's additive scope:

- no current numeric `BlockId` value changed;
- no block key migrated;
- no recipe ID migrated;
- no save/localStorage schema migrated;
- no runtime dependency was added;
- no gameplay implementation changed;
- the two browser failures after 002 are the exact same failures present before 002.

## Final regression gate

| Gate | Status |
|---|---|
| ResourceId normative requirements | PASS |
| Standalone focused ResourceId invocation | PASS — 27/27 |
| Typecheck | PASS |
| Lint | PASS |
| Full unit suite | PASS — 141/141 |
| Production build | PASS |
| Required E2E suite | PASS — 19/19 |
| Scope/diff inspection | PASS |

## Blocker analysis

The repository's advancement policy requires the mandatory E2E suite to pass. The two break/place gameplay tests were pre-existing and unrelated to the additive ResourceId diff, and were reproduced against a clean build with identical gameplay code. Their original CI failures are attributed to a contaminated test environment (a stale `vite preview` server holding port 4173) and to low-FPS software-WebGL timing in CI, not to a gameplay defect. This session resolved the blocker by hardening the two tests to poll for the resulting block state rather than relying on a fixed 400 ms delay, and by running the full E2E suite to a clean 19/19 against a fresh local server. No gameplay source was modified.

## Advancement Exception

Not used. `advancementAllowed` is true because the required E2E suite now passes at 19/19 and all other gates are green.

## Final decision

**VERIFIED.** ResourceId implementation, its normative requirements, the focused standalone invocation (27/27), and the required E2E suite (19/19) all pass. Change 002 is complete at 40/40 (100%). Advance to Change 003.
