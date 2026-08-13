# Verification: 002-resource-id-foundation

Status: **BLOCKED**

Completion: **38 / 40 tasks = 95%**

Advancement allowed: **false**

Advancement exception used: **false**

Validated implementation head: `9ae68c82ead5e392ea65b8dd36eadcc3ff213e25`

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

Pre-existing E2E failures:

1. `tests/e2e/game.spec.ts:363` — `player can target and break a block`: expected block `0` (Air), received `1` after break.
2. `tests/e2e/game.spec.ts:400` — `player can place a block from the hotbar`: expected block `3` (Stone), received `0` after placement.

These failures existed before any 002 source file was added.

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
| `npm run test:e2e` | FAIL | 17/19 passed; exact same two baseline failures reproduced |

The post-change E2E failure names and observed values are identical to the session-start baseline. No new E2E failure appeared.

## Focused standalone validation

Task 5.2 remains incomplete. The 27 ResourceId tests passed inside the full `npm test` CI run, but no independent focused invocation was successfully executed in this session. A local attempt could not clone GitHub because the execution environment had no DNS/network access; this is not recorded as a product failure and does not substitute for the required focused invocation.

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
| Standalone focused ResourceId invocation | INCOMPLETE |
| Typecheck | PASS |
| Lint | PASS |
| Full unit suite | PASS — 141/141 |
| Production build | PASS |
| Required E2E suite | **FAIL — pre-existing 17/19 baseline** |
| Scope/diff inspection | PASS |

## Blocker analysis

The repository's advancement policy requires the mandatory E2E suite to pass. The two failing gameplay tests are pre-existing and unrelated to the additive ResourceId diff, but a required-test failure still blocks advancement regardless of the 95% task percentage. An advancement exception cannot override a required failing test.

Fixing those break/place gameplay paths would exceed the user-directed scope of “only Change 002” and is therefore intentionally not performed in this session.

## Advancement Exception

Not used. `advancementAllowed` remains false because the required E2E suite fails.

## Final decision

**BLOCKED.** ResourceId implementation and its normative requirements are implemented and passing, but Change 002 is not VERIFIED. Do not start Change 003.
