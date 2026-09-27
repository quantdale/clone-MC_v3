import * as THREE from 'three';
import type { PotionContents } from '../data/PotionItemData';

/**
 * In-flight splash potion rendering (295). Draws every live splash potion as a
 * small two-box bottle (`THREE.Group` named `splash-potion`), mirroring the 293
 * `RaiderRenderer` pattern: a per-key group pool synced from the live set,
 * GL-free so unit tests run over a real `THREE.Scene`.
 *
 * - Every geometry/material is created once in the constructor (two
 *   geometries, one neck material, a fixed tint palette) and shared by all
 *   groups; `sync` never allocates GPU resources and `dispose` frees them
 *   exactly once.
 * - Only adds/removes its own groups: no lights, fog, background, world
 *   materials, atlas or camera are touched; an empty live set adds nothing.
 * - No shatter particle: the repo's `ParticleSystem` has no live render path,
 *   so there is nothing to emit into (documented in the 295 design).
 */

export type SplashPotionTint =
  | 'harming'
  | 'healing'
  | 'poison'
  | 'slowness'
  | 'weakness'
  | 'speed'
  | 'strength'
  | 'default';

/** Body colours per tint (vanilla effect colours, approximated). */
export const SPLASH_POTION_TINTS: Readonly<Record<SplashPotionTint, number>> = {
  harming: 0x430a09,
  healing: 0xf82423,
  poison: 0x4e9331,
  slowness: 0x5a6c81,
  weakness: 0x484d48,
  speed: 0x7cafc6,
  strength: 0x932423,
  default: 0x385dc6,
};
export const SPLASH_POTION_NECK_COLOR = 0xd8e4f0;
export const SPLASH_POTION_BODY_SIZE = 0.25;
export const SPLASH_POTION_NECK_SIZE = 0.1;

const TINT_BY_KEY: Readonly<Record<string, SplashPotionTint>> = {
  instant_damage: 'harming',
  harming: 'harming',
  instant_health: 'healing',
  healing: 'healing',
  poison: 'poison',
  slowness: 'slowness',
  weakness: 'weakness',
  speed: 'speed',
  strength: 'strength',
};

/** Tint for a potion: its first effect's key, else `default`. */
export function splashPotionTint(contents: PotionContents | null | undefined): SplashPotionTint {
  const typeId = contents?.customEffects?.[0]?.typeId;
  if (typeof typeId !== 'string') return 'default';
  const key = typeId.slice(typeId.lastIndexOf('/') + 1);
  return TINT_BY_KEY[key] ?? 'default';
}

export interface SplashPotionRenderEntry {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly tint: SplashPotionTint;
}

export interface SplashPotionMeshView {
  readonly key: string;
  readonly tint: SplashPotionTint;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly childCount: number;
  readonly inScene: boolean;
  readonly visible: boolean;
}

interface GroupRecord {
  readonly group: THREE.Group;
  readonly tint: SplashPotionTint;
}

export class SplashPotionRenderer {
  private readonly scene: THREE.Scene;
  private readonly bodyGeometry: THREE.BoxGeometry;
  private readonly neckGeometry: THREE.BoxGeometry;
  private readonly neckMaterial: THREE.MeshLambertMaterial;
  private readonly tintMaterials = new Map<SplashPotionTint, THREE.MeshLambertMaterial>();
  private readonly groups = new Map<string, GroupRecord>();
  private visible = true;
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const b = SPLASH_POTION_BODY_SIZE;
    const n = SPLASH_POTION_NECK_SIZE;
    this.bodyGeometry = new THREE.BoxGeometry(b, b, b);
    this.neckGeometry = new THREE.BoxGeometry(n, n, n);
    this.neckMaterial = new THREE.MeshLambertMaterial({ color: SPLASH_POTION_NECK_COLOR });
    for (const [tint, color] of Object.entries(SPLASH_POTION_TINTS) as [SplashPotionTint, number][]) {
      this.tintMaterials.set(tint, new THREE.MeshLambertMaterial({ color }));
    }
  }

  /** Add/update/rebuild/remove groups so the scene holds exactly one per entry key. */
  sync(entries: readonly SplashPotionRenderEntry[]): void {
    if (this.disposed) return;
    const live = new Set<string>();
    for (const entry of entries) {
      if (live.has(entry.key)) continue;
      if (!Number.isFinite(entry.x) || !Number.isFinite(entry.y) || !Number.isFinite(entry.z)) continue;
      live.add(entry.key);
      let record = this.groups.get(entry.key);
      if (record && record.tint !== entry.tint) {
        this.scene.remove(record.group);
        this.groups.delete(entry.key);
        record = undefined;
      }
      if (!record) {
        record = { group: this.build(entry), tint: entry.tint };
        this.groups.set(entry.key, record);
        this.scene.add(record.group);
      }
      record.group.position.set(entry.x, entry.y, entry.z);
    }
    for (const [key, record] of this.groups) {
      if (!live.has(key)) {
        this.scene.remove(record.group);
        this.groups.delete(key);
      }
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const record of this.groups.values()) record.group.visible = visible;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  get size(): number {
    return this.groups.size;
  }

  getMeshes(): SplashPotionMeshView[] {
    const out: SplashPotionMeshView[] = [];
    for (const [key, r] of this.groups) {
      out.push({
        key,
        tint: r.tint,
        x: r.group.position.x,
        y: r.group.position.y,
        z: r.group.position.z,
        childCount: r.group.children.length,
        inScene: r.group.parent === this.scene,
        visible: r.group.visible,
      });
    }
    return out;
  }

  /** Shared resource counts (constant after construction; leak tests). */
  resourceCounts(): { geometries: number; materials: number } {
    return { geometries: 2, materials: 1 + this.tintMaterials.size };
  }

  /** Remove every group and dispose the shared resources exactly once. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const record of this.groups.values()) this.scene.remove(record.group);
    this.groups.clear();
    this.bodyGeometry.dispose();
    this.neckGeometry.dispose();
    this.neckMaterial.dispose();
    for (const m of this.tintMaterials.values()) m.dispose();
  }

  private build(entry: SplashPotionRenderEntry): THREE.Group {
    const group = new THREE.Group();
    group.name = 'splash-potion';
    group.userData = { splashPotionKey: entry.key, splashPotionTint: entry.tint };
    const body = new THREE.Mesh(this.bodyGeometry, this.tintMaterials.get(entry.tint)!);
    const neck = new THREE.Mesh(this.neckGeometry, this.neckMaterial);
    neck.position.set(0, (SPLASH_POTION_BODY_SIZE + SPLASH_POTION_NECK_SIZE) / 2, 0);
    group.add(body);
    group.add(neck);
    group.visible = this.visible;
    return group;
  }
}
