import { describe, it, expect } from 'vitest';
import { computeSkyLight } from '../../src/rendering/SkyLightEngine';
import { computeBlockLight } from '../../src/rendering/BlockLightEngine';
import { updateLightAfterEdit, type LightUpdateWorld } from '../../src/rendering/LightUpdateEngine';

/** In-memory 16×16 column volume whose opaque/source state can be edited between updates. */
class EditableGridWorld implements LightUpdateWorld {
  readonly minY: number;
  readonly maxY: number;
  private readonly opaqueCells = new Set<string>();
  private readonly sources = new Map<string, number>();
  private readonly skyLight = new Map<string, number>();
  private readonly blockLight = new Map<string, number>();

  constructor(minY = 0, maxY = 16) {
    this.minY = minY;
    this.maxY = maxY;
  }

  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  isOpaque(x: number, y: number, z: number): boolean {
    return this.opaqueCells.has(this.key(x, y, z));
  }

  getLuminance(x: number, y: number, z: number): number {
    return this.sources.get(this.key(x, y, z)) ?? 0;
  }

  getSkyLight(x: number, y: number, z: number): number {
    return this.skyLight.get(this.key(x, y, z)) ?? 0;
  }

  setSkyLight(x: number, y: number, z: number, value: number): void {
    this.skyLight.set(this.key(x, y, z), value);
  }

  getBlockLight(x: number, y: number, z: number): number {
    return this.blockLight.get(this.key(x, y, z)) ?? 0;
  }

  setBlockLight(x: number, y: number, z: number, value: number): void {
    this.blockLight.set(this.key(x, y, z), value);
  }

  placeBlock(x: number, y: number, z: number): void {
    this.opaqueCells.add(this.key(x, y, z));
  }

  breakBlock(x: number, y: number, z: number): void {
    this.opaqueCells.delete(this.key(x, y, z));
  }

  setSource(x: number, y: number, z: number, luminance: number): void {
    this.sources.set(this.key(x, y, z), luminance);
  }

  removeSource(x: number, y: number, z: number): void {
    this.sources.delete(this.key(x, y, z));
  }
}

interface Edit {
  x: number;
  y: number;
  z: number;
  apply(world: EditableGridWorld): void;
}

function place(x: number, y: number, z: number): Edit {
  return { x, y, z, apply: (w) => w.placeBlock(x, y, z) };
}

function breakBlock(x: number, y: number, z: number): Edit {
  return { x, y, z, apply: (w) => w.breakBlock(x, y, z) };
}

function setSource(x: number, y: number, z: number, luminance: number): Edit {
  return { x, y, z, apply: (w) => w.setSource(x, y, z, luminance) };
}

function removeSource(x: number, y: number, z: number): Edit {
  return { x, y, z, apply: (w) => w.removeSource(x, y, z) };
}

function openSkyWorld(): EditableGridWorld {
  return new EditableGridWorld();
}

function groundWorld(minY = 0, maxY = 16): EditableGridWorld {
  const world = new EditableGridWorld(minY, maxY);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      world.placeBlock(x, 0, z);
    }
  }
  return world;
}

/** A single air column through solid rock: sky light enters only from the top. */
function shaftWorld(): EditableGridWorld {
  const world = new EditableGridWorld();
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < 16; y++) {
        if (x !== 8 || z !== 8) world.placeBlock(x, y, z);
      }
    }
  }
  return world;
}

/** Ground at y=0 with a sealed cave carved below it (y ∈ [-5, -1], x/z ∈ [6, 10]). */
function caveWorld(): EditableGridWorld {
  const world = new EditableGridWorld(-6, 16);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = -6; y < 16; y++) {
        const inCave = x >= 6 && x <= 10 && z >= 6 && z <= 10 && y >= -5 && y <= -1;
        if (!inCave) world.placeBlock(x, y, z);
      }
    }
  }
  return world;
}

/** Ground truth: full recompute of sky (067) then block (068) light. */
function fullCompute(world: EditableGridWorld): void {
  computeSkyLight(world);
  computeBlockLight(world);
}

function snapshot(world: EditableGridWorld): string {
  const parts: string[] = [];
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = world.minY; y < world.maxY; y++) {
        const sky = world.getSkyLight(x, y, z);
        if (sky > 0) parts.push(`s:${x},${y},${z}:${sky}`);
        const block = world.getBlockLight(x, y, z);
        if (block > 0) parts.push(`b:${x},${y},${z}:${block}`);
      }
    }
  }
  return parts.sort().join('|');
}

interface Fixture {
  name: string;
  build(): EditableGridWorld;
  edits: Edit[];
}

