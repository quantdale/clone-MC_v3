/**
 * Fire block simulation (change 128).
 *
 * A pure, deterministic ignition API places Fire on an ignitable cell (air over
 * a flammable support); `FireBlockBehavior` drives aging/extinguish/burn/spread
 * from the existing random-tick dispatch (048/050), using the per-block `age`
 * state (125/126 overlay pattern) as its burn timer. All randomness is derived
 * from the injected simulation seed via {@link hash32}, so identical worlds
 * replay identically. No scheduled-tick wiring, no tool item, no damage/light —
 * see `openspec/changes/128-fire-block-simulation/design.md`.
 */
import { BlockId } from '../world/BlockRegistry';
import type { BlockBehavior, BlockBehaviorContext, BlockWorldAccess } from './BlockBehavior';
import { hash32 } from './RandomTickSelector';

/** State property name holding a fire's burn stage. */
export const FIRE_AGE_PROPERTY = 'age';

/** Maximum fire age; a fire whose age would exceed this extinguishes (and may burn its support). */
export const MAX_FIRE_AGE = 15;

/** Per-candidate probability threshold below which a spread roll ignites a neighbor. */
export const SPREAD_PROBABILITY = 0.5;

/** Maximum number of new fires a single live fire may ignite in one random tick. */
export const MAX_SPREAD_PER_TICK = 2;

/** The documented flammable set: blocks a fire can be supported by / spread onto. */
export function isFlammable(blockId: number): boolean {
  return blockId === BlockId.Wood || blockId === BlockId.Leaves || blockId === BlockId.Planks;
}

/**
 * Parse a fire age value defensively. `undefined`, non-integer, or out-of-range
 * values normalize to 0 (mirrors crop-age/moisture parsing in 125/126).
 */
export function parseFireAge(raw: string | undefined): number {
  const a = raw === undefined ? 0 : parseInt(raw, 10);
  if (!Number.isInteger(a) || a < 0 || a > MAX_FIRE_AGE) {
    return 0;
  }
  return a;
}

/** Whether `(x, y, z)` is an ignitable cell: air with a flammable block directly below. */
export function canIgnite(world: BlockWorldAccess, x: number, y: number, z: number): boolean {
  return world.getBlockId(x, y, z) === BlockId.Air && isFlammable(world.getBlockId(x, y - 1, z));
}

/**
 * Place Fire (age 0) at `(x, y, z)` when the cell is ignitable, returning `true`.
 * Writes nothing and returns `false` on a non-ignitable cell; never throws.
 */
export function ignite(world: BlockWorldAccess, x: number, y: number, z: number): boolean {
  if (!canIgnite(world, x, y, z)) {
    return false;
  }
  if (typeof world.setBlockState === 'function') {
    world.setBlockState(x, y, z, BlockId.Fire, { [FIRE_AGE_PROPERTY]: 0 });
  } else {
    world.setBlockId(x, y, z, BlockId.Fire);
  }
  return true;
}

/** The 6 fixed orthogonal neighbors of a cell, in a stable candidate order (4 horizontal + up + down). */
function orthogonalNeighbors(x: number, y: number, z: number): Array<[number, number, number]> {
  return [
    [x + 1, y, z],
    [x - 1, y, z],
    [x, y, z + 1],
    [x, y, z - 1],
    [x, y + 1, z],
    [x, y - 1, z],
  ];
}

/** Whether any of the 6 orthogonal neighbors of `(x, y, z)` is Water. */
export function isAdjacentToWater(world: BlockWorldAccess, x: number, y: number, z: number): boolean {
  for (const [nx, ny, nz] of orthogonalNeighbors(x, y, z)) {
    if (world.getBlockId(nx, ny, nz) === BlockId.Water) {
      return true;
    }
  }
  return false;
}

/**
 * Deterministic per-candidate spread roll in `[0, 1)`, a pure function of its
 * inputs derived from the {@link hash32} FNV-1a-style hash. No global RNG.
 */
export function spreadRoll(
  seed: number,
  x: number,
  y: number,
  z: number,
  tick: number,
  index: number,
): number {
  return hash32(seed, x, y, z, tick, index) / 4294967296;
}

/**
 * Attempt bounded spread from a live fire at `(x, y, z)` to its 6 fixed
 * neighbors: each ignitable candidate ignites when `roll(index)` is below
 * {@link SPREAD_PROBABILITY}, stopping once {@link MAX_SPREAD_PER_TICK} new
 * fires have been placed. Returns the number of fires ignited.
 */
export function spreadFire(
  world: BlockWorldAccess,
  x: number,
  y: number,
  z: number,
  roll: (index: number) => number,
): number {
  const candidates = orthogonalNeighbors(x, y, z);
  let ignited = 0;
  for (let i = 0; i < candidates.length && ignited < MAX_SPREAD_PER_TICK; i++) {
    const candidate = candidates[i]!;
    const [nx, ny, nz] = candidate;
    if (!canIgnite(world, nx, ny, nz)) {
      continue;
    }
    if (roll(i) >= SPREAD_PROBABILITY) {
      continue;
    }
    if (ignite(world, nx, ny, nz)) {
      ignited++;
    }
  }
  return ignited;
}

/**
 * Behavior for the Fire block (128). On a random tick: extinguishes when
 * unsupported or water-adjacent (never burning its support in that case);
 * otherwise advances `age`, and at the end of its life extinguishes AND burns a
 * flammable support to Air (the burn rule); a live fire also attempts bounded
 * spread to ignitable neighbors. Never throws — a throwing state read, a
 * non-fire cell, or a state-less access are all safe no-ops/skips.
 */
export class FireBlockBehavior implements BlockBehavior {
  onRandomTick(ctx: BlockBehaviorContext): void {
    const world = ctx.world;
    if (world.getBlockId(ctx.x, ctx.y, ctx.z) !== BlockId.Fire) {
      return;
    }

    const supported = isFlammable(world.getBlockId(ctx.x, ctx.y - 1, ctx.z));
    if (!supported || isAdjacentToWater(world, ctx.x, ctx.y, ctx.z)) {
      world.setBlockId(ctx.x, ctx.y, ctx.z, BlockId.Air);
      return;
    }

    let age = 0;
    if (typeof world.getBlockState === 'function') {
      try {
        age = parseFireAge(world.getBlockState(ctx.x, ctx.y, ctx.z).getProperty(FIRE_AGE_PROPERTY));
      } catch {
        // Malformed/absent state read: skip this tick.
        return;
      }
    }

    const next = age + 1;
    if (next > MAX_FIRE_AGE) {
      world.setBlockId(ctx.x, ctx.y, ctx.z, BlockId.Air);
      // Burn rule: end-of-life fire consumes its flammable support.
      world.setBlockId(ctx.x, ctx.y - 1, ctx.z, BlockId.Air);
      return;
    }

    if (typeof world.setBlockState === 'function') {
      world.setBlockState(ctx.x, ctx.y, ctx.z, BlockId.Fire, { [FIRE_AGE_PROPERTY]: next });
    }

    const seed = ctx.seed ?? 0;
    spreadFire(world, ctx.x, ctx.y, ctx.z, (index) =>
      spreadRoll(seed, ctx.x, ctx.y, ctx.z, ctx.tick, index),
    );
  }
}
