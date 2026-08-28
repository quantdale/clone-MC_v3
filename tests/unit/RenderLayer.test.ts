import { describe, it, expect } from 'vitest';
import {
  RENDER_LAYERS,
  RenderLayerRegistry,
  compareLayers,
  isRenderLayer,
  parseRenderLayer,
} from '../../src/rendering/RenderLayer';

describe('RenderLayer model', () => {
  it('defines exactly four layers in pinned order', () => {
    expect(RENDER_LAYERS).toEqual(['opaque', 'cutout', 'translucent', 'emissive']);
  });

  it('parses and validates layer strings', () => {
    expect(parseRenderLayer('opaque')).toBe('opaque');
    expect(parseRenderLayer('cutout')).toBe('cutout');
    expect(parseRenderLayer('translucent')).toBe('translucent');
    expect(parseRenderLayer('emissive')).toBe('emissive');
    expect(parseRenderLayer('glassy')).toBeNull();
    expect(parseRenderLayer('')).toBeNull();
    expect(isRenderLayer('opaque')).toBe(true);
    expect(isRenderLayer('OPAQUE')).toBe(false);
  });

  it('orders layers strictly by the pinned sequence', () => {
    for (let i = 0; i < RENDER_LAYERS.length; i++) {
      for (let j = 0; j < RENDER_LAYERS.length; j++) {
        const a = RENDER_LAYERS[i]!;
        const b = RENDER_LAYERS[j]!;
        expect(compareLayers(a, b)).toBe(i - j);
      }
    }
    expect(compareLayers('opaque', 'emissive')).toBeLessThan(0);
    expect(compareLayers('emissive', 'opaque')).toBeGreaterThan(0);
    expect(compareLayers('cutout', 'cutout')).toBe(0);
  });
});

describe('RenderLayerRegistry', () => {
  it('defaults to opaque and round-trips explicit layers', () => {
    const registry = new RenderLayerRegistry();
    expect(registry.getLayer('minecraft:stone')).toBe('opaque');

    registry.setLayer('minecraft:glass', 'translucent');
    expect(registry.getLayer('minecraft:glass')).toBe('translucent');
    expect(registry.has('minecraft:glass')).toBe(true);
    expect(registry.has('minecraft:stone')).toBe(false);
    expect(registry.size).toBe(1);
  });

  it('rejects unknown layer strings', () => {
    const registry = new RenderLayerRegistry();
    expect(() => registry.setLayer('minecraft:x', 'glassy')).toThrow(/unknown render layer/i);
    expect(registry.size).toBe(0);
  });

  it('clear removes all registrations', () => {
    const registry = new RenderLayerRegistry();
    registry.setLayer('a', 'cutout');
    registry.setLayer('b', 'emissive');
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.getLayer('a')).toBe('opaque');
  });
});
