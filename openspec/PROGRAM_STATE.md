# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **073-animated-texture-metadata — VERIFIED 100%**
- Active implementation change: **073-animated-texture-metadata — VERIFIED**
- Next change: **074-translucent-surface-rendering — NOT YET ACTIVE (artifacts pending)**
- 073 task ledger: **5 total tasks, 5 completed**
- 073 completion: **100%**
- 073 mandatory animated-texture-metadata requirements: **PASS**
- 073 required-test gate: **PASS — unit 826/826, E2E 19/19**
- 073 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `e445720aeb65d63ce27f8d9633d31b37b7c2d434`
- Next exact action: **Advance to 074-translucent-surface-rendering. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (074 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement dedicated translucent geometry handling and a stable ordering policy (deterministic; orthogonal to 061 RenderLayer data), verify full gate, commit + push, advance program state.**

## What 073 implemented

Change 073 adds time-based animated atlas frame metadata without gameplay coupling.

- `src/data/AnimatedTexture.ts` (NEW) — `AnimatedTextureMetadata { frametimeTicks, frames }`
  (positive integer tick duration; explicit non-empty strip-local frame order);
  `validateAnimatedTextureMetadata` (strict, descriptive errors); `AnimatedTextureRegistry`
  (register/get/has/size/clear, duplicate rejection, 059 pattern).
- `src/rendering/AnimatedTextureFrame.ts` (NEW) — `animatedTextureFrameAt(metadata, tick)`:
  `frames[floor(tick / frametimeTicks) % frames.length]` for non-negative ticks, `frames[0]` for
  negative ticks; O(1), pure, no gameplay coupling.
- `tests/unit/AnimatedTexture.test.ts` (NEW) — 12 tests: validation matrix, registry lifecycle,
  per-frame windows, wrap-around, negative clamping, single-frame and non-sequential orders,
  purity.

## Validation evidence (073)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 826/826 (prior 814 + 12 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 073 is **VERIFIED** at 5/5 (100%). All gates are green: typecheck, lint, the new 073 suites,
the full unit suite (826/826, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 074 (pending artifacts)

`074-translucent-surface-rendering` is named in `CHANGE_SEQUENCE.md` with scope "Dedicated
translucent geometry handling and stable ordering policy." Per `AGENTS.md`, a change lacking full
artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 073 verification.
Change 074 is the next change; its artifacts must be authored and validated before implementation
begins.
