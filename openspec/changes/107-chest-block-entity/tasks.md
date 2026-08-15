# Tasks: 107-chest-block-entity

> VERIFIED. Entry gate confirmed (106 VERIFIED; baseline 1192 unit / 19 e2e green).

- [x] 1. Confirm entry gate (106 VERIFIED; baseline 1192 unit / 19 e2e green).
- [x] 2. Add chest block (id 19) and chest item (id 25) to the registries with an original procedural chest atlas tile (index 27); validate cross-references.
- [x] 3. Add `src/world/ChestBlockEntity.ts` (27-slot `ChestInventory` with strict validation, 036-envelope serialize/deserialize, 106 menu bridge with `playerSlotStart` 27, 052 entity lifecycle create/read/update, contents extraction).
- [x] 4. Add `tests/unit/ChestBlockEntity.test.ts` (construction/validation matrix, serialization round-trips and rejects, menu transaction vectors across the chest/player boundary, immutability, entity lifecycle, manager chunk round-trip, registry cross-references).
- [x] 5. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
