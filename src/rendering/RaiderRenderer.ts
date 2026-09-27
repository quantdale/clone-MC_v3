import * as THREE from 'three';
import type { ResourceId } from '../data/ResourceId';
import type { EntityInstance } from '../world/Entity';

/**
 * Raider + patrol rendering (293). Draws every ACTIVE raid-wave raider (284:
 * pillager / vindicator / ravager / witch) and patrol pillager (291) as a
 * low-poly box-mesh `THREE.Group`, mirroring `HostileMobRenderer` /
 * `PassiveMobRenderer`: a per-key group pool synced from the live set, GL-free
 * so unit tests run over a real `THREE.Scene`.
 *
 * - Keys are namespaced by source (`raid:<id>` / `patrol:<id>`) because the two
 *   entity managers allocate ids independently.
 * - Every geometry/material is created once in the constructor and shared by
 *   all groups (fixed count, disposed exactly once in `dispose`); `sync` never
 *   allocates GPU resources, so removing a group cannot leak.
 * - The patrol captain carries an ominous-banner panel on its back.
 * - Facing: horizontal movement direction when moving (288 combat moves by
 *   velocity and never rewrites yaw), else the stored spawn yaw, which 284/291
 *   author in radians (`atan2(dx, dz)` / `nextFloat·2π`). The model front is +Z,
 *   so `rotation.y = facing` points it along `(sin f, cos f)`.
 * - Only adds/removes its own groups: no lights, fog, background, world
 *   materials, atlas or camera are touched; an empty live set adds nothing.
 */

export type RaiderKind = 'pillager' | 'vindicator' | 'ravager' | 'witch';
export const RAIDER_KINDS: readonly RaiderKind[] = ['pillager', 'vindicator', 'ravager', 'witch'];
/** Horizontal speed (blocks/s) above which a raider faces its movement direction. */
export const RAIDER_MOVE_FACING_EPSILON = 0.01;

export interface RaiderRenderEntry {
  readonly key: string;
  readonly source: 'raid' | 'patrol';
  readonly entityId: number;
  readonly kind: RaiderKind;
  readonly captain: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Radians; the model's +Z front points along (sin facing, cos facing). */
  readonly facing: number;
}

export interface RaiderMeshView {
  readonly key: string;
  readonly kind: RaiderKind;
  readonly captain: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotationY: number;
  readonly childCount: number;
  readonly inScene: boolean;
  readonly visible: boolean;
}

/** Raider kind for an entity type id (`<ns>:entity_type/<kind>`), else null. */
export function raiderKindOf(typeId: ResourceId): RaiderKind | null {
  const path = typeId.path;
  const leaf = path.slice(path.lastIndexOf('/') + 1);
  return (RAIDER_KINDS as readonly string[]).includes(leaf) ? (leaf as RaiderKind) : null;
}

/** Render facing (radians) for a raider entity; see the module doc. */
export function raiderFacing(e: EntityInstance): number {
  const vx = e.velocity?.vx;
  const vz = e.velocity?.vz;
  if (Number.isFinite(vx) && Number.isFinite(vz) && Math.hypot(vx, vz) > RAIDER_MOVE_FACING_EPSILON) {
    return Math.atan2(vx, vz);
  }
  const yaw = e.transform.yaw;
  return Number.isFinite(yaw) ? yaw : 0;
}

/**
 * Project both managers' ACTIVE entities into render entries. Unknown kinds,
 * non-ACTIVE entities and non-finite positions are skipped (counted).
 */
