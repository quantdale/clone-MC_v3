# Tasks: 054-deterministic-rng-streams

> IMPLEMENTED. 053 was VERIFIED; 054 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (053 VERIFIED; baseline 658 unit / 19 e2e green).
- [x] 2. Add `src/simulation/SeedRng.ts` (`SeedRng` mulberry32 with `next`/`nextFloat`/`nextInt`/`nextIntInclusive`/`nextBoolean`/`fork(name)`/`state`; `createNamedRng(worldSeed, streamName)`; FNV-1a string hash; RangeError on invalid args).
- [x] 3. Add `tests/unit/SeedRng.test.ts` (determinism, named-stream isolation, ranges, fork determinism, state exposure, invalid args).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
