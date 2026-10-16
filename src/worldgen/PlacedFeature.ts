/**
 * Placed feature core (095). A `PlacedFeature` pairs a key with a referenced configured feature
 * key (094) and an ordered chain of placement modifiers. `placeFeature` applies the chain
 * deterministically from a `PlacementContext`, producing placement positions `[x, y, z]`.
 * Modifier semantics: count (expand candidates), rarity (1-in-chance survival), heightRange
 * (uniform y sampling), surfaceHeight (y from the terrain surface callback; added by 098),
 * biomeFilter (biome key membership), survivalFilter (solidity probe).
 * `PlacedFeatureRegistry` stores only validated definitions with atomic rejection (003 pattern).
 */

/** A placement modifier; chains apply in data order (at most one count, survival needs a prior y-definer). */
export type PlacementModifier =
  | { type: 'count'; tries: number }
  | { type: 'rarity'; chance: number }
  | { type: 'heightRange'; minY: number; maxY: number }
  | { type: 'biomeFilter'; biomeKeys: string[] }
  | { type: 'surfaceHeight' }
  | { type: 'survivalFilter' };

/** A keyed, validated placed feature referencing a configured feature (094) by key. */
export interface PlacedFeature {
  key: string;
  featureKey: string;
  modifiers: PlacementModifier[];
}

/**
 * The environment placement runs in: the biome key at the placement column, a solidity probe,
 * the terrain surface height at a column, and a `nextFloat` source. `SeedRng` (054) satisfies
 * `rng` for deterministic production streams.
 */
export interface PlacementContext {
  biomeKey: string;
  isSolid(x: number, y: number, z: number): boolean;
  surfaceY(x: number, z: number): number;
  rng: { nextFloat(): number };
}

/** A candidate position in the modifier chain; y is undefined until a heightRange applies. */
interface Candidate {
  x: number;
  y: number | undefined;
  z: number;
}

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function assertPositive(value: unknown, path: string): void {
  if (!isInteger(value) || value <= 0) {
    throw new Error(`PlacedFeature: ${path} must be a positive integer, got ${String(value)}`);
  }
}

function assertInteger(value: unknown, path: string): void {
  if (!isInteger(value)) {
    throw new Error(`PlacedFeature: ${path} must be an integer, got ${String(value)}`);
  }
}

/** Validate an unknown value as a placement modifier; throws descriptively otherwise. */
export function validatePlacementModifier(input: unknown): PlacementModifier {
  if (typeof input !== 'object' || input === null) {
    throw new Error('PlacedFeature: modifier must be an object');
  }
  const r = input as Record<string, unknown>;
  switch (r.type) {
    case 'count':
      assertPositive(r.tries, 'count.tries');
      return input as PlacementModifier;
    case 'rarity':
      assertPositive(r.chance, 'rarity.chance');
      return input as PlacementModifier;
    case 'heightRange':
      assertInteger(r.minY, 'heightRange.minY');
      assertInteger(r.maxY, 'heightRange.maxY');
      if ((r.minY as number) > (r.maxY as number)) {
        throw new Error(`PlacedFeature: heightRange.minY must be <= maxY (got ${String(r.minY)} > ${String(r.maxY)})`);
      }
      return input as PlacementModifier;
    case 'biomeFilter':
      if (!Array.isArray(r.biomeKeys) || r.biomeKeys.length === 0) {
        throw new Error('PlacedFeature: biomeFilter.biomeKeys must be a non-empty array');
      }
      for (const k of r.biomeKeys) {
        if (typeof k !== 'string' || k.length === 0) {
          throw new Error('PlacedFeature: biomeFilter.biomeKeys entries must be non-empty strings');
        }
      }
      return input as PlacementModifier;
    case 'surfaceHeight':
      return input as PlacementModifier;
    case 'survivalFilter':
      return input as PlacementModifier;
    default:
      throw new Error(`PlacedFeature: unknown modifier type: ${String(r.type)}`);
  }
}