export function projectRaiderRenderEntries(
  raid: readonly EntityInstance[],
  patrol: readonly EntityInstance[],
  captainId: number | null,
): { entries: RaiderRenderEntry[]; skipped: number } {
  const entries: RaiderRenderEntry[] = [];
  let skipped = 0;
  const add = (e: EntityInstance, source: 'raid' | 'patrol'): void => {
    const kind = raiderKindOf(e.typeId);
    const { x, y, z } = e.transform;
    if (e.state !== 'ACTIVE' || kind === null || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      skipped++;
      return;
    }
    entries.push({
      key: `${source}:${e.id}`,
      source,
      entityId: e.id,
      kind,
      captain: source === 'patrol' && captainId !== null && e.id === captainId,
      x,
      y,
      z,
      facing: raiderFacing(e),
    });
  };
  for (const e of raid) add(e, 'raid');
  for (const e of patrol) add(e, 'patrol');
  return { entries, skipped };
}

type Vec3 = readonly [number, number, number];
interface PartSpec {
  readonly size: Vec3;
  readonly at: Vec3;
  readonly color: number;
}

const SKIN = 0x8f9488;
const LEGS = 0x2c2c30;
const BANNER = 0xefefef;
const EMBLEM = 0x3a3a3a;

function illagerParts(robe: number): PartSpec[] {
  return [
    { size: [0.6, 0.9, 0.35], at: [0, 1.2, 0], color: robe },
    { size: [0.44, 0.44, 0.44], at: [0, 1.87, 0], color: SKIN },
    { size: [0.18, 0.75, 0.18], at: [-0.15, 0.375, 0], color: LEGS },
    { size: [0.18, 0.75, 0.18], at: [0.15, 0.375, 0], color: LEGS },
    { size: [0.62, 0.2, 0.26], at: [0, 1.3, 0.22], color: robe },
  ];
}

/** Normative per-kind part tables (design.md "Models"). */
export const RAIDER_PARTS: Readonly<Record<RaiderKind, readonly PartSpec[]>> = {
  pillager: [...illagerParts(0x5a4632), { size: [0.08, 0.1, 0.55], at: [0.3, 1.25, 0.3], color: 0x6b4a2b }],
  vindicator: [...illagerParts(0x2f3540), { size: [0.08, 0.55, 0.08], at: [0.36, 1.05, 0.1], color: 0x9aa0a6 }],
  witch: [
    ...illagerParts(0x4a2a5a),
    { size: [0.62, 0.06, 0.62], at: [0, 2.12, 0], color: 0x2b1f33 },
    { size: [0.32, 0.34, 0.32], at: [0, 2.32, 0], color: 0x2b1f33 },
  ],
  ravager: [
    { size: [1.3, 1.1, 2.0], at: [0, 1.35, 0], color: 0x4a4038 },
    { size: [0.8, 0.8, 0.9], at: [0, 1.5, 1.35], color: 0x4a4038 },
    { size: [0.4, 0.8, 0.4], at: [-0.42, 0.4, -0.65], color: 0x4a4038 },
    { size: [0.4, 0.8, 0.4], at: [0.42, 0.4, -0.65], color: 0x4a4038 },
    { size: [0.4, 0.8, 0.4], at: [-0.42, 0.4, 0.65], color: 0x4a4038 },
    { size: [0.4, 0.8, 0.4], at: [0.42, 0.4, 0.65], color: 0x4a4038 },
    { size: [0.14, 0.35, 0.14], at: [-0.3, 2.0, 1.35], color: 0xd9cfa9 },
    { size: [0.14, 0.35, 0.14], at: [0.3, 2.0, 1.35], color: 0xd9cfa9 },
  ],
};

/** Captain add-on: ominous-banner panel + emblem on the back (-Z). */
export const CAPTAIN_PARTS: readonly PartSpec[] = [
  { size: [0.5, 0.72, 0.06], at: [0, 1.3, -0.24], color: BANNER },
  { size: [0.2, 0.3, 0.02], at: [0, 1.35, -0.28], color: EMBLEM },
];

export const CAPTAIN_BANNER_COLOR = BANNER;

interface GroupRecord {
  readonly group: THREE.Group;
  readonly kind: RaiderKind;
  readonly captain: boolean;
}

