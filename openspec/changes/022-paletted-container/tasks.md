# Tasks: 022-paletted-container

> PLANNED. Start only after 021 is VERIFIED.

- [ ] 1. Confirm entry gate and run baseline.
- [ ] 2. Implement `PackedIntegerArray` (bits/capacity, get/set, resize, serialize).
- [ ] 3. Implement `PalettedContainer<T>` runtime palette with `keyOf` identity and ordinal lookup.
- [ ] 4. Implement dynamic bit-width resize on palette growth (4..16 bits).
- [ ] 5. Implement deterministic serialize/deserialize (versioned, encode/decode id mapping).
- [ ] 6. Provide default/identity decode/encode for numeric values.
- [ ] 7. Test round-trips, resize thresholds, de-duplication, large/negative values, and serialization.
- [ ] 8. Run typecheck, lint, full unit tests, build, and E2E.
- [ ] 9. Record evidence/state and activate 023 only after VERIFIED.
