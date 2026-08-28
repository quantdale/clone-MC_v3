# Tasks: 135-a-star-pathfinding

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/a-star-pathfinding/spec.md`) and validate
      it against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [x] **2.1** Create `src/simulation/AStarPathfinding.ts`: `PathNode`, `PathfindOptions`,
      `PathResult`, `findPath` (bounded deterministic A*, fixed 6-directional neighbor order,
      insertion-order-tiebroken open set, best-effort partial result, cancellation), `isPathStale`.

- [x] **3.1** Write `tests/unit/AStarPathfinding.test.ts`: unstandable-start `null`; simple
      open-corridor success; walled-off/unreachable-goal best-effort partial result; a tiny
      `maxExpansions` bound actually cutting off an otherwise-reachable goal; cancellation via
      `isCancelled`; determinism across two identical calls; `isPathStale` fresh/stale/
      before-fromIndex cases. 10 tests.

- [x] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. All green (see verification.md).

- [x] **5.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
