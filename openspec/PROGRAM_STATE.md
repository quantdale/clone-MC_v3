# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **038-dirty-save-queue — VERIFIED 100%**
- Active implementation change: **038-dirty-save-queue — VERIFIED**
- Next change: **039-transactional-autosave — NOT YET ACTIVE (artifacts pending)**
- 038 task ledger: **5 total tasks, 5 completed**
- 038 completion: **100%**
- 038 mandatory dirty-save-queue requirements: **PASS**
- 038 required-test gate: **PASS — unit 552/552, E2E 19/19**
- 038 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `8fa1d1c96695a5d04d287bbbf25e4d6aa4bc833c`
- Next exact action: **Advance to 039-transactional-autosave. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (039 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement crash-resistant periodic autosave and pagehide flush over the 038 DirtySaveQueue + 034-037 repositories, verify full gate, commit + push, advance program state.**

## What 038 implemented

Change 038 adds the bounded, ordered, de-duplicated dirty-save queue that coordinates the four 034-037
repositories, so world saves never block the simulation or starve the frame budget.

- `src/storage/DirtySaveQueue.ts` (NEW) — `SaveUnitKind`, `SaveUnit`, `SaveSink`, and `DirtySaveQueue`.
  `markDirty` de-duplicates by key (keeping original FIFO position); `drain(sink, limit)` performs at
  most `limit` async writes in insertion order, removing successes and re-queuing failures at the end;
  `size`/`has`/`keys`/`clear` expose pending state.
- `src/storage/RepositorySaveSink.ts` (NEW) — `RepositorySaveSink` mapping each `SaveUnitKind` to the
  matching repository: `world-metadata`→`WorldMetadataRepository.putMetadata`, `chunk-sections`→
  `ChunkSectionRepository.putColumn`, `block-entities`/`entities`→`*EntityRepository.putChunkEntities`.
  A missing repository or unknown kind makes `write` reject (unit re-queued, never dropped).
- `tests/unit/DirtySaveQueue.test.ts` (NEW) — 7 tests covering bounded ordered drain, de-duplication,
  failure-retry, size/has/keys/clear, `limit <= 0`, and repository-sink integration over all four
  repositories backed by the in-memory `IDBFactory` mocks (each kind lands in its store).

## Validation evidence (038)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 552/552 (prior 545 + 7 new DirtySaveQueue tests)
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 038 is **VERIFIED** at 5/5 (100%). All gates are green: typecheck, lint, the new 038 suite
(7/7), the full unit suite (552/552), production build, and the required E2E suite (19/19). No
advancement exception was needed. No `WORLD_DB_VERSION` bump — 038 layers purely above 034-037.

## Next change: 039 (pending artifacts)

`039-transactional-autosave` is named in `CHANGE_SEQUENCE.md` with scope "Crash-resistant periodic
autosave and pagehide flush policy." It builds on 038 by driving `DirtySaveQueue.drain` on a periodic
and `pagehide` schedule with a bounded `limit` and backoff, over the 034-037 repositories. Per
`AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate
those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 038 verification.
Change 039 is the next change; its artifacts must be authored and validated before implementation
begins.
