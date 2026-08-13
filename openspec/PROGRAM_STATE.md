# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **001-autonomous-program-control — VERIFIED 100%**
- Active implementation change: **002-resource-id-foundation — BLOCKED**
- Next change: **003-generic-registry-core — NOT ACTIVE**
- 002 task ledger: **40 total tasks, 38 completed**
- 002 completion: **95%**
- 002 mandatory ResourceId requirements: **PASS**
- 002 required-test gate: **FAIL because of two pre-existing gameplay E2E failures**
- 002 advancement allowed: **No**
- Session-start head: `390824a7c0f3260ec03274428209f6e9e7bde2b9`
- Validated implementation head: `9ae68c82ead5e392ea65b8dd36eadcc3ff213e25`
- Next exact action: **Do not start 003. Resolve the pre-existing break/place E2E baseline under explicitly authorized scope, then run the standalone focused ResourceId invocation and rerun the full 002 gate.**

## What 002 implemented

Change 002 added only:

- `src/data/ResourceId.ts`
- `tests/unit/ResourceId.test.ts`

It did not migrate `BlockId`, block keys, recipes, saves, dependencies, or gameplay systems.

The ResourceId primitive now provides strict namespaced/path validation, explicit-default parsing, immutable values, canonical serialization, exact equality, deterministic non-locale ordering, structured validation reasons, and validation-only try-parse behavior.

## Validation evidence

### Session-start baseline

At `390824a7c0f3260ec03274428209f6e9e7bde2b9`:

- typecheck: PASS
- lint: PASS
- unit: PASS, 114/114
- production dependency audit: PASS, 0 vulnerabilities
- production build: PASS as the Playwright webServer prerequisite
- E2E: **FAIL, 17/19**
  - break-block test expected Air 0, received 1
  - place-block test expected Stone 3, received Air 0

### 002 implementation

At `9ae68c82ead5e392ea65b8dd36eadcc3ff213e25`:

- typecheck: PASS
- lint: PASS
- unit: PASS, 141/141
- ResourceId tests within full suite: PASS, 27/27
- production dependency audit: PASS, 0 vulnerabilities
- production build: PASS as the Playwright webServer prerequisite
- E2E: **FAIL, 17/19 with the exact same two baseline failures and values**

The exact start-to-implementation diff contains only the two 002 files above. Therefore the browser-test failures are demonstrated pre-existing baseline defects, not regressions introduced by ResourceId.

## Remaining 002 tasks

Two tasks remain incomplete:

1. `5.2` — execute the ResourceId test file as a standalone focused command and record the independent result. The tests already pass 27/27 inside full CI; a local standalone attempt was blocked because the execution environment could not resolve GitHub to clone the repository.
2. `5.7` — obtain a passing full E2E regression run. Current result remains 17/19 because of the pre-existing break/place failures.

## Advancement decision

Change 002 is **not VERIFIED** despite 95% task completion. The program policy forbids advancement whenever a required test fails, and no exception can override that gate.

**Change 003 MUST NOT begin.**

Fixing the break/place gameplay defects was not performed here because the user explicitly limited this session to one change and those defects are outside the ResourceId foundation scope.

## Resume rule

A future session must first inspect current `origin/main`, this state, and 002 verification. It must not reinterpret the identical baseline/post-change E2E failure as 002 completion. Resolve the required-test blocker under appropriate scope, then finish the two remaining 002 tasks before activating 003.