export class RaiderRenderer {
  private readonly scene: THREE.Scene;
  private readonly geometries = new Map<string, THREE.BoxGeometry>();
  private readonly materials = new Map<number, THREE.MeshLambertMaterial>();
  private readonly groups = new Map<string, GroupRecord>();
  private visible = true;
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    // Allocate every shared resource up front: sync never creates GPU objects.
    for (const kind of RAIDER_KINDS) {
      for (const part of RAIDER_PARTS[kind]) this.resourcesFor(part);
    }
    for (const part of CAPTAIN_PARTS) this.resourcesFor(part);
  }

  /** Add/update/rebuild/remove groups so the scene holds exactly one per entry key. */
  sync(entries: readonly RaiderRenderEntry[]): void {
    if (this.disposed) return;
    const live = new Set<string>();
    for (const entry of entries) {
      if (live.has(entry.key)) continue; // first entry for a key wins
      live.add(entry.key);
      let record = this.groups.get(entry.key);
      if (record && (record.kind !== entry.kind || record.captain !== entry.captain)) {
        this.scene.remove(record.group);
        this.groups.delete(entry.key);
        record = undefined;
      }
      if (!record) {
        record = { group: this.build(entry), kind: entry.kind, captain: entry.captain };
        this.groups.set(entry.key, record);
        this.scene.add(record.group);
      }
      record.group.position.set(entry.x, entry.y, entry.z);
      record.group.rotation.y = entry.facing;
    }
    for (const [key, record] of this.groups) {
      if (!live.has(key)) {
        this.scene.remove(record.group);
        this.groups.delete(key);
      }
    }
  }

  /** Show/hide every raider group (also applied to groups created later). */
  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const record of this.groups.values()) record.group.visible = visible;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Number of live raider groups. */
  get size(): number {
    return this.groups.size;
  }

  /** Read-only view of every live group (E2E/diagnostics). */
  getMeshes(): RaiderMeshView[] {
    const out: RaiderMeshView[] = [];
    for (const [key, r] of this.groups) {
      out.push({
        key,
        kind: r.kind,
        captain: r.captain,
        x: r.group.position.x,
        y: r.group.position.y,
        z: r.group.position.z,
        rotationY: r.group.rotation.y,
        childCount: r.group.children.length,
        inScene: r.group.parent === this.scene,
        visible: r.group.visible,
      });
    }
    return out;
  }

  /** Shared resource counts (constant after construction; leak tests). */
  resourceCounts(): { geometries: number; materials: number } {
    return { geometries: this.geometries.size, materials: this.materials.size };
  }

  /** Remove every group and dispose the shared resources exactly once. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const record of this.groups.values()) this.scene.remove(record.group);
    this.groups.clear();
    for (const g of this.geometries.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
  }

  private resourcesFor(part: PartSpec): { geometry: THREE.BoxGeometry; material: THREE.MeshLambertMaterial } {
    const gKey = part.size.join('x');
    let geometry = this.geometries.get(gKey);
    if (!geometry) {
      geometry = new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
      this.geometries.set(gKey, geometry);
    }
    let material = this.materials.get(part.color);
    if (!material) {
      material = new THREE.MeshLambertMaterial({ color: part.color });
      this.materials.set(part.color, material);
    }
    return { geometry, material };
  }

  private build(entry: RaiderRenderEntry): THREE.Group {
    const group = new THREE.Group();
    group.name = entry.captain ? `raider-${entry.kind}-captain` : `raider-${entry.kind}`;
    group.userData = { raiderKey: entry.key, raiderKind: entry.kind, raiderCaptain: entry.captain };
    const parts = entry.captain ? [...RAIDER_PARTS[entry.kind], ...CAPTAIN_PARTS] : RAIDER_PARTS[entry.kind];
    for (const part of parts) {
      const { geometry, material } = this.resourcesFor(part);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(part.at[0], part.at[1], part.at[2]);
      group.add(mesh);
    }
    group.visible = this.visible;
    return group;
  }
}
