# Design: 091-surface-rule-engine

## Context / current state

088 generates uniform-stone terrain; 090 selects biomes. Surface replacement (grass on plains,
sand at beaches, gravel underwater) needs a rule engine.

## Target state

`applySurfaceRules(rules, ctx, currentBlockId)` replaces the current cell's block id with the
first matching rule's id (or keeps it), using layered depth semantics. Conditions compose biome,
height, and noise predicates.

## Invariants

- Conditions: `always`; `biome` (key equality); `height` (y in `[minY, maxY)`); `noise`
  (`noise(id, x, y, z) > threshold`); `not`, `and`, `or` compositions.
- Rules are ordered; the first whose condition holds and whose `depth` covers
  `ctx.depthFromSurface` wins; no match → null (keep current).
- `depthFromSurface` 0 is the surface cell; a rule with depth N covers depths 0..N-1.
- Evaluation is pure; validation is strict (depths ≥ 1 integers; block ids ≥ 0; known condition
  types).

## API and data model

```ts
// src/worldgen/SurfaceRuleEngine.ts (NEW)
export type SurfaceCondition =
  | { type: 'always' }
  | { type: 'biome'; biomeKey: string }
  | { type: 'height'; minY: number; maxY: number }
  | { type: 'noise'; noiseId: string; threshold: number }
  | { type: 'not'; condition: SurfaceCondition }
  | { type: 'and'; conditions: SurfaceCondition[] }
  | { type: 'or'; conditions: SurfaceCondition[] };

export interface SurfaceRule {
  condition: SurfaceCondition;
  blockId: number;
  /** Number of surface layers (from depth 0) this rule replaces; default 1. */
  depth?: number;
}

export interface SurfaceRuleContext {
  biomeKey: string;
  x: number; y: number; z: number;
  /** 0 = the surface cell; increases downward. */
  depthFromSurface: number;
  noise(id: string, x: number, y: number, z: number): number;
}

export function evaluateSurfaceCondition(condition: SurfaceCondition, ctx: SurfaceRuleContext): boolean;
export function applySurfaceRules(rules: readonly SurfaceRule[], ctx: SurfaceRuleContext, currentBlockId: number): number | null;
export function validateSurfaceRules(input: unknown, maxDepth?: number): SurfaceRule[];
```

## Control / data flow

1. The wiring (later) walks each column from the surface downward, building a context per cell
   (biome key, depth, noise sampler) and calling `applySurfaceRules`.
2. The engine returns the replacement id or null; the wiring writes it.

## Detailed behavior

- `noise` sampling is via the context callback (caller owns 087 instances).
- `height` is inclusive-min, exclusive-max.
- `and`/`or` evaluate in fixed order with short-circuit; `not` negates.
- Validation caps composition depth at 64 (mirrors 087).

## Failure modes

- Validation throws descriptive errors; application is total over valid inputs.

## Compatibility / migration

Additive.

## Performance / resource constraints

Rule application is O(rules) condition evaluations; validation O(rules).

## Testing seams

- `tests/unit/SurfaceRuleEngine.test.ts` (NEW): condition matrix with a stub noise sampler;
  first-match and depth semantics; no-match; validation matrix (types, depths, block ids,
  composition depth); purity/determinism.

## Observability / debugging

Results are plain ids or null; tests assert exact replacements.

## Affected files / symbols

- `src/worldgen/SurfaceRuleEngine.ts` — NEW.
- `tests/unit/SurfaceRuleEngine.test.ts` — NEW.

## Rejected alternatives

- *Hardcoded rule sets*: the engine is data-driven; default sets are a wiring concern.
- *Rule weights/randomness*: deterministic first-match keeps worldgen reproducible.

## Downstream dependencies

The world wiring applies rules over 088 columns with 090 biomes; 092+ carve and feature the
result.
