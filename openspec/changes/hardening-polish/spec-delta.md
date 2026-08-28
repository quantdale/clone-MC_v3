# Specification Delta

## Added

- Pointer-lock acquisition failures SHALL be handled as recoverable UI feedback without unhandled promise rejections.
- Focus/visibility loss SHALL clear active movement and transient action input.
- A full active mesh queue SHALL not permanently lose a dirty chunk remesh request.
- Grounded horizontal movement SHOULD step over a one-block rise when the player's clearance permits it.
- Raycast directions SHALL be normalized and non-finite inputs SHALL return no hit.
- Directional shadow focus SHALL follow the player during streamed exploration.
- Engine-owned lights SHALL be removed during teardown.

## Verification updates

- Unit suite now covers 104 tests, including step-up/two-block collision, water buoyancy, normalized/invalid DDA inputs, terrain biomes/caves, save-snapshot validation, stackable inventory, crafting, held mining, fall telemetry, and survival rules.
- Browser suite now verifies explicit pointer-lock release/relock and focus-loss input reset, inventory/crafting, food use, and survival HUD in addition to the existing gameplay checks (18 total).
- Production smoke verifies CSP, absence of the test hook, resize behavior, pointer-lock state, and zero page/console errors.
