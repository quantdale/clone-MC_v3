# Tasks: 024-chunk-column-storage

> VERIFIED. Started only after 023 was VERIFIED.

- [x] 1. Confirm entry gate and run baseline.
- [x] 2. Implement `ChunkColumn` grouping `sectionCount` `ChunkSection`s by (chunkX, chunkZ).
- [x] 3. Implement block get/set routing via 021 `sectionIndex`/`localCoord` with range checks.
- [x] 4. Implement lazy air-section allocation and `getSection`.
- [x] 5. Implement dirty-section tracking (`Set`, `isDirty`, `clearDirty`).
- [x] 6. Implement deterministic serialize/deserialize (per-section paletted data).
- [x] 7. Test air default, cross-section routing, out-of-range, dirty tracking, serialization.
- [x] 8. Run typecheck, lint, full unit tests, build, and E2E.
- [x] 9. Record evidence/state and activate 025 only after VERIFIED.
