import type { TextureAtlas } from '../rendering/TextureAtlas';
import { TILE_SIZE, TILES_PER_ROW } from '../rendering/TextureAtlas';
import type { Inventory } from '../inventory/Inventory';
import type { ItemTypeRegistry } from '../inventory/ItemRegistry';
import {
  applyBrewingMenuTransaction,
  createBrewingMenu,
  extractBrewingPlayerSlots,
  extractBrewingSlots,
  BREWING_BOTTLE_SLOT,
  BREWING_FUEL_SLOT,
  BREWING_INGREDIENT_SLOT,
  BREWING_MENU_SLOT_COUNT,
  BREWING_PLAYER_SLOT_START,
  brewingBrewProgress,
  brewingFuelFraction,
  brewingIsLit,
  type BrewingState,
} from '../world/BrewingStandBlockEntity';
import { menuSlotToStack, stackToMenuSlot } from '../inventory/MenuSlots';
import { parseResourceId } from '../data/ResourceId';
import type { ContainerMenu, MenuCursor, MenuSlot, MenuTransaction } from '../inventory/MenuTransaction';

/**
 * Live brewing screen (260). Pure view/controller over the authoritative host
 * state, mirroring `FurnacePanel` (251) over the 123 menu helpers: every
 * interaction derives a fresh 39-slot menu from the host's current state plus
 * the player inventory plus the panel cursor, applies ONE 106 transaction
 * immutably, writes the resulting brewing/player regions back atomically, and
 * re-renders. The panel owns no item state of its own beyond the transient
 * cursor slot, which {@link takeCursor} hands back on close so nothing —
 * including the bottle's potion contents — can be lost by closing.
 */
export interface BrewingPanelDeps {
  inventory: Inventory;
  registry: ItemTypeRegistry;
  atlas: TextureAtlas;
  /** The authoritative brewing state right now, or null when gone/closed. */
  getState(): BrewingState | null;
  /** Atomically write menu-derived brewing slots back into the host. */
  applySlots(slots: {
    bottle: BrewingState['bottle'];
    fuel: BrewingState['fuel'];
    ingredient: BrewingState['ingredient'];
  }): BrewingState | null;
  /** Player inventory changed (hotbar re-render). */
  onInventoryChanged(): void;
  /** Close button pressed. */
  onClose(): void;
}

interface SlotCell {
  root: HTMLElement;
  index: number;
}

/** The full cursor slot the panel settles on close (components preserved). */
export interface BrewingCursor {
  item: string | null;
  count: number;
  components?: Readonly<Record<string, unknown>>;
}

export class BrewingPanel {
  private readonly el: HTMLElement;
  private readonly deps: BrewingPanelDeps;
  private readonly cells: SlotCell[] = [];
  private readonly playerGrid: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly flameBar: HTMLElement;
  private readonly arrowBar: HTMLElement;
  private readonly cursorEl: HTMLElement;
  private readonly closeButton: HTMLButtonElement | null;

  /** Transient cursor slot between transactions (returned on close). */
  private cursor: MenuCursor & { components?: Readonly<Record<string, unknown>> } = { item: null, count: 0 };
  /** Cached render signature to avoid pointless DOM churn each frame. */
  private lastRenderKey = '';
  /** Last mouse position inside the panel, for the floating cursor chip. */
  private mouseX = 0;
  private mouseY = 0;

