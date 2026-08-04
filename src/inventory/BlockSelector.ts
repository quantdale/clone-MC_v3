/**
 * Block selector interface.
 *
 * Implemented by the inventory/hotbar and consumed by the interaction system to
 * determine which block to place.
 */
export interface BlockSelector {
  /** The block id of the currently selected hotbar slot. */
  getSelectedBlockId(): number;
}