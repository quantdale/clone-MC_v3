# Tasks: 023-chunk-section-storage

> PLANNED. Start only after 022 is VERIFIED.

- [ ] 1. Confirm entry gate and run baseline.
- [ ] 2. Implement `ChunkSection` wrapping a `PalettedContainer<BlockStateId>` defaulting to air.
- [ ] 3. Implement slot and in-section coordinate get/set (resolve ids via 007 registry).
- [ ] 4. Implement `fill`, `isEmpty` (single-entry palette fast path), and `nonAirCount`.
- [ ] 5. Implement deterministic serialize/deserialize reusing 022.
- [ ] 6. Test empty/set/boundary/coordinate/fill/nonAir/serialization behavior.
- [ ] 7. Run typecheck, lint, full unit tests, build, and E2E.
- [ ] 8. Record evidence/state and activate 024 only after VERIFIED.
