# Proposal: 256-production-readiness-hardening

## Problem

The repository is program-COMPLETE through Change 255 (001–255 VERIFIED, 37/37 tasks 100%, gates green: typecheck/lint/unit 4559+1/build 195/e2e 51+1). The live tree is published 5 commits ahead of `origin/main` (`17a814a` vs `54d4ea0`) with publication BLOCKED on missing GitHub credential — not a code defect. Owner now explicitly asks (verbatim goal): "do a entire or full codebase clean up. also do a full codebase refactoring. and most importantly do anfull codebase hardening of the logic, systems, functions, docs, and every file important on this repository. ensure the entire app still works after those chnages, test it. optimize the entire codebase. apply YAGNI principles. do not stop until this is achieved and donde and the entire game is productions ready."

Without a scoped change, an unbounded sweep would violate AGENTS.md Scope Discipline and the OpenSpec invariant that every `src/` edit traces to an active change's tasks. The correct path per SPEC_AUTHORING_PROTOCOL.md is to host the requested hardening as a new explicit active change with tight scope, YAGNI guardrails, and evidence.

This change is that host. It does NOT add new gameplay, dimensions, mobs, redstone, multiplayer, or content — it hardens the existing verified tree to production readiness via cleanup, refactoring, hardening, and measured optimization only.

## Goals

- Full codebase cleanup: delete dead code, unused exports, redundant helpers, `void`-noise, duplicate runtime checks, and inline style that belongs in CSS.
- Full codebase refactoring: consolidate duplicated logic (e.g., headless distance helpers), extract named constants for magic numbers, and tighten type safety (remove `as unknown as` double casts, unsafe `any`).
- Full codebase hardening: complete missing error handling, harden logic branches, validate inputs defensively, and ensure deterministic teardown/dispose paths.
- Every important file hardened: `src/engine/Game.ts`, `src/main.ts`, `src/config`, `src/world`, `src/rendering`, `src/simulation`, `src/storage`, `src/player`, `src/inventory`, `src/data`, plus docs and scripts.
- Full verification that the entire app still works: typecheck, lint, unit (377 files, 4559+1), build, and smoke E2E/visual determinism where feasible.
- Optimize the entire codebase where measured: remove avoidable allocations, bound queues, deduplicate checks, without changing behavior or save format.
- Apply YAGNI rigorously: remove speculative abstractions and premature generalizations; keep only what the verified 001–255 gameplay needs.
- Production-ready exit: gates PASS, no Critical/High open, bundle within budget, readiness checklist complete.

## Non-goals

- No new numbered parity features beyond 001–255 scope (no new mobs, blocks, dimensions, worldgen content, redstone, multiplayer, or progression).
- No save-format or generation-version bump; no migration beyond hardening the existing durable path.
- No asset replacement, art restyling, or global renderer rewrite.
- No speculative future-proofing, feature flags for unplanned features, or "while we're at it" scope creep — YAGNI is enforced via checklist in design/spec.
- No Git history rewrite to fix publication lineage; publication is a credential operation, not a code change.

## Preconditions

- 001–255 are VERIFIED and ARCHIVED; `PROGRAM_STATE.json` says COMPLETE with `nextChange: null`; local HEAD `17a814a` is 5 ahead of `origin/main` `54d4ea0` with publication BLOCKED on credential.
- Local gates are PASS at this baseline: `npm run typecheck` PASS, `npm run lint` PASS, `npm test` 4559+1 PASS (377 files), `npm run build` 195 modules PASS, `validate-state` and `file-audit` PASS.
- Toolchain: Node ≥20, Vite, Vitest, Playwright, ESLint, strict TypeScript.

## Dependencies

- All existing source under `src/`, tests under `tests/`, plus `src/config`, `scripts/validate-state.mjs`, `scripts/orphan-check.mjs`, `scripts/gen-file-audit.mjs`, and `openspec/hardening/` evidence.
- No new runtime dependencies unless removal is the optimization.

## Proposed change

Host the owner's requested hardening as Change 256, strictly gated: audit first, harden in narrow slices, YAGNI gate, behavior preservation, optimization only when measured, documentation hardening.

## Compatibility and migration

No persisted schema change. `CHANGE_SEQUENCE.md` gains a Post-terminal row for 256; `PROGRAM_STATE.json` transitions from `COMPLETE/nextChange:null` to active 256 while work is in progress, then back to COMPLETE at VERIFIED.

## Risks

Sweep risk, over-optimization risk, publication risk remains credential-bound, YAGNI mis-judgment — all mitigated by audited backlog + narrow slices + gate after each slice.

## Rollback strategy

Every slice is a small commit; any regression is reverted by `git revert` of that slice. No data migration to unwind.

## Definition of Done

All MUST/SHALL in `specs/production-hardening/spec.md` are implemented and tested. Dead-code/YAGNI backlog is 0 or explicitly triaged. Magic-number and error-handling hardening complete. Gates PASS. No Critical/High open.

## Advancement gate

100% tasks and all MUST/SHALL must pass. 90–99.99% exception allowed only under AGENTS.md Advancement Exception. Below 90% or any failed MUST/SHALL, advancement forbidden.
