# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **013-damage-type-registry — VERIFIED 100%**
- Active implementation change: **013-damage-type-registry — VERIFIED (advanced)**
- Next change: **014-status-effect-registry — NOT YET ACTIVE (artifacts missing)**
- 013 task ledger: **18 total tasks, 18 completed**
- 013 completion: **100%**
- 013 mandatory damage-type requirements: **PASS**
- 013 required-test gate: **PASS — unit 298/298, E2E 19/19**
- 013 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `95b06d7751ac73d2c3975305c9c8b5dbb776fb60`
- Next exact action: **Advance to 014-status-effect-registry. Its directory/artifacts do not yet exist; author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md, validate, then implement a status-effect type registry and serializable effect instances (without gameplay effects yet), verify full gate, commit + push, advance program state.**

## What 013 implemented

Change 013 introduced a data-driven damage-type model and routed `SurvivalSystem` through it:

- `src/data/DamageType.ts` — `DamageTypeFlag` (`BYPASS_ARMOR`/`FIRE`/`DROWNING`/`FALL`/`STARVATION`/`ENVIRONMENTAL`), `DamageTypeKind` (`fall`/`periodic`/`starvation`), and `DamageTypeDefinition` (ResourceId id, key, name, flags, kind, amount, interval?, fallThreshold?, fallScaling?). `DamageTypeRegistry` builds on the 003 generic `Registry<DamageTypeDefinition>`, validates every definition (unique id, known flags, finite non-negative params, kind-required fields) and finalizes. `createDefaultDamageTypeRegistry` encodes the current numbers: fall (threshold 3, scaling 1.5), drowning (amount 2, interval 1.5s), lava (amount 4, interval 0.7s), starvation (amount 1). `requireDamageType` resolves a type by key and fails fast if missing.
- `src/player/SurvivalSystem.ts` — constructor accepts an optional `DamageTypeRegistry` (defaulting to the current-value registry) and resolves the four default types once; `update()` applies fall/drowning/lava/starvation from their data, reproducing prior literals exactly. The `damage()` signature and snapshot/restore are unchanged.
- `src/engine/Game.ts` — updated the `SurvivalSystem` call site to pass the event callback as the second argument (registry defaults).
- `tests/unit/DamageType.test.ts` — 11 tests covering validation/error paths, default-type data and flags, exact fall formula via registry, custom scaling via injected registry, and preserved drowning/lava amounts.

## Validation evidence (013)

- typecheck: PASS
- lint: PASS
- unit: PASS 298/298 (prior 287 + 11 new DamageType tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 013 is **VERIFIED** at 18/18 (100%). All gates are green: typecheck, lint, full unit suite (298/298), production build, and the required E2E suite (19/19). No advancement exception was needed. Behavior is preserved exactly (existing `SurvivalSystem.test.ts` still pins the same drow/lava/fall numbers), with the damage parameters now data-driven and extensible.

## Next change: 014 (blocked on missing artifacts)

`014-status-effect-registry` is named in `CHANGE_SEQUENCE.md` but its change directory does not yet exist, so it has no proposal/design/tasks/specs/verification. Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code; scope is "status-effect type registry and serializable effect instances, without gameplay effects yet."

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 013 verification. Change 014 is the next change; its artifacts must be authored and validated before implementation begins.
