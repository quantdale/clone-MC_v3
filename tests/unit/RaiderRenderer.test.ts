import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import type { EntityInstance } from '../../src/world/Entity';
import { createResourceId } from '../../src/data/ResourceId';
import {
  CAPTAIN_BANNER_COLOR,
  RAIDER_KINDS,
  RaiderRenderer,
  projectRaiderRenderEntries,
  raiderFacing,
  raiderKindOf,
  type RaiderKind,
  type RaiderRenderEntry,
} from '../../src/rendering/RaiderRenderer';

const OVERWORLD = createResourceId('minecraft', 'overworld');

function raider(
  id: number,
  kind: string,
  opts: { x?: number; y?: number; z?: number; yaw?: number; vx?: number; vz?: number; state?: 'ACTIVE' | 'REMOVED' } = {},
): EntityInstance {
  return {
    id,
    typeId: createResourceId('minecraft', `entity_type/${kind}`),
    transform: { x: opts.x ?? 0, y: opts.y ?? 64, z: opts.z ?? 0, yaw: opts.yaw ?? 0, pitch: 0 },
    velocity: { vx: opts.vx ?? 0, vy: 0, vz: opts.vz ?? 0 },
    dimension: OVERWORLD,
    state: opts.state ?? 'ACTIVE',
  };
}

function entry(key: string, kind: RaiderKind, over: Partial<RaiderRenderEntry> = {}): RaiderRenderEntry {
  return {
    key,
    source: key.startsWith('patrol') ? 'patrol' : 'raid',
    entityId: Number(key.split(':')[1] ?? 0),
    kind,
    captain: false,
    x: 0,
    y: 64,
    z: 0,
    facing: 0,
    ...over,
  };
}

function raiderGroups(scene: THREE.Scene): THREE.Object3D[] {
  return scene.children.filter((c) => c.name.startsWith('raider-'));
}

const EXPECTED_PARTS: Record<RaiderKind, number> = { pillager: 6, vindicator: 6, witch: 7, ravager: 8 };

describe('raider projection (293)', () => {
  it('maps entity types to raider kinds and ignores other entities', () => {
    for (const kind of RAIDER_KINDS) {
      expect(raiderKindOf(createResourceId('minecraft', `entity_type/${kind}`))).toBe(kind);
    }
    expect(raiderKindOf(createResourceId('minecraft', 'entity_type/zombie'))).toBeNull();
    expect(raiderKindOf(createResourceId('minecraft', 'entity_type/pig'))).toBeNull();
  });

  it('namespaces keys by source so colliding ids stay distinct and marks only the patrol captain', () => {
    const { entries, skipped } = projectRaiderRenderEntries(
      [raider(1, 'pillager'), raider(2, 'ravager')],
      [raider(1, 'pillager'), raider(2, 'pillager')],
      1,
    );
    expect(skipped).toBe(0);
    expect(entries.map((e) => e.key)).toEqual(['raid:1', 'raid:2', 'patrol:1', 'patrol:2']);
    expect(entries.filter((e) => e.captain).map((e) => e.key)).toEqual(['patrol:1']);
    expect(entries.find((e) => e.key === 'raid:2')!.kind).toBe('ravager');
  });

  it('spec scenario: colliding ids raid:1 vindicator and patrol:1 pillager captain', () => {
    const { entries } = projectRaiderRenderEntries([raider(1, 'vindicator')], [raider(1, 'pillager')], 1);
    expect(entries.map((e) => [e.key, e.kind, e.captain])).toEqual([
      ['raid:1', 'vindicator', false],
      ['patrol:1', 'pillager', true],
    ]);
  });

  it('spec scenario: a zombie in the raid manager yields no entry and skipped 1', () => {
    expect(projectRaiderRenderEntries([raider(7, 'zombie')], [], null)).toEqual({ entries: [], skipped: 1 });
  });

  it('skips unknown kinds, removed entities and non-finite positions', () => {
    const { entries, skipped } = projectRaiderRenderEntries(
      [raider(1, 'zombie'), raider(2, 'witch', { x: Number.NaN }), raider(3, 'vindicator', { state: 'REMOVED' })],
      [raider(4, 'pillager', { y: Number.POSITIVE_INFINITY }), raider(5, 'pillager')],
      null,
    );
    expect(skipped).toBe(4);
    expect(entries.map((e) => e.key)).toEqual(['patrol:5']);
    expect(entries[0]!.captain).toBe(false);
  });

  it('faces the stored radian yaw when still and the movement direction when moving', () => {
    expect(raiderFacing(raider(1, 'pillager', { yaw: 1.25 }))).toBeCloseTo(1.25, 10);
    expect(raiderFacing(raider(1, 'pillager', { yaw: 1.25, vx: 1, vz: 0 }))).toBeCloseTo(Math.PI / 2, 10);
    expect(raiderFacing(raider(1, 'pillager', { yaw: 1.25, vx: 0, vz: -2 }))).toBeCloseTo(Math.PI, 10);
    // Below the epsilon the stored yaw wins.
    expect(raiderFacing(raider(1, 'pillager', { yaw: -0.5, vx: 0.005, vz: 0 }))).toBeCloseTo(-0.5, 10);
    expect(raiderFacing(raider(1, 'pillager', { yaw: Number.NaN }))).toBe(0);
  });
});