const FIXTURES: Fixture[] = [
  { name: 'place a block in open sky', build: openSkyWorld, edits: [place(8, 8, 8)] },
  { name: 'place a block on the ground', build: groundWorld, edits: [place(8, 1, 8)] },
  {
    name: 'break a hole in the ground into a basement',
    build: () => groundWorld(-3, 8),
    edits: [breakBlock(8, 0, 8)],
  },
  {
    name: 'break the ground where no light reaches (no-op)',
    build: groundWorld,
    edits: [breakBlock(8, 0, 8)],
  },
  {
    name: 'block and unblock a shaft',
    build: shaftWorld,
    edits: [place(8, 8, 8), breakBlock(8, 8, 8)],
  },
  { name: 'place a torch', build: openSkyWorld, edits: [setSource(8, 8, 8, 14)] },
  {
    name: 'remove a torch',
    build: () => {
      const world = openSkyWorld();
      world.setSource(8, 8, 8, 14);
      return world;
    },
    edits: [removeSource(8, 8, 8)],
  },
  {
    name: 'place glowstone',
    build: openSkyWorld,
    edits: [
      {
        x: 8,
        y: 8,
        z: 8,
        apply: (w) => {
          w.placeBlock(8, 8, 8);
          w.setSource(8, 8, 8, 15);
        },
      },
    ],
  },
  {
    name: 'turn a torch into an opaque emitter',
    build: () => {
      const world = openSkyWorld();
      world.setSource(8, 8, 8, 14);
      return world;
    },
    edits: [place(8, 8, 8)],
  },
  {
    name: 'wall between a torch and the far side',
    build: () => {
      const world = openSkyWorld();
      world.setSource(5, 8, 8, 14);
      return world;
    },
    edits: [place(8, 8, 8)],
  },
  {
    name: 'block placed directly above a torch',
    build: () => {
      const world = openSkyWorld();
      world.setSource(8, 8, 8, 14);
      return world;
    },
    edits: [place(8, 9, 8)],
  },
  {
    name: 'compound edits: place, light, break, re-place',
    build: groundWorld,
    edits: [place(8, 4, 8), setSource(6, 4, 6, 12), breakBlock(8, 4, 8), place(6, 5, 6)],
  },
  {
    name: 'edits at world edges and corners',
    build: openSkyWorld,
    edits: [place(0, 0, 0), place(15, 15, 15), setSource(15, 0, 15, 10)],
  },
  {
    name: 'underground cave: torch, ceiling block, torch removal',
    build: caveWorld,
    edits: [setSource(8, -3, 8, 14), place(8, -2, 8), removeSource(8, -3, 8)],
  },
];

