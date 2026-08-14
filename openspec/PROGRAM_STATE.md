# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **012-attribute-registry — VERIFIED 100%**
- Active implementation change: **012-attribute-registry — VERIFIED (advanced)**
- Next change: **013-damage-type-registry — NOT YET ACTIVE (artifacts missing)**
- 012 task ledger: **21 total tasks, 21 completed**
- 012 completion: **100%**
- 012 mandatory attribute/modifier requirements: **PASS**
- 012 required-test gate: **PASS — unit 287/287, E2E 19/19**
- 012 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `a87220eef7e1ee34248a2503ae3edbfbdb80ff6d`
- Next exact action: **Advance to 013-damage-type-registry. Its directory/artifacts do not yet exist; author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md, validate, then implement data-driven damage types and flags while preserving current fall/drown/lava semantics, verify full gate, commit + push, advance program state.**

## What 012 implemented

Change 012 introduced a deterministic, data-driven attribute and modifier model (gameplay-free):

- `src/data/AttributeRegistry.ts` — `AttributeDefinition` (ResourceId id, key, name, finite ordered `min`/`default`/`max`), `Modifier` (ResourceId id, one of `ADD_VALUE`/`ADD_BASE_FRACTION`/`MULTIPLY_TOTAL`, finite amount), `AttributeError` with reasons `DUPLICATE_ID`/`DUPLICATE_MODIFIER`/`MISSING_ID`/`INVALID_RANGE`/`INVALID_VALUE`/`INVALID_OPERATION`. `AttributeRegistry` builds on the 003 generic `Registry<AttributeDefinition>`, validates every definition (unique id, finite ordered range) and finalizes. `AttributeInstance` stores one finite base plus uniquely identified modifiers, computes `value = base + ΣADD_VALUE + base·ΣADD_BASE_FRACTION`, then applies `MULTIPLY_TOTAL` in deterministic modifier-id order, clamped to `[min,max]`, with a dirty-flag cache. Invalid inputs (non-finite base/amount, unknown operation, duplicate modifier id) are rejected atomically. `createDefaultAttributeRegistry` provides 6 generic attributes (max_health, movement_speed, attack_damage, armor, luck, attack_speed).
- `tests/unit/AttributeRegistry.test.ts` — 17 tests covering registry validation, each operation independently, the combined formula with insertion-order independence, deterministic multiply order, final clamp, cache invalidation, atomic invalid-input rejection, duplicate handling, removal/clear, and the default registry domains.

## Validation evidence (012)

- typecheck: PASS
- lint: PASS
- unit: PASS 287/287 (prior 270 + 17 new AttributeRegistry tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 012 is **VERIFIED** at 21/21 (100%). All gates are green: typecheck, lint, full unit suite (287/287), production build, and the required E2E suite (19/19). No advancement exception was needed. 012 is intentionally additive and gameplay-free — no player, entity, equipment, or combat code changed.

## Next change: 013 (blocked on missing artifacts)

`013-damage-type-registry` is named in `CHANGE_SEQUENCE.md` but its change directory does not yet exist, so it has no proposal/design/tasks/specs/verification. Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code; scope is "data-driven damage types and flags; preserve current fall/drown/lava semantics."

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 012 verification. Change 013 is the next change; its artifacts must be authored and validated before implementation begins.
