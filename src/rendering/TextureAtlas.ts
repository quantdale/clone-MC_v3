import * as THREE from 'three';
import { PRNG } from '../math/PRNG';

/**
 * Procedural texture atlas.
 *
 * Generates original 16×16 tiles at runtime into a single canvas atlas and
 * exposes a THREE.CanvasTexture plus per-tile UV rectangles. All art is
 * procedural (no copyrighted assets). The atlas is laid out as a grid of
 * tiles; tile index → UV mapping is derived from the index.
 */

export const TILE_SIZE = 16;
export const TILES_PER_ROW = 16;
export const ATLAS_ROWS = 4;
export const ATLAS_WIDTH = TILE_SIZE * TILES_PER_ROW; // 256
export const ATLAS_HEIGHT = TILE_SIZE * ATLAS_ROWS; // 64
/** Backwards-compatible alias for the atlas width. */
export const ATLAS_SIZE = ATLAS_WIDTH;

/** Tile atlas indices used by the block registry. */
export const TILE_INDEX = {
  air: 0,
  grassTop: 1,
  dirt: 2,
  grassSide: 3,
  stone: 4,
  sand: 5,
  water: 6,
  bedrock: 7,
  woodTop: 8,
  woodSide: 9,
  leaves: 10,
  glass: 11,
  snow: 12,
  gravel: 13,
  planks: 14,
  apple: 15,
  coalOre: 16,
  ironOre: 17,
  cobblestone: 18,
  bricks: 19,
  lava: 20,
  stick: 21,
  woodenPickaxe: 22,
  stonePickaxe: 23,
  woodenAxe: 24,
  coal: 25,
  rawIron: 26,
  chest: 27,
  furnace: 28,
  ironIngot: 29,
} as const;

export function tileUV(tile: number): { u0: number; v0: number; u1: number; v1: number } {
  const col = tile % TILES_PER_ROW;
  const row = Math.floor(tile / TILES_PER_ROW);
  const u0 = col / TILES_PER_ROW;
  const v0 = 1 - (row + 1) / ATLAS_ROWS;
  const u1 = (col + 1) / TILES_PER_ROW;
  const v1 = 1 - row / ATLAS_ROWS;
  return { u0, v0, u1, v1 };
}