describe('RaiderRenderer (293)', () => {
  it('adds one group per entry with the per-kind part count, name and userData', () => {
    const scene = new THREE.Scene();
    const r = new RaiderRenderer(scene);
    r.sync(RAIDER_KINDS.map((k, i) => entry(`raid:${i + 1}`, k, { x: i * 3 })));
    expect(raiderGroups(scene)).toHaveLength(4);
    expect(r.size).toBe(4);
    for (const kind of RAIDER_KINDS) {
      const g = scene.children.find((c) => c.name === `raider-${kind}`)!;
      expect(g).toBeDefined();
      expect(g.children).toHaveLength(EXPECTED_PARTS[kind]);
      expect(g.userData.raiderKind).toBe(kind);
      expect(g.userData.raiderCaptain).toBe(false);
      for (const child of g.children) expect(child).toBeInstanceOf(THREE.Mesh);
    }
    const views = r.getMeshes();
    expect(views.every((v) => v.inScene && v.visible)).toBe(true);
    expect(views.map((v) => v.childCount).sort()).toEqual([6, 6, 7, 8]);
  });

  it('gives each kind a distinct colour set and makes the ravager larger than the illagers', () => {
    const scene = new THREE.Scene();
    const r = new RaiderRenderer(scene);
    r.sync(RAIDER_KINDS.map((k, i) => entry(`raid:${i + 1}`, k, { x: i * 10 })));
    const colours = (kind: RaiderKind): string =>
      scene.children
        .find((c) => c.name === `raider-${kind}`)!
        .children.map((m) => ((m as THREE.Mesh).material as THREE.MeshLambertMaterial).color.getHex())
        .sort()
        .join(',');
    const sets = RAIDER_KINDS.map(colours);
    expect(new Set(sets).size).toBe(4);
    const size = (kind: RaiderKind): THREE.Vector3 =>
      new THREE.Box3().setFromObject(scene.children.find((c) => c.name === `raider-${kind}`)!).getSize(new THREE.Vector3());
    const rav = size('ravager');
    expect(rav.x).toBeGreaterThan(1);
    for (const kind of ['pillager', 'vindicator', 'witch'] as const) {
      const s = size(kind);
      expect(rav.x).toBeGreaterThan(s.x);
      expect(rav.z).toBeGreaterThan(s.z);
      expect(rav.x * rav.y * rav.z).toBeGreaterThan(s.x * s.y * s.z);
    }
  });

  it('marks the captain with a banner block on its back', () => {
    const scene = new THREE.Scene();
    const r = new RaiderRenderer(scene);
    r.sync([entry('patrol:1', 'pillager', { captain: true }), entry('patrol:2', 'pillager')]);
    const cap = scene.children.find((c) => c.name === 'raider-pillager-captain')!;
    const plain = scene.children.find((c) => c.name === 'raider-pillager')!;
    expect(cap.children).toHaveLength(8);
    expect(plain.children).toHaveLength(6);
    const banner = cap.children.find(
      (m) => ((m as THREE.Mesh).material as THREE.MeshLambertMaterial).color.getHex() === CAPTAIN_BANNER_COLOR,
    )!;
    expect(banner).toBeDefined();
    expect(banner.position.z).toBeLessThan(0); // back (model front is +Z)
    expect(plain.children.some((m) => ((m as THREE.Mesh).material as THREE.MeshLambertMaterial).color.getHex() === CAPTAIN_BANNER_COLOR)).toBe(false);
    expect(r.getMeshes().filter((v) => v.captain).map((v) => v.key)).toEqual(['patrol:1']);
  });

  it('updates the same group in place, rebuilds on kind/captain change and removes absent keys', () => {
    const scene = new THREE.Scene();
    const r = new RaiderRenderer(scene);
    r.sync([entry('raid:1', 'pillager'), entry('patrol:1', 'pillager')]);
    const first = scene.children.find((c) => c.userData.raiderKey === 'raid:1')!;

    r.sync([entry('raid:1', 'pillager', { x: 5, y: 70, z: -3, facing: 1.25 }), entry('patrol:1', 'pillager', { captain: true })]);
    const same = scene.children.find((c) => c.userData.raiderKey === 'raid:1')!;
    expect(same).toBe(first);
    expect(same.position.toArray()).toEqual([5, 70, -3]);
    expect(same.rotation.y).toBeCloseTo(1.25, 10);
    expect(scene.children.find((c) => c.userData.raiderKey === 'patrol:1')!.name).toBe('raider-pillager-captain');
    expect(raiderGroups(scene)).toHaveLength(2);

    r.sync([entry('raid:1', 'vindicator')]);
    const rebuilt = scene.children.find((c) => c.userData.raiderKey === 'raid:1')!;
    expect(rebuilt).not.toBe(first);
    expect(rebuilt.name).toBe('raider-vindicator');
    expect(first.parent).toBeNull();
    expect(raiderGroups(scene)).toHaveLength(1);

    r.sync([]);
    expect(raiderGroups(scene)).toHaveLength(0);
    expect(rebuilt.parent).toBeNull();
    expect(r.size).toBe(0);
  });

  it('rotates groups to the projected facing (stored yaw when still, velocity when moving)', () => {
    const scene = new THREE.Scene();
    const r = new RaiderRenderer(scene);
    const { entries } = projectRaiderRenderEntries(
      [raider(1, 'pillager', { yaw: 1.25 }), raider(2, 'ravager', { yaw: 1.25, vx: 1, vz: 0 })],
      [],
      null,
    );
    r.sync(entries);
    const rot = (key: string): number => scene.children.find((c) => c.userData.raiderKey === key)!.rotation.y;
    expect(rot('raid:1')).toBeCloseTo(1.25, 10);
    expect(rot('raid:2')).toBeCloseTo(Math.PI / 2, 10);
  });

  it('keeps the first entry for a duplicated key', () => {
    const scene = new THREE.Scene();
    const r = new RaiderRenderer(scene);
    r.sync([entry('raid:1', 'witch', { x: 1 }), entry('raid:1', 'ravager', { x: 2 })]);
    expect(raiderGroups(scene)).toHaveLength(1);
    expect(r.getMeshes()[0]).toMatchObject({ kind: 'witch', x: 1 });
  });

  it('applies visibility to existing and later groups', () => {
    const scene = new THREE.Scene();
    const r = new RaiderRenderer(scene);
    r.sync([entry('raid:1', 'pillager')]);
    r.setVisible(false);
    expect(r.isVisible).toBe(false);
    r.sync([entry('raid:1', 'pillager'), entry('raid:2', 'witch')]);
    expect(r.getMeshes().every((v) => !v.visible)).toBe(true);
    r.setVisible(true);
    expect(r.getMeshes().every((v) => v.visible)).toBe(true);
  });

  it('adds nothing to the scene for an empty live set', () => {
    const scene = new THREE.Scene();
    const r = new RaiderRenderer(scene);
    r.sync([]);
    expect(scene.children).toHaveLength(0);
  });

  it('allocates a fixed set of shared resources and never more across churn', () => {
    const scene = new THREE.Scene();
    const r = new RaiderRenderer(scene);
    const before = r.resourceCounts();
    expect(before).toEqual({ geometries: 14, materials: 12 });
    const geoms = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    for (let i = 0; i < 200; i++) {
      const n = i % 31; // up to 30 entities of all kinds
      const list: RaiderRenderEntry[] = [];
      for (let j = 0; j < n; j++) {
        list.push(entry(`${j % 2 ? 'patrol' : 'raid'}:${i + j}`, RAIDER_KINDS[(i + j) % 4]!, { captain: j === 1 && i % 3 === 0 }));
      }
      r.sync(list);
      expect(raiderGroups(scene)).toHaveLength(n);
      for (const g of raiderGroups(scene)) {
        for (const m of g.children as THREE.Mesh[]) {
          geoms.add(m.geometry);
          mats.add(m.material as THREE.Material);
        }
      }
    }
    expect(r.resourceCounts()).toEqual(before);
    expect(geoms.size).toBeLessThanOrEqual(14);
    expect(mats.size).toBeLessThanOrEqual(12);
  });

  it('dispose removes every group and disposes each shared resource exactly once; idempotent', () => {
    const scene = new THREE.Scene();
    const r = new RaiderRenderer(scene);
    const all = RAIDER_KINDS.map((k, i) => entry(`raid:${i}`, k));
    all.push(entry('patrol:9', 'pillager', { captain: true }));
    r.sync(all);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const g of raiderGroups(scene)) {
      for (const m of g.children as THREE.Mesh[]) {
        resources.add(m.geometry);
        resources.add(m.material as THREE.Material);
      }
    }
    expect(resources.size).toBe(26); // every shared resource is in use
    const counts = new Map<unknown, number>();
    for (const res of resources) {
      res.addEventListener('dispose', () => counts.set(res, (counts.get(res) ?? 0) + 1));
    }
    r.dispose();
    expect(raiderGroups(scene)).toHaveLength(0);
    expect(scene.children).toHaveLength(0);
    expect(r.size).toBe(0);
    expect([...counts.values()]).toHaveLength(26);
    expect([...counts.values()].every((c) => c === 1)).toBe(true);
    r.dispose();
    expect([...counts.values()].every((c) => c === 1)).toBe(true);
    r.sync(all);
    expect(scene.children).toHaveLength(0);
  });
});

