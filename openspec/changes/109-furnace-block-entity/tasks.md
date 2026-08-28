# Tasks: 109-furnace-block-entity

> VERIFIED. Entry gate confirmed (108 VERIFIED; baseline 1229 unit / 19 e2e green).

- [x] 1. Confirm entry gate (108 VERIFIED; baseline 1229 unit / 19 e2e green).
- [x] 2. Add `src/world/FurnaceBlockEntity.ts` (`FurnaceState` with strict validation and time invariants, injectable-context deterministic `tickFurnace` (fuel consume on progress, lit = burnTime > 0, pause on blocked output, reset on input removal, cook completion merge), `furnaceIsLit`, 036-envelope serialize/deserialize, 39-slot menu bridge (`playerSlotStart` 3), 052 entity lifecycle, progress/burn fraction helpers).
- [x] 3. Add furnace block (id 20) and item (id 26) to the registries with an original procedural furnace atlas tile (index 28); update registry enumeration tests.
- [x] 4. Add `tests/unit/FurnaceBlockEntity.test.ts` (state validation matrix, envelope round-trips and rejects, tick vectors: burn start/fuel consume, pause on blocked output, reset on input removal, cook completion and result merge, multi-tick determinism, immutability; menu bridge and extraction; entity lifecycle; manager chunk round-trip; registry cross-references).
- [x] 5. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
