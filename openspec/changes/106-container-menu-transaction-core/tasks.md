# Tasks: 106-container-menu-transaction-core

> VERIFIED. Entry gate confirmed (105 VERIFIED; baseline 1172 unit / 19 e2e green).

- [x] 1. Confirm entry gate (105 VERIFIED; baseline 1172 unit / 19 e2e green).
- [x] 2. Add `src/inventory/MenuTransaction.ts` (`MenuCursor`/`MenuSlot`/`ContainerMenu` with strict validation, `createContainerMenu`/`validateContainerMenu`, `MenuTransaction` union leftClick/rightClick/placeOne/quickMove, deterministic immutable `applyMenuTransaction` with merge/swap/split-half/first-fit quick-move rules; out-of-bounds indices throw).
- [x] 3. Add `tests/unit/MenuTransaction.test.ts` (construction matrix, per-transaction vectors, immutability, out-of-bounds throws, determinism).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
