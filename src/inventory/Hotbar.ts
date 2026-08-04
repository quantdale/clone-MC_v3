import type { Inventory } from './Inventory';
import type { TextureAtlas } from '../rendering/TextureAtlas';
import { TILE_SIZE, TILES_PER_ROW } from '../rendering/TextureAtlas';
import type { BlockRegistry } from '../world/BlockRegistry';

/**
 * Renders the hotbar UI: one {@link .hotbar-slot} per inventory slot, each with
 * a slot-index label and a canvas preview of the slot's block tile texture.
 * The currently selected slot is highlighted with the `selected` class.
 */
export class Hotbar {
  private readonly container: HTMLElement;
  private readonly inventory: Inventory;
  private readonly atlas: TextureAtlas;
  private readonly registry: BlockRegistry;
  private readonly slots: HTMLDivElement[] = [];

  constructor(container: HTMLElement, inventory: Inventory, atlas: TextureAtlas, registry: BlockRegistry) {
    this.container = container;
    this.inventory = inventory;
    this.atlas = atlas;
    this.registry = registry;
    this.buildSlots();
    this.render();
  }

  /** Build the slot DOM elements and their block previews. */
  private buildSlots(): void {
    this.inventory.slots.forEach((blockId, index) => {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.dataset.index = String(index);

      const indexLabel = document.createElement('span');
      indexLabel.className = 'slot-index';
      indexLabel.textContent = String(index + 1);
      slot.appendChild(indexLabel);

      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.drawBlockPreview(ctx, blockId);
      }
      slot.appendChild(canvas);

      const def = this.registry.get(blockId);
      slot.title = def.name;

      this.container.appendChild(slot);
      this.slots.push(slot);
    });
  }

  /** Draw a single block's tile texture onto the given canvas context. */
  private drawBlockPreview(ctx: CanvasRenderingContext2D, blockId: number): void {
    const tile = this.registry.get(blockId).topTile;
    const col = tile % TILES_PER_ROW;
    const row = Math.floor(tile / TILES_PER_ROW);
    const tileX = col * TILE_SIZE;
    const tileY = row * TILE_SIZE;
    ctx.drawImage(this.atlas.canvas, tileX, tileY, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE);
  }

  /** Re-sync the selected highlight to the inventory's current selection. */
  render(): void {
    this.slots.forEach((slot, index) => {
      slot.classList.toggle('selected', index === this.inventory.selected);
    });
  }

  /** Show the hotbar. */
  show(): void {
    this.container.classList.remove('hidden');
  }

  /** Hide the hotbar. */
  hide(): void {
    this.container.classList.add('hidden');
  }

  /** Remove all hotbar DOM from the container. */
  dispose(): void {
    this.slots.length = 0;
    this.container.textContent = '';
  }
}