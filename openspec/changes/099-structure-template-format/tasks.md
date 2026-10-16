# Tasks: 099-structure-template-format

> VERIFIED. Entry gate confirmed (098 VERIFIED; baseline 1095 unit / 19 e2e green).

- [x] 1. Confirm entry gate (098 VERIFIED; baseline 1095 unit / 19 e2e green).
- [x] 2. Add `src/worldgen/StructureTemplate.ts` (`Direction`, `StructureSize`/`StructureBlock`/`StructureEntity`/`StructureConnector`/`StructureTemplate`, strict `validateStructureTemplate` with bounds/duplicate/facing/oversize checks, `StructureTransform` + `validateStructureTransform`, deterministic `applyStructureTransform` with documented mirror-then-rotation composition and facing rotation, `TransformedStructure`, `StructureTemplateRegistry` with atomic rejection).
- [x] 3. Add `tests/unit/StructureTemplate.test.ts` (validation matrix, exact transform vectors for every rotation/mirror and composition, determinism, registry lifecycle/atomicity).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
