/**
 * Render layer model (061). Geometry is classified into four layers with a pinned render order —
 * `opaque < cutout < translucent < emissive` — driving geometry grouping (063) and translucent
 * sorting (074). Layer strings are validated; the per-block `RenderLayerRegistry` defaults to
 * `opaque` and rejects unknown layers.
 */

import type { MeshStreamName } from '../world/MeshingTypes';

/** The four canonical render layers. */
export type RenderLayer = 'opaque' | 'cutout' | 'translucent' | 'emissive';

/** The layer set in pinned render order. */
export const RENDER_LAYERS: readonly RenderLayer[] = ['opaque', 'cutout', 'translucent', 'emissive'];

const LAYER_SET: ReadonlySet<string> = new Set(RENDER_LAYERS);

/** True when `value` is a valid layer name. */
export function isRenderLayer(value: string): value is RenderLayer {
  return LAYER_SET.has(value);
}

/** Parse a layer name; returns `null` for anything else (non-throwing). */
export function parseRenderLayer(value: string): RenderLayer | null {
  return LAYER_SET.has(value) ? (value as RenderLayer) : null;
}

/** Compare two layers by pinned order: negative/zero/positive. */
export function compareLayers(a: RenderLayer, b: RenderLayer): number {
  return RENDER_LAYERS.indexOf(a) - RENDER_LAYERS.indexOf(b);
}

/**
 * Explicit layer → mesh-stream assignment (audit 03 pipeline target). The
 * geometry streams are `opaque | cutout | translucent | fluid`; the `emissive`
 * layer is a material policy, not a blend class, so its geometry joins the
 * opaque stream (depth-write, no sorting) and only its material differs.
 */
export const LAYER_TO_STREAM: Readonly<Record<RenderLayer, MeshStreamName>> = {
  opaque: 'opaque',
  cutout: 'cutout',
  translucent: 'translucent',
  emissive: 'opaque',
};

/** The mesh stream a render layer's geometry is emitted into. */
export function streamForRenderLayer(layer: RenderLayer): MeshStreamName {
  return LAYER_TO_STREAM[layer];
}

/** Stores validated render layers per block key; unregistered blocks are `opaque`. */
export class RenderLayerRegistry {
  private readonly layers = new Map<string, RenderLayer>();

  /** Set the layer for `blockKey`. Throws on unknown layer strings. */
  setLayer(blockKey: string, layer: string): void {
    const parsed = parseRenderLayer(layer);
    if (parsed === null) {
      throw new Error(`RenderLayerRegistry: unknown render layer '${layer}'`);
    }
    this.layers.set(blockKey, parsed);
  }

  /** The layer for `blockKey` (`'opaque'` when unregistered). */
  getLayer(blockKey: string): RenderLayer {
    return this.layers.get(blockKey) ?? 'opaque';
  }

  /** Whether a layer is explicitly registered for `blockKey`. */
  has(blockKey: string): boolean {
    return this.layers.has(blockKey);
  }

  /** Number of registered layers. */
  get size(): number {
    return this.layers.size;
  }

  /** Remove all registrations. */
  clear(): void {
    this.layers.clear();
  }
}
