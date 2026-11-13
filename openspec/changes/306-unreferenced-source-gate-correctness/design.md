# Design: 306-unreferenced-source-gate-correctness

## Context/current state

The existing script uses `/(?:import|export)[^'"]*from.../g` on raw source text. A real synthetic repository with `src/Dead.ts` and a commented-out import in `src/main.ts` exits 0. The gate's real-tree pass therefore does not prove that counted edges are syntactic imports. `tests/unit/OrphanGateEnforcement.test.ts` only checks a bare orphan and misses the false pass.

## Browser gate blocker discovered during verification

The full browser suite failed the statistics mining journey; isolated repeats failed 8/10. Three additional instrumented failures captured target `(0,32,-3)` while the eventual target was `(0,31,-2)`, with the original block still intact. The test captures a target immediately after observing a jump without waiting for the player to land. Fix the test precondition, not product behavior: wait until grounded after the jump and allow rendering/target updates after changing pitch, then capture and still require the actual target block to become air and `blocks_broken` to increase. Run repeated real-browser journeys to validate the change. The separate persistence pending-count failure remains under investigation.

## Persistence browser assertion race

The first full browser gate observed pending count 1 after a flush. A controlled reproduction explicitly enqueued the same player snapshot used by periodic autosave after a flush returned `{committed:119, failed:0, health:'ok'}`; the next observation saw count 1 and key `player-state|world-20260821`. A later pending count cannot prove whether the preceding flush succeeded while the game continues generating saves. This establishes a real assertion race, not the exact cause of the original failure. Use `flushed.failed === 0`, measured in the flush operation itself, and retain all 150 post-reload exact edit checks. Add a dedicated real-browser scenario proving a successful flush can be followed by a legitimate new pending player save, then flush that save. Do not infer that the separate queue bug caused the initial failure.

## Urgent save-queue integrity defect discovered during verification

A deterministic real `DirtySaveQueue` test exposes data loss: enqueue A and B(v1), start a two-item drain with A's write held, re-mark B(v2), release A. The batch captured B(v1), then `drainReportUnlocked` deletes key B before checking the epoch, deleting B(v2); it skips the obsolete write and leaves no pending B. The failing assertion observed `[]` instead of `['b']`. Before deleting a batch entry, require both the epoch and current pending entry identity to still match the captured entry. This also skips entries cleared while an earlier write was in flight. An in-flight write's already-established re-mark and failure semantics remain unchanged. This urgent integrity fix is authorized by the repository scope discipline; it is not asserted to explain the separate browser pending-count failure.

## Target state

Parse tracked TypeScript files with the already-locked TypeScript compiler. Collect statically named module specifiers from import/export declarations, import-equals external references, dynamic `import()` and `require()` calls, including type-only syntax. Ignore comments and non-module strings. Resolve only relative specifiers to tracked `.ts` files, including explicit `.ts` and `.js` specifiers and directory index files. Unexpected importer-free source files fail.

## Invariants

The three reviewed entry points remain the only allow-list. Tests may be importers as before. Direct incoming edges, not root-reachability, are the criterion; cycles and type-only imports count. No gameplay retune, dependency or public API change; the urgent save-queue fix preserves the existing durability contract.

## API and data model

No public API change: `node scripts/orphan-check.mjs [--root <root>]` prints the census and uses exit 0 for pass, 1 for unexpected orphan, 2 for scan errors. A map of canonical tracked absolute paths to relative paths supplies graph identity.

## Control/data flow

List tracked source/tests using Git, parse each tracked TypeScript file, collect AST module references, resolve relative references against tracked source paths, then subtract incoming targets and allow-listed paths from tracked sources.

## Detailed behavior

Static `import` (including side-effect and type-only), `export ... from`, `import x = require('...')`, literal dynamic `import('...')`, and literal `require('...')` each supply a reference. Nonliteral dynamic expressions are not statically resolvable and do not establish an edge. Module names occurring in comments or unrelated strings do not count. An explicit `.js` relative specifier can resolve to its TypeScript counterpart, matching TypeScript's standard source convention. Resolved target must be in tracked sources.

## Failure modes

Unreadable tracked files, malformed source syntax and Git listing failure terminate nonzero with a diagnostic, never a passing census. A missing or invalid root flag is an error. Unexpected orphans produce exit 1 naming each path.

## Compatibility/migration

No persisted state changes; the checker is intentionally stricter. If existing code depends on a real supported edge, tests demonstrate it before changing any allow-list.

## Performance/resource constraints

Single parse per tracked source/test file, linear AST traversal and bounded constant-count path candidates per reference; no filesystem tree walk or network operation. Complete within the existing 30-second real-tree fixture timeout on this host.

## Testing seams

Execute the actual script against separate synthetic Git roots. Exercise comments, strings, genuine static/re-export/type/side-effect/dynamic/import-equals/require edges, explicit extensions, directory index resolution, missing modules, syntax errors, missing root, and the live tree. Capture red-before proof for the reported defect.

## Observability/debugging

Retain orphan names and entry-point census; errors identify the offending file or Git operation.

## Affected files/symbols

`scripts/orphan-check.mjs`, `tests/unit/OrphanGateEnforcement.test.ts`, `tests/e2e/statistics.spec.ts` and `tests/e2e/persistence.spec.ts` (browser gate blockers), `src/storage/DirtySaveQueue.ts` and its tests (urgent data-loss fix), `ONBOARDING.md`, state and change artifacts, reviewed file-audit manifest.

## Rejected alternatives

Stripping comments with a regex cannot reliably distinguish strings, template literals and comments. A full root reachability graph would alter the existing 305 direct-importer contract and is separately scoped.

## Downstream dependencies

CI, `npm run verify:all` and the gate wiring tests depend on the existing command and its exit status.
