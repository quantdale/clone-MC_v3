/**
 * Biome tint resolution (072). A model face declares a `tintindex` kind ('grass' | 'foliage' |
 * 'water'); this module resolves a biome definition + kind into a concrete 24-bit RGB tint:
 * grass → `grassColor`, foliage → `foliageColor`, water → `waterColor` (falling back to the shared
 * `DEFAULT_WATER_COLOR` when absent). Pure and deterministic; biomes are assumed registry-validated
 * (016), so `grassColor`/`foliageColor` are always present.
 */
import {
  biomeColorToRGB,
  DEFAULT_WATER_COLOR,
  type BiomeColor,
  type BiomeColorRGB,
  type BiomeTypeDefinition,
} from '../data/Biome';
import type { TintKind } from '../data/BlockModel';

/** The resolved tint attribute for one face. */
export interface BiomeTint {
  kind: TintKind;
  /** 24-bit RGB color (0xRRGGBB). */
  color: BiomeColor;
  /** RGB split of `color`. */
  rgb: BiomeColorRGB;
}

/** The biome color field a tint kind maps to. */
function colorField(biome: BiomeTypeDefinition, kind: TintKind): BiomeColor {
  if (kind === 'grass') return biome.grassColor;
  if (kind === 'foliage') return biome.foliageColor;
  return biome.waterColor ?? DEFAULT_WATER_COLOR;
}

/** The 24-bit RGB tint for a biome and kind (pure, deterministic). */
export function biomeTintColor(biome: BiomeTypeDefinition, kind: TintKind): BiomeColor {
  return colorField(biome, kind);
}

/** The full tint attribute for a biome and kind: kind + color + RGB split. */
export function biomeTint(biome: BiomeTypeDefinition, kind: TintKind): BiomeTint {
  const color = colorField(biome, kind);
  return { kind, color, rgb: biomeColorToRGB(color) };
}

/**
 * The merge-signature tint class id for a biome and kind (072): the resolved
 * 24-bit biome color itself. Faces of the same kind in the same biome share a
 * class; different colors never merge. Pure, allocation-free.
 */
export function biomeTintClassId(biome: BiomeTypeDefinition, kind: TintKind): number {
  return colorField(biome, kind);
}
