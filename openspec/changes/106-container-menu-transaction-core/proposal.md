# Proposal: 106-container-menu-transaction-core

## Problem

105 provides the crafting-table session, but no generic slot/menu transaction engine exists:
click actions (pick up, place, split, quick-move) have no shared, validated implementation for
crafting and storage screens (107+).

## Goals

- `ContainerMenu` state: ordered slots (container region + player region) with per-slot stack
  caps, plus a cursor.
- Transaction union: `leftClick` (pick up / swap / merge), `rightClick` (split-half pickup or
  place-one), `placeOne` (cursor -> slot), `quickMove` (whole stack to the other region via
  deterministic first-fit).
- `applyMenuTransaction`: pure, deterministic, immutable state transitions; construction
  validation strict; out-of-bounds transaction indices throw.

## Non-goals

- Crafting result-slot rules (the table session owns take semantics; menus map onto the core).
- UI panels/input handling.
- Persistence (later block-entity changes).

## Preconditions

- Change 105 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 105 baseline (1172 unit / 19 e2e).

## Dependencies

- Item stack-cap conventions from `ItemRegistry`, 003-style validation.

## Proposed change

- `src/inventory/MenuTransaction.ts` (NEW): `MenuCursor`, `MenuSlot`, `ContainerMenu`,
  `MenuTransaction`, `createContainerMenu`, `applyMenuTransaction`, `validateContainerMenu`.
- `tests/unit/MenuTransaction.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Merge/split arithmetic (ceil halves, first-fit quick-move) must be pinned; exact vectors
  cover every transaction type.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Menu construction validates strictly (regions, slots, cursor).
- Every transaction type behaves per the documented rules; states transition immutably and
  deterministically.
- Full gate green; 106 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 106 suite; E2E stays 19/19.
