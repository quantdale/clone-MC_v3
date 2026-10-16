# Proposal: 009-slot-data-unification

## Problem

The current hotbar stores identity, quantity, and per-slot wear in parallel arrays, while main storage uses a separate shape. One logical inventory concept therefore has two representations.

## Goals

- Use one stack value for every occupied hotbar/storage slot.
- Keep 9 hotbar and 27 storage capacity.
- Use item-domain identity and 008 component data.
- Define stacking by same item identity plus equal component data.
- Enforce item-specific maximum stack size.
- Preserve current selection, add/remove, crafting payment, placement consumption, UI, and save/restore behavior.
- Translate existing valid snapshot data without semantic loss.

## Non-goals

No new inventory-screen interaction model, recipe grid, general save database, or new item catalog.

## Preconditions

008 is VERIFIED.

## Definition of Done

The two current representations are replaced by one slot-stack model, compatibility fixtures preserve current state, affected behavior remains equivalent, and all required regression checks pass.

## Advancement gate

010 starts only after 009 is 100% complete and VERIFIED.
