# Design: 072-biome-tint-rendering

## Context / current state

016 biomes carry `grassColor`/`foliageColor`/`waterColor`/`fogColor` and color pack/unpack helpers.
059 model faces carry texture/uv/cull data only — a surface cannot declare "tint me like grass".
Nothing maps a biome to a concrete tint color.

## Target state

Model faces may declare `tintindex: 'grass' | 'foliage' | 'water'` (strictly validated), and
`src/rendering/BiomeTint.ts` resolves a biome + kind into a concrete 24-bit RGB tint
deterministically (water falls back to the shared default). Purity: same inputs → same outputs;
no state, no position dependence.

## Invariants

- `TintKind` is exactly `'grass' | 'foliage' | 'water'`; validation rejects anything else.
- `biomeTintColor` maps grass → `grassColor`, foliage → `foliageColor`, water → `waterColor ?? DEFAULT_WATER_COLOR`.
- The water fallback value is the single shared constant also used by 016 definitions.
- `biomeTint` returns `{ kind, color, rgb }` where `rgb` equals `biomeColorToRGB(color)`.

## API and data model

```ts
// src/data/BlockModel.ts (additions)
export type TintKind = 'grass' | 'foliage' | 'water';
export interface BlockModelFace {
  texture: string;
  uv?: [number, number, number, number];
  cullface?: ModelFace | null;
  /** Biome tint kind applied to this face (MC-style tint attribute); absent = untinted. */
  tintindex?: TintKind;
}

// src/data/Biome.ts (additive export)
export const DEFAULT_WATER_COLOR = 0x3f76e4;

// src/rendering/BiomeTint.ts (NEW)
export type { TintKind } from '../data/BlockModel';
export interface BiomeTint { kind: TintKind; color: BiomeColor; rgb: BiomeColorRGB; }
export function biomeTintColor(biome: BiomeTypeDefinition, kind: TintKind): BiomeColor;
export function biomeTint(biome: BiomeTypeDefinition, kind: TintKind): BiomeTint;
```

## Control / data flow

1. Model authors set `tintindex` on faces; `validateBlockModel` narrows and preserves it.
2. At render-preparation time a caller maps a face's `tintindex` to a biome (per position — later
   wiring) and calls `biomeTintColor`/`biomeTint`.
3. `biomeTintColor` reads the biome definition field per kind (water falls back to the shared
   default) and returns the 24-bit color; `biomeTint` additionally splits it into `rgb`.

## Detailed behavior

- Unknown `tintindex` values (e.g., `'leaves'`, `1`, `null`) throw descriptive `Error`s from
  `validateBlockModel`; the field is preserved verbatim on round-trip.
- Biomes are assumed registry-validated (016) — `grassColor`/`foliageColor` always present; only
  `waterColor` is optional, hence the fallback.
- Kind is a closed union: no unknown-kind error path exists at the resolver level.

## Failure modes

- Invalid `tintindex` → validation error at model-validate time (no silent acceptance).
- No resolver failure modes (closed kind union, validated biome).

## Compatibility / migration

Additive. Existing models without `tintindex` validate and behave identically; `validateBlockModel`
output objects simply carry the new optional field when present.

## Performance / resource constraints

Resolver is O(1), allocation-free for `biomeTintColor`; `biomeTint` allocates one small object.
Validation cost is one string check per face.

## Testing seams

- `tests/unit/BlockModel.test.ts`: `tintindex` accepted for all three kinds, rejected for unknown
  values, preserved on round-trip; existing fixtures unchanged.
- `tests/unit/BiomeTint.test.ts` (NEW): grass/foliage/water resolution over the default registry
  (swampland water `0x4e7a4e`; plains water falls back to `0x3f76e4`); `rgb` split; determinism;
  all 10 biomes × 3 kinds resolve.

## Observability / debugging

Resolver outputs are plain values; tests assert exact colors. Validation errors name the invalid
value.

## Affected files / symbols

- `src/data/BlockModel.ts` — `TintKind`, `BlockModelFace.tintindex`, validator.
- `src/data/Biome.ts` — export `DEFAULT_WATER_COLOR`.
- `src/rendering/BiomeTint.ts` — NEW: `BiomeTint`, `biomeTintColor`, `biomeTint`.
- Tests: `BiomeTint.test.ts` NEW; `BlockModel.test.ts` extended.

## Rejected alternatives

- *Numeric tint indices (legacy MC)*: ambiguous across MC versions; string kinds are self-
  documenting and strictly validated.
- *Resolve tint inside the mesher (063)*: meshing has no biome source; the resolver stays pure and a
  later wiring supplies per-position biomes.
- *Only a resolver, no face attribute*: the attribute is the surface-side declaration that makes
  the resolver useful; both halves are the change's contract.

## Downstream dependencies

A later wiring change resolves `tintindex` per position via the biome source and applies
`biomeTint` colors in meshing/rendering; 073+ continue the rendering stack.
