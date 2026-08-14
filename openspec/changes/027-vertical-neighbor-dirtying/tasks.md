# Tasks: 027-vertical-neighbor-dirtying

> VERIFIED. Started only after 026 was VERIFIED.

- [x] 1. Confirm entry gate and run baseline.
- [x] 2. Add `ChunkColumn.markSectionDirty(sy)` (range-checked, no allocation).
- [x] 3. Extend `VerticalWorldAccess.setBlockState` to propagate dirtiness across all six section faces (four horizontal + two vertical) after a boundary write.
- [x] 4. Guard propagation so only existing neighbor columns are touched and out-of-range vertical neighbors no-op.
- [x] 5. Test `markSectionDirty` range safety, each of the six face directions, vertical top/bottom no-op, absent-neighbor no-op, interior-write cleanliness, and written-section stays dirty.
- [x] 6. Run typecheck, lint, full unit tests, build, and E2E.
- [x] 7. Record evidence/state and activate 028 only after VERIFIED.
