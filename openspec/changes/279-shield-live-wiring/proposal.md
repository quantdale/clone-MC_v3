# Proposal: 279-shield-live-wiring

## Problem

The verified `ShieldBlocking` framework (144) already defines the 90-degree
directional block, durability wear, and axe-disable cooldown, but the live game
has no shield item, offhand action, or damage-path integration. A player cannot
use the defensive mechanic that the headless rules already certify.

## Goals

- Add a stable shield item definition with vanilla-sized durability and
  non-stackable equipment semantics.
- Let players swap the selected hotbar stack with the offhand through a live
  keyboard action and hold right-click to raise an offhand shield.
- Apply the existing directional block rules at the real hostile-mob and wither
  damage chokes, including durability wear, shield break, and axe disable.
- Expose a small HUD indicator and preserve offhand shield state through the
  existing inventory snapshot path.
- Prove the behavior with focused unit tests and real-browser E2E coverage.

## Non-goals

- New hostile-mob AI, new weapons, projectile types, villager/workstation/raid
  behavior, multiplayer transport, or a new persistence namespace.
- Reopening or certifying Change 258, changing meshing/render quality, or adding
  headed GPU requirements.
- Modeling shield animation, banners, enchantments, or a complete equipment UI.

## Preconditions

- Changes 259–278 are VERIFIED and Change 258 remains BLOCKED.
- `ShieldBlocking` (144), `Equipment`/inventory snapshots (113), durability
  rules (115), and the live `SurvivalSystem` damage callback are available.
- Existing hostile-mob and wither damage paths remain the only live combat
  callers changed by this package.

## Dependencies

- `src/simulation/ShieldBlocking.ts` and its unit contract.
- `src/inventory/Equipment.ts`, `src/inventory/Inventory.ts`, and
  `src/inventory/DurabilityRules.ts`.
- `Game`, `InputManager`, `PlayerInteraction`, `HostileMobBaseline`, and the
  existing HUD DOM/CSS.

## Proposed change

Add `ItemId.Shield=71` with `maxDurability=336` and a procedural icon tile.
Add a `V` offhand swap action, an offhand durability adapter, and a Game-owned
shield state. While the player is pointer-locked, interactive, and holding
right-click with an offhand shield, the Game records the shield as raised and
blocks right-click block use. Hostile and wither callers provide their existing
attacker/source XZ coordinates to the shield resolver; fall, lava, drowning,
starvation, status-only, and debug-lethal paths remain unblocked environmental
damage. Successful blocks wear the offhand shield and axe attacks start the
100-tick framework cooldown. The HUD reports equipped/raised/disabled/broken
state without adding a save record.

## Compatibility and migration

The existing version-1 inventory snapshot already contains optional equipment
slots and serialized components. Old snapshots without equipment still restore
empty offhand state; new snapshots restore shield durability through the same
validated item-id and component checks. No existing numeric item id changes.

## Risks

- A direction-conversion error could block attacks from behind; cardinal-facing
  unit tests and a browser front/behind proof pin the adapter.
- A shield could accidentally consume block placement input; the interaction
  seam drains use input while the shield is raised and has a dedicated unit
  proof.
- Durability could be shared or lost on save; component-preserving equipment
  tests and reload E2E compare the exact remaining durability.

## Rollback strategy

Revert the 279 commit. Existing inventory snapshots remain readable because the
new shield id is additive and no namespace or version is changed; old builds
will safely quarantine a snapshot containing the unknown shield id under their
existing inventory restore rules.

## Definition of Done

- All required artifacts and tasks are complete, with every mandatory scenario
  covered by a test.
- `ShieldBlocking` is live for hostile and wither source damage, item/offhand
  state is durable, and HUD/input lifecycle is deterministic.
- Typecheck, lint, full unit, production build, browser regression, file audit,
  state validation, and the C279 parity row pass.
- 279 is committed and published to `origin/main`; 258 remains BLOCKED.

## Advancement gate

Advance only at 100% (12/12), with all MUST/SHALL requirements proven and no
known data-loss, compatibility, determinism, security, or regression blocker.
