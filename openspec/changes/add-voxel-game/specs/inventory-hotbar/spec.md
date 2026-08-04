# Spec: inventory-hotbar

## Contract

- **Purpose**: Provide a responsive hotbar showing block slots with icons and a selected-slot highlight, selectable by number keys and the mouse wheel (with wraparound), displaying the selected block's name and feeding placement.
- **Scope**: Owns hotbar slot rendering, selection input (number keys, wheel), block-name display, and wiring the selected slot into block placement. Does not cover the placement action itself (block-interaction) or the wider HUD/debug overlay (user-interface).
- **Functional requirements**: Hotbar slots; selection input; block-name display; placement integration; responsive readability.
- **Non-functional requirements**: Wheel scrolling wraps around at both ends; the hotbar stays readable and usable at common desktop resolutions; the selected slot drives placement.
- **Inputs and outputs**: Inputs: number-key and wheel events, block definitions from the registry. Outputs: selected slot index, hotbar slot icons, block-name display, the block type used for placement.
- **Core data structures**: `Inventory` (slot selection), `Hotbar` (slot rendering/highlight), `BlockSelector`, block id for the selected slot.
- **Dependencies**: block-registry (block names, textures for icons), player-interaction (placement uses selected block), input (number keys, wheel), UI (HUD).
- **Error and edge-case behavior**: A number key outside the slot range is ignored; scrolling past the last slot wraps to the first and vice versa; on selection change the new block's display name is shown; placement always uses the currently selected slot's block type.
- **Performance expectations**: Selection and slot rendering are trivial per-frame work with no allocation; readable at 1920×1080 and 1366×768 — see performance spec.
- **Acceptance criteria**: The scenarios in "Hotbar slots", "Selection input", "Block-name display", "Placement integration", and "Responsive readability" encode the pass/fail conditions.
- **Verification method**: Unit tests `tests/unit/Inventory.test.ts` (7 tests) plus e2e `tests/e2e/game.spec.ts`; verification matrix rows INV-01 through INV-05.

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
