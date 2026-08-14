/**
 * Data-driven 3D density composition (087). A `DensityNode` tree (constant, y-gradient, noise,
 * add, multiply, scale, offset, min, max, clamp) is evaluated purely by `evaluateDensity` with
 * fixed child order (a then b; scalars applied after children). `validateDensityNode` strictly
 * rejects unknown types, malformed fields, non-finite scalars, and trees deeper than 64.
 */
import type { ValueNoise3D } from './DensityNoise';

export type DensityNode =
  | { type: 'constant'; value: number }
  | { type: 'yGradient'; minY: number; maxY: number; minValue: number; maxValue: number }
  | {
      type: 'noise';
      noise: ValueNoise3D;
      scaleX: number;
      scaleY: number;
      scaleZ: number;
      offsetX: number;
      offsetY: number;
      offsetZ: number;
    }
  | { type: 'add'; a: DensityNode; b: DensityNode }
  | { type: 'multiply'; a: DensityNode; b: DensityNode }
  | { type: 'scale'; a: DensityNode; factor: number }
  | { type: 'offset'; a: DensityNode; amount: number }
  | { type: 'min'; a: DensityNode; b: DensityNode }
  | { type: 'max'; a: DensityNode; b: DensityNode }
  | { type: 'clamp'; a: DensityNode; min: number; max: number };

/** Reserved for future samplers (climate etc.). */
export type DensityContext = Record<string, never>;

const MAX_DEPTH = 64;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function assertFinite(value: unknown, name: string): void {
  if (!isFiniteNumber(value)) {
    throw new Error(`DensityNode: ${name} must be a finite number, got ${String(value)}`);
  }
}

/**
 * Validate an unknown value as a `DensityNode` tree (depth-capped). Returns the same value
 * (narrowed) on success; throws a descriptive error otherwise.
 */
export function validateDensityNode(input: unknown, maxDepth: number = MAX_DEPTH): DensityNode {
  if (maxDepth < 0) {
    throw new Error(`DensityNode: tree exceeds maximum depth ${MAX_DEPTH}`);
  }
  if (typeof input !== 'object' || input === null) {
    throw new Error('DensityNode: node must be an object');
  }
  const r = input as Record<string, unknown>;
  switch (r.type) {
    case 'constant':
      assertFinite(r.value, 'value');
      return input as DensityNode;
    case 'yGradient':
      assertFinite(r.minY, 'minY');
      assertFinite(r.maxY, 'maxY');
      assertFinite(r.minValue, 'minValue');
      assertFinite(r.maxValue, 'maxValue');
      if ((r.maxY as number) <= (r.minY as number)) {
        throw new Error('DensityNode: yGradient maxY must be greater than minY');
      }
      return input as DensityNode;
    case 'noise':
      assertFinite(r.scaleX, 'scaleX');
      assertFinite(r.scaleY, 'scaleY');
      assertFinite(r.scaleZ, 'scaleZ');
      assertFinite(r.offsetX, 'offsetX');
      assertFinite(r.offsetY, 'offsetY');
      assertFinite(r.offsetZ, 'offsetZ');
      if (typeof r.noise !== 'object' || r.noise === null) {
        throw new Error('DensityNode: noise must be a ValueNoise3D');
      }
      return input as DensityNode;
    case 'add':
    case 'multiply':
    case 'min':
    case 'max': {
      validateDensityNode(r.a, maxDepth - 1);
      validateDensityNode(r.b, maxDepth - 1);
      return input as DensityNode;
    }
    case 'scale':
    case 'offset':
      assertFinite(r.factor ?? r.amount, r.type === 'scale' ? 'factor' : 'amount');
      validateDensityNode(r.a, maxDepth - 1);
      return input as DensityNode;
    case 'clamp':
      assertFinite(r.min, 'min');
      assertFinite(r.max, 'max');
      if ((r.max as number) < (r.min as number)) {
        throw new Error('DensityNode: clamp max must be >= min');
      }
      validateDensityNode(r.a, maxDepth - 1);
      return input as DensityNode;
    default:
      throw new Error(`DensityNode: unknown node type: ${String(r.type)}`);
  }
}

/** Evaluate a density tree at a world sample point (pure; children in fixed order). */
export function evaluateDensity(node: DensityNode, _context: DensityContext, x: number, y: number, z: number): number {
  switch (node.type) {
    case 'constant':
      return node.value;
    case 'yGradient': {
      const t = Math.min(1, Math.max(0, (y - node.minY) / (node.maxY - node.minY)));
      return node.minValue + (node.maxValue - node.minValue) * t;
    }
    case 'noise':
      return node.noise.sample(x * node.scaleX + node.offsetX, y * node.scaleY + node.offsetY, z * node.scaleZ + node.offsetZ);
    case 'add':
      return evaluateDensity(node.a, _context, x, y, z) + evaluateDensity(node.b, _context, x, y, z);
    case 'multiply':
      return evaluateDensity(node.a, _context, x, y, z) * evaluateDensity(node.b, _context, x, y, z);
    case 'scale':
      return evaluateDensity(node.a, _context, x, y, z) * node.factor;
    case 'offset':
      return evaluateDensity(node.a, _context, x, y, z) + node.amount;
    case 'min':
      return Math.min(evaluateDensity(node.a, _context, x, y, z), evaluateDensity(node.b, _context, x, y, z));
    case 'max':
      return Math.max(evaluateDensity(node.a, _context, x, y, z), evaluateDensity(node.b, _context, x, y, z));
    case 'clamp':
      return Math.min(node.max, Math.max(node.min, evaluateDensity(node.a, _context, x, y, z)));
  }
}
