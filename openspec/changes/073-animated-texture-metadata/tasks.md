# Tasks: 073-animated-texture-metadata

> VERIFIED. Entry gate confirmed (072 VERIFIED; baseline 814 unit / 19 e2e green).

- [x] 1. Confirm entry gate (072 VERIFIED; baseline 814 unit / 19 e2e green).
- [x] 2. Add `src/data/AnimatedTexture.ts` (`AnimatedTextureMetadata`, `validateAnimatedTextureMetadata` strict validation, `AnimatedTextureRegistry` with duplicate rejection).
- [x] 3. Add `src/rendering/AnimatedTextureFrame.ts` (`animatedTextureFrameAt`: deterministic wrap, negative-tick clamp, O(1)).
- [x] 4. Add `tests/unit/AnimatedTexture.test.ts` (validation matrix, registry lifecycle, per-frame windows, wrap-around, negative clamping, single-frame, purity).
- [x] 5. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
