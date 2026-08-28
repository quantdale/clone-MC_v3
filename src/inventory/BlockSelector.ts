/**
 * Block selector interface.
 *
 * Implemented by the inventory/hotbar and consumed by the interaction system to
 * determine which block to place.
 */
import type { ItemStack } from './Inventory';

export interface BlockSelector {
  /** The item id of the currently selected hotbar slot. */
  getSelectedItemId(): number;
  /** Optional stack count used by the interactive inventory implementation. */
  getSlotCount?(index?: number): number;
  /** Optional consumption hook used when placing a stackable block. */
  consumeSelected?(): boolean;
  /** Optional drop/pickup hook used when breaking a block. */
  addItem?(id: number, amount: number): number;
  /** Optional tool durability hooks used by efficient mining. */
  getSelectedDurability?(maxDurability: number): number;
  /** Optional full stack of the selected slot (used for enchantment reads). */
  getSelectedStack?(): ItemStack | null;
  damageSelectedItem?(
    amount: number,
    maxDurability: number,
    unbreakingLevel?: number,
    rng?: () => number,
  ): boolean;
}
