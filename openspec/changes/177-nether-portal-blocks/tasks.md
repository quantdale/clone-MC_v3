# Tasks: 177-nether-portal-blocks

## Implementation
- [x] `src/world/BlockRegistry.ts`: `PORTAL_SCHEMA` (`axis` 'x'|'z'); `BlockId.NetherPortal = 55`
      (unbreakable, no dropItem, default `{ axis: 'x' }`).
- [x] `src/simulation/NetherPortal.ts`: `PortalAxis`; `PortalShape`; `PortalFrameWorld` seam.
- [x] `MIN_PORTAL_WIDTH` (2) / `MIN_PORTAL_HEIGHT` (3) / `MAX_PORTAL_SIZE` (21).
- [x] `validatePortalFrame` (bounded axis probes, obsidian far walls/bars, full ring + corners,
      interior air-or-fire; axis 'x' tried first).
- [x] `portalBlockPositions` (column-major interior listing).
- [x] `portalStateProperties`.

## Tests
- [x] `tests/unit/NetherPortal.test.ts`: block carries PORTAL_SCHEMA, 2 states, default axis x.
- [x] No placing item; `validateItemBlockCrossReferences` passes.
- [x] Minimal 4x5 frame (interior 2x3) validates with exact shape (axis x).
- [x] Z-oriented frame validates with axis z.
- [x] Fire inside the opening is accepted.
- [x] Missing corner rejects; missing top bar rejects.
- [x] Too-narrow (width 1) rejects; too-short (height 2) rejects.
- [x] Non-air/non-fire ignition cell rejects; empty world rejects.
- [x] `portalBlockPositions` lists all interior cells (column-major, 6 cells for 2x3).
- [x] `portalStateProperties` projection matches the schema.
- [x] Characterization: BlockRegistry 43→44, BlockStateRegistry total + nether_portal branch,
      BlockPropertySchema STATEFUL set adds nether_portal.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2394/2394 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      178-nether-portal-linking).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
