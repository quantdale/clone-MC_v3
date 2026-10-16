/**
 * Deterministic animated-texture frame selection (073). `animatedTextureFrameAt` picks the current
 * frame index for a given simulation tick: `frames[floor(tick / frametimeTicks) % frames.length]`
 * for non-negative ticks, `frames[0]` for negative ticks. Pure and O(1); no gameplay coupling.
 *
 * Supporting helpers are data-driven and allocation-bounded: `animatedTextureCycleTicks` reports
 * the full loop length, and `animatedTextureFrameSequence` materializes one frame index per tick
 * into a caller-provided array for bake-style consumers.
 */
import type { AnimatedTextureMetadata } from '../data/AnimatedTexture';

/** Effective frametime guard: non-positive or fractional frametimes clamp to one tick. */
function effectiveFrametime(frametimeTicks: number): number {
  if (!Number.isFinite(frametimeTicks) || frametimeTicks < 1) return 1;
  return Math.floor(frametimeTicks);
}

/**
 * The frame index of an animated texture at `tick` (engine ticks, 20/s). Negative ticks clamp to
 * the first frame; non-negative ticks advance every `frametimeTicks` and wrap periodically.
 * Degenerate metadata (empty frames, non-positive frametime) degrades to frame 0 / 1 tick.
 */
export function animatedTextureFrameAt(metadata: AnimatedTextureMetadata, tick: number): number {
  const frames = metadata.frames;
  if (frames.length === 0) {
    throw new RangeError('animatedTextureFrameAt: metadata.frames must not be empty');
  }
  if (!Number.isFinite(tick) || tick < 0) return frames[0]!;
  const step = Math.floor(tick / effectiveFrametime(metadata.frametimeTicks));
  return frames[step % frames.length]!;
}

/** Total engine ticks for one full animation loop (frames × effective frametime). */
export function animatedTextureCycleTicks(metadata: AnimatedTextureMetadata): number {
  return metadata.frames.length * effectiveFrametime(metadata.frametimeTicks);
}

/**
 * Fill `dest[0..count)` with the frame indices for consecutive ticks starting at `startTick`
 * (baked playback). Returns the filled array; no intermediate allocations.
 */
export function animatedTextureFrameSequence(
  metadata: AnimatedTextureMetadata,
  startTick: number,
  count: number,
  dest: number[],
): number[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`animatedTextureFrameSequence: count must be a non-negative integer: ${count}`);
  }
  const base = Math.max(0, Math.floor(startTick));
  for (let i = 0; i < count; i++) {
    dest[i] = animatedTextureFrameAt(metadata, base + i);
  }
  return dest;
}
