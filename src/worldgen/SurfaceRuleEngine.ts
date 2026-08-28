/**
 * Surface rule engine (091). `applySurfaceRules` replaces a cell's block id with the first rule
 * whose condition holds and whose `depth` covers `ctx.depthFromSurface` (0 = surface cell,
 * increasing downward), or null to keep the current block. Conditions compose biome keys, y
 * ranges, and noise thresholds (always/biome/height/noise/not/and/or). Evaluation is pure and
 * deterministic; `validateSurfaceRules` is strict (depth ≥ 1, block ids ≥ 0, composition depth
 * ≤ 64).
 */
export type SurfaceCondition =
  | { type: 'always' }
  | { type: 'biome'; biomeKey: string }
  | { type: 'height'; minY: number; maxY: number }
  | { type: 'noise'; noiseId: string; threshold: number }
  | { type: 'not'; condition: SurfaceCondition }
  | { type: 'and'; conditions: SurfaceCondition[] }
  | { type: 'or'; conditions: SurfaceCondition[] };

/** One surface replacement rule. */
export interface SurfaceRule {
  condition: SurfaceCondition;
  blockId: number;
  /** Number of surface layers (from depth 0) this rule replaces; default 1. */
  depth?: number;
}

/** Per-cell surface rule context. */
export interface SurfaceRuleContext {
  biomeKey: string;
  x: number;
  y: number;
  z: number;
  /** 0 = the surface cell; increases downward. */
  depthFromSurface: number;
  /** Caller-owned noise sampler (087 instances). */
  noise(id: string, x: number, y: number, z: number): number;
}

const MAX_COMPOSITION_DEPTH = 64;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Evaluate a surface condition against a context (pure). */
export function evaluateSurfaceCondition(condition: SurfaceCondition, ctx: SurfaceRuleContext): boolean {
  switch (condition.type) {
    case 'always':
      return true;
    case 'biome':
      return ctx.biomeKey === condition.biomeKey;
    case 'height':
      return ctx.y >= condition.minY && ctx.y < condition.maxY;
    case 'noise':
      return ctx.noise(condition.noiseId, ctx.x, ctx.y, ctx.z) > condition.threshold;
    case 'not':
      return !evaluateSurfaceCondition(condition.condition, ctx);
    case 'and':
      for (const sub of condition.conditions) {
        if (!evaluateSurfaceCondition(sub, ctx)) return false;
      }
      return true;
    case 'or':
      for (const sub of condition.conditions) {
        if (evaluateSurfaceCondition(sub, ctx)) return true;
      }
      return false;
  }
}

/**
 * Apply a rule set to a cell: returns the first matching rule's block id, or null when no rule
 * matches (keep the current block). Pure; never mutates inputs.
 */
export function applySurfaceRules(rules: readonly SurfaceRule[], ctx: SurfaceRuleContext, _currentBlockId: number): number | null {
  for (const rule of rules) {
    const depth = rule.depth ?? 1;
    if (ctx.depthFromSurface < depth && evaluateSurfaceCondition(rule.condition, ctx)) {
      return rule.blockId;
    }
  }
  return null;
}

function validateCondition(input: unknown, depth: number, path: string): SurfaceCondition {
  if (depth < 0) {
    throw new Error(`SurfaceRule: ${path} exceeds maximum composition depth ${MAX_COMPOSITION_DEPTH}`);
  }
  if (typeof input !== 'object' || input === null) {
    throw new Error(`SurfaceRule: ${path} condition must be an object`);
  }
  const r = input as Record<string, unknown>;
  switch (r.type) {
    case 'always':
      return input as SurfaceCondition;
    case 'biome':
      if (typeof r.biomeKey !== 'string' || r.biomeKey.length === 0) {
        throw new Error(`SurfaceRule: ${path} biome biomeKey must be a non-empty string`);
      }
      return input as SurfaceCondition;
    case 'height':
      if (!isFiniteNumber(r.minY) || !isFiniteNumber(r.maxY) || (r.maxY as number) <= (r.minY as number)) {
        throw new Error(`SurfaceRule: ${path} height requires finite minY < maxY`);
      }
      return input as SurfaceCondition;
    case 'noise':
      if (typeof r.noiseId !== 'string' || !isFiniteNumber(r.threshold)) {
        throw new Error(`SurfaceRule: ${path} noise requires a noiseId string and finite threshold`);
      }
      return input as SurfaceCondition;
    case 'not':
      validateCondition(r.condition, depth - 1, `${path}.condition`);
      return input as SurfaceCondition;
    case 'and':
    case 'or': {
      if (!Array.isArray(r.conditions) || r.conditions.length === 0) {
        throw new Error(`SurfaceRule: ${path} ${r.type} requires a non-empty conditions array`);
      }
      for (let i = 0; i < r.conditions.length; i++) {
        validateCondition(r.conditions[i], depth - 1, `${path}.conditions[${i}]`);
      }
      return input as SurfaceCondition;
    }
    default:
      throw new Error(`SurfaceRule: ${path} unknown condition type: ${String(r.type)}`);
  }
}

/** Validate an unknown value as a rule list; throws a descriptive error otherwise. */
export function validateSurfaceRules(input: unknown, maxDepth: number = MAX_COMPOSITION_DEPTH): SurfaceRule[] {
  if (!Array.isArray(input)) {
    throw new Error('SurfaceRules: must be an array');
  }
  const rules: SurfaceRule[] = [];
  for (let i = 0; i < input.length; i++) {
    const raw = input[i];
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`SurfaceRules[${i}]: must be an object`);
    }
    const r = raw as Record<string, unknown>;
    validateCondition(r.condition, maxDepth, `SurfaceRules[${i}].condition`);
    if (!isFiniteNumber(r.blockId) || !Number.isInteger(r.blockId) || (r.blockId as number) < 0) {
      throw new Error(`SurfaceRules[${i}]: blockId must be a non-negative integer`);
    }
    if (r.depth !== undefined && (!Number.isInteger(r.depth) || (r.depth as number) < 1)) {
      throw new Error(`SurfaceRules[${i}]: depth must be a positive integer`);
    }
    rules.push({ condition: r.condition as SurfaceCondition, blockId: r.blockId as number, ...(r.depth !== undefined ? { depth: r.depth as number } : {}) });
  }
  return rules;
}
