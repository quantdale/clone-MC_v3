import type { CraftingRecipe } from '../inventory/Crafting';
import { CraftingSystem } from '../inventory/Crafting';
import { Inventory } from '../inventory/Inventory';
import type { TextureAtlas } from '../rendering/TextureAtlas';
import { TILE_SIZE, TILES_PER_ROW } from '../rendering/TextureAtlas';
import { BlockRegistry } from '../world/BlockRegistry';

/** DOM controller for the compact Minecraft-style recipe panel. */
export class CraftingPanel {
  private readonly el: HTMLElement;
  private readonly recipesEl: HTMLElement;
  private readonly summaryEl: HTMLElement;
  private readonly inventoryGridEl: HTMLElement;
  private readonly closeButton: HTMLButtonElement | null;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly system: CraftingSystem;
  private readonly inventory: Inventory;

  constructor(
    el: HTMLElement,
    inventory: Inventory,
    registry: BlockRegistry,
    atlas: TextureAtlas,
    onCraft: (recipe: CraftingRecipe) => void,
    onClose: () => void,
  ) {
    this.el = el;
    this.inventory = inventory;
    this.system = new CraftingSystem(inventory);
    this.recipesEl = this.requireElement('crafting-recipes');
    this.summaryEl = this.requireElement('crafting-summary');
    this.inventoryGridEl = this.requireElement('inventory-grid');
    this.closeButton = el.querySelector<HTMLButtonElement>('#crafting-close');
    this.closeButton?.addEventListener('click', onClose);

    for (const recipe of this.system.recipes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'crafting-recipe';
      button.dataset.recipe = recipe.id;
      button.addEventListener('click', () => {
        const crafted = this.system.craft(recipe.id);
        if (crafted) {
          onCraft(crafted);
        }
        this.render(registry);
      });
      const title = document.createElement('span');
      title.className = 'crafting-recipe-title';
      title.textContent = recipe.name;
      const detail = document.createElement('span');
      detail.className = 'crafting-recipe-detail';
      detail.textContent = `${recipe.description} → ${registry.get(recipe.output).name}`;
      button.append(title, detail);
      this.recipesEl.appendChild(button);
      this.buttons.set(recipe.id, button);
    }
    this.atlas = atlas;
    this.render(registry);
  }

  private readonly atlas: TextureAtlas;

  show(): void {
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
  }

  isVisible(): boolean {
    return !this.el.classList.contains('hidden');
  }

  render(registry: BlockRegistry): void {
    const carried = registry.all()
      .filter((definition) => this.system.recipes.some((recipe) => recipe.ingredients.some(([id]) => id === definition.id)))
      .map((definition) => `${definition.name}: ${this.systemInventoryCount(definition.id)}`)
      .join('  ·  ');
    this.summaryEl.textContent = carried || 'Gather logs, sand, and stone to unlock recipes.';
    this.renderInventory(registry);
    for (const recipe of this.system.recipes) {
      const button = this.buttons.get(recipe.id);
      if (button) {
        button.disabled = !this.system.canCraft(recipe) || !this.systemInventoryCanAdd(recipe);
      }
    }
  }

  private renderInventory(registry: BlockRegistry): void {
    this.inventoryGridEl.textContent = '';
    for (let index = 0; index < this.inventory.slots.length; index++) {
      const id = this.inventory.slots[index] ?? 0;
      const count = this.inventory.getSlotCount(index);
      const cell = this.createCell(registry, id, count, `${index + 1}: hotbar`, true);
      cell.classList.add('inventory-hotbar-cell');
      cell.classList.toggle('selected', index === this.inventory.selected);
      cell.addEventListener('click', () => {
        this.inventory.select(index);
        this.render(registry);
      });
      this.inventoryGridEl.appendChild(cell);
    }
    for (let index = 0; index < 27; index++) {
      const stack = this.inventory.storage[index];
      const cell = this.createCell(
        registry,
        stack?.id ?? 0,
        stack?.count ?? 0,
        stack ? registry.get(stack.id).name : 'empty inventory slot',
        false,
      );
      this.inventoryGridEl.appendChild(cell);
    }
  }

  private createCell(
    registry: BlockRegistry,
    id: number,
    count: number,
    label: string,
    interactive: boolean,
  ): HTMLButtonElement {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'inventory-cell';
    cell.disabled = !interactive;
    cell.setAttribute('aria-label', `${label}: ${count > 0 ? `${registry.get(id).name}, ${count}` : 'empty'}`);
    if (count === 0) {
      cell.classList.add('empty');
    }
    if (count > 0) {
      const tile = registry.get(id).topTile;
      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      canvas.className = 'inventory-cell-icon';
      const context = canvas.getContext('2d');
      if (context) {
        const tileX = (tile % TILES_PER_ROW) * TILE_SIZE;
        const tileY = Math.floor(tile / TILES_PER_ROW) * TILE_SIZE;
        context.drawImage(this.atlas.canvas, tileX, tileY, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE);
      }
      cell.appendChild(canvas);
    }
    const countLabel = document.createElement('span');
    countLabel.className = 'inventory-cell-count';
    countLabel.textContent = count > 0 ? String(count) : '';
    cell.appendChild(countLabel);
    return cell;
  }

  private systemInventoryCount(id: number): number {
    // CraftingSystem intentionally keeps inventory private; the panel only
    // needs a read-only view, so this helper is supplied by the closure below.
    return this.inventory.getItemCount(id);
  }

  private systemInventoryCanAdd(recipe: CraftingRecipe): boolean {
    return this.inventory.canAddItem(recipe.output, recipe.outputCount);
  }

  private requireElement(id: string): HTMLElement {
    const found = this.el.querySelector<HTMLElement>(`#${id}`);
    if (!found) {
      throw new Error(`Crafting element missing: #${id}`);
    }
    return found;
  }
}
