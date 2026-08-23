import type { Inventory } from './Inventory';
import type { TextureAtlas } from '../rendering/TextureAtlas';
import { TILE_SIZE, TILES_PER_ROW } from '../rendering/TextureAtlas';
import type { ItemTypeRegistry } from './ItemRegistry';

/**
 * Renders the hotbar UI: one {@link .hotbar-slot} per inventory slot, each with
 * a slot-index label and a canvas preview of the slot's item icon texture. The
 * currently selected slot is highlighted with the `selected` class.
 */
export class Hotbar {
  private readonly container: HTMLElement;
  private readonly inventory: Inventory;
  private readonly atlas: TextureAtlas;
  private readonly registry: ItemTypeRegistry;
  private readonly slots: HTMLButtonElement[] = [];
  /** Per-slot preview canvases, for redrawing when a slot's item id changes. */
  private readonly canvases: HTMLCanvasElement[] = [];
  /** Item id currently painted on each slot canvas (-1 = never drawn). */
  private drawnIds: number[] = [];

  constructor(container: HTMLElement, inventory: Inventory, atlas: TextureAtlas, registry: ItemTypeRegistry) {
    this.container = container;
    this.inventory = inventory;
    this.atlas = atlas;
    this.registry = registry;
    this.buildSlots();
    this.render();
  }

  /** Build the slot DOM elements and their item previews. */
  private buildSlots(): void {
    this.container.setAttribute('role', 'toolbar');
    this.container.setAttribute('aria-label', 'Item hotbar');
    this.inventory.slots.forEach((stack, index) => {
      const itemId = stack?.id ?? 0;
      const def = this.registry.getByLegacyId(itemId);
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'hotbar-slot';
      slot.dataset.index = String(index);
      slot.setAttribute('aria-label', `${index + 1}: ${def?.name ?? 'empty'}`);
      slot.setAttribute('aria-pressed', index === this.inventory.selected ? 'true' : 'false');
      slot.addEventListener('click', () => {
        this.inventory.select(index);
        this.render();
      });

      const indexLabel = document.createElement('span');
      indexLabel.className = 'slot-index';
      indexLabel.textContent = String(index + 1);
      slot.appendChild(indexLabel);

      const countLabel = document.createElement('span');
      countLabel.className = 'slot-count';
      countLabel.dataset.count = String(index);
      slot.appendChild(countLabel);

      const durabilityBar = document.createElement('span');
      durabilityBar.className = 'slot-durability';
      durabilityBar.dataset.durability = String(index);
      slot.appendChild(durabilityBar);

      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.drawItemPreview(ctx, itemId);
      }
      slot.appendChild(canvas);
      this.canvases.push(canvas);
      this.drawnIds.push(itemId);

      slot.title = def?.name ?? 'empty';

      this.container.appendChild(slot);
      this.slots.push(slot);
    });
  }

  /** Draw a single item's icon tile onto the given canvas context. */
  private drawItemPreview(ctx: CanvasRenderingContext2D, itemId: number): void {
    const tile = this.registry.getByLegacyId(itemId)?.iconTile ?? 0;
    const col = tile % TILES_PER_ROW;
    const row = Math.floor(tile / TILES_PER_ROW);
    const tileX = col * TILE_SIZE;
    const tileY = row * TILE_SIZE;
    ctx.drawImage(this.atlas.canvas, tileX, tileY, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE);
  }

  /** Re-sync the selected highlight and per-slot visuals to the inventory. */
  render(): void {
    this.slots.forEach((slot, index) => {
      const selected = index === this.inventory.selected;
      slot.classList.toggle('selected', selected);
      slot.setAttribute('aria-pressed', selected ? 'true' : 'false');
      const countLabel = slot.querySelector<HTMLElement>('.slot-count');
      const count = this.inventory.getSlotCount(index);
      const stackId = this.inventory.slots[index]?.id ?? 0;
      const definition = this.registry.getByLegacyId(stackId);
      // Redraw the icon + title when the slot's item identity changed
      // (hardening 2026-08-23): they were previously painted once at
      // construction, leaving stale visuals after a save restore or when a
      // pickup replaced an empty slot's placeholder id.
      if (this.drawnIds[index] !== stackId) {
        const canvas = this.canvases[index];
        const ctx = canvas?.getContext('2d');
        if (ctx) {
          this.drawItemPreview(ctx, stackId);
        }
        this.drawnIds[index] = stackId;
        slot.title = definition?.name ?? 'empty';
      }
      if (countLabel) {
        countLabel.textContent = count > 0 ? String(count) : '';
      }
      const durabilityBar = slot.querySelector<HTMLElement>('.slot-durability');
      const maxDurability = definition?.maxDurability ?? 0;
      const durability = maxDurability > 0 && count > 0
        ? this.inventory.getSlotDurability(index, maxDurability)
        : 0;
      if (durabilityBar) {
        durabilityBar.classList.toggle('visible', durability > 0);
        durabilityBar.style.width = maxDurability > 0 ? `${Math.max(0, Math.min(100, durability / maxDurability * 100))}%` : '0%';
        durabilityBar.setAttribute('aria-label', maxDurability > 0 ? `${durability}/${maxDurability} durability` : '');
      }
      slot.setAttribute(
        'aria-label',
        `${index + 1}: ${definition?.name ?? 'empty'}${count > 0 ? `, ${count}` : ', empty'}${durability > 0 ? `, ${durability}/${maxDurability} durability` : ''}`,
      );
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
    this.canvases.length = 0;
    this.drawnIds = [];
    this.container.textContent = '';
  }
}
