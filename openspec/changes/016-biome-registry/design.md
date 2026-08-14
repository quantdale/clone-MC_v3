# Design: 016-biome-registry

## Context / current state

Biomes have no typed representation. World/rendering code uses scattered constants. There is no
single source of truth for a biome's temperature, precipitation, or colors.

## Target state

`src/data/Biome.ts` defines biome types as first-class, ResourceId-identified data, in a
`BiomeRegistry`. This is the data foundation for future biome-aware generation, coloring, and
climate; it does not alter current world code.

## Invariants

- `category` MUST be one of the known `BiomeCategory` values.
- `precipitation` MUST be one of `NONE` | `RAIN` | `SNOW`.
- `temperature` MUST be finite and within `[-2, 5]`.
- `grassColor`, `foliageColor`, and optional `waterColor`/`fogColor` MUST be finite integers in
  `[0, 0xFFFFFF]`.
- A biome with `precipitation: 'SNOW'` MUST have `temperature <= 0.15` (snow only forms where it
  is cold enough); otherwise construction MUST fail.
- Ids MUST be unique.

## API and data model

```ts
export type BiomeCategory =
  | 'OCEAN' | 'PLAINS' | 'DESERT' | 'EXTREME_HILLS' | 'FOREST'
  | 'TAIGA' | 'SWAMP' | 'RIVER' | 'SNOWY_TUNDRA' | 'JUNGLE' | 'MUSHROOM';
export type BiomePrecipitation = 'NONE' | 'RAIN' | 'SNOW';
/** 24-bit RGB color packed as 0xRRGGBB. */
export type BiomeColor = number;

export interface BiomeTypeDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  readonly category: BiomeCategory;
  readonly temperature: number;          // finite, [-2, 5]
  readonly precipitation: BiomePrecipitation;
  readonly grassColor: BiomeColor;       // [0, 0xFFFFFF]
  readonly foliageColor: BiomeColor;     // [0, 0xFFFFFF]
  readonly waterColor?: BiomeColor;      // [0, 0xFFFFFF]
  readonly fogColor?: BiomeColor;        // [0, 0xFFFFFF]
}

export interface BiomeColorRGB { readonly r: number; readonly g: number; readonly b: number; }

export class BiomeError extends Error {
  readonly reason: 'INVALID_VALUE' | 'INVALID_FLAG' | 'INVALID_DEFINITION' | 'DUPLICATE_ID';
}

export class BiomeRegistry {
  constructor(definitions: BiomeTypeDefinition[]); // validates + finalizes
  get(id): BiomeTypeDefinition;
  getOptional(id): BiomeTypeDefinition | undefined;
  has(id): boolean;
  getByKey(key): BiomeTypeDefinition | undefined;
  getByRuntimeId(runtimeId): BiomeTypeDefinition;
  readonly size: number;
  readonly finalized: boolean;
  entries(): readonly BiomeTypeDefinition[];
}

export function biomeColorFromRGB(rgb: BiomeColorRGB): BiomeColor;
export function biomeColorToRGB(color: BiomeColor): BiomeColorRGB;
export function createDefaultBiomeRegistry(): BiomeRegistry;
```

Default types (ids `minecraft:biome/<key>`), colors in 24-bit RGB:

| key | category | precip | temp | grass | foliage |
|---|---|---|---|---|---|
| plains | PLAINS | RAIN | 0.8 | 0x7cbd6b | 0x4b9c3a |
| desert | DESERT | NONE | 2.0 | 0xbfb755 | 0x9e8b3f |
| ocean | OCEAN | RAIN | 0.5 | 0x8eb971 | 0x4b9c3a |
| mountains | EXTREME_HILLS | RAIN | 0.2 | 0x7cbd6b | 0x4b9c3a |
| forest | FOREST | RAIN | 0.7 | 0x79c05a | 0x59ae30 |
| taiga | TAIGA | RAIN | 0.25 | 0x86b783 | 0x68a55f |
| snowy_tundra | SNOWY_TUNDRA | SNOW | 0.0 | 0x80b497 | 0x60a17b |
| swampland | SWAMP | RAIN | 0.8 | 0x6a7039 | 0x4b9c3a |
| jungle | JUNGLE | RAIN | 0.95 | 0x6aa321 | 0x4b9c3a |
| mushroom_fields | MUSHROOM | RAIN | 0.9 | 0xa0a0a0 | 0xa0a0a0 |

Each default biome also sets `waterColor` (default 0x3f76e4 when absent) and `fogColor`
(default 0xc0d8ff when absent) via the factory to keep the definition terse.

## Control / data flow

Construction validates each definition (unique id, known category/precipitation, finite bounded
temperature, integer colors in range, snow/temperature consistency), then registers into the 003
core and finalizes. Lookup is O(1) via the core; `getByKey` indexes by `key` string.

## Failure modes

- Non-finite/out-of-range `temperature` or color -> `BiomeError` (INVALID_VALUE).
- Unknown `category` or `precipitation` -> `INVALID_FLAG`.
- Snow biome warmer than 0.15 -> `INVALID_DEFINITION`.
- Duplicate id -> `DUPLICATE_ID`.

All failures are atomic at construction time.

## Compatibility / migration

Purely additive data; no persisted or call-site changes.

## Performance / resource constraints

Registry lookup O(1); validation is one-pass at construction; color pack/unpack helpers are
O(1) and allocation-free beyond the small result object.

## Testing seams

`tests/unit/Biome.test.ts` covers validation/error paths, default registry contents/colors,
snow/temperature consistency, color pack/unpack round-trip, and runtime-id lookup. No current
world/terrain code is touched, so existing tests remain valid.

## Affected files / symbols

- `src/data/Biome.ts` (new)
- `tests/unit/Biome.test.ts` (new)

## Rejected alternatives

- Storing colors as separate r/g/b fields: a packed 24-bit `BiomeColor` matches downstream
  rendering integer conventions and keeps definitions compact; `biomeColorFromRGB`/`toRGB`
  provide ergonomic access.
- Modeling biomes under `src/world/`: biomes are data, consistent with 012-015 in `src/data/`;
  generation/coloring consumers are deferred.

## Downstream dependencies

Future biome-aware terrain generation, sky/fog coloring, and climate consumers can resolve biome
types from this registry without defining their own schema.
