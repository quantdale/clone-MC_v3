# Tasks: 226-server-chunk-streaming

## Group 1: Implementation and focused tests

- [x] Implement `src/simulation/ChunkStreaming.ts` — `ChunkKey`, `columnKey`, `ChunkCoord`,
      `SectionSnapshot`, `ChunkSnapshot`, `ChunkStreamOptions`, `InterestDelta`,
      `ChunkUpdate`, and `ChunkStreamManager` with option validation
      (`ChunkStream: <detail>` throws), Chebyshev interest, center-move deltas with
      accumulation, snapshot store with bounded oldest-first eviction and dirty tracking,
      consumed `pendingUpdates`, and `reset()`.
- [x] Unit tests: construction — pristine state (null center, empty interest/store), valid
      defaults, every option-rejection class (viewDistance 0/2.5, maxSnapshots 0/3.5).
- [x] Unit tests: interest — Chebyshev membership incl. boundary, sorted `interest()` list,
      no-center behavior.
- [x] Unit tests: center moves — first call enters everything, one-chunk move delta, delta
      accumulation across moves, non-integer coordinate rejection (state unchanged).
- [x] Unit tests: snapshots — put/get/has round trip, every rejection class (key mismatch,
      non-integer coords, empty sections, duplicate/empty section y, negative/empty data,
      invalid tick), replacement, removal clears dirty, bounded eviction (maxSnapshots 2).
- [x] Unit tests: updates — first update added-only, consumption (second call empty),
      move-then-update removed, late-snapshot surfaces as updated, dirty-inside-interest
      updated, removed snapshot not sent, invalid tick rejection without consumption.
- [x] Unit tests: reset/determinism — reset restores pristine state; two identical
      schedules produce identical update output at every step.

## Group 2: Integration and regression

- [x] `npm run typecheck` and `npm run lint` clean.
- [x] Full unit suite `npm test` green (expect 2922 + new count; full run at
      `--testTimeout=15000` to avoid the documented grid-sweep load flake).
- [x] `npm run build` and `npm run test:e2e` green (22/22).

## Group 3: State, docs, publication

- [x] Update `openspec/PROGRAM_STATE.json` (currentChange 226 VERIFIED, completedTasks,
      validationResults entry with the feature head) and `openspec/PROGRAM_STATE.md`
      (checkpoint block + "What 226 implemented" section; next 227-server-player-movement).
- [x] Commit feature + state advance, push to `origin/main`, verify published head matches
      local HEAD, and report the session.