describe('raider rendering source guards (293)', () => {
  const moduleSrc = readFileSync(resolve(__dirname, '../../src/rendering/RaiderRenderer.ts'), 'utf8');
  const gameSrc = readFileSync(resolve(__dirname, '../../src/engine/Game.ts'), 'utf8');

  it('renderer module does not touch lights, fog, background, atlas or the camera', () => {
    const code = moduleSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/Light\b|\bFog|background|atlas|Atlas|camera|Texture/);
  });

  it('allocates geometry/material only through the constructor-time cache', () => {
    const syncBody = moduleSrc.slice(moduleSrc.indexOf('  sync(entries'), moduleSrc.indexOf('  setVisible('));
    expect(syncBody).not.toMatch(/new THREE\.(BoxGeometry|MeshLambertMaterial)/);
  });

  it('Game tracks the renderer and syncs it from both managers every frame before the draw', () => {
    expect(gameSrc).toMatch(/this\.raiderRenderer = new RaiderRenderer\(this\.renderer\.scene\);\s*this\.resources\.track\(this\.raiderRenderer\);/);
    const render = gameSrc.slice(gameSrc.indexOf('  private render(): void {'));
    const body = render.slice(0, render.indexOf('\n  }\n'));
    expect(body.indexOf('this.syncRaiderRenderer();')).toBeGreaterThan(-1);
    expect(body.indexOf('this.syncRaiderRenderer();')).toBeLessThan(body.indexOf('this.renderer.render();'));
    expect(gameSrc).toMatch(/this\.raidEntityManager\.getInDimension\(this\.overworldDimension\),\s*this\.patrolEntityManager\.getInDimension\(this\.overworldDimension\),\s*this\.pillagerPatrol\.getCaptainId\(\),/);
  });
});
