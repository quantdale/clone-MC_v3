# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **018-block-entity-type-registry — VERIFIED 100%**
- Active implementation change: **018-block-entity-type-registry — VERIFIED (advanced)**
- Next change: **019-versioned-codec-framework — NOT YET ACTIVE (artifacts missing)**
- 018 task ledger: **11 total tasks, 11 completed**
- 018 completion: **100%**
- 018 mandatory block-entity requirements: **PASS**
- 018 required-test gate: **PASS — unit 343/343, E2E 19/19**
- 018 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `186afe66b43e2a2f59b5c57e238151e9c91ce6c6`
- Next exact action: **Advance to 019-versioned-codec-framework. Its directory/artifacts do not yet exist; author proposal/design/tasks/specs/versioned-codec/spec.md/verification via SPEC_AUTHORING_PROTOCOL.md, validate, then implement versioned validation/codec primitives for persistent and network-safe data (schema version marker, forward/backward tolerant encode/decode, integrity checks), verify full gate, commit + push, advance program state.**

## What 018 implemented

Change 018 introduced a behavior-free block-entity data model:

- `src/data/BlockEntityType.ts` — `BlockEntityTypeDefinition` (ResourceId id, key, name, optional `inventorySize` > 0, `tickable`). `BlockEntityRegistry` builds on the 003 generic `Registry`, validates every definition (unique id, finite positive inventorySize) and finalizes. `BlockEntityCompatibility` declares block-key → block-entity-type-key mappings, validated at construction against the registry (rejects unknown types). `createDefaultBlockEntityRegistry` provides ten representative types; `createDefaultBlockEntityCompatibility` maps block keys (including `oak_sign`/`hanging_sign` → `sign`).
- `tests/unit/BlockEntityType.test.ts` — 7 tests covering registry validation/error paths (inventorySize, duplicate id), compatibility validation (unknown-type rejection), and compatibility queries (resolve, undeclared, shared type).

## Validation evidence (018)

- typecheck: PASS
- lint: PASS
- unit: PASS 343/343 (prior 336 + 7 new BlockEntityType tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 018 is **VERIFIED** at 11/11 (100%). All gates are green: typecheck, lint, full unit suite (343/343), production build, and the required E2E suite (19/19). No advancement exception was needed. The model is additive and behavior-free; no storage/UI/dispatch was attached.

## Next change: 019 (blocked on missing artifacts)

`019-versioned-codec-framework` is named in `CHANGE_SEQUENCE.md` but its change directory does not yet exist, so it has no proposal/design/tasks/specs/verification. Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code; scope is "versioned validation/codec primitives for persistent and network-safe data."

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 018 verification. Change 019 is the next change; its artifacts must be authored and validated before implementation begins.
