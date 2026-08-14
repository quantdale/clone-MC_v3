# Tasks: 024-chunk-column-storage

> PLANNED. Start only after 023 is VERIFIED.

- [ ] 1. Confirm entry gate and run baseline.
- [ ] 2. Implement `ChunkColumn` grouping `sectionCount` `ChunkSection`s by (chunkX, chunkZ).
- [ ] 3. Implement block get/set routing via 021 `sectionIndex`/`localCoord` with range checks.
- [ ] 4. Implement lazy air-section allocation and `getSection`.
- [ ] 5. Implement dirty-section tracking (`Set`, `isDirty`, `clearDirty`).
- [ ] 6. Implement deterministic serialize/deserialize (per-section paletted data).
- [ ] 7. Test air default, cross-section routing, out-of-range, dirty tracking, serialization.
- [ ] 8. Run typecheck, lint, full unit tests, build, and E2E.
- [ ] 9. Record evidence/state and activate 025 only after VERIFIED.