/** Validate an unknown value as a placed feature; throws descriptively otherwise. */
export function validatePlacedFeature(input: unknown): PlacedFeature {
  if (typeof input !== 'object' || input === null) {
    throw new Error('PlacedFeature: must be an object');
  }
  const r = input as Record<string, unknown>;
  if (typeof r.key !== 'string' || r.key.length === 0) {
    throw new Error('PlacedFeature: key must be a non-empty string');
  }
  if (typeof r.featureKey !== 'string' || r.featureKey.length === 0) {
    throw new Error('PlacedFeature: featureKey must be a non-empty string');
  }
  if (!Array.isArray(r.modifiers)) {
    throw new Error('PlacedFeature: modifiers must be an array');
  }
  const modifiers: PlacementModifier[] = r.modifiers.map((m) => validatePlacementModifier(m));
  if (modifiers.filter((m) => m.type === 'count').length > 1) {
    throw new Error('PlacedFeature: at most one count modifier is allowed per placed feature');
  }
  let sawYDefiner = false;
  for (const m of modifiers) {
    if (m.type === 'heightRange' || m.type === 'surfaceHeight') {
      sawYDefiner = true;
    } else if (m.type === 'survivalFilter' && !sawYDefiner) {
      throw new Error('PlacedFeature: survivalFilter requires a preceding heightRange or surfaceHeight modifier');
    }
  }
  return { key: r.key, featureKey: r.featureKey, modifiers };
}

/**
 * Apply `placed`'s modifier chain to a column `(x, z)` with `ctx`, returning surviving positions
 * `[x, y, z]` in chain order. Deterministic: every rng draw occurs at a fixed chain position.
 * Candidates never touched by a heightRange report `y = 0`.
 */
export function placeFeature(
  placed: PlacedFeature,
  ctx: PlacementContext,
  x: number,
  z: number,
): Array<[number, number, number]> {
  let candidates: Candidate[] = [{ x, y: undefined, z }];
  for (const modifier of placed.modifiers) {
    switch (modifier.type) {
      case 'count': {
        const next: Candidate[] = [];
        for (const c of candidates) {
          for (let i = 0; i < modifier.tries; i++) {
            next.push({ x: c.x, y: c.y, z: c.z });
          }
        }
        candidates = next;
        break;
      }
      case 'rarity': {
        const next: Candidate[] = [];
        for (const c of candidates) {
          if (ctx.rng.nextFloat() < 1 / modifier.chance) {
            next.push(c);
          }
        }
        candidates = next;
        break;
      }
      case 'heightRange': {
        const span = modifier.maxY - modifier.minY + 1;
        candidates = candidates.map((c) => ({
          x: c.x,
          y: modifier.minY + Math.floor(ctx.rng.nextFloat() * span),
          z: c.z,
        }));
        break;
      }
      case 'surfaceHeight': {
        candidates = candidates.map((c) => ({ x: c.x, y: ctx.surfaceY(c.x, c.z), z: c.z }));
        break;
      }
      case 'biomeFilter': {
        if (!modifier.biomeKeys.includes(ctx.biomeKey)) {
          candidates = [];
        }
        break;
      }
      case 'survivalFilter': {
        const next: Candidate[] = [];
        for (const c of candidates) {
          if (c.y !== undefined && ctx.isSolid(c.x, c.y, c.z)) {
            next.push(c);
          }
        }
        candidates = next;
        break;
      }
    }
  }
  return candidates.map((c) => [c.x, c.y ?? 0, c.z]);
}

/** Registry of validated placed features (duplicate/invalid rejection, no partial state). */
export class PlacedFeatureRegistry {
  private readonly features = new Map<string, PlacedFeature>();

  register(key: string, featureKey: string, modifiers: PlacementModifier[]): void {
    const placed = validatePlacedFeature({ key, featureKey, modifiers });
    if (this.features.has(key)) {
      throw new Error(`PlacedFeatureRegistry: duplicate key: ${key}`);
    }
    this.features.set(key, placed);
  }

  get(key: string): PlacedFeature | null {
    return this.features.get(key) ?? null;
  }

  has(key: string): boolean {
    return this.features.has(key);
  }

  get size(): number {
    return this.features.size;
  }

  clear(): void {
    this.features.clear();
  }
}
