import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { createPotionContents } from '../../src/data/PotionItemData';
import {
  SPLASH_POTION_TINTS,
  SplashPotionRenderer,
  splashPotionTint,
  type SplashPotionRenderEntry,
  type SplashPotionTint,
} from '../../src/rendering/SplashPotionRenderer';

const groups = (scene: THREE.Scene) => scene.children.filter((c) => c.name === 'splash-potion');
const entry = (key: string, tint: SplashPotionTint = 'poison', over: Partial<SplashPotionRenderEntry> = {}): SplashPotionRenderEntry => ({
  key,
  x: 1,
  y: 65,
  z: 2,
  tint,
  ...over,
});

describe('splash potion tint (295)', () => {
  it('maps the first effect key (and instant aliases) to a palette tint', () => {
    const c = (k: string) => createPotionContents({ kind: 'SPLASH', customEffects: [{ typeId: `minecraft:effect/${k}`, duration: 10, amplifier: 0 }] });
    expect(splashPotionTint(c('poison'))).toBe('poison');
    expect(splashPotionTint(c('instant_damage'))).toBe('harming');
    expect(splashPotionTint(c('harming'))).toBe('harming');
    expect(splashPotionTint(c('instant_health'))).toBe('healing');
    expect(splashPotionTint(c('slowness'))).toBe('slowness');
    expect(splashPotionTint(c('weakness'))).toBe('weakness');
    expect(splashPotionTint(c('luck'))).toBe('default');
    expect(splashPotionTint(null)).toBe('default');
  });
});

describe('SplashPotionRenderer (295)', () => {
  it('holds exactly one two-part bottle group per live potion and follows positions', () => {
    const scene = new THREE.Scene();
    const r = new SplashPotionRenderer(scene);
    expect(groups(scene)).toHaveLength(0);
    r.sync([entry('potion:1'), entry('potion:2', 'harming', { x: 5 })]);
    expect(groups(scene)).toHaveLength(2);
    expect(r.size).toBe(2);
    const meshes = r.getMeshes();
    expect(meshes.every((m) => m.childCount === 2 && m.inScene && m.visible)).toBe(true);
    const body = (groups(scene)[1]!.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
    expect(body.color.getHex()).toBe(SPLASH_POTION_TINTS.harming);
    r.sync([entry('potion:1', 'poison', { x: 3, y: 66, z: 4 }), entry('potion:1', 'poison', { x: 99 })]);
    expect(groups(scene)).toHaveLength(1);
    expect(r.getMeshes()[0]).toMatchObject({ key: 'potion:1', x: 3, y: 66, z: 4 });
    r.sync([entry('potion:1', 'speed', { x: 3 })]);
    expect(r.getMeshes()[0]!.tint).toBe('speed');
    r.sync([entry('potion:3', 'poison', { x: Number.NaN })]);
    expect(groups(scene)).toHaveLength(0);
    r.sync([]);
    expect(scene.children).toHaveLength(0);
  });

  it('visibility applies to current and later groups', () => {
    const scene = new THREE.Scene();
    const r = new SplashPotionRenderer(scene);
    r.sync([entry('potion:1')]);
    r.setVisible(false);
    r.sync([entry('potion:1'), entry('potion:2')]);
    expect(r.isVisible).toBe(false);
    expect(r.getMeshes().every((m) => !m.visible)).toBe(true);
  });

  it('never allocates in sync and disposes each shared resource exactly once; idempotent', () => {
    const scene = new THREE.Scene();
    const r = new SplashPotionRenderer(scene);
    const before = r.resourceCounts();
    expect(before).toEqual({ geometries: 2, materials: 1 + Object.keys(SPLASH_POTION_TINTS).length });
    const all = (Object.keys(SPLASH_POTION_TINTS) as SplashPotionTint[]).map((t, i) => entry(`potion:${i}`, t));
    for (let i = 0; i < 20; i++) r.sync(i % 2 === 0 ? all : []);
    r.sync(all);
    expect(r.resourceCounts()).toEqual(before);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const g of groups(scene)) {
      for (const m of g.children as THREE.Mesh[]) {
        resources.add(m.geometry);
        resources.add(m.material as THREE.Material);
      }
    }
    expect(resources.size).toBe(before.geometries + before.materials);
    const counts = new Map<unknown, number>();
    for (const res of resources) res.addEventListener('dispose', () => counts.set(res, (counts.get(res) ?? 0) + 1));
    r.dispose();
    expect(scene.children).toHaveLength(0);
    expect([...counts.values()]).toHaveLength(resources.size);
    expect([...counts.values()].every((c) => c === 1)).toBe(true);
    r.dispose();
    expect([...counts.values()].every((c) => c === 1)).toBe(true);
    r.sync(all);
    expect(scene.children).toHaveLength(0);
  });
});

describe('splash potion rendering source guards (295)', () => {
  const moduleSrc = readFileSync(resolve(__dirname, '../../src/rendering/SplashPotionRenderer.ts'), 'utf8');
  const gameSrc = readFileSync(resolve(__dirname, '../../src/engine/Game.ts'), 'utf8');

  it('renderer module does not touch lights, fog, background, atlas, textures or the camera', () => {
    const code = moduleSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/Light\b|\bFog|background|atlas|Atlas|camera|Texture/);
  });

  it('sync never allocates GPU resources', () => {
    const syncBody = moduleSrc.slice(moduleSrc.indexOf('  sync(entries'), moduleSrc.indexOf('  setVisible('));
    expect(syncBody).not.toMatch(/new THREE\.(BoxGeometry|MeshLambertMaterial)/);
  });

  it('Game tracks the renderer and syncs it every frame before the draw', () => {
    expect(gameSrc).toMatch(/this\.splashPotionRenderer = new SplashPotionRenderer\(this\.renderer\.scene\);\s*this\.resources\.track\(this\.splashPotionRenderer\);/);
    const render = gameSrc.slice(gameSrc.indexOf('  private render(): void {'));
    const body = render.slice(0, render.indexOf('\n  }\n'));
    expect(body.indexOf('this.syncSplashPotionRenderer();')).toBeGreaterThan(-1);
    expect(body.indexOf('this.syncSplashPotionRenderer();')).toBeLessThan(body.indexOf('this.renderer.render();'));
  });

  it('no particle emission is wired (ParticleSystem has no live render path)', () => {
    expect(gameSrc).not.toMatch(/ParticleSystem|emitParticleEvent/);
  });
});
