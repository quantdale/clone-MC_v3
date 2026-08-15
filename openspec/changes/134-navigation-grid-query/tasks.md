# Tasks: 134-navigation-grid-query

- [ ] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/navigation-grid-query/spec.md`) and
      validate it against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [ ] **2.1** Create `src/simulation/NavigationGridQuery.ts`: `PathNodeType`, `NavigationWorld`,
      `classifyNode`, `nodeCost`, `isPassable`, `canStandAt`, `movementCost` per design.md.

- [ ] **3.1** Write `tests/unit/NavigationGridQuery.test.ts`: `classifyNode` for each of the five
      kinds (including collision-shape-takes-priority-over-block-id); `nodeCost` ordering +
      `isPassable` partition; `canStandAt` (solid ground + clear headroom, obstructed headroom,
      no ground/not water, floating in water); `movementCost` (finite vs `Infinity`).

- [ ] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. Fix any failure.

- [ ] **5.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
