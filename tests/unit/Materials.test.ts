import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Materials } from '../../src/rendering/Materials';
import type { TextureAtlas } from '../../src/rendering/TextureAtlas';

/** Minimal stand-in carrying a real THREE.Texture (Materials only reads `atlas.texture`). */
function fakeAtlas(): TextureAtlas {
  return { texture: new THREE.Texture() } as unknown as TextureAtlas;
}

describe('Materials', () => {
  it('creates the four streams with the documented transparency/depth/alpha flags', () => {
    const m = new Materials(fakeAtlas());
    // Opaque: alpha-tested, no blending, writes depth.
    expect(m.opaque.transparent).toBe(false);
    expect(m.opaque.depthWrite).toBe(true);
    expect(m.opaque.alphaTest).toBe(0.5);
    expect(m.opaque.side).toBe(THREE.FrontSide);
    // Cutout: alpha-tested like opaque, no blend pass.
    expect(m.cutout.transparent).toBe(false);
    expect(m.cutout.depthWrite).toBe(true);
    expect(m.cutout.alphaTest).toBe(0.5);
    expect(m.cutout.side).toBe(THREE.FrontSide);
    // Transparent (glass): blended, no depth write.
    expect(m.transparent.transparent).toBe(true);
    expect(m.transparent.depthWrite).toBe(false);
    expect(m.transparent.opacity).toBeCloseTo(0.72, 12);
    // Fluid: blended and never depth-writes so stacked surfaces stay visible.
    expect(m.fluid.transparent).toBe(true);
    expect(m.fluid.depthWrite).toBe(false);
    expect(m.fluid.opacity).toBeCloseTo(0.72, 12);
  });

  it('shares one atlas map identity across every material', () => {
    const atlas = fakeAtlas();
    const m = new Materials(atlas);
    expect(m.opaque.map).toBe(atlas.texture);
    expect(m.transparent.map).toBe(atlas.texture);
    expect(m.cutout.map).toBe(atlas.texture);
    expect(m.fluid.map).toBe(atlas.texture);
  });

  it('dispose() disposes all four materials', () => {
    const m = new Materials(fakeAtlas());
    const spies = [m.opaque, m.transparent, m.cutout, m.fluid].map((mat) => vi.spyOn(mat, 'dispose'));
    m.dispose();
    for (const spy of spies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });
});
