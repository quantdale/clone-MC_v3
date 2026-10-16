/**
 * Animated texture metadata (073). An animated atlas entry is described by `AnimatedTextureMetadata`:
 * a positive `frametimeTicks` (simulation ticks per frame, 20 ticks/s per 044) and an explicit,
 * non-empty `frames` order of strip-local frame indices (not atlas coordinates). Validation is
 * strict and descriptive; `AnimatedTextureRegistry` stores validated metadata per string key with
 * duplicate rejection (059 pattern). Frame selection over time is pure and lives in
 * `src/rendering/AnimatedTextureFrame.ts`.
 */

/** Metadata for one animated atlas entry. */
export interface AnimatedTextureMetadata {
  /** Frames advance every this many simulation ticks (positive integer). */
  frametimeTicks: number;
  /** Frame indices in animation order (strip-local, 0-based; not atlas coordinates). */
  frames: number[];
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Validate an unknown value as `AnimatedTextureMetadata`. Returns the same value (narrowed) on
 * success; throws a descriptive `Error` naming the offending field.
 */
export function validateAnimatedTextureMetadata(input: unknown): AnimatedTextureMetadata {
  if (typeof input !== 'object' || input === null) {
    throw new Error('AnimatedTextureMetadata: must be an object');
  }
  const r = input as Record<string, unknown>;
  if (!isPositiveInteger(r.frametimeTicks)) {
    throw new Error(`AnimatedTextureMetadata: frametimeTicks must be a positive integer, got ${String(r.frametimeTicks)}`);
  }
  if (!Array.isArray(r.frames) || r.frames.length === 0) {
    throw new Error('AnimatedTextureMetadata: frames must be a non-empty array');
  }
  for (let i = 0; i < r.frames.length; i++) {
    const frame = r.frames[i];
    if (!isNonNegativeInteger(frame)) {
      throw new Error(`AnimatedTextureMetadata: frames[${i}] must be a non-negative integer, got ${String(frame)}`);
    }
  }
  return { frametimeTicks: r.frametimeTicks, frames: r.frames.slice() as number[] };
}

/** Registry of validated animated-texture metadata keyed by string key. */
export class AnimatedTextureRegistry {
  private readonly entries = new Map<string, AnimatedTextureMetadata>();

  /** Register validated metadata; throws on duplicate keys or invalid metadata. */
  register(key: string, metadata: AnimatedTextureMetadata): void {
    if (this.entries.has(key)) {
      throw new Error(`AnimatedTextureRegistry: duplicate key: ${key}`);
    }
    this.entries.set(key, validateAnimatedTextureMetadata(metadata));
  }

  /** The metadata for `key`, or null when absent. */
  get(key: string): AnimatedTextureMetadata | null {
    return this.entries.get(key) ?? null;
  }

  /** Whether `key` is registered. */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Number of registered entries. */
  get size(): number {
    return this.entries.size;
  }

  /** Remove all entries. */
  clear(): void {
    this.entries.clear();
  }
}
