# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **031-chunk-ticket-model — VERIFIED 100%**
- Active implementation change: **031-chunk-ticket-model — VERIFIED (advanced)**
- Next change: **032-render-vs-simulation-distance — NOT YET ACTIVE (artifacts pending)**
- 031 task ledger: **5 total tasks, 5 completed**
- 031 completion: **100%**
- 031 mandatory chunk-ticket-model requirements: **PASS**
- 031 required-test gate: **PASS — unit 467/467, E2E 19/19**
- 031 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `a4e0265e15cc9ca26c57bc1297d895b16acf905f`
- Next exact action: **Advance to 032-render-vs-simulation-distance. Author proposal/design/tasks/specs/render-vs-simulation-distance/spec.md/verification via SPEC_AUTHORING_PROTOCOL.md, validate, implement render-vs-simulation distance, verify full gate, commit + push, advance program state.**

## What 031 implemented

Change 031 added a typed ticket model for deciding which chunks must stay loaded (terrain/features) and which must keep ticking (entities/blocks), independent of rendering/visibility:

- `src/world/ChunkTicket.ts` (new) — `ChunkTicketType` const enum (`Start`, `Portal`, `Dragon`, `Player`, `ForceLoad`, `Unknown`) with `CHUNK_TICKET_DEFAULT_LEVEL`, the level thresholds `TICKING_LEVEL = 31` / `LOADED_LEVEL = 33` / `MAX_TICKET_LEVEL = 44`, the `ChunkTicket` type, `createChunkTicket` (optional explicit level override), predicates `isTickingLevel`/`isLoadedLevel`/`isHigherPriority`, and `ChunkTicketManager` aggregating per-chunk tickets to the minimum effective level (falling back to `MAX_TICKET_LEVEL` when none).
- `tests/unit/ChunkTicket.test.ts` — 11 tests covering default levels, predicates, explicit override, manager add/get/remove, min-level aggregation, per-chunk independence, and absent-removal no-op.

## Validation evidence (031)

- typecheck: PASS
- lint: PASS
- unit: PASS 467/467 (prior 456 + 11 new ChunkTicket tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 031 is **VERIFIED** at 5/5 (100%). All gates are green: typecheck, lint, full unit suite (467/467), production build, and the required E2E suite (19/19). No advancement exception was needed. The module is additive world-storage infrastructure; the legacy streaming `World.ts` is untouched.

## Next change: 032 (pending artifacts)

`032-render-vs-simulation-distance` is named in `CHANGE_SEQUENCE.md` with scope "Distinguish rendering radius from simulation/ticking radius". Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 031 verification. Change 032 is the next change; its artifacts must be authored and validated before implementation begins.
