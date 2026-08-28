# Design: 099-structure-template-format

## Context / current state

No structure representation exists. 100 needs a template format to place; 101 needs the first
structure. The worldgen layer is pure and data-driven (094-098 pattern).

## Target state

A validated `StructureTemplate` (key, size, sparse blocks, entities, connectors) plus
deterministic transforms (Y rotation, x/z mirror, composed mirror-then-rotation) and a
003-pattern registry.

## Invariants

- `size` extents are positive integers ≤ `MAX_TEMPLATE_EXTENT` (64).
- Block/entity/connector coordinates are integers within `[0, extent)` per axis.
- Block positions are unique; connector keys are unique; `blockId` non-negative integers;
  `entityKey` non-empty strings; connector `facing` one of the six `Direction`s.
- Transforms: mirror first, then rotation; rotation is clockwise about +Y (viewed from above)
  around the origin corner; the rotated footprint is `depth × height × width` for 90/270.
- Facing rotation: `north→east→south→west→north` per 90° clockwise; x-mirror swaps
  `east↔west`; z-mirror swaps `north↔south`; `up`/`down` unchanged.
- Identical inputs produce identical transformed output.

## API and data model

```ts
// src/worldgen/StructureTemplate.ts (NEW)
export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
export const MAX_TEMPLATE_EXTENT = 64;

export interface StructureSize { width: number; height: number; depth: number; }
export interface StructureBlock { x: number; y: number; z: number; blockId: number; }
export interface StructureEntity { x: number; y: number; z: number; entityKey: string; }
export interface StructureConnector { key: string; x: number; y: number; z: number; facing: Direction; }
export interface StructureTemplate {
  key: string;
  size: StructureSize;
  blocks: StructureBlock[];
  entities: StructureEntity[];
  connectors: StructureConnector[];
}
export function validateStructureTemplate(input: unknown): StructureTemplate;

export type StructureRotation = 0 | 90 | 180 | 270;
export type StructureMirror = 'none' | 'x' | 'z';
export interface StructureTransform { rotation: StructureRotation; mirror: StructureMirror; }
export function validateStructureTransform(input: unknown): StructureTransform;
export interface TransformedStructure {
  size: StructureSize;
  blocks: StructureBlock[];
  entities: StructureEntity[];
  connectors: StructureConnector[];
}
export function applyStructureTransform(template: StructureTemplate, transform: StructureTransform): TransformedStructure;

export class StructureTemplateRegistry {
  register(template: StructureTemplate): void;
  get(key: string): StructureTemplate | null;
  has(key: string): boolean;
  get size(): number;
  clear(): void;
}
```

## Control / data flow

1. Authors define templates (099 format), validated by `validateStructureTemplate` and stored
   in the registry.
2. 100 placement resolves a template, applies `applyStructureTransform`, and places the
   transformed blocks/entities/connectors into columns.

## Detailed behavior

- Coordinate convention: `north` faces `-z`, `south` faces `+z`, `east` faces `+x`, `west`
  faces `-x`, `up` `+y`, `down` `-y` (Minecraft convention).
- Rotation (about +Y, clockwise from above, around the origin corner), for size
  `(W, H, D)`:
  - 90: `(x, y, z) -> (D - 1 - z, y, x)`, new size `(D, H, W)`.
  - 180: `(x, y, z) -> (W - 1 - x, y, D - 1 - z)`, size unchanged.
  - 270: `(x, y, z) -> (z, y, W - 1 - x)`, new size `(D, H, W)`.
- Mirror: x: `x -> W - 1 - x`; z: `z -> D - 1 - z`; size unchanged.
- Composition: mirror first, then rotation. Connector facings transform with the same rules;
  block and entity coordinates transform identically (entities keep their keys).

## Failure modes

- Validation throws descriptive errors naming the offending field; registry operations reject
  invalid/duplicate registrations atomically.

## Compatibility / migration

Additive.

## Performance / resource constraints

Validation O(blocks + entities + connectors); transform O(same); registry O(1) lookups.
Extents capped at 64 so templates stay small.

## Testing seams

- `tests/unit/StructureTemplate.test.ts` (NEW): validation matrix (bounds, duplicates,
  facings, oversize, bad keys); transform vectors for every rotation and mirror on a known
  template (exact block/entity/connector output incl. facing rotation and transposed sizes);
  composition order; determinism; registry lifecycle/atomicity.

## Observability / debugging

Plain validated data; tests assert exact values.

## Affected files / symbols

- `src/worldgen/StructureTemplate.ts` — NEW.
- `tests/unit/StructureTemplate.test.ts` — NEW.

## Rejected alternatives

- *Rotation around the template center*: origin-corner rotation matches the structure-block
  convention and makes composed transforms easy to reason about.
- *Full 3D rotation set*: only Y-axis rotation and mirrors exist in the scope; the transform
  type is the extension point for more.
- *Dense block grids*: sparse lists keep templates small and validation explicit.

## Downstream dependencies

100 consumes templates for seeded placement; 101 defines the first default template and places
it end-to-end.