  constructor(el: HTMLElement, deps: BrewingPanelDeps) {
    this.el = el;
    this.deps = deps;

    for (const [id, index] of [
      ['brewing-bottle-slot', BREWING_BOTTLE_SLOT],
      ['brewing-fuel-slot', BREWING_FUEL_SLOT],
      ['brewing-ingredient-slot', BREWING_INGREDIENT_SLOT],
    ] as const) {
      const root = this.requireElement(id);
      this.wireSlot(root, index);
      this.cells.push({ root, index });
    }

    this.playerGrid = this.requireElement('brewing-player-grid');
    for (let index = BREWING_PLAYER_SLOT_START; index < BREWING_MENU_SLOT_COUNT; index++) {
      const cell = document.createElement('div');
      cell.className = 'inventory-cell brewing-slot';
      this.wireSlot(cell, index);
      this.cells.push({ root: cell, index });
      this.playerGrid.appendChild(cell);
    }

    this.statusEl = this.requireElement('brewing-status');
    this.flameBar = this.requireElement('brewing-flame-bar');
    this.arrowBar = this.requireElement('brewing-arrow-bar');
    this.cursorEl = this.requireElement('brewing-cursor');
    this.closeButton = el.querySelector<HTMLButtonElement>('#brewing-close');
    this.closeButton?.addEventListener('click', () => deps.onClose());
    el.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.positionCursorChip();
    });
  }

  show(): void {
    this.el.classList.remove('hidden');
    this.lastRenderKey = '';
    this.render();
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.lastRenderKey = '';
  }

  isVisible(): boolean {
    return !this.el.classList.contains('hidden');
  }

  /**
   * Hand back the transient cursor slot on close (null when empty), WITH its
   * components so a held potion bottle keeps its contents. The caller merges
   * it into the inventory or drops it — it must not be discarded.
   */
  takeCursor(): BrewingCursor | null {
    if (this.cursor.item === null || this.cursor.count <= 0) {
      this.cursor = { item: null, count: 0 };
      return null;
    }
    const taken: BrewingCursor = { item: this.cursor.item, count: this.cursor.count };
    if (this.cursor.components !== undefined) {
      taken.components = this.cursor.components;
    }
    this.cursor = { item: null, count: 0 };
    return taken;
  }

  /** Re-render from the authoritative state (cheap when nothing changed). */
  render(): void {
    const state = this.deps.getState();
    if (!state) return;
    const key = this.renderSignature(state);
    if (key === this.lastRenderKey) return;
    this.lastRenderKey = key;

    const menu = this.deriveMenu(state);
    for (const cell of this.cells) {
      this.renderCell(cell.root, menu.slots[cell.index] ?? null, this.deps.registry, cell.index);
    }
    const lit = brewingIsLit(state);
    this.statusEl.textContent = lit
      ? `Brewing — ${(brewingBrewProgress(state) * 100).toFixed(0)}% done, ${(brewingFuelFraction(state) * 100).toFixed(0)}% fuel left`
      : state.bottle.item !== null && state.fuel.item !== null
        ? 'Out of fire — add blaze powder'
        : 'Insert bottle, ingredient and fuel';
    this.flameBar.style.width = `${Math.round(brewingFuelFraction(state) * 100)}%`;
    this.flameBar.classList.toggle('lit', lit);
    this.arrowBar.style.width = `${Math.round(brewingBrewProgress(state) * 100)}%`;
    this.renderCursorChip();
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private deriveMenu(state: BrewingState): ContainerMenu {
    const playerSlots: MenuSlot[] = [];
    for (const stack of this.deps.inventory.slots) {
      playerSlots.push(stackToMenuSlot(stack, this.deps.registry));
    }
    const storage = this.deps.inventory.storage;
    for (let i = 0; i < 27; i++) {
      playerSlots.push(stackToMenuSlot(storage[i] ?? null, this.deps.registry));
    }
    return createBrewingMenu(state, playerSlots.slice(0, 36), { ...this.cursor });
  }

  private wireSlot(root: HTMLElement, index: number): void {
    root.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const transaction: MenuTransaction | null =
        e.shiftKey && e.button === 0
          ? { type: 'quickMove', index }
          : e.button === 0
            ? { type: 'leftClick', index }
            : e.button === 2
              ? { type: 'rightClick', index }
              : null;
      if (transaction) this.transact(transaction);
    });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private transact(transaction: MenuTransaction): void {
    const state = this.deps.getState();
    if (!state) return;
    let next: ContainerMenu;
    try {
      next = applyBrewingMenuTransaction(this.deriveMenu(state), transaction);
    } catch {
      return; // out-of-bounds guard; indices come from our own DOM so never thrown
    }
    // Atomicity guard (furnace parity): every content-bearing slot in the
    // result must convert back to an inventory stack — including its
    // components, so a bottle that lost its potion_contents can never be
    // written. If any would fail, abort the whole transaction — never a
    // partial write that could strand items between cursor, inventory, and
    // stand.
    const resultSlots = [
      ...Object.values(extractBrewingSlots(next)),
      ...extractBrewingPlayerSlots(next),
      next.cursor as unknown as MenuSlot,
    ];
    for (const slot of resultSlots) {
      if (slot.item !== null && slot.count > 0 && menuSlotToStack(slot, this.deps.registry) === null) {
        return;
      }
    }
    const brewingSlots = extractBrewingSlots(next);
    const applied = this.deps.applySlots(brewingSlots);
    if (!applied) return; // stand vanished mid-transaction: authoritative state untouched
    this.writeBackPlayerSlots(extractBrewingPlayerSlots(next));
    this.cursor = { ...next.cursor };
    this.deps.onInventoryChanged();
    this.lastRenderKey = '';
    this.render();
  }

  private writeBackPlayerSlots(menuSlots: MenuSlot[]): void {
    const inventory = this.deps.inventory;
    for (let i = 0; i < 9; i++) {
      const slot = menuSlots[i]!;
      const stack = menuSlotToStack(slot, this.deps.registry);
      if (stack) {
        inventory.slots[i] = stack;
      } else if ((slot.count ?? 0) <= 0 || slot.item === null) {
        // The transaction emptied this slot.
        inventory.slots[i] = { id: inventory.slots[i]?.id ?? 0, count: 0 };
      }
      // else: the menu held content that failed conversion (unknown id/corrupt
      // components). Keep the existing inventory stack — never delete items.
    }
    const previousStorage = [...inventory.storage];
    const nextStorage: typeof inventory.storage = [];
    for (let i = 9; i < 36; i++) {
      const slot = menuSlots[i]!;
      const stack = menuSlotToStack(slot, this.deps.registry);
      if (stack) {
        nextStorage.push(stack);
        continue;
      }
      if ((slot.count ?? 0) > 0 && slot.item !== null) {
        // Conversion failure: preserve the original stack at this position
        // verbatim so a transient problem cannot delete items.
        const original = previousStorage[i - 9];
        if (original && original.count > 0) nextStorage.push(original);
      }
      // else the transaction emptied this slot: nothing is pushed.
    }
    inventory.storage.length = 0;
    inventory.storage.push(...nextStorage);
  }

  private renderCell(
    root: HTMLElement,
    slot: MenuSlot | null,
    registry: ItemTypeRegistry,
    index: number,
  ): void {
    root.textContent = '';
    root.dataset.slotIndex = String(index);
    let tile = 0;
    let name = 'empty';
    const count = slot && slot.item !== null ? slot.count : 0;
    if (slot && slot.item !== null) {
      try {
        const def = registry.getByResourceId(parseResourceId(slot.item));
        if (def) {
          tile = def.iconTile;
          name = def.name;
        } else {
          name = slot.item;
        }
      } catch {
        name = slot.item;
      }
    }
    root.setAttribute('aria-label', `slot ${index + 1}: ${count > 0 ? `${name}, ${count}` : 'empty'}`);
    root.classList.toggle('empty', count === 0);
    if (count > 0 && slot && slot.item !== null && name !== slot.item) {
      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      canvas.className = 'inventory-cell-icon';
      const context = canvas.getContext('2d');
      if (context) {
        const tileX = (tile % TILES_PER_ROW) * TILE_SIZE;
        const tileY = Math.floor(tile / TILES_PER_ROW) * TILE_SIZE;
        context.drawImage(this.deps.atlas.canvas, tileX, tileY, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE);
      }
      root.appendChild(canvas);
    }
    const countLabel = document.createElement('span');
    countLabel.className = 'inventory-cell-count';
    countLabel.textContent = count > 0 ? String(count) : '';
    root.appendChild(countLabel);
  }

  private renderSignature(state: BrewingState): string {
    const s = (o: { item: string | null; count: number }) => `${o.item}:${o.count}`;
    return [
      s(state.bottle),
      JSON.stringify(state.bottle.components ?? null),
      s(state.fuel),
      s(state.ingredient),
      state.brewTime,
      state.brewTimeTotal,
      state.fuelBurnTime,
      state.fuelBurnTimeTotal,
      this.cursor.item,
      this.cursor.count,
      JSON.stringify((this.cursor as { components?: unknown }).components ?? null),
      this.deps.inventory.selected,
      ...this.deps.inventory.slots.map((st) => `${st.id}:${st.count}`),
      ...this.deps.inventory.storage.map((st) => `${st.id}:${st.count}`),
    ].join('|');
  }

  private renderCursorChip(): void {
    this.cursorEl.textContent = '';
    this.cursorEl.classList.toggle('empty', this.cursor.item === null);
    this.cursorEl.classList.toggle('carrying', this.cursor.item !== null);
    if (this.cursor.item !== null) {
      this.renderCell(
        this.cursorEl,
        { item: this.cursor.item, count: this.cursor.count, maxStack: 64 },
        this.deps.registry,
        -1,
      );
      this.positionCursorChip();
    }
  }

  private positionCursorChip(): void {
    if (this.cursor.item === null) return;
    this.cursorEl.style.left = `${this.mouseX + 8}px`;
    this.cursorEl.style.top = `${this.mouseY + 8}px`;
  }

  private requireElement(id: string): HTMLElement {
    const found = this.el.querySelector<HTMLElement>(`#${id}`);
    if (!found) {
      throw new Error(`Brewing element missing: #${id}`);
    }
    return found;
  }
}
