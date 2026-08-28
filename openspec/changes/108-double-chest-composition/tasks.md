# Tasks: 108-double-chest-composition

> VERIFIED. Entry gate confirmed (107 VERIFIED; baseline 1216 unit / 19 e2e green).

- [x] 1. Confirm entry gate (107 VERIFIED; baseline 1216 unit / 19 e2e green).
- [x] 2. Add `src/world/DoubleChest.ts` (horizontal adjacency, deterministic order-independent pair key and primary/secondary order, 90-slot double-chest menu bridge with `playerSlotStart` 54, half extraction, unpairing to the surviving half).
- [x] 3. Add `tests/unit/DoubleChest.test.ts` (adjacency matrix, pair-key/order determinism across argument orders, menu construction and validation, transactions across primary/secondary/player regions, extraction round-trip, unpairing vectors, immutability, 052 manager round-trip of two adjacent chest entities).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
