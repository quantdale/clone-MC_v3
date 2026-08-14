# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **001-autonomous-program-control — VERIFIED 100%**
- Last completed change: **002-resource-id-foundation — VERIFIED 100%**
- Last completed change: **003-generic-registry-core — VERIFIED 100%**
- Active implementation change: **004-block-item-registry-separation — PLANNED (not yet started)**
- Next change: **005-tag-registry — NOT ACTIVE**
- 003 task ledger: **41 total tasks, 41 completed**
- 003 completion: **100%**
- 003 mandatory generic-registry requirements: **PASS**
- 003 required-test gate: **PASS — E2E 19/19**
- 003 standalone focused Registry invocation: **PASS — 13/13**
- 003 advancement allowed: **Yes**
- Session-start head: `88b188038f3944e4533141b9b3b3b8bc361864d19a`
- Validated head: `88b188038f3944e4533141b9b3b3b8bc361864d19a`
- Next exact action: **Begin Change 004 task 1.1: confirm 003 VERIFIED and program state activates 004, then inventory numeric definitions (1.3) and run the full baseline (1.2).**

## What 002 implemented

Change 002 added only:

- `src/data/ResourceId.ts`
- `tests/unit/ResourceId.test.ts`

It did not migrate `BlockId`, block keys, recipes, saves, dependencies, or gameplay systems.

The ResourceId primitive provides strict namespaced/path validation, explicit-default parsing, immutable values, canonical serialization, exact equality, deterministic non-locale ordering, structured validation reasons, and validation-only try-parse behavior.

## Validation evidence

### Session-start baseline

At `390824a7c0f3260ec03274428209f6e9e7bde2b9`:

- typecheck: PASS
- lint: PASS
- unit: PASS, 114/114
- production dependency audit: PASS, 0 vulnerabilities
- production build: PASS as the Playwright webServer prerequisite
- E2E: **FAIL, 17/19** (break-block expected Air 0 received 1; place-block expected Stone 3 received Air 0)

### 002 implementation

At `9ae68c82ead5e392ea65b8dd36eadcc3ff213e25`:

- typecheck: PASS
- lint: PASS
- unit: PASS, 141/141
- ResourceId tests within full suite: PASS, 27/27
- production dependency audit: PASS, 0 vulnerabilities
- production build: PASS as the Playwright webServer prerequisite
- E2E: **FAIL, 17/19** with the exact same two baseline failures and values

The exact start-to-implementation diff contains only the two 002 files above. Therefore the browser-test failures are demonstrated pre-existing baseline defects, not regressions introduced by ResourceId.

### 002 verification (resolved)

At `047d6eb9af9f7259916f585c717c177f7ea0dc90` (docs-only head over the 002 implementation; gameplay code unchanged):

- typecheck: PASS
- lint: PASS
- unit: PASS, 141/141; ResourceId 27/27
- ResourceId standalone focused invocation: PASS, 27/27
- production dependency audit: PASS, 0 vulnerabilities
- production build: PASS as the Playwright webServer prerequisite
- E2E: **PASS, 19/19**

Resolution: the break-block and place-block E2E failures were environmental — a stale `vite preview` server was holding port 4173 during the original CI run, and the software-WebGL CI renderer produced very low frame rates that made a fixed 400 ms wait insufficient. This session killed the stale server, ran the full E2E suite against a fresh local `vite preview` (19/19 PASS), and hardened the two tests to poll for the resulting block state (Air `0` after break, Stone `3` after place) with a 5 s timeout instead of a fixed delay. No gameplay source was modified.

## 002 remaining tasks

All 40 tasks complete, including the two that were previously blocked:

1. `5.2` — ResourceId test file executed as a standalone focused command: **27 passed (27)**.
2. `5.7` — Full E2E regression run now **PASS 19/19** after hardening.

## Advancement decision

Change 003 is **VERIFIED** at 41/41 (100%). All gates are green: typecheck, lint, full unit suite (154/154, incl. 13 generic Registry tests), production build, and the required E2E suite (19/19). No advancement exception was needed. The generic registry core is additive and leaves `BlockRegistry` untouched.

**Change 004 is authorized to begin.** It is fully specified (proposal, design, tasks, specs, verification) and may start once its entry gate (task 1.1) confirms this state.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 003 verification. Change 004 is the active change; begin at task 1.1 and do not migrate 005+ scope.
