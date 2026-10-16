# Design: 093-aquifer-system

## Context / current state

092 produces carved space; no fluid decisions exist for it.

## Target state

`classifyAquifer` decides each carved cell's fluid; `applyAquifers` fills carved cells
deterministically and purely.

## Invariants

- Decision table: `y >= seaLevel` → NONE; else if `fbm3(dryNoise, x·0.03, y·0.03, z·0.03) >
  dryThreshold` → NONE (dry pocket); else `y < lavaLevel` → LAVA; else WATER.
- Defaults: `seaLevel` 63, `lavaLevel` -54, `dryThreshold` 0.4.
- `applyAquifers` writes only carved cells; non-carved cells are copied unchanged; input never
  mutated.
- Config validation: finite thresholds, integer sea/lava levels, `lavaLevel < seaLevel`.

## API and data model

```ts
// src/worldgen/AquiferSystem.ts (NEW)
export type AquiferDecision = 'WATER' | 'LAVA' | 'NONE';
export interface AquiferConfig {
  seed: number;
  seaLevel: number;   // default 63
  lavaLevel: number;  // default -54 (must be < seaLevel)
  dryThreshold: number; // default 0.4
}
export interface AquiferBlockIds { water: number; lava: number; } // defaults 8 / 10
export function classifyAquifer(seed: number, x: number, y: number, z: number, config?: Partial<AquiferConfig>): AquiferDecision;
export function applyAquifers(
  column: TerrainColumn, carved: CarvedColumn,
  seed: number, config?: Partial<AquiferConfig>, ids?: Partial<AquiferBlockIds>,
): TerrainColumn;
```

## Control / data flow

1. The wiring carves (092) then calls `applyAquifers` with the carved mask.
2. Each carved cell is classified; water/lava ids are written; dry/above-sea cells stay air.

## Detailed behavior

- The dryness noise instance: `ValueNoise3D(seed ^ 0x165667b1)` (distinct offset), fbm 3 octaves,
  scale 0.03.
- `dryThreshold >= 1` forces NONE never (fbm bounded by ±1.75); `dryThreshold <= -2` forces NONE
  always — used by exact-table tests (documented).

## Failure modes

- Invalid configs throw (descriptive).

## Compatibility / migration

Additive.

## Performance / resource constraints

Classification O(1); application O(carved cells).

## Testing seams

- `tests/unit/AquiferSystem.test.ts` (NEW): exact y-table with forced dryness configs;
  default-config determinism and decision set; applyAquifers fills exactly carved cells, preserves
  others, purity; config validation.

## Observability / debugging

Decisions are plain strings; tests assert exact fills.

## Affected files / symbols

- `src/worldgen/AquiferSystem.ts` — NEW.
- `tests/unit/AquiferSystem.test.ts` — NEW.

## Rejected alternatives

- *Full 3D water-table simulation*: initial fills suffice; 076-084 flow handles dynamics later.

## Downstream dependencies

094+ features generate against aquifer-filled terrain; the world wiring runs aquifers after
carving.
