# Proposal: 179-nether-content-baseline

## Problem
176-178 built Nether terrain, portal blocks, and linking — but the Nether's *content* is missing:
the terrain generator writes a documented netherrack id **placeholder** (176), the portal seams
identify obsidian only through caller data (177/178), and no Nether crop/resource exists for the
brewing system (123). The Nether is structurally complete but has no blocks the player can mine,
build with, or farm.

## Goals
Register the core Nether blocks and items required for progression (fulfilling 176's documented
handoff):
- `netherrack` (block + item, stateless) — `BlockId/ItemId.Netherrack = 56`; 176's
  `DEFAULT_NETHER_TERRAIN_BLOCK_IDS.netherrack` is updated from its placeholder (1) to this real id
  (56).
- `obsidian` (block + item, stateless, hardness 50, miningLevel 3 — diamond pickaxe) —
  `BlockId/ItemId.Obsidian = 57`; the block the 177/178 portal-frame seams identify.
- `soul_sand` (block + item, stateless, shovel-preferred) — `BlockId/ItemId.SoulSand = 58`; the
  growth substrate of the Nether's crop.
- `nether_wart` (block + item, **4 states** `age 0..3`, default 0) — `BlockId/ItemId.NetherWart =
  59`; the Nether's brewing ingredient (123 consumes item data; recipes are 219/220's catalog work).

## Non-goals
- **No Nether mobs in this change.** The narrow outcome mentions "mobs", but the existing
  `HostileMobSystem` (146) is hard-wired to the zombie entity definition, and a blaze (the only
  Nether mob strictly required for End progression, via blaze rods) needs a ranged-attack path that
  is genuinely new behavior. The blaze is therefore a documented deferral to 218
  (`mob-content-expansion`), and the End-progression changes (180-184) model eyes-of-ender as item
  requirements. This is the honest scoping decision: content registration here, behavior there.
- **No crop growth/soil behavior** (that is 125/126's crop machinery, applied to nether_wart in a
  later content change), **no recipe/loot table wiring** (219/220), **no `Game`/`World` wiring**.

## Preconditions
- Change 178 (`nether-portal-linking`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts`, `src/worldgen/NetherTerrain.ts`
  (176's defaults).

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `BlockId.Netherrack/Obsidian/SoulSand/NetherWart = 56..59`;
   `NETHER_WART_SCHEMA` (`age` 0..3); the four defs.
2. `src/inventory/ItemRegistry.ts` (EDIT): the four placing items.
3. `src/worldgen/NetherTerrain.ts` (EDIT): default netherrack id 1 → 56 (the 176 handoff).

## Compatibility and migration
- Four additive block ids + four additive item ids; `nether_wart` is the 22nd multi-state block
  (4 states). Requires the documented three characterization updates. No `Game.ts` edit; no schema/
  save-format change.

## Risks
- **Leaving 176's placeholder id in place** (netherrack terrain writing the wrong block). Mitigation:
  the default is updated in the same change and a dedicated test asserts generated columns carry
  `BlockId.Netherrack` in the terrain band.
- **Obsidian mining requirements being wrong** (hardness/miningLevel). Mitigation: pinned by a test
  (hardness 50, miningLevel 3 — diamond pickaxe, vanilla).

## Rollback strategy
Four additive registry entries + one default-id update + test updates; reverting removes the content
cleanly.

## Definition of Done
- All four blocks/items registered; nether_wart enumerates exactly 4 states (default age 0);
  cross-references pass; nether terrain writes the real netherrack id.
- Unit tests cover: keys/ids for all four; obsidian hardness/mining level; statelessness of the
  three solid blocks; nether_wart's 4-state enumeration; item placement + cross-references; the
  terrain handoff.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
