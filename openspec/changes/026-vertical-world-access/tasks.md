# Tasks: 026-vertical-world-access

> VERIFIED. Started only after 025 was VERIFIED.

- [x] 1. Confirm entry gate and run baseline.
- [x] 2. Implement `VerticalWorldAccess` construction from `DimensionType` + `BlockStateRegistry` (derive `minSectionY`/`sectionCount`, default `airId`).
- [x] 3. Implement full-world `getBlockState`/`setBlockState` routing (chunk X/Z via 16-wide section math, world Y via column) with integer/range guards; no 0–63 slab.
- [x] 4. Implement column management (`hasColumn`/`getColumn`/`ensureColumn`/`removeColumn`/`size`/`columns()`) with lazy creation on write.
- [x] 5. Implement dirty aggregation (`isDirty`/`dirtyColumns`/`clearDirty`) and `serialize`/`deserialize` of the column set (reuse 024).
- [x] 6. Test air default, full-range negative/high Y read/write, cross-column routing, out-of-range/non-integer guards, lazy creation, dirty tracking, and serialization round-trip.
- [x] 7. Run typecheck, lint, full unit tests, build, and E2E.
- [x] 8. Record evidence/state and activate 027 only after VERIFIED.
