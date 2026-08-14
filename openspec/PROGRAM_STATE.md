# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **029-heightmap-storage — VERIFIED 100%**
- Active implementation change: **029-heightmap-storage — VERIFIED (advanced)**
- Next change: **030-chunk-status-model — NOT YET ACTIVE (artifacts missing)**
- 029 task ledger: **6 total tasks, 6 completed**
- 029 completion: **100%**
- 029 mandatory heightmap-storage requirements: **PASS**
- 029 required-test gate: **PASS — unit 449/449, E2E 19/19**
- 029 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `837e2f5a8b38ab0d2a1d1a2f43a014b62f58dd6b`
- Next exact action: **Advance to 030-chunk-status-model. Its directory/artifacts do not yet exist; author proposal/design/tasks/specs/chunk-status-model/spec.md/verification via SPEC_AUTHORING_PROTOCOL.md, validate, then implement explicit chunk-generation lifecycle status independent of visibility on the vertical storage stack, verify full gate, commit + push, advance program state.**

## What 029 implemented

Change 029 added chunk-column surface/motion-blocking heightmap primitives as a storage primitive:

- `src/world/ChunkColumn.ts` — added two `Int16Array(256)` heightmaps (`surfaceHeight`, `motionBlockingHeight`,
  indexed `localZ * 16 + localX`, sentinel `minY - 1`), `readonly minY`/`maxY`, and an optional
  `blockRegistry?: BlockTypeRegistry` in `ChunkColumnOptions`. Exposed `getSurfaceHeight(localX, localZ)`,
  `getMotionBlockingHeight(localX, localZ)`, and `recomputeHeightmaps()`. `setBlockState` updates the affected
  column incrementally (O(1) common case, downward rescan only when the top block is removed/replaced); `deserialize`
  marks the maps stale so the first read recomputes them. Heightmaps are runtime-only and not serialized.
- `tests/unit/HeightmapStorage.test.ts` — 12 tests covering empty sentinels, single-write set, raise on higher
  write, top-removal rescan (and last-block sentinel), water-excluded-from-motion with a registry, optional-registry
  fallback, column independence, `recomputeHeightmaps`, and `deserialize` lazy recompute.

## Validation evidence (029)

- typecheck: PASS
- lint: PASS
- unit: PASS 449/449 (prior 437 + 12 new HeightmapStorage tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 029 is **VERIFIED** at 6/6 (100%). All gates are green: typecheck, lint, full unit suite (449/449), production build, and the required E2E suite (19/19). No advancement exception was needed. The module is additive world-storage infrastructure; the legacy streaming `World.ts` is untouched.

## Next change: 030 (blocked on missing artifacts)

`030-chunk-status-model` is named in `CHANGE_SEQUENCE.md` but its change directory does not yet exist, so it has no proposal/design/tasks/specs/verification. Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code; scope is "Explicit generation lifecycle statuses independent of visibility."

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 029 verification. Change 030 is the next change; its artifacts must be authored and validated before implementation begins.
