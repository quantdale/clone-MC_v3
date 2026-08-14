/**
 * Deterministic animated-texture frame selection (073). `animatedTextureFrameAt` picks the current
 * frame index for a given simulation tick: `frames[floor(tick / frametimeTicks) % frames.length]`
 * for non-negative ticks, `frames[0]` for negative ticks. Pure and O(1); no gameplay coupling.
 */
import type { AnimatedTextureMetadata } from '../data/AnimatedTexture';

/**
 * The frame index of an animated texture at `tick` (engine ticks, 20/s). Negative ticks clamp to
 * the first frame; non-negative ticks advance every `frametimeTicks` and wrap periodically.
 */
export function animatedTextureFrameAt(metadata: AnimatedTextureMetadata, tick: number): number {
  if (tick < 0) return metadata.frames[0]!;
  const step = Math.floor(tick / metadata.frametimeTicks);
  return metadata.frames[step % metadata.frames.length]!;
}
