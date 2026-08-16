# Proposal: 230-block-interaction-networking

## Problem

In multiplayer Minecraft, block interactions (breaking, placing, and using blocks) must be server-authoritative. Clients submit interaction requests, which the server validates against player reach, game mode rules, block states, and break progress. On success, the server applies the change and broadcasts the event to observers; on rejection, the server returns a correction to resynchronize the client. Change 230 provides this pure, headless interaction networking model.

## Goals

- Define typed request and response contracts for block breaking (`start`, `cancel`, `finish`, `instant`), block placing, and block using.
- Server-side authoritative validator (`BlockInteractionValidator`):
  - Validates player reach distance (default max reach 6.0 blocks).
  - Validates break progress sequencing and hardness requirements.
  - Validates placement position, replacement rules, and collisions.
  - Produces structured confirmation (`accepted: true` with resulting block state) or rejection (`accepted: false` with correction block state and explicit reason).
  - Generates broadcast descriptors for in-range observers.
- Client-side prediction tracking (`ClientBlockReconciler`):
  - Tracks pending local block predictions.
  - Confirms accepted interactions or rolls back rejected predictions to authoritative block state.
- Strict input validation: non-integer block coords, negative ticks, non-finite player positions throw descriptive `BlockInteraction: <detail>` errors without mutating state.
- Pure headless simulation module with zero DOM or external dependencies.

## Non-goals

- No direct WebSocket or socket transport (223 codecs and 225 lifecycle handle wire connections).
- No inventory/item transaction logic (231 `inventory-network-transactions` owns slot/container sync).
- No combat attack networking (232 `combat-networking` owns entity attacks).

## Preconditions

- 229 `entity-replication` VERIFIED.
- 007 `block-state-runtime-registry` and 056 `voxel-shape-core` concepts available.

## Dependencies

- Pure TypeScript module in `src/simulation/BlockInteractionNetworking.ts`. Follows patterns from 222-229 (`Module: <detail>` throws, strict validation, deterministic execution).

## Proposed change

- New module `src/simulation/BlockInteractionNetworking.ts`:
  - `BlockCoord = { readonly x: number; readonly y: number; readonly z: number }`.
  - `Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down'`.
  - `BlockBreakAction = 'start' | 'cancel' | 'finish' | 'instant'`.
  - `BlockBreakRequest = { playerId, action, position, face, tick }`.
  - `BlockPlaceRequest = { playerId, position, face, blockStateId, tick }`.
  - `BlockUseRequest = { playerId, position, face, cursor?, tick }`.
  - `InteractionResult = { accepted: true; position; blockStateId; broadcast: boolean } | { accepted: false; position; authoritativeStateId; reason: string }`.
  - `BlockInteractionValidator` and `ClientBlockReconciler`.

## Compatibility and migration

Pure addition. Zero registry changes, no save format migrations.

## Risks

- Desync from packet loss/out-of-order -> pinned: sequence validation and explicit correction state IDs allow clients to snap to authoritative truth.

## Rollback strategy

Delete `src/simulation/BlockInteractionNetworking.ts` and `tests/unit/BlockInteractionNetworking.test.ts`.

## Definition of Done

Spec requirements REQ-1..REQ-6 verified by unit tests; baseline gate `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` all PASS; OpenSpec state updated.

## Advancement gate

100% task completion; all mandatory MUST/SHALL requirements verified; regression gate green.