describe('updateLightAfterEdit', () => {
  it.each(FIXTURES)('is equivalent to a full recompute: $name', ({ build, edits }) => {
    const incremental = build();
    fullCompute(incremental);
    for (const edit of edits) {
      edit.apply(incremental);
      updateLightAfterEdit(incremental, edit.x, edit.y, edit.z);
    }

    const fresh = build();
    for (const edit of edits) edit.apply(fresh);
    fullCompute(fresh);

    expect(snapshot(incremental)).toBe(snapshot(fresh));
  });

  it('darkens cells that depended on the edited cell when a block is placed', () => {
    const world = shaftWorld();
    fullCompute(world);
    expect(world.getSkyLight(8, 4, 8)).toBe(4);

    world.placeBlock(8, 8, 8);
    updateLightAfterEdit(world, 8, 8, 8);

    expect(world.getSkyLight(8, 8, 8)).toBe(0); // the opaque cell itself
    expect(world.getSkyLight(8, 7, 8)).toBe(0);
    expect(world.getSkyLight(8, 4, 8)).toBe(0);
    expect(world.getSkyLight(8, 1, 8)).toBe(0);
    expect(world.getSkyLight(8, 9, 8)).toBe(9); // above the block keeps its light
  });

  it('lets light back in when a block is broken', () => {
    const world = shaftWorld();
    fullCompute(world);
    world.placeBlock(8, 8, 8);
    updateLightAfterEdit(world, 8, 8, 8);
    expect(world.getSkyLight(8, 4, 8)).toBe(0);

    world.breakBlock(8, 8, 8);
    updateLightAfterEdit(world, 8, 8, 8);

    expect(world.getSkyLight(8, 7, 8)).toBe(7);
    expect(world.getSkyLight(8, 4, 8)).toBe(4);
    expect(world.getSkyLight(8, 1, 8)).toBe(1);
    expect(world.getSkyLight(8, 0, 8)).toBe(0);
  });

  it('lets sky light into a basement when the ground is broken', () => {
    const world = groundWorld(-3, 8);
    fullCompute(world);
    expect(world.getSkyLight(8, -1, 8)).toBe(0);

    world.breakBlock(8, 0, 8);
    updateLightAfterEdit(world, 8, 0, 8);

    expect(world.getSkyLight(8, 0, 8)).toBe(8);
    expect(world.getSkyLight(8, -1, 8)).toBe(7);
    expect(world.getSkyLight(8, -2, 8)).toBe(6);
  });

  it('propagates from a newly placed light source', () => {
    const world = openSkyWorld();
    fullCompute(world);
    world.setSource(8, 8, 8, 14);
    updateLightAfterEdit(world, 8, 8, 8);

    expect(world.getBlockLight(8, 8, 8)).toBe(14);
    expect(world.getBlockLight(9, 8, 8)).toBe(13);
    expect(world.getBlockLight(10, 8, 8)).toBe(12);
    expect(world.getBlockLight(8, 11, 8)).toBe(11);
    expect(world.getSkyLight(8, 8, 8)).toBe(8); // sky untouched
  });

  it('stops propagation when a light source is removed', () => {
    const world = openSkyWorld();
    world.setSource(8, 8, 8, 14);
    fullCompute(world);
    expect(world.getBlockLight(10, 8, 8)).toBe(12);

    world.removeSource(8, 8, 8);
    updateLightAfterEdit(world, 8, 8, 8);

    expect(world.getBlockLight(8, 8, 8)).toBe(0);
    expect(world.getBlockLight(10, 8, 8)).toBe(0);
    expect(world.getSkyLight(8, 8, 8)).toBe(8);
  });

  it('lets an opaque source emit block light while blocking sky', () => {
    const world = openSkyWorld();
    fullCompute(world);
    world.placeBlock(8, 8, 8);
    world.setSource(8, 8, 8, 15);
    updateLightAfterEdit(world, 8, 8, 8);

    expect(world.getBlockLight(8, 8, 8)).toBe(15);
    expect(world.getBlockLight(9, 8, 8)).toBe(14);
    expect(world.getSkyLight(8, 8, 8)).toBe(0);
  });

  it('bends around a block placed above a torch instead of fully darkening', () => {
    const world = openSkyWorld();
    world.setSource(8, 8, 8, 14);
    fullCompute(world);

    world.placeBlock(8, 9, 8);
    updateLightAfterEdit(world, 8, 9, 8);

    expect(world.getBlockLight(8, 9, 8)).toBe(0); // opaque
    expect(world.getBlockLight(8, 10, 8)).toBe(10); // light bends around: 14 - 4 steps
    expect(world.getBlockLight(8, 8, 8)).toBe(14); // torch untouched
  });

  it('does not darken cells with an independent light path', () => {
    const world = openSkyWorld();
    world.setSource(5, 8, 8, 14);
    world.setSource(11, 8, 8, 14);
    fullCompute(world);
    expect(world.getBlockLight(10, 8, 8)).toBe(13); // lit by the torch at x=11

    world.placeBlock(8, 8, 8);
    updateLightAfterEdit(world, 8, 8, 8);

    expect(world.getBlockLight(10, 8, 8)).toBe(13); // still lit from x=11
    expect(world.getBlockLight(9, 8, 8)).toBe(12);
    expect(world.getBlockLight(7, 8, 8)).toBe(12);
    expect(world.getBlockLight(8, 9, 8)).toBe(10); // shadowed side, bent light
    expect(world.getBlockLight(8, 7, 8)).toBe(10);
    expect(world.getBlockLight(8, 8, 8)).toBe(0); // the opaque cell itself
  });

  it('is a no-op for a light-less edit in a dark sealed cave', () => {
    const world = caveWorld();
    fullCompute(world);
    const before = snapshot(world);

    world.placeBlock(8, -3, 8);
    updateLightAfterEdit(world, 8, -3, 8);

    expect(snapshot(world)).toBe(before);
  });

  it('restores the previous light when a placed block is broken again', () => {
    const world = openSkyWorld();
    fullCompute(world);
    const before = snapshot(world);

    world.placeBlock(8, 8, 8);
    updateLightAfterEdit(world, 8, 8, 8);
    world.breakBlock(8, 8, 8);
    updateLightAfterEdit(world, 8, 8, 8);

    expect(snapshot(world)).toBe(before);
  });

  it('is deterministic across identical worlds and edits', () => {
    const run = () => {
      const world = groundWorld();
      fullCompute(world);
      for (const edit of [
        place(8, 4, 8),
        setSource(6, 4, 6, 12),
        breakBlock(8, 4, 8),
        place(6, 5, 6),
      ]) {
        edit.apply(world);
        updateLightAfterEdit(world, edit.x, edit.y, edit.z);
      }
      return snapshot(world);
    };
    expect(run()).toBe(run());
  });
});