export class TextureAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly uvCache: Map<number, { u0: number; v0: number; u1: number; v1: number }>;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_WIDTH;
    this.canvas.height = ATLAS_HEIGHT;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to create 2D canvas context for texture atlas');
    }
    this.ctx = ctx;
    this.generateAllTiles();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    // Nearest-filtered pixel art should not use mipmaps; they cause shimmering
    // when the GPU selects a lower-resolution mip level at oblique angles.
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    // Pre-compute UV rectangles once at atlas construction time so that the
    // per-face meshing loop can reuse cached objects instead of allocating a
    // fresh {u0,v0,u1,v1} per face (AUDIT-009).
    this.uvCache = new Map();
    for (const tile of Object.values(TILE_INDEX)) {
      this.uvCache.set(tile, tileUV(tile));
    }
  }

  /** Draw a single tile onto the canvas at the given tile index. */
  private drawTile(tile: number, painter: (ctx: CanvasRenderingContext2D, rng: PRNG) => void): void {
    const col = tile % TILES_PER_ROW;
    const row = Math.floor(tile / TILES_PER_ROW);
    const x = col * TILE_SIZE;
    const y = row * TILE_SIZE;
    this.ctx.save();
    this.ctx.translate(x, y);
    painter(this.ctx, new PRNG(tile * 7919 + 13));
    this.ctx.restore();
  }

  private generateAllTiles(): void {
    // 0: air — fully transparent (unused in rendering).
    this.drawTile(TILE_INDEX.air, (ctx) => {
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
    });

    // 1: grass top — green with noise speckles.
    this.drawTile(TILE_INDEX.grassTop, (ctx, rng) => {
      ctx.fillStyle = '#5aa037';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 60; i++) {
        const brightness = Math.floor(rng.range(0.6, 1.15) * 255);
        ctx.fillStyle = `rgb(${Math.floor(brightness * 0.36)}, ${Math.floor(brightness * 0.66)}, ${Math.floor(brightness * 0.26)})`;
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
    });

    // 2: dirt — brown with speckles.
    this.drawTile(TILE_INDEX.dirt, (ctx, rng) => {
      ctx.fillStyle = '#8a5a33';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 55; i++) {
        const brightness = Math.floor(rng.range(0.7, 1.15) * 255);
        ctx.fillStyle = `rgb(${Math.floor(brightness * 0.56)}, ${Math.floor(brightness * 0.38)}, ${Math.floor(brightness * 0.22)})`;
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
    });

    // 3: grass side — dirt with a green top strip.
    this.drawTile(TILE_INDEX.grassSide, (ctx, rng) => {
      ctx.fillStyle = '#8a5a33';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 45; i++) {
        const brightness = Math.floor(rng.range(0.7, 1.15) * 255);
        ctx.fillStyle = `rgb(${Math.floor(brightness * 0.56)}, ${Math.floor(brightness * 0.38)}, ${Math.floor(brightness * 0.22)})`;
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
      // Green grass strip along the top.
      ctx.fillStyle = '#5aa037';
      ctx.fillRect(0, 0, TILE_SIZE, 3);
      for (let i = 0; i < 16; i++) {
        const g = Math.floor(rng.range(0.7, 1.1) * 255);
        ctx.fillStyle = `rgb(${Math.floor(g * 0.36)}, ${Math.floor(g * 0.66)}, ${Math.floor(g * 0.26)})`;
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(3), 1, 1);
      }
    });

    // 4: stone — gray with speckles.
    this.drawTile(TILE_INDEX.stone, (ctx, rng) => {
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 60; i++) {
        const v = Math.floor(rng.range(0.55, 1.2) * 255);
        ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
    });

    // 5: sand — pale yellow with speckles.
    this.drawTile(TILE_INDEX.sand, (ctx, rng) => {
      ctx.fillStyle = '#e8d9a0';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 55; i++) {
        const v = Math.floor(rng.range(0.7, 1.2) * 255);
        ctx.fillStyle = `rgb(${Math.floor(v * 0.92)}, ${Math.floor(v * 0.86)}, ${Math.floor(v * 0.62)})`;
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
    });

    // 6: water — semi-transparent blue.
    this.drawTile(TILE_INDEX.water, (ctx, rng) => {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#3a6fd8';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 20; i++) {
        ctx.fillStyle = `rgba(255,255,255,${rng.range(0.05, 0.2)})`;
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
    });

    // 7: bedrock — dark gray/noise.
    this.drawTile(TILE_INDEX.bedrock, (ctx, rng) => {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 70; i++) {
        const v = Math.floor(rng.range(0.2, 0.8) * 255);
        ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
    });

    // 8: wood top — concentric rings.
    this.drawTile(TILE_INDEX.woodTop, (ctx) => {
      ctx.fillStyle = '#b08a4a';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      const cx = 8;
      const cy = 8;
      for (let r = 1; r <= 8; r++) {
        ctx.strokeStyle = r % 2 === 0 ? '#8a6a34' : '#c8a05a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // 9: wood side — vertical bark stripes.
    this.drawTile(TILE_INDEX.woodSide, (ctx, rng) => {
      ctx.fillStyle = '#8a6a34';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let x = 0; x < TILE_SIZE; x++) {
        const v = Math.floor(rng.range(0.75, 1.15) * 255);
        ctx.fillStyle = `rgb(${Math.floor(v * 0.56)}, ${Math.floor(v * 0.42)}, ${Math.floor(v * 0.2)})`;
        ctx.fillRect(x, 0, 1, TILE_SIZE);
      }
    });

    // 10: leaves — green with darker speckles.
    this.drawTile(TILE_INDEX.leaves, (ctx, rng) => {
      ctx.fillStyle = '#3f7a2a';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 80; i++) {
        const g = Math.floor(rng.range(0.4, 1.2) * 255);
        ctx.fillStyle = `rgb(${Math.floor(g * 0.3)}, ${Math.floor(g * 0.62)}, ${Math.floor(g * 0.22)})`;
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
      // A few transparent gaps for a leafy feel.
      for (let i = 0; i < 8; i++) {
        ctx.clearRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
    });

    // 11: glass — a cool, translucent pane with a strong diagonal highlight.
    this.drawTile(TILE_INDEX.glass, (ctx) => {
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = '#8bd7ef';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#d9f7ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(2, 14);
      ctx.lineTo(14, 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(30, 115, 160, 0.6)';
      ctx.strokeRect(0.5, 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    });

    // 12: snow — bright, cool white with subtle blue shadow pixels.
    this.drawTile(TILE_INDEX.snow, (ctx, rng) => {
      ctx.fillStyle = '#eef8ff';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 32; i++) {
        ctx.fillStyle = rng.next() > 0.55 ? '#d3eaf6' : '#ffffff';
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
    });

    // 13: gravel — coarse gray stones with warm earth flecks.
    this.drawTile(TILE_INDEX.gravel, (ctx, rng) => {
      ctx.fillStyle = '#77766f';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 44; i++) {
        const shade = Math.floor(rng.range(0.55, 1.2) * 180);
        ctx.fillStyle = rng.next() > 0.78
          ? `rgb(${shade}, ${Math.floor(shade * 0.82)}, ${Math.floor(shade * 0.62)})`
          : `rgb(${shade}, ${shade}, ${shade})`;
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
    });

    // 14: planks — warm wood boards with simple dark seams.
    this.drawTile(TILE_INDEX.planks, (ctx, rng) => {
      ctx.fillStyle = '#b77a3c';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = '#80532c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 5.5);
      ctx.lineTo(TILE_SIZE, 5.5);
      ctx.moveTo(0, 11.5);
      ctx.lineTo(TILE_SIZE, 11.5);
      ctx.stroke();
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = rng.next() > 0.5 ? '#d29a58' : '#97602f';
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1 + rng.nextInt(2), 1);
      }
    });

    // 15: apple — a tiny warm-red food icon for the survival inventory.
    this.drawTile(TILE_INDEX.apple, (ctx) => {
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#c63c35';
      ctx.beginPath();
      ctx.arc(6, 9, 4.3, 0, Math.PI * 2);
      ctx.arc(10, 9, 4.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#743026';
      ctx.fillRect(7.5, 2, 1, 3);
      ctx.fillStyle = '#63a344';
      ctx.beginPath();
      ctx.ellipse(10.5, 3.5, 3, 1.5, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f58a68';
      ctx.fillRect(4, 7, 1, 2);
    });

    // 16: coal ore — charcoal mineral flecks embedded in stone.
    this.drawTile(TILE_INDEX.coalOre, (ctx, rng) => {
      ctx.fillStyle = '#777777';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 42; i++) {
        const shade = Math.floor(rng.range(0.55, 1.15) * 150);
        ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = '#20252a';
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1 + rng.nextInt(2), 1);
      }
    });

    // 17: iron ore — warm rust-colored mineral flecks in stone.
    this.drawTile(TILE_INDEX.ironOre, (ctx, rng) => {
      ctx.fillStyle = '#858585';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 42; i++) {
        const shade = Math.floor(rng.range(0.55, 1.15) * 160);
        ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = rng.next() > 0.5 ? '#b35d3e' : '#d08055';
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1 + rng.nextInt(2), 1);
      }
    });

    // 18: cobblestone — irregular pale stones with dark mortar lines.
    this.drawTile(TILE_INDEX.cobblestone, (ctx, rng) => {
      ctx.fillStyle = '#686a6c';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = '#3d4144';
      ctx.lineWidth = 1;
      for (let y = 1; y < TILE_SIZE; y += 5) {
        ctx.beginPath();
        ctx.moveTo(0, y + rng.range(-1, 1));
        ctx.lineTo(TILE_SIZE, y + rng.range(-1, 1));
        ctx.stroke();
      }
      for (let i = 0; i < 20; i++) {
        ctx.fillStyle = rng.next() > 0.5 ? '#888b8c' : '#4f5356';
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 2, 1);
      }
    });

    // 19: bricks — warm masonry with alternating mortar seams.
    this.drawTile(TILE_INDEX.bricks, (ctx, rng) => {
      ctx.fillStyle = '#a9553d';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = '#6d392f';
      ctx.lineWidth = 1;
      for (let y = 5; y < TILE_SIZE; y += 6) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(TILE_SIZE, y);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(7.5, 0);
      ctx.lineTo(7.5, 5);
      ctx.moveTo(3.5, 5);
      ctx.lineTo(3.5, 11);
      ctx.moveTo(11.5, 5);
      ctx.lineTo(11.5, 11);
      ctx.moveTo(7.5, 11);
      ctx.lineTo(7.5, TILE_SIZE);
      ctx.stroke();
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = rng.next() > 0.5 ? '#c16b4b' : '#8f4637';
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
    });

    // 20: lava — a hot orange fluid tile with a dark molten pattern.
    this.drawTile(TILE_INDEX.lava, (ctx, rng) => {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#d34b1f';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = rng.next() > 0.45 ? '#ff9a2d' : '#8e2618';
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1 + rng.nextInt(2), 1 + rng.nextInt(2));
      }
      ctx.globalAlpha = 1;
    });

    // 21: stick — a simple inventory icon with a warm wood grain.
    this.drawTile(TILE_INDEX.stick, (ctx) => {
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = '#9b6939';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, 13);
      ctx.lineTo(12, 3);
      ctx.stroke();
      ctx.strokeStyle = '#d1a064';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(5, 13);
      ctx.lineTo(13, 3);
      ctx.stroke();
    });

    // 22: wooden pickaxe — transparent icon for the hotbar and inventory.
    this.drawTile(TILE_INDEX.woodenPickaxe, (ctx) => {
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = '#8e5b2e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(5, 14);
      ctx.lineTo(10, 6);
      ctx.stroke();
      ctx.strokeStyle = '#c48a4b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, 5);
      ctx.quadraticCurveTo(8, 1, 13, 5);
      ctx.stroke();
    });

    // 23: stone pickaxe — dark handle and gray head.
    this.drawTile(TILE_INDEX.stonePickaxe, (ctx) => {
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = '#80552f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(5, 14);
      ctx.lineTo(10, 6);
      ctx.stroke();
      ctx.strokeStyle = '#9ca5ad';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(4, 5);
      ctx.quadraticCurveTo(8, 1, 13, 5);
      ctx.stroke();
    });

    // 24: wooden axe — broad warm head and diagonal handle.
    this.drawTile(TILE_INDEX.woodenAxe, (ctx) => {
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = '#8e5b2e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(5, 14);
      ctx.lineTo(10, 6);
      ctx.stroke();
      ctx.fillStyle = '#c48a4b';
      ctx.beginPath();
      ctx.moveTo(8, 2);
      ctx.lineTo(14, 4);
      ctx.lineTo(11, 9);
      ctx.lineTo(8, 7);
      ctx.closePath();
      ctx.fill();
    });

    // 25: coal — a compact dark mineral inventory icon.
    this.drawTile(TILE_INDEX.coal, (ctx) => {
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#22272c';
      ctx.beginPath();
      ctx.moveTo(4, 11);
      ctx.lineTo(5, 5);
      ctx.lineTo(10, 3);
      ctx.lineTo(13, 7);
      ctx.lineTo(11, 13);
      ctx.lineTo(6, 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#59616a';
      ctx.fillRect(6, 5, 2, 2);
      ctx.fillRect(9, 8, 2, 2);
    });

    // 26: raw iron — warm metallic nugget icon.
    this.drawTile(TILE_INDEX.rawIron, (ctx) => {
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#c47b58';
      ctx.beginPath();
      ctx.moveTo(3, 10);
      ctx.lineTo(6, 4);
      ctx.lineTo(12, 3);
      ctx.lineTo(14, 8);
      ctx.lineTo(10, 13);
      ctx.lineTo(5, 13);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f0aa79';
      ctx.fillRect(6, 5, 3, 2);
      ctx.fillRect(9, 9, 2, 2);
    });

    // 27: chest — a warm wooden container tile with a framed lid and latch.
    this.drawTile(TILE_INDEX.chest, (ctx, rng) => {
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      // Plank base.
      ctx.fillStyle = '#a9743f';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      // Darker frame border.
      ctx.fillStyle = '#6b4526';
      ctx.fillRect(0, 0, TILE_SIZE, 2);
      ctx.fillRect(0, TILE_SIZE - 2, TILE_SIZE, 2);
      ctx.fillRect(0, 0, 2, TILE_SIZE);
      ctx.fillRect(TILE_SIZE - 2, 0, 2, TILE_SIZE);
      // Lid seam band.
      ctx.fillStyle = '#8a5a30';
      ctx.fillRect(0, 7, TILE_SIZE, 2);
      // Plank grain speckles.
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = rng.next() > 0.5 ? '#b9824a' : '#9c6636';
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
      // Latch.
      ctx.fillStyle = '#d8b04c';
      ctx.fillRect(7, 4, 2, 3);
      ctx.fillStyle = '#7a4e28';
      ctx.fillRect(7, 9, 2, 1);
    });

    // 28: furnace — a stone block face with a dark ash opening and fire glow.
    this.drawTile(TILE_INDEX.furnace, (ctx, rng) => {
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      // Stone base with speckles.
      ctx.fillStyle = '#7d8084';
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = rng.next() > 0.5 ? '#8f9296' : '#66696d';
        ctx.fillRect(rng.nextInt(TILE_SIZE), rng.nextInt(TILE_SIZE), 1, 1);
      }
      // Dark rim around the mouth.
      ctx.fillStyle = '#4a4d51';
      ctx.fillRect(1, 1, TILE_SIZE - 2, 2);
      ctx.fillRect(1, TILE_SIZE - 3, TILE_SIZE - 2, 2);
      ctx.fillRect(1, 1, 2, TILE_SIZE - 2);
      ctx.fillRect(TILE_SIZE - 3, 1, 2, TILE_SIZE - 2);
      // Mouth opening.
      ctx.fillStyle = '#1c1e21';
      ctx.fillRect(3, 3, TILE_SIZE - 6, TILE_SIZE - 6);
      // Ember glow inside the mouth.
      ctx.fillStyle = '#d3541f';
      ctx.fillRect(5, 9, 3, 2);
      ctx.fillRect(8, 7, 2, 2);
      ctx.fillStyle = '#f2a33c';
      ctx.fillRect(6, 8, 2, 1);
    });
    // 29: iron_ingot — a metallic ingot bar with beveled edges and a bright highlight.
    this.drawTile(TILE_INDEX.ironIngot, (ctx) => {
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      // Darker base plate behind the bar for contrast.
      ctx.fillStyle = '#2b2e33';
      ctx.fillRect(2, 4, TILE_SIZE - 4, TILE_SIZE - 8);
      // Main ingot body with a vertical gradient feel via stacked bands.
      ctx.fillStyle = '#b8bcc4';
      ctx.fillRect(4, 6, TILE_SIZE - 8, TILE_SIZE - 12);
      ctx.fillStyle = '#d7dbe2';
      ctx.fillRect(4, 6, TILE_SIZE - 8, 2);
      ctx.fillStyle = '#9aa0aa';
      ctx.fillRect(4, TILE_SIZE - 8, TILE_SIZE - 8, 2);
      // Specular highlight along the upper edge.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(6, 7, TILE_SIZE - 12, 1);
      // Tapered end shadows for the classic ingot silhouette.
      ctx.fillStyle = '#7e848e';
      ctx.fillRect(4, 6, 2, TILE_SIZE - 12);
      ctx.fillRect(TILE_SIZE - 6, 6, 2, TILE_SIZE - 12);
    });
  }

  /** Get the UV rectangle for a tile index (cached, no per-call allocation). */
  uv(tile: number): { u0: number; v0: number; u1: number; v1: number } {
    return this.uvCache.get(tile) ?? tileUV(tile);
  }

  dispose(): void {
    this.texture.dispose();
  }
}