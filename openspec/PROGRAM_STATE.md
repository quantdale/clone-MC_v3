# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **017-entity-type-registry — VERIFIED 100%**
- Active implementation change: **017-entity-type-registry — VERIFIED (advanced)**
- Next change: **018-block-entity-type-registry — NOT YET ACTIVE (artifacts missing)**
- 017 task ledger: **10 total tasks, 10 completed**
- 017 completion: **100%**
- 017 mandatory entity requirements: **PASS**
- 017 required-test gate: **PASS — unit 336/336, E2E 19/19**
- 017 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `1b96fe0ef6d87c260c9219eab47fd461e6d85989`
- Next exact action: **Advance to 018-block-entity-type-registry. Its directory/artifacts do not yet exist; author proposal/design/tasks/specs/block-entity-types/spec.md/verification via SPEC_AUTHORING_PROTOCOL.md, validate, then implement a block-entity type registry plus block compatibility declarations (which blocks may host which block entities), verify full gate, commit + push, advance program state.**

## What 017 implemented

Change 017 introduced a behavior-free entity data model:

- `src/data/EntityType.ts` — `EntityCategory` (7 values), and `EntityTypeDefinition` (ResourceId id, key, name, category, optional `health` > 0, `attackDamage` >= 0, `isSummonable`, `isPersistent`). `EntityRegistry` builds on the 003 generic `Registry`, validates every definition (known category, finite bounded health/attack) and finalizes, assigning dense deterministic runtime ids by registration order. `createDefaultEntityRegistry` provides eleven representative entities (monsters, creatures, ambient, water, and an `item` OTHER placeholder).
- `tests/unit/EntityType.test.ts` — 7 tests covering registry validation/error paths (health, attack, category, duplicate id), default registry contents/metadata, and runtime-id assignment/lookup.

## Validation evidence (017)

- typecheck: PASS
- lint: PASS
- unit: PASS 336/336 (prior 329 + 7 new EntityType tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 017 is **VERIFIED** at 10/10 (100%). All gates are green: typecheck, lint, full unit suite (336/336), production build, and the required E2E suite (19/19). No advancement exception was needed. The model is additive and behavior-free; no AI/behavior was attached.

## Next change: 018 (blocked on missing artifacts)

`018-block-entity-type-registry` is named in `CHANGE_SEQUENCE.md` but its change directory does not yet exist, so it has no proposal/design/tasks/specs/verification. Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code; scope is "block-entity type registry and block compatibility declarations."

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 017 verification. Change 018 is the next change; its artifacts must be authored and validated before implementation begins.
