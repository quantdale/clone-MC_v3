# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **041-save-schema-migrations — VERIFIED 100%**
- Active implementation change: **041-save-schema-migrations — VERIFIED**
- Next change: **042-world-export-import — NOT YET ACTIVE (artifacts pending)**
- 041 task ledger: **5 total tasks, 5 completed**
- 041 completion: **100%**
- 041 mandatory save-schema-migrations requirements: **PASS**
- 041 required-test gate: **PASS — unit 580/580, E2E 19/19**
- 041 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `dbe59066fe55dab7d59d6fcbd50ae83e3c02b697`
- Next exact action: **Advance to 042-world-export-import. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (042 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement original world archive export/import with validation over the 034-041 world database, verify full gate, commit + push, advance program state.**

## What 041 implemented

Change 041 adds the ordered, gap-checked data-version migration framework so stored records can be
upgraded deterministically as their shapes evolve.

- `src/storage/DataMigration.ts` (NEW) — `DataMigration<T>` (`fromVersion`/`toVersion = fromVersion+1`/
  `migrate`), `DataMigrationError` (kinds `GAP` | `DUPLICATE` | `DOWNGRADE` | `UNKNOWN_VERSION`), and
  `DataMigrationChain<T>` (`register` with eager contiguity/duplicate validation, `migrate` with
  `appliedSteps` reporting, `needsMigration`, `currentVersion`, `steps`). Migration is pure — a
  throwing step aborts with the input untouched; downgrades and unknown versions are rejected.
- Typed chains for the persisted families: `WORLD_METADATA_MIGRATIONS` (`schemaVersion`, base 1) and
  `CHUNK_COLUMN_MIGRATIONS` (`version`, base 1), both empty today (identity), plus
  `migrateWorldMetadata`/`migrateChunkColumn` helpers.
- `tests/unit/DataMigration.test.ts` (NEW) — 10 tests: ordered two-step application with `appliedSteps`,
  identity on current records, gap/duplicate/non-contiguous registration rejection, downgrade and
  unknown-version rejection, purity on a throwing step, and typed-chain identity.

## Validation evidence (041)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 580/580 (prior 570 + 10 new DataMigration tests)
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 041 is **VERIFIED** at 5/5 (100%). All gates are green: typecheck, lint, the new 041 suite
(10/10), the full unit suite (580/580), production build, and the required E2E suite (19/19). No
advancement exception was needed. No `WORLD_DB_VERSION` bump — 041 is an additive framework over the
existing five-store schema (v5).

## Next change: 042 (pending artifacts)

`042-world-export-import` is named in `CHANGE_SEQUENCE.md` with scope "Original world archive
export/import with validation." It builds on 034-041 by serializing a world's stores (metadata,
chunk sections, block entities, entities, player state) into a portable archive and validating/
restoring it. Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block.
Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 041 verification.
Change 042 is the next change; its artifacts must be authored and validated before implementation
begins.
