# Design: 073-animated-texture-metadata

## Context / current state

No animated-texture concept exists: atlas entries are static. The engine tick (044) is the natural
time source for animations.

## Target state

`AnimatedTextureMetadata` describes one animated atlas entry (frame duration in ticks + explicit
frame order), validated strictly and registered per ResourceId. `animatedTextureFrameAt(metadata,
tick)` deterministically selects the current frame for any tick without touching gameplay state.

## Invariants

- `frametimeTicks` is a positive integer.
- `frames` is non-empty; every index is a non-negative integer.
- Frame selection: `frames[floor(tick / frametimeTicks) % frames.length]` for `tick >= 0`;
  `frames[0]` for `tick < 0`.
- Purity: same metadata + tick → same frame index.

## API and data model

```ts
// src/data/AnimatedTexture.ts (NEW)
export interface AnimatedTextureMetadata {
  /** Frames advance every this many simulation ticks (positive integer). */
  frametimeTicks: number;
  /** Frame indices in animation order (strip indices, not atlas coordinates). */
  frames: number[];
}
export function validateAnimatedTextureMetadata(input: unknown): AnimatedTextureMetadata;
export class AnimatedTextureRegistry {
  register(key: string, metadata: AnimatedTextureMetadata): void; // duplicate/invalid → throws
  get(key: string): AnimatedTextureMetadata | null;
  has(key: string): boolean;
  get size(): number;
  clear(): void;
}

// src/rendering/AnimatedTextureFrame.ts (NEW)
export function animatedTextureFrameAt(metadata: AnimatedTextureMetadata, tick: number): number;
```

## Control / data flow

1. Content authors provide metadata (e.g., mcmeta-style) for animated atlas entries; validation
   narrows it.
2. A registry holds validated entries keyed by ResourceId string.
3. The render loop (later wiring) computes `animatedTextureFrameAt(metadata, simulationTick)` and
   selects the atlas frame.

## Detailed behavior

- Validation rejects: non-finite/non-positive/non-integer `frametimeTicks`; empty `frames`;
  non-integer or negative frame indices; non-array frames; non-object input.
- The selector wraps deterministically (modulo) and clamps negative ticks (frame 0). Ticks are
  plain numbers (engine ticks per 044: 20 ticks per second).
- Frame indices are strip-local (0 = first frame of the entry's strip); the atlas builder maps them
  to atlas coordinates later.

## Failure modes

- Invalid metadata → validation error at registration time (no silent acceptance).
- Selector has no error path beyond a corrupted (unvalidated) object; callers use validated
  metadata.

## Compatibility / migration

Additive; no existing module or behavior changes.

## Performance / resource constraints

Selector is O(1). Validation is O(frames). Registry is a plain Map.

## Testing seams

- `tests/unit/AnimatedTexture.test.ts` (NEW):
  - validation accept/reject matrix (frametime, frames, index values);
  - registry register/get/has/size/clear/duplicate/invalid;
  - selector: boundaries at exact multiples, wrap-around, tick 0, negative ticks, single-frame
    entries, determinism.

## Observability / debugging

Selector output is a plain frame index; validation errors name the offending field.

## Affected files / symbols

- `src/data/AnimatedTexture.ts` — NEW.
- `src/rendering/AnimatedTextureFrame.ts` — NEW.
- `tests/unit/AnimatedTexture.test.ts` — NEW.

## Rejected alternatives

- *Store atlas coordinates in frames*: couples metadata to a specific atlas layout; strip indices
  keep metadata layout-independent.
- *Interpolation-aware selector*: renderer concern; the metadata/selector stay minimal.
- *Event-driven animation*: needs gameplay coupling; a pure time function is the non-goal answer.

## Downstream dependencies

The atlas builder (later) maps strip indices to atlas regions and the render loop calls
`animatedTextureFrameAt` with the simulation tick.
