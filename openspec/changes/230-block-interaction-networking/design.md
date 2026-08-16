# Design: 230-block-interaction-networking

## Context/current state

Block breaking and placing in singleplayer (058, 104, 114) operate directly on world instances. In multiplayer, all world modifications must be validated by the server before applying to authoritative world state. Clients submit interaction intents; the server verifies player reach distance, break sequences, and block placement legality, generating confirmation/correction messages and broadcasting accepted changes to other players.

## Target state

A pure headless interaction networking framework in `src/simulation/BlockInteractionNetworking.ts` with:
1. `BlockInteractionValidator`: Validates break, place, and use intents against player eye position, reach limits, breaking progress, and world state access seams.
2. `ClientBlockReconciler`: Tracks optimistic client-side block modifications and rolls them back if the server rejects the request.

## Invariants

- **Reach distance**: Distance from player eye position `(px, py, pz)` to the target block center `(bx + 0.5, by + 0.5, bz + 0.5)` MUST be `<= maxReachDistance` (default 6.0 blocks).
- **Coordinate integrity**: Block coordinates must be safe integers.
- **Authoritative correction**: On rejection, the server returns the authoritative `currentBlockStateId` so client prediction desyncs are immediately resolved.
- **Break sequencing**: A `finish` break action MUST have a corresponding `start` action recorded, or be an instant break.
- **Determinism**: Given identical interaction schedules and world queries, validator outputs and client reconciler states are identical.

## API and data model

```typescript
export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
export type BlockBreakAction = 'start' | 'cancel' | 'finish' | 'instant';

export interface BlockCoord {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PlayerPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BlockBreakRequest {
  readonly playerId: number;
  readonly action: BlockBreakAction;
  readonly position: BlockCoord;
  readonly face: Direction;
  readonly tick: number;
}

export interface BlockPlaceRequest {
  readonly playerId: number;
  readonly position: BlockCoord;
  readonly face: Direction;
  readonly blockStateId: number;
  readonly tick: number;
}

export interface BlockUseRequest {
  readonly playerId: number;
  readonly position: BlockCoord;
  readonly face: Direction;
  readonly cursor?: { readonly x: number; readonly y: number; readonly z: number };
  readonly tick: number;
}

export type InteractionResult =
  | {
      readonly accepted: true;
      readonly action: 'break' | 'place' | 'use';
      readonly position: BlockCoord;
      readonly blockStateId: number;
      readonly broadcast: boolean;
    }
  | {
      readonly accepted: false;
      readonly action: 'break' | 'place' | 'use';
      readonly position: BlockCoord;
      readonly authoritativeStateId: number;
      readonly reason: string;
    };

export interface BlockInteractionValidatorOptions {
  /** Maximum reach distance from player position to block center (default 6.0). */
  readonly maxReachDistance?: number;
  /** Minimum ticks required to break a block if not instant (default 0). */
  readonly minBreakTicks?: number;
}
```

## Control/data flow

1. **Server Validation**:
   - Client sends `BlockBreakRequest`, `BlockPlaceRequest`, or `BlockUseRequest`.
   - `validator.validateBreak(playerPos, request, getBlockState)`:
     - Checks reach distance from `playerPos` to `request.position`.
     - Checks break progress (`start` records sequence, `cancel` clears, `finish` verifies completion).
     - Returns `InteractionResult` (`accepted: true` -> air block state, or `accepted: false` with current state & reason).
   - `validator.validatePlace(playerPos, request, getBlockState, canPlace)`:
     - Checks reach distance.
     - Checks placement position / replaceability.
     - Returns `InteractionResult` (`accepted: true` -> placed block state, or `accepted: false`).
   - `validator.validateUse(playerPos, request, getBlockState)`:
     - Checks reach distance and target block presence.
     - Returns `InteractionResult`.
2. **Client Prediction & Reconciliation**:
   - `reconciler.predictBreak(position, predictedStateId)` / `reconciler.predictPlace(...)`.
   - On server response:
     - `reconciler.reconcile(result)`: if accepted, confirms; if rejected, returns rollback instruction to `result.authoritativeStateId`.

## Detailed behavior

- **Offset from face**: For block placement on a solid face, placement target position is adjacent in the direction of `face`.
- **Reach math**: Euclidean distance `Math.hypot(px - (bx + 0.5), py - (by + 0.5), pz - (bz + 0.5)) <= maxReachDistance`.
- **Reason strings**: Exact reason codes: `'out_of_reach'`, `'no_active_break'`, `'break_too_fast'`, `'cannot_place'`, `'block_missing'`.

## Failure modes

- Non-safe-integer coordinates -> throws `BlockInteraction: coordinates must be integers`.
- Non-finite player positions -> throws `BlockInteraction: player position must be finite numbers`.
- Invalid tick -> throws `BlockInteraction: tick must be a non-negative safe integer`.
- Invalid options -> throws `BlockInteraction: maxReachDistance must be a positive finite number`.

## Compatibility/migration

Pure addition to `src/simulation/BlockInteractionNetworking.ts`.

## Performance/resource constraints

- O(1) per interaction check.
- Zero allocation for simple checks when pooling or returning static objects.

## Testing seams

- Headless unit tests verifying reach boundaries, break sequences, placement adjacent offsets, rejections, client rollback, and determinism.

## Observability/debugging

- `activeBreakingCount`, `getBreakProgress(playerId)` accessors.

## Affected files/symbols

- `src/simulation/BlockInteractionNetworking.ts` (NEW).
- `tests/unit/BlockInteractionNetworking.test.ts` (NEW).

## Rejected alternatives

- *Trusting client break timing unconditionally*: Vulnerable to instant-break cheats; server sequence tracking is required.

## Downstream dependencies

- 231 `inventory-network-transactions`, 236 `multiplayer-load-tests`, 237 `network-adversarial-validation`.
