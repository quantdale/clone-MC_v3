# Tasks: 203-container-screen-framework

## Implementation
- [x] `src/inventory/ContainerScreenFramework.ts`: `ContainerScreenState` +
      `createContainerScreen`.
- [x] `validateContainerScreen` (menu via 106, drag shape incl. unique in-bounds hovered, hotbar
      0..8, unknown keys; descriptive throws).
- [x] `ContainerScreenEvent` union + `applyScreenEvent` (click/quickMove -> 106; dragStart/
      hover/end with index validation -> 202; doubleClick -> gather; hotbarSwap -> 202;
      selectHotbar with range check + identity).

## Tests
- [x] `tests/unit/ContainerScreenFramework.test.ts`: default creation.
- [x] Validation: valid screen; non-object; bad hotbar; duplicate hovered; unknown key.
- [x] Clicks: left pickup; right split; out-of-bounds throw; quickMove.
- [x] Drag flow: click pickup -> dragStart -> dragHover -> dragEnd distribution; invalid drag
      index throw.
- [x] Double-click gather; hotbarSwap throw for container index; selectHotbar set/identity/
      out-of-range throw.
- [x] Input immutability after events.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2668/2668 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 204-recipe-book).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
