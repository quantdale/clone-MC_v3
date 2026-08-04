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
export const ATLAS_SIZE = TILE_SIZE * TILES_PER_ROW; // 256

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
} as const;

export function tileUV(tile: number): { u0: number; v0: number; u1: number; v1: number } {
  const col = tile % TILES_PER_ROW;
  const row = Math.floor(tile / TILES_PER_ROW);
  const u0 = col / TILES_PER_ROW;
  const v0 = 1 - (row + 1) / TILES_PER_ROW;
  const u1 = (col + 1) / TILES_PER_ROW;
  const v1 = 1 - row / TILES_PER_ROW;
  return { u0, v0, u1, v1 };
}

export class TextureAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_SIZE;
    this.canvas.height = ATLAS_SIZE;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to create 2D canvas context for texture atlas');
    }
    this.ctx = ctx;
    this.generateAllTiles();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = true;
    this.texture.colorSpace = THREE.SRGBColorSpace;
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
  }

  /** Get the UV rectangle for a tile index. */
  uv(tile: number): { u0: number; v0: number; u1: number; v1: number } {
    return tileUV(tile);
  }

  dispose(): void {
    this.texture.dispose();
  }
}