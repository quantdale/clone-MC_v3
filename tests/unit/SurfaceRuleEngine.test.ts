import { describe, it, expect } from 'vitest';
import {
  applySurfaceRules,
  evaluateSurfaceCondition,
  validateSurfaceRules,
  type SurfaceCondition,
  type SurfaceRule,
  type SurfaceRuleContext,
} from '../../src/worldgen/SurfaceRuleEngine';

const GRASS = 2;
const SAND = 12;
const GRAVEL = 13;

function context(overrides: Partial<SurfaceRuleContext> = {}): SurfaceRuleContext {
  return {
    biomeKey: 'plains',
    x: 0,
    y: 70,
    z: 0,
    depthFromSurface: 0,
    noise: (id) => (id === 'high' ? 0.8 : 0.2),
    ...overrides,
  };
}

describe('evaluateSurfaceCondition', () => {
  it('evaluates leaf conditions', () => {
    expect(evaluateSurfaceCondition({ type: 'always' }, context())).toBe(true);
    expect(evaluateSurfaceCondition({ type: 'biome', biomeKey: 'plains' }, context())).toBe(true);
    expect(evaluateSurfaceCondition({ type: 'biome', biomeKey: 'desert' }, context())).toBe(false);
    expect(evaluateSurfaceCondition({ type: 'height', minY: 60, maxY: 80 }, context())).toBe(true);
    expect(evaluateSurfaceCondition({ type: 'height', minY: 80, maxY: 100 }, context())).toBe(false);
    expect(evaluateSurfaceCondition({ type: 'noise', noiseId: 'high', threshold: 0.5 }, context())).toBe(true);
    expect(evaluateSurfaceCondition({ type: 'noise', noiseId: 'low', threshold: 0.5 }, context())).toBe(false);
  });

  it('evaluates compositions with fixed-order short-circuit', () => {
    expect(evaluateSurfaceCondition({ type: 'not', condition: { type: 'always' } }, context())).toBe(false);
    expect(
      evaluateSurfaceCondition(
        { type: 'and', conditions: [{ type: 'biome', biomeKey: 'plains' }, { type: 'height', minY: 0, maxY: 100 }] },
        context(),
      ),
    ).toBe(true);
    expect(
      evaluateSurfaceCondition(
        { type: 'and', conditions: [{ type: 'biome', biomeKey: 'desert' }, { type: 'always' }] },
        context(),
      ),
    ).toBe(false);
    expect(
      evaluateSurfaceCondition(
        { type: 'or', conditions: [{ type: 'biome', biomeKey: 'desert' }, { type: 'always' }] },
        context(),
      ),
    ).toBe(true);
    expect(
      evaluateSurfaceCondition(
        { type: 'or', conditions: [{ type: 'biome', biomeKey: 'desert' }, { type: 'biome', biomeKey: 'ocean' }] },
        context(),
      ),
    ).toBe(false);
  });
});

describe('applySurfaceRules', () => {
  const rules: SurfaceRule[] = [
    { condition: { type: 'biome', biomeKey: 'plains' }, blockId: GRASS },
    { condition: { type: 'biome', biomeKey: 'desert' }, blockId: SAND, depth: 2 },
    { condition: { type: 'noise', noiseId: 'high', threshold: 0.5 }, blockId: GRAVEL },
  ];

  it('returns the first matching rule (order matters)', () => {
    expect(applySurfaceRules(rules, context(), 1)).toBe(GRASS);
    // A desert context: the first rule fails, the second matches.
    expect(applySurfaceRules(rules, context({ biomeKey: 'desert' }), 1)).toBe(SAND);
  });

  it('honors depth coverage', () => {
    const desertCtx = context({ biomeKey: 'desert' });
    expect(applySurfaceRules(rules, { ...desertCtx, depthFromSurface: 0 }, 1)).toBe(SAND);
    expect(applySurfaceRules(rules, { ...desertCtx, depthFromSurface: 1 }, 1)).toBe(SAND);
    // The noise rule has default depth 1 → at depth 2 nothing matches.
    expect(applySurfaceRules(rules, { ...desertCtx, depthFromSurface: 2 }, 1)).toBeNull();

    // A non-desert context falls through the biome rules to the depth-1 noise rule at depth 0.
    expect(applySurfaceRules(rules, context({ biomeKey: 'ocean' }), 1)).toBe(GRAVEL);
    expect(applySurfaceRules(rules, context({ biomeKey: 'ocean', depthFromSurface: 1 }), 1)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    const rules2: SurfaceRule[] = [{ condition: { type: 'biome', biomeKey: 'ocean' }, blockId: SAND }];
    expect(applySurfaceRules(rules2, context(), 1)).toBeNull();
  });

  it('is pure and deterministic', () => {
    const rulesJson = JSON.stringify(rules);
    const a = applySurfaceRules(rules, context(), 1);
    const b = applySurfaceRules(rules, context(), 1);
    expect(a).toBe(b);
    expect(JSON.stringify(rules)).toBe(rulesJson);
  });
});

describe('validateSurfaceRules', () => {
  it('accepts valid rule sets', () => {
    const valid: SurfaceRule[] = [
      { condition: { type: 'always' }, blockId: GRASS },
      { condition: { type: 'and', conditions: [{ type: 'biome', biomeKey: 'plains' }] }, blockId: SAND, depth: 2 },
    ];
    expect(validateSurfaceRules(valid)).toEqual(valid);
  });

  it('rejects unknown types, malformed fields, invalid depths, and bad ids', () => {
    expect(() => validateSurfaceRules([{ condition: { type: 'moon' }, blockId: 1 }])).toThrow(/condition type/i);
    expect(() => validateSurfaceRules([{ condition: { type: 'biome' }, blockId: 1 }])).toThrow(/biomeKey/i);
    expect(() => validateSurfaceRules([{ condition: { type: 'height', minY: 5, maxY: 5 }, blockId: 1 }])).toThrow(
      /height/i,
    );
    expect(() => validateSurfaceRules([{ condition: { type: 'noise', noiseId: 'x' }, blockId: 1 }])).toThrow(
      /threshold/i,
    );
    expect(() => validateSurfaceRules([{ condition: { type: 'always' }, blockId: -1 }])).toThrow(/blockId/i);
    expect(() => validateSurfaceRules([{ condition: { type: 'always' }, blockId: 1, depth: 0 }])).toThrow(/depth/i);
    expect(() => validateSurfaceRules([{ condition: { type: 'and', conditions: [] }, blockId: 1 }])).toThrow(
      /conditions/i,
    );
    expect(() => validateSurfaceRules('nope')).toThrow(/array/i);
  });

  it('rejects over-deep compositions', () => {
    let condition: SurfaceCondition = { type: 'always' };
    for (let i = 0; i < 70; i++) {
      condition = { type: 'not', condition };
    }
    expect(() => validateSurfaceRules([{ condition, blockId: 1 }])).toThrow(/depth/i);
  });
});
