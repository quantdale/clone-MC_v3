import { describe, it, expect } from 'vitest';
import {
  evaluateDensity,
  validateDensityNode,
  type DensityContext,
  type DensityNode,
} from '../../src/worldgen/DensityComposition';
import { ValueNoise3D } from '../../src/worldgen/DensityNoise';

const CTX: DensityContext = {};

describe('validateDensityNode', () => {
  it('accepts valid nodes of every type', () => {
    const tree: DensityNode = {
      type: 'clamp',
      min: -1,
      max: 1,
      a: {
        type: 'add',
        a: { type: 'constant', value: 1 },
        b: {
          type: 'yGradient',
          minY: 0,
          maxY: 10,
          minValue: -0.5,
          maxValue: 0.5,
        },
      },
    };
    expect(validateDensityNode(tree)).toEqual(tree);
  });

  it('rejects unknown types, malformed fields, and non-finite scalars', () => {
    expect(() => validateDensityNode({ type: 'moon' })).toThrow(/unknown node type/i);
    expect(() => validateDensityNode({ type: 'constant', value: NaN })).toThrow(/value/i);
    expect(() => validateDensityNode({ type: 'constant' })).toThrow(/value/i);
    expect(() =>
      validateDensityNode({ type: 'yGradient', minY: 5, maxY: 5, minValue: 0, maxValue: 1 }),
    ).toThrow(/maxY/i);
    expect(() =>
      validateDensityNode({ type: 'clamp', min: 2, max: 1, a: { type: 'constant', value: 0 } }),
    ).toThrow(/clamp/i);
    expect(() => validateDensityNode({ type: 'add', a: { type: 'constant', value: 1 } })).toThrow(
      /b/i,
    );
  });

  it('rejects trees deeper than 64', () => {
    let node: DensityNode = { type: 'constant', value: 0 };
    for (let i = 0; i < 70; i++) {
      node = { type: 'offset', a: node, amount: 1 };
    }
    expect(() => validateDensityNode(node)).toThrow(/depth/i);
  });
});

describe('evaluateDensity', () => {
  it('evaluates constants and yGradients', () => {
    expect(evaluateDensity({ type: 'constant', value: 3.5 }, CTX, 0, 0, 0)).toBe(3.5);

    const gradient: DensityNode = { type: 'yGradient', minY: 0, maxY: 10, minValue: 0, maxValue: 1 };
    expect(evaluateDensity(gradient, CTX, 0, 5, 0)).toBe(0.5);
    expect(evaluateDensity(gradient, CTX, 0, -5, 0)).toBe(0); // clamped below
    expect(evaluateDensity(gradient, CTX, 0, 20, 0)).toBe(1); // clamped above
  });

  it('evaluates noise nodes with scale and offset', () => {
    const noise = new ValueNoise3D(11);
    const node: DensityNode = {
      type: 'noise',
      noise,
      scaleX: 2,
      scaleY: 1,
      scaleZ: 1,
      offsetX: 3,
      offsetY: 0,
      offsetZ: 0,
    };
    expect(evaluateDensity(node, CTX, 4, 5, 6)).toBe(noise.sample(4 * 2 + 3, 5, 6));
  });

  it('evaluates combinators with fixed child order and scalar application', () => {
    const five = { type: 'constant', value: 5 } as const;
    const three = { type: 'constant', value: 3 } as const;

    expect(evaluateDensity({ type: 'add', a: five, b: three }, CTX, 0, 0, 0)).toBe(8);
    expect(evaluateDensity({ type: 'multiply', a: five, b: three }, CTX, 0, 0, 0)).toBe(15);
    expect(evaluateDensity({ type: 'scale', a: five, factor: 2 }, CTX, 0, 0, 0)).toBe(10);
    expect(evaluateDensity({ type: 'offset', a: five, amount: -2 }, CTX, 0, 0, 0)).toBe(3);
    expect(evaluateDensity({ type: 'min', a: five, b: three }, CTX, 0, 0, 0)).toBe(3);
    expect(evaluateDensity({ type: 'max', a: five, b: three }, CTX, 0, 0, 0)).toBe(5);
    expect(evaluateDensity({ type: 'clamp', a: five, min: 0, max: 4 }, CTX, 0, 0, 0)).toBe(4);
    expect(evaluateDensity({ type: 'clamp', a: five, min: 6, max: 10 }, CTX, 0, 0, 0)).toBe(6);
  });

  it('evaluates nested trees deterministically without mutation', () => {
    const tree: DensityNode = {
      type: 'scale',
      factor: 0.5,
      a: {
        type: 'add',
        a: { type: 'yGradient', minY: 0, maxY: 8, minValue: -1, maxValue: 1 },
        b: { type: 'constant', value: 1 },
      },
    };
    const before = JSON.stringify(tree);
    const a = evaluateDensity(tree, CTX, 1, 4, 2);
    const b = evaluateDensity(tree, CTX, 1, 4, 2);
    expect(a).toBe(b);
    expect(a).toBe(0.5); // ((4/8*2-1) + 1) * 0.5
    expect(JSON.stringify(tree)).toBe(before);
  });
});
