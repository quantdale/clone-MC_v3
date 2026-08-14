# Tasks: 020-resource-data-loader

> VERIFIED. 020 complete; 021 authorized.

- [x] 1. Confirm entry gate and run baseline.
- [x] 2. Define `ResourceReader`, `LoadFileError`, and `LoadedResource`.
- [x] 3. Build `ResourceDataLoader` with ordered load via an injected reader + 019 codec.
- [x] 4. Collect missing-file and decode-failure errors without aborting the batch.
- [x] 5. Add `loadIntoRegistry` keyed by 002 `ResourceId`, surfacing duplicate-key errors.
- [x] 6. Test ordered load, missing-file, decode-failure, mixed-batch resilience.
- [x] 7. Test `loadIntoRegistry` keying and duplicate-key rejection.
- [x] 8. Run typecheck, lint, full unit tests, build, and E2E.
- [x] 9. Record evidence/state and activate 021 only after VERIFIED.
