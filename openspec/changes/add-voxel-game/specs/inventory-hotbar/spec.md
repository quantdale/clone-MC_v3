# Spec: inventory-hotbar

## Contract

- **Purpose**: Provide a responsive Minecraft-style inventory and hotbar with stack counts, icons, selection, crafting, item collection, food use, and placement integration.
- **Scope**: Owns hotbar and inventory slot rendering, selection input (number keys, wheel, inventory clicks), stack accounting, item collection/consumption, recipe execution, and block-name display. Does not cover the placement action itself (block-interaction), survival rules (player-controller), or the wider HUD/debug overlay (user-interface).
- **Functional requirements**: Hotbar slots; selection input; stack quantities; 27-slot storage; item pickup; item consumption; nine crafting recipes; durable tools; block-name display; placement integration; responsive readability.
- **Non-functional requirements**: Wheel scrolling wraps around at both ends; the hotbar stays readable and usable at common desktop resolutions; the selected slot drives placement.
- **Inputs and outputs**: Inputs: number-key, wheel, inventory-cell, crafting, mining, and food-use events, block definitions from the registry, collected item ids. Outputs: selected slot index, stack counts/durability, hotbar/storage icons, recipe outputs, block-name display, the block type used for placement.
- **Core data structures**: `Inventory` (hotbar/storage stacks and selection), `Hotbar` (slot rendering/highlight), `CraftingSystem`, `CraftingPanel`, `BlockSelector`, `InventorySnapshot`.
- **Dependencies**: block-registry (block names, textures for icons), player-interaction (placement uses selected block), input (number keys, wheel), UI (HUD).
- **Error and edge-case behavior**: A number key outside the slot range is ignored; scrolling past the last slot wraps to the first and vice versa; stack additions fill existing stacks before storage; full storage rejects an addition transactionally; malformed or unknown-id/durability save snapshots are rejected; crafting requires all ingredients and output capacity; food cannot be consumed at full hunger; broken tools are removed; placement always uses the currently selected slot's block type.
- **Performance expectations**: Selection and slot rendering are trivial per-frame work with no allocation; readable at 1920×1080 and 1366×768 — see performance spec.
- **Acceptance criteria**: The scenarios in "Hotbar slots", "Selection input", "Block-name display", "Placement integration", and "Responsive readability" encode the pass/fail conditions.
- **Verification method**: Unit tests `tests/unit/Inventory.test.ts`, `tests/unit/Crafting.test.ts`, and `tests/unit/PlayerInteraction.test.ts` plus e2e `tests/e2e/game.spec.ts`; verification matrix rows INV-01 through INV-10.

## ADDED Requirements

### Requirement: Hotbar slots
The system SHALL display a hotbar with multiple slots, each showing a block icon or texture preview, with the currently selected slot clearly highlighted.

#### Scenario: Slot rendering
- **WHEN** the hotbar is displayed
- **THEN** each slot shows the texture preview of its block type and the selected slot is visually highlighted

### Requirement: Selection input
The player SHALL select slots with number keys and with the mouse wheel; wheel scrolling SHALL wrap around at both ends of the hotbar.

#### Scenario: Number-key selection
- **WHEN** the player presses a number key within the slot range
- **THEN** the corresponding slot becomes selected

#### Scenario: Wheel wraparound
- **WHEN** the player scrolls down past the last slot or up past the first
- **THEN** selection wraps to the opposite end

### Requirement: Block-name display
The system SHALL display the display name of the currently selected block where useful (e.g. briefly on selection change).

#### Scenario: Name on selection
- **WHEN** the selected slot changes
- **THEN** the new block's display name is shown to the player

### Requirement: Placement integration
Block placement SHALL use the block type of the currently selected hotbar slot.

#### Scenario: Selected block placed
- **WHEN** the player places a block with a given slot selected
- **THEN** the placed block type matches that slot's block

### Requirement: Responsive readability
The hotbar SHALL remain readable and usable at common desktop browser resolutions.

#### Scenario: Resize
- **WHEN** the window is resized to a smaller desktop resolution
- **THEN** the hotbar remains fully visible and legible

### Requirement: Stackable inventory

The system SHALL track quantities up to a 64-item stack across nine hotbar slots and 27 storage slots.

#### Scenario: Collect block
- **WHEN** a breakable block is destroyed
- **THEN** one matching item is added to an existing stack or an available storage stack

#### Scenario: Consume placement stack
- **WHEN** a placeable block is successfully placed
- **THEN** exactly one item is consumed from the selected hotbar stack

### Requirement: Inventory screen

The system SHALL provide a pause-safe inventory screen showing hotbar and storage cells, icons, quantities, and selection state.

#### Scenario: Open inventory
- **WHEN** the player presses C
- **THEN** pointer lock is released and the inventory/crafting panel displays the current stacks

### Requirement: Crafting

The system SHALL provide nine deterministic recipes for planks, glass, gravel, cobblestone, bricks, sticks, and durable wooden/stone tools and SHALL execute them transactionally.

### Requirement: Tool durability

The inventory SHALL preserve tool durability in validated snapshots, expose it in the hotbar, and remove a tool when its durability reaches zero.

#### Scenario: Tool wears down
- **WHEN** a crafted tool completes a block break
- **THEN** its durability decreases, the hotbar indicator updates, and zero durability removes the tool from the slot

#### Scenario: Craft output
- **WHEN** the player has all ingredients and output capacity
- **THEN** ingredients are removed and the recipe output is added to the inventory

#### Scenario: Craft rejection
- **WHEN** ingredients or output capacity are insufficient
- **THEN** the inventory remains unchanged and the recipe is disabled

### Requirement: Food use

The system SHALL expose apples as a collected food item and allow the player to consume one while hunger is below maximum.

#### Scenario: Eat apple
- **WHEN** the player presses R while carrying an apple and not fully fed
- **THEN** one apple is consumed and hunger/saturation increase
