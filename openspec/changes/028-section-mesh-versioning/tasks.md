# Tasks: 028-section-mesh-versioning

> VERIFIED. Started only after 027 was VERIFIED.

- [x] 1. Confirm entry gate and run baseline.
- [x] 2. Add `ChunkSection.meshVersion` (starts 0, increments on every `set`).
- [x] 3. Add `ChunkColumn.sectionMeshVersion(sy)` and `isSectionStale(sy, capturedVersion)`.
- [x] 4. Test version starts at 0, increments per mutator, untouched reads 0, stale detection, and serialize reset.
- [x] 5. Run typecheck, lint, full unit tests, build, and E2E.
- [x] 6. Record evidence/state and activate 029 only after VERIFIED.
