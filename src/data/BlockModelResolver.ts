/**
 * Deterministic blockstate → model resolution (060). A `BlockModelResolver` maps `(blockKey,
 * properties)` to a 059 model key: property variants are checked in registration order (first match
 * wins), the per-block default applies otherwise, and unknown blocks resolve to `null`. Pure and
 * deterministic — identical inputs always yield identical results.
 */
export type BlockProperties = Readonly<Record<string, string>>;

interface BlockMapping {
  defaultKey: string | null;
  variants: Array<{ property: string; value: string; modelKey: string }>;
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`BlockModelResolver: ${label} must be a non-empty string`);
  }
}

/** Resolves block states to model keys deterministically. */
export class BlockModelResolver {
  private readonly blocks = new Map<string, BlockMapping>();

  /** Set the default model for `blockKey`. Throws on duplicates. */
  setDefault(blockKey: string, modelKey: string): void {
    assertNonEmpty(blockKey, 'blockKey');
    assertNonEmpty(modelKey, 'modelKey');
    let mapping = this.blocks.get(blockKey);
    if (!mapping) {
      mapping = { defaultKey: null, variants: [] };
      this.blocks.set(blockKey, mapping);
    }
    if (mapping.defaultKey !== null) {
      throw new Error(`BlockModelResolver: duplicate default for '${blockKey}'`);
    }
    mapping.defaultKey = modelKey;
  }

  /** Register a property variant: `properties[property] === value` resolves to `modelKey`. */
  setVariant(blockKey: string, property: string, value: string, modelKey: string): void {
    assertNonEmpty(blockKey, 'blockKey');
    assertNonEmpty(property, 'property');
    assertNonEmpty(value, 'value');
    assertNonEmpty(modelKey, 'modelKey');
    let mapping = this.blocks.get(blockKey);
    if (!mapping) {
      mapping = { defaultKey: null, variants: [] };
      this.blocks.set(blockKey, mapping);
    }
    mapping.variants.push({ property, value, modelKey });
  }

  /**
   * Resolve `(blockKey, properties)` to a model key: the first matching variant (registration order)
   * wins, then the default, then `null`.
   */
  resolve(blockKey: string, properties: BlockProperties): string | null {
    const mapping = this.blocks.get(blockKey);
    if (!mapping) return null;

    for (const variant of mapping.variants) {
      if (properties[variant.property] === variant.value) {
        return variant.modelKey;
      }
    }
    return mapping.defaultKey;
  }

  /** Whether any mapping exists for `blockKey`. */
  has(blockKey: string): boolean {
    return this.blocks.has(blockKey);
  }

  /** Number of blocks with mappings. */
  get size(): number {
    return this.blocks.size;
  }

  /** Remove all mappings. */
  clear(): void {
    this.blocks.clear();
  }
}
