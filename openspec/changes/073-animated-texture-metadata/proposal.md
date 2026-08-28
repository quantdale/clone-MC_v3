# Proposal: 073-animated-texture-metadata

## Problem

Texture atlases need animated entries (water, lava, fire, portals) whose frames change over time.
No metadata model or deterministic frame selector exists, and the selector must not couple to
gameplay.

## Goals

- A validated data model for animated texture metadata: frame timing (in simulation ticks) and an
  explicit frame order.
- A pure, deterministic frame selector: given metadata and a tick, return the current frame index;
  wraps periodically, clamps negative ticks.
- A registry for validated metadata keyed by ResourceId (project pattern), with duplicate rejection.

## Non-goals

- Atlas building or texture storage (a later atlas change consumes the metadata).
- Interpolation between frames or easing (a renderer concern).
- Gameplay/system coupling: the selector is a pure function of (metadata, tick).

## Preconditions

- Change 072 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 072 baseline (814 unit / 19 e2e).

## Dependencies

- 003 generic registry core; 059 registry/validation patterns; 044 tick semantics (20 ticks/s).

## Proposed change

- `src/data/AnimatedTexture.ts` (NEW): `AnimatedTextureMetadata { frametimeTicks: number; frames:
  number[] }`; `validateAnimatedTextureMetadata(input)` (strict); `AnimatedTextureRegistry`
  (register/get/has/size/clear, duplicate rejection, validated inputs).
- `src/rendering/AnimatedTextureFrame.ts` (NEW): `animatedTextureFrameAt(metadata, tick): number`
  (deterministic; wraps; clamps negative ticks to frame 0).
- `tests/unit/AnimatedTexture.test.ts` (NEW): validation, registry, selector.

## Compatibility and migration

Additive: new module + new file; nothing existing changes.

## Risks

- Frame indices are atlas-strip indices, not atlas coordinates — documented to avoid ambiguity with
  the later atlas change.
- Tick semantics must match the engine clock (044, 20 ticks/s) — documented in the selector
  contract.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Metadata validates strictly: positive integer `frametimeTicks`, non-empty non-negative integer
  `frames`; every violation throws a descriptive error.
- Registry rejects duplicates and invalid metadata; lookups follow the 059 pattern.
- `animatedTextureFrameAt` returns `frames[floor(tick / frametimeTicks) % frames.length]` for
  non-negative ticks and `frames[0]` for negative ticks; identical inputs → identical outputs.
- Full gate green; 073 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 073 suite; E2E stays 19/19.
